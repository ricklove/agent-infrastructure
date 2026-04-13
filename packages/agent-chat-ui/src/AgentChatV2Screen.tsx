import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import { useEffect, useState } from "react"

export type AgentChatV2ScreenProps = {
  apiRootUrl?: string
  wsRootUrl?: string
  appVersion?: string
}

type HealthPayload = {
  ok?: boolean
}

type SessionsPayload = {
  ok?: boolean
  sessions?: unknown[]
  error?: string
}

type LoadState = {
  status: "loading" | "ready" | "error"
  healthOk: boolean
  sessionCount: number | null
  sessionPayloadBytes: number | null
  error: string
}

const initialLoadState: LoadState = {
  status: "loading",
  healthOk: false,
  sessionCount: null,
  sessionPayloadBytes: null,
  error: "",
}

async function readJsonText(path: string): Promise<{
  payload: unknown
  bytes: number
}> {
  const response = (await dashboardSessionFetch(path)) as Response
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : null
  if (!response.ok) {
    const error =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with ${response.status}`
    throw new Error(error)
  }
  return {
    payload,
    bytes: new TextEncoder().encode(text).length,
  }
}

export function AgentChatV2Screen(props: AgentChatV2ScreenProps) {
  const apiRootUrl = props.apiRootUrl ?? "/api/agent-chat"
  const [loadState, setLoadState] = useState<LoadState>(initialLoadState)

  useEffect(() => {
    let cancelled = false

    async function loadPreviewData() {
      setLoadState(initialLoadState)
      try {
        const [healthResult, sessionsResult] = await Promise.all([
          readJsonText(`${apiRootUrl}/health`),
          readJsonText(`${apiRootUrl}/sessions`),
        ])
        if (cancelled) {
          return
        }

        const health = healthResult.payload as HealthPayload
        const sessions = sessionsResult.payload as SessionsPayload
        setLoadState({
          status: "ready",
          healthOk: health.ok === true,
          sessionCount: Array.isArray(sessions.sessions)
            ? sessions.sessions.length
            : null,
          sessionPayloadBytes: sessionsResult.bytes,
          error: "",
        })
      } catch (error) {
        if (cancelled) {
          return
        }
        setLoadState({
          ...initialLoadState,
          status: "error",
          error:
            error instanceof Error ? error.message : "Chat v2 failed to load.",
        })
      }
    }

    void loadPreviewData()
    return () => {
      cancelled = true
    }
  }, [apiRootUrl])

  const sessionPayloadLabel =
    loadState.sessionPayloadBytes == null
      ? "Not loaded"
      : `${(loadState.sessionPayloadBytes / 1024).toFixed(1)} KB`

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
            Agent Chat v2
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white">
            Read-only preview tab
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-300">
            This surface is wired into the dashboard menu and points at the same
            canonical Agent Chat API and websocket roots as v1. Mutations stay
            disabled while the Legend State store and bounded loading contracts
            are built.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile
            label="Backend"
            value={
              loadState.status === "loading"
                ? "Checking"
                : loadState.healthOk
                  ? "Healthy"
                  : "Unavailable"
            }
          />
          <StatusTile
            label="Sessions"
            value={
              loadState.sessionCount == null
                ? "Unknown"
                : loadState.sessionCount.toLocaleString()
            }
          />
          <StatusTile
            label="Current list payload"
            value={sessionPayloadLabel}
          />
          <StatusTile
            label="WebSocket root"
            value={props.wsRootUrl ?? "/ws/agent-chat"}
          />
        </div>

        {loadState.status === "error" ? (
          <p className="mt-6 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {loadState.error}
          </p>
        ) : null}

        <div className="mt-8 rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">
            Next implementation boundary
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
            <li>Feature-owned Legend State store for normalized chat state.</li>
            <li>Bounded session list and transcript-window API reads.</li>
            <li>
              Websocket deltas merged into hydrated windows without full
              refetch.
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}

function StatusTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {props.label}
      </p>
      <p className="mt-2 break-words text-lg font-semibold text-stone-100">
        {props.value}
      </p>
    </div>
  )
}
