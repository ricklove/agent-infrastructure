import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "xterm"
import "xterm/css/xterm.css"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

export type DashboardTerminalScreenProps = {
  apiRootUrl: string
  wsRootUrl: string
  appVersion?: string
}

const sessionStorageKey = "agent-infrastructure.dashboard.session"
const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."
const ctrlCPrimeTimeoutMs = 2000

type SessionSummary = {
  id: string
  cwd: string
  shell: string
  cols: number
  rows: number
  createdAtMs: number
  lastActivityMs: number
  closed: boolean
  attached: boolean
}

type ProfilesResponse = {
  profiles: { id: string; label: string; shell: string }[]
  defaultCwd: string
  allowedRoots: string[]
}

type ApiErrorResponse = {
  ok?: boolean
  error?: string
}

type WsMessageOut =
  | { type: "output"; data: string }
  | { type: "snapshot"; data: string }
  | { type: "attached"; sessionId: string; cols: number; rows: number }
  | { type: "session_closed"; sessionId: string; exitCode?: number }
  | { type: "error"; message: string }
  | { type: "heartbeat_ack" }

function readStoredSessionToken(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return window.sessionStorage.getItem(sessionStorageKey) ?? ""
}

function applyDashboardSessionHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers)
  const sessionToken = readStoredSessionToken().trim()
  if (sessionToken) {
    nextHeaders.set("Authorization", `Bearer ${sessionToken}`)
  }
  return nextHeaders
}

function dashboardSessionWebSocketProtocols(): string[] {
  const sessionToken = readStoredSessionToken().trim()
  if (!sessionToken) {
    return []
  }

  return [`${dashboardSessionWebSocketProtocolPrefix}${sessionToken}`]
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: applyDashboardSessionHeaders(init?.headers),
  })
}

function isAccelKey(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey
}

function useTerminalRenderer(args: {
  onInput: (data: string) => void
  onResize: (cols: number, rows: number) => void
  onPrimeCtrlC: () => void
  onClearCtrlCPrime: () => void
  ctrlCPrimedRef: React.MutableRefObject<boolean>
}) {
  const { onInput, onResize, onPrimeCtrlC, onClearCtrlCPrime, ctrlCPrimedRef } =
    args
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || terminalRef.current) {
      return
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
      fontSize: 13,
      lineHeight: 1.35,
      rows: 24,
      cols: 80,
      scrollback: 5000,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#c9d1d9",
        selectionBackground: "rgba(88, 166, 255, 0.35)",
      },
    })
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminalRef.current = terminal
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    fitAddon.fit()

    const dataDisposable = terminal.onData((data) => {
      onInput(data)
    })
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      onResize(cols, rows)
    })
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true
      }

      const lowerKey = event.key.toLowerCase()
      if (isAccelKey(event) && lowerKey == "c") {
        event.preventDefault()
        if (ctrlCPrimedRef.current) {
          onInput("\u0003")
          onClearCtrlCPrime()
        } else {
          const selectedText = terminal.hasSelection()
            ? terminal.getSelection()
            : window.getSelection()?.toString() ?? ""
          if (selectedText) {
            navigator.clipboard.writeText(selectedText).catch(() => {})
          }
          onPrimeCtrlC()
        }
        return false
      }

      if (isAccelKey(event) && lowerKey == "v") {
        event.preventDefault()
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              onInput(text)
            }
          })
          .catch(() => {})
        return false
      }

      return true
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      resizeDisposable.dispose()
      dataDisposable.dispose()
      fitAddonRef.current = null
      terminalRef.current = null
      terminal.dispose()
    }
  }, [ctrlCPrimedRef, onClearCtrlCPrime, onInput, onPrimeCtrlC, onResize])

  const write = useCallback((text: string) => {
    terminalRef.current?.write(text)
  }, [])

  const reset = useCallback((text: string) => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    terminal.reset()
    if (text) {
      terminal.write(text)
    }
  }, [])

  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  const fit = useCallback(() => {
    fitAddonRef.current?.fit()
  }, [])

  return useMemo(
    () => ({
      clear,
      containerRef,
      fit,
      focus,
      reset,
      terminalRef,
      write,
    }),
    [clear, fit, focus, reset, write],
  )
}

