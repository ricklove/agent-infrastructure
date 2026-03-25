import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardTerminalScreenProps = {
  apiRootUrl: string;
  wsRootUrl: string;
  appVersion?: string;
};

const sessionStorageKey = "agent-infrastructure.dashboard.session";
const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1.";

type SessionSummary = {
  id: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  createdAtMs: number;
  lastActivityMs: number;
  closed: boolean;
  attached: boolean;
};

type ProfilesResponse = {
  profiles: { id: string; label: string; shell: string }[];
  defaultCwd: string;
  allowedRoots: string[];
};

type ApiErrorResponse = {
  ok?: boolean;
  error?: string;
};

type WsMessageOut =
  | { type: "output"; data: string }
  | { type: "snapshot"; data: string }
  | { type: "attached"; sessionId: string; cols: number; rows: number }
  | { type: "session_closed"; sessionId: string; exitCode?: number }
  | { type: "error"; message: string }
  | { type: "heartbeat_ack" };

function readStoredSessionToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(sessionStorageKey) ?? "";
}

function applyDashboardSessionHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  const sessionToken = readStoredSessionToken().trim();
  if (sessionToken) {
    nextHeaders.set("Authorization", `Bearer ${sessionToken}`);
  }
  return nextHeaders;
}

function dashboardSessionWebSocketProtocols(): string[] {
  const sessionToken = readStoredSessionToken().trim();
  if (!sessionToken) {
    return [];
  }

  return [`${dashboardSessionWebSocketProtocolPrefix}${sessionToken}`];
}

// ---------------------------------------------------------------------------
// ANSI minimal renderer
// ---------------------------------------------------------------------------

/**
 * Extremely minimal terminal rendering. For V1 this renders raw terminal output
 * into a <pre> element. A proper xterm.js integration is the next step but
 * requires bundler configuration — this gets the interactive PTY working first.
 */
function useTerminalRenderer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef("");

  const normalize = useCallback((text: string) => {
    return text
      // Strip OSC sequences (title sets, etc.)
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
      // Strip CSI sequences (colors, cursor movement, etc.)
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
      // Strip remaining two-byte escape sequences
      .replace(/\u001b[@-_]/g, "")
      // Strip carriage returns that aren't part of \r\n (overwrite-style output)
      .replace(/\r(?!\n)/g, "");
  }, []);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const append = useCallback((text: string) => {
    contentRef.current += normalize(text);
    if (preRef.current) {
      preRef.current.textContent = contentRef.current;
      scrollToBottom();
    }
  }, [normalize, scrollToBottom]);

  const reset = useCallback((text: string) => {
    contentRef.current = normalize(text);
    if (preRef.current) {
      preRef.current.textContent = contentRef.current;
      scrollToBottom();
    }
  }, [normalize, scrollToBottom]);

  return { containerRef, preRef, cursorRef, append, reset };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: applyDashboardSessionHeaders(init?.headers),
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardTerminalScreen({
  apiRootUrl,
  wsRootUrl,
  appVersion,
}: DashboardTerminalScreenProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfilesResponse | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [ctrlCPrimed, setCtrlCPrimed] = useState(false);
  const ctrlCTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { containerRef, preRef, cursorRef, append, reset } = useTerminalRenderer();

  // -----------------------------------------------------------------------
  // API helpers
  // -----------------------------------------------------------------------

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiRootUrl}/sessions`);
      const data = (await res.json()) as { sessions?: SessionSummary[] } & ApiErrorResponse;
      if (!res.ok) {
        setSessions([]);
        setError(data.error ?? "Terminal access requires a valid dashboard session.");
        return;
      }
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setSessions([]);
    }
  }, [apiRootUrl]);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiRootUrl}/profiles`);
      const data = (await res.json()) as Partial<ProfilesResponse> & ApiErrorResponse;
      if (!res.ok) {
        setProfiles(null);
        setError(data.error ?? "Terminal access requires a valid dashboard session.");
        return;
      }
      if (Array.isArray(data.profiles) && typeof data.defaultCwd === "string" && Array.isArray(data.allowedRoots)) {
        setProfiles({
          profiles: data.profiles,
          defaultCwd: data.defaultCwd,
          allowedRoots: data.allowedRoots,
        });
      } else {
        setProfiles(null);
      }
    } catch {
      setProfiles(null);
    }
  }, [apiRootUrl]);

  // Load sessions and profiles on mount
  useEffect(() => {
    fetchSessions();
    fetchProfiles();
  }, [fetchSessions, fetchProfiles]);

  // -----------------------------------------------------------------------
  // WebSocket connection
  // -----------------------------------------------------------------------

  const connectWs = useCallback(
    (sessionId: string) => {
      // Clean up existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      setConnected(false);
      setError(null);
      reset("");

      const wsUrl = wsRootUrl;
      const protocols = dashboardSessionWebSocketProtocols();
      const ws =
        protocols.length > 0 ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "attach", sessionId }));
        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 25_000);
      };

      ws.onmessage = (event) => {
        let msg: WsMessageOut;
        try {
          msg = JSON.parse(event.data as string) as WsMessageOut;
        } catch {
          return;
        }

        switch (msg.type) {
          case "snapshot":
            reset(msg.data);
            break;
          case "attached":
            setConnected(true);
            setActiveSessionId(msg.sessionId);
            // Focus input
            setTimeout(() => inputRef.current?.focus(), 50);
            break;
          case "output":
            append(msg.data);
            break;
          case "session_closed":
            setConnected(false);
            setError("Session closed");
            fetchSessions();
            break;
          case "error":
            setError(msg.message);
            break;
          case "heartbeat_ack":
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection error");
      };
    },
    [wsRootUrl, append, reset, fetchSessions],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Session actions
  // -----------------------------------------------------------------------

  const createSession = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiRootUrl}/sessions`, {
        method: "POST",
        headers: applyDashboardSessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          cwd: profiles?.defaultCwd || "/home/ec2-user/workspace",
        }),
      });
      const data = (await res.json()) as { session?: SessionSummary; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create session");
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.session) {
        await fetchSessions();
        connectWs(data.session.id);
      }
    } catch (e) {
      setError(`Failed to create session: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  }, [apiRootUrl, profiles, fetchSessions, connectWs]);

  const closeSession = useCallback(
    async (sessionId: string) => {
      try {
        await apiFetch(`${apiRootUrl}/sessions/${sessionId}/close`, { method: "POST" });
        if (activeSessionId === sessionId) {
          wsRef.current?.close();
          setActiveSessionId(null);
          setConnected(false);
          reset("");
        }
        fetchSessions();
      } catch {}
    },
    [apiRootUrl, activeSessionId, fetchSessions, reset],
  );

  // -----------------------------------------------------------------------
  // Keyboard handling — Copy-first Ctrl+C, Ctrl+V paste
  // -----------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Ctrl+C — copy-first
      if (e.ctrlKey && e.key === "c") {
        e.preventDefault();
        if (ctrlCPrimed) {
          // Second Ctrl+C — send interrupt
          ws.send(JSON.stringify({ type: "input", data: "\x03" }));
          setCtrlCPrimed(false);
          if (ctrlCTimerRef.current) {
            clearTimeout(ctrlCTimerRef.current);
            ctrlCTimerRef.current = null;
          }
        } else {
          // First Ctrl+C — try copy, prime for interrupt
          const selection = window.getSelection()?.toString();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(() => {});
          }
          setCtrlCPrimed(true);
          ctrlCTimerRef.current = setTimeout(() => {
            setCtrlCPrimed(false);
            ctrlCTimerRef.current = null;
          }, 2000);
        }
        return;
      }

      // Ctrl+V — paste into terminal
      if (e.ctrlKey && e.key === "v") {
        e.preventDefault();
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              ws.send(JSON.stringify({ type: "input", data: text }));
            }
          })
          .catch(() => {});
        return;
      }

      // Regular keys — send to terminal
      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
        e.preventDefault();
        ws.send(JSON.stringify({ type: "input", data: e.key }));
        return;
      }

      // Special keys
      const keyMap: Record<string, string> = {
        Enter: "\r",
        Backspace: "\x7f",
        Tab: "\t",
        Escape: "\x1b",
        ArrowUp: "\x1b[A",
        ArrowDown: "\x1b[B",
        ArrowRight: "\x1b[C",
        ArrowLeft: "\x1b[D",
        Home: "\x1b[H",
        End: "\x1b[F",
        Delete: "\x1b[3~",
        PageUp: "\x1b[5~",
        PageDown: "\x1b[6~",
      };

      if (keyMap[e.key]) {
        e.preventDefault();
        ws.send(JSON.stringify({ type: "input", data: keyMap[e.key] }));
        return;
      }

      // Ctrl+key combos (a-z)
      if (e.ctrlKey && e.key.length === 1 && e.key >= "a" && e.key <= "z") {
        e.preventDefault();
        const code = e.key.charCodeAt(0) - 96; // ctrl+a = 1, ctrl+z = 26
        ws.send(JSON.stringify({ type: "input", data: String.fromCharCode(code) }));
        return;
      }
    },
    [ctrlCPrimed],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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
      {/* Tab bar / session list */}
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
          >
            <span style={{ fontFamily: "monospace" }}>
              {s.cwd.split("/").pop() || "~"}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeSession(s.id);
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

      {/* Ctrl+C hint toast */}
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

      {/* Error banner */}
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

      {/* Terminal viewport */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {activeSessionId && connected ? (
          <>
            <div
              ref={containerRef}
              style={{
                overflowY: "auto",
                height: "100%",
                padding: "8px 12px",
                backgroundColor: "#0d1117",
              }}
            >
              <pre
                ref={preRef}
                style={{
                  margin: 0,
                  padding: 0,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
                  fontSize: "13px",
                  lineHeight: "1.4",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: "#c9d1d9",
                  backgroundColor: "transparent",
                  display: "inline",
                }}
              />
              <span
                ref={cursorRef}
                style={{
                  display: "inline-block",
                  width: "7.8px",
                  height: "1.15em",
                  backgroundColor: "#c9d1d9",
                  verticalAlign: "text-bottom",
                  animation: "terminal-blink 1s step-end infinite",
                }}
              />
              <style>{`@keyframes terminal-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
            </div>
            {/* Hidden input to capture keyboard events */}
            <textarea
              ref={inputRef}
              onKeyDown={handleKeyDown}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "1px",
                height: "1px",
                opacity: 0,
                pointerEvents: "none",
              }}
              autoFocus
              aria-label="Terminal input"
            />
          </>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
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

      {/* Status bar */}
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
          {activeSessionId && sessions.find((s) => s.id === activeSessionId) && (
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
  );
}