export function DashboardTerminalScreen({
  apiRootUrl,
  wsRootUrl,
  appVersion,
}: DashboardTerminalScreenProps) {
  useRenderCounter("DashboardTerminalScreen")
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<ProfilesResponse | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [ctrlCPrimed, setCtrlCPrimed] = useState(false)
  const ctrlCPrimedRef = useRef(false)
  const ctrlCTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCtrlCPrime = useCallback(() => {
    ctrlCPrimedRef.current = false
    setCtrlCPrimed(false)
    if (ctrlCTimerRef.current) {
      clearTimeout(ctrlCTimerRef.current)
      ctrlCTimerRef.current = null
    }
  }, [])

  const primeCtrlC = useCallback(() => {
    ctrlCPrimedRef.current = true
    setCtrlCPrimed(true)
    if (ctrlCTimerRef.current) {
      clearTimeout(ctrlCTimerRef.current)
    }
    ctrlCTimerRef.current = setTimeout(() => {
      ctrlCPrimedRef.current = false
      setCtrlCPrimed(false)
      ctrlCTimerRef.current = null
    }, ctrlCPrimeTimeoutMs)
  }, [])

  const sendInput = useCallback((data: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN && data) {
      ws.send(JSON.stringify({ type: "input", data }))
    }
  }, [])

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
      ws.send(JSON.stringify({ type: "resize", cols, rows }))
    }
  }, [])

  const terminal = useTerminalRenderer({
    onInput: sendInput,
    onResize: sendResize,
    onPrimeCtrlC: primeCtrlC,
    onClearCtrlCPrime: clearCtrlCPrime,
    ctrlCPrimedRef,
  })

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiRootUrl}/sessions`)
      const data = (await res.json()) as {
        sessions?: SessionSummary[]
      } & ApiErrorResponse
      if (!res.ok) {
        setSessions([])
        setError(
          data.error ?? "Terminal access requires a valid dashboard session.",
        )
        return
      }
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
    } catch {
      setSessions([])
    }
  }, [apiRootUrl])

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiRootUrl}/profiles`)
      const data = (await res.json()) as Partial<ProfilesResponse> &
        ApiErrorResponse
      if (!res.ok) {
        setProfiles(null)
        setError(
          data.error ?? "Terminal access requires a valid dashboard session.",
        )
        return
      }
      if (
        Array.isArray(data.profiles) &&
        typeof data.defaultCwd === "string" &&
        Array.isArray(data.allowedRoots)
      ) {
        setProfiles({
          profiles: data.profiles,
          defaultCwd: data.defaultCwd,
          allowedRoots: data.allowedRoots,
        })
      } else {
        setProfiles(null)
      }
    } catch {
      setProfiles(null)
    }
  }, [apiRootUrl])

  useEffect(() => {
    fetchSessions()
    fetchProfiles()
  }, [fetchProfiles, fetchSessions])

  const connectWs = useCallback(
    (sessionId: string) => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }

      clearCtrlCPrime()
      setConnected(false)
      setError(null)
      terminal.reset("")

      const protocols = dashboardSessionWebSocketProtocols()
      const ws =
        protocols.length > 0
          ? new WebSocket(wsRootUrl, protocols)
          : new WebSocket(wsRootUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "attach", sessionId }))
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }))
          }
        }, 25_000)
      }

      ws.onmessage = (event) => {
        let msg: WsMessageOut
        try {
          msg = JSON.parse(event.data as string) as WsMessageOut
        } catch {
          return
        }

        switch (msg.type) {
          case "snapshot":
            terminal.reset(msg.data)
            break
          case "attached":
            setConnected(true)
            setActiveSessionId(msg.sessionId)
            setTimeout(() => {
              terminal.fit()
              terminal.focus()
            }, 50)
            break
          case "output":
            terminal.write(msg.data)
            break
          case "session_closed":
            setConnected(false)
            setError("Session closed")
            fetchSessions()
            break
          case "error":
            setError(msg.message)
            break
          case "heartbeat_ack":
            break
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
      }

      ws.onerror = () => {
        setError("WebSocket connection error")
      }
    },
    [clearCtrlCPrime, fetchSessions, terminal, wsRootUrl],
  )

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
      if (ctrlCTimerRef.current) {
        clearTimeout(ctrlCTimerRef.current)
      }
    }
  }, [])

  const createSession = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await apiFetch(`${apiRootUrl}/sessions`, {
        method: "POST",
        headers: applyDashboardSessionHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          cwd: profiles?.defaultCwd || "/home/ec2-user/workspace",
        }),
      })
      const data = (await res.json()) as {
        session?: SessionSummary
        error?: string
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to create session")
        return
      }
      if (data.error) {
        setError(data.error)
        return
      }
      if (data.session) {
        await fetchSessions()
        connectWs(data.session.id)
      }
    } catch (e) {
      setError(
        `Failed to create session: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setCreating(false)
    }
  }, [apiRootUrl, connectWs, fetchSessions, profiles])

  const closeSession = useCallback(
    async (sessionId: string) => {
      try {
        await apiFetch(`${apiRootUrl}/sessions/${sessionId}/close`, {
          method: "POST",
        })
        if (activeSessionId === sessionId) {
          wsRef.current?.close()
          setActiveSessionId(null)
          setConnected(false)
          terminal.reset("")
        }
        fetchSessions()
      } catch {
        // Ignore close failures and let the session list refresh on the next poll.
      }
    },
    [activeSessionId, apiRootUrl, fetchSessions, terminal],
  )

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 12px",
          borderBottom: "1px solid #21262d",
          backgroundColor: "#161b22",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        {sessions.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: "pointer",
              backgroundColor:
                activeSessionId === s.id ? "#21262d" : "transparent",
              border:
                activeSessionId === s.id
                  ? "1px solid #30363d"
                  : "1px solid transparent",
            }}
            onClick={() => connectWs(s.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                connectWs(s.id)
              }
            }}
          >
            <span style={{ fontFamily: "monospace" }}>
              {s.cwd.split("/").pop() || "~"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                closeSession(s.id)
              }}
              style={{
                background: "none",
                border: "none",
                color: "#8b949e",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: "14px",
                lineHeight: 1,
              }}
              title="Close session"
            >
              x
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={createSession}
          disabled={creating}
          style={{
            background: "none",
            border: "1px solid #30363d",
            color: "#c9d1d9",
            cursor: creating ? "wait" : "pointer",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        >
          {creating ? "..." : "+ New"}
        </button>
      </div>
      {ctrlCPrimed && (
        <div
          style={{
            padding: "6px 14px",
            backgroundColor: "#1c2128",
            borderBottom: "1px solid #30363d",
            fontSize: "12px",
            color: "#f0883e",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          Press Ctrl+C again to send Ctrl+C to the terminal
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "6px 14px",
            backgroundColor: "#3d1f1f",
            borderBottom: "1px solid #6e3030",
            fontSize: "12px",
            color: "#f85149",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
        role="application"
        onClick={() => terminal.focus()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            terminal.focus()
          }
        }}
      >
        <div
          ref={terminal.containerRef}
          style={{
            display: activeSessionId && connected ? "block" : "none",
            height: "100%",
            width: "100%",
            padding: "8px 12px",
            backgroundColor: "#0d1117",
            overflow: "hidden",
          }}
        />
        {!(activeSessionId && connected) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              color: "#8b949e",
            }}
          >
            <div style={{ fontSize: "14px" }}>
              {sessions.length === 0
                ? "No terminal sessions. Create one to get started."
                : "Select a terminal session or create a new one."}
            </div>
            <button
              type="button"
              onClick={createSession}
              disabled={creating}
              style={{
                background: "#238636",
                border: "1px solid #2ea043",
                color: "#ffffff",
                cursor: creating ? "wait" : "pointer",
                padding: "8px 20px",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {creating ? "Creating..." : "New Terminal Session"}
            </button>
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 12px",
          borderTop: "1px solid #21262d",
          backgroundColor: "#161b22",
          fontSize: "11px",
          color: "#8b949e",
          flexShrink: 0,
        }}
      >
        <span>
          {connected ? (
            <span style={{ color: "#3fb950" }}>Connected</span>
          ) : (
            <span>Disconnected</span>
          )}
          {activeSessionId &&
            sessions.find((s) => s.id === activeSessionId) && (
              <span style={{ marginLeft: "12px" }}>
                cwd: {sessions.find((s) => s.id === activeSessionId)?.cwd}
              </span>
            )}
        </span>
        <span>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          {appVersion ? ` | ${appVersion}` : ""}
        </span>
      </div>
    </div>
  )
}
