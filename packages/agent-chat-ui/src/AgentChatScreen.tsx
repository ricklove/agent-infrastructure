import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"

type ProviderKind =
  | "codex-app-server"
  | "openrouter"
  | "claude-agent-sdk"
  | "gemini"

type ProviderCatalogEntry = {
  kind: ProviderKind
  label: string
  description: string
  defaultModelRef: string
  authProfiles: string[]
  status: "ready" | "planned"
  supportsImageInput: boolean
  supportsCachedContext: boolean
  supportsInteractiveApprovals: boolean
  transport: string
}

type SessionSummary = {
  id: string
  title: string
  providerKind: ProviderKind
  modelRef: string
  authProfile: string | null
  imageModelRef: string | null
  createdAtMs: number
  updatedAtMs: number
  preview: string | null
  messageCount: number
}

type SessionMessage = {
  id: string
  sessionId: string
  role: "user" | "assistant" | "system"
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>
  createdAtMs: number
}

type SessionSnapshotResponse = {
  ok: boolean
  session: SessionSummary
  messages: SessionMessage[]
}

type SessionsResponse = {
  ok: boolean
  sessions: SessionSummary[]
}

type ProvidersResponse = {
  ok: boolean
  providers: ProviderCatalogEntry[]
}

type SessionUpdatedEvent = {
  type: "session.updated"
  session: SessionSummary | null
  messages: SessionMessage[]
}

type RunStartedEvent = {
  type: "run.started"
  sessionId: string
  providerKind: ProviderKind
}

type RunDeltaEvent = {
  type: "run.delta"
  sessionId: string
  itemId: string
  delta: string
}

type RunCompletedEvent = {
  type: "run.completed"
  sessionId: string
}

type RunFailedEvent = {
  type: "run.failed"
  sessionId: string
  error: string
}

type SessionSnapshotEvent = {
  type: "session.snapshot"
  session: SessionSummary
  messages: SessionMessage[]
}

export type AgentChatScreenProps = {
  apiRootUrl: string
  wsRootUrl: string
}

function formatTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function AgentChatScreen(props: AgentChatScreenProps) {
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>("")
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [runStatus, setRunStatus] = useState("idle")
  const [streamingAssistantText, setStreamingAssistantText] = useState("")
  const [composerText, setComposerText] = useState("")
  const [providerKind, setProviderKind] = useState<ProviderKind>("codex-app-server")
  const [modelRef, setModelRef] = useState("")
  const [authProfile, setAuthProfile] = useState("")
  const [imageModelRef, setImageModelRef] = useState("")
  const socketRef = useRef<WebSocket | null>(null)

  const activeProvider = useMemo(
    () => providers.find((entry) => entry.kind === providerKind) ?? null,
    [providerKind, providers],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )

  useEffect(() => {
    if (!activeProvider) {
      return
    }
    setModelRef(activeProvider.defaultModelRef)
    setAuthProfile(activeProvider.authProfiles[0] ?? "")
  }, [activeProvider])

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      setLoading(true)
      setError("")

      try {
        const [providersResponse, sessionsResponse] = await Promise.all([
          fetch(`${props.apiRootUrl}/providers`).then((response) => response.json() as Promise<ProvidersResponse>),
          fetch(`${props.apiRootUrl}/sessions`).then((response) => response.json() as Promise<SessionsResponse>),
        ])

        if (cancelled) {
          return
        }

        setProviders(providersResponse.providers)
        setSessions(sessionsResponse.sessions)
        if (sessionsResponse.sessions[0]) {
          setActiveSessionId((current) => current || sessionsResponse.sessions[0]!.id)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Agent Chat failed to load.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitial()

    return () => {
      cancelled = true
    }
  }, [props.apiRootUrl])

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      return
    }

    let cancelled = false

    async function loadSession() {
      try {
        const response = await fetch(`${props.apiRootUrl}/sessions/${activeSessionId}`)
        const payload = (await response.json()) as SessionSnapshotResponse
        if (!cancelled) {
          setMessages(payload.messages)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Session load failed.")
        }
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [activeSessionId, props.apiRootUrl])

  useEffect(() => {
    socketRef.current?.close()
    socketRef.current = null

    if (!activeSessionId) {
      return
    }

    const socketUrl = new URL(props.wsRootUrl)
    socketUrl.searchParams.set("sessionId", activeSessionId)
    const socket = new WebSocket(socketUrl.toString())
    socketRef.current = socket

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data)) as
        | SessionSnapshotEvent
        | SessionUpdatedEvent
        | RunStartedEvent
        | RunDeltaEvent
        | RunCompletedEvent
        | RunFailedEvent

      if (payload.type === "session.snapshot") {
        setMessages(payload.messages)
        setStreamingAssistantText("")
        setRunStatus("idle")
        setSessions((current) =>
          current.map((session) =>
            session.id === payload.session.id ? payload.session : session,
          ),
        )
        return
      }

      if (payload.type === "session.updated") {
        setMessages((current) => [...current, ...payload.messages])
        if (payload.messages.some((message) => message.role === "assistant")) {
          setStreamingAssistantText("")
          setRunStatus("idle")
        }
        if (payload.session) {
          setSessions((current) =>
            current.map((session) =>
              session.id === payload.session!.id ? payload.session! : session,
            ),
          )
        }
        return
      }

      if (payload.type === "run.started") {
        setRunStatus("running")
        setStreamingAssistantText("")
        return
      }

      if (payload.type === "run.delta") {
        setRunStatus("running")
        setStreamingAssistantText((current) => current + payload.delta)
        return
      }

      if (payload.type === "run.completed") {
        setRunStatus("idle")
        return
      }

      if (payload.type === "run.failed") {
        setRunStatus("error")
        setStreamingAssistantText("")
        setError(payload.error)
      }
    })

    socket.addEventListener("error", () => {
      setError("Agent Chat WebSocket disconnected.")
    })

    return () => {
      socket.close()
      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [activeSessionId, props.wsRootUrl])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.dispatchEvent(
      new CustomEvent("dashboard-feature-status", {
        detail: {
          featureId: "chat",
          items: [
            {
              label: "API",
              value: loading ? "loading" : error ? "error" : "ready",
              tone: error ? "bad" : loading ? "warn" : "good",
            },
            {
              label: "Sessions",
              value: String(sessions.length),
              tone: sessions.length > 0 ? "good" : "warn",
            },
            {
              label: "Provider",
              value: activeSession?.providerKind ?? providerKind,
              tone: "neutral",
            },
          ],
        },
      }),
    )
  }, [activeSession, error, loading, providerKind, sessions.length])

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError("")

    try {
      const response = await fetch(`${props.apiRootUrl}/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          providerKind,
          modelRef,
          authProfile: authProfile || null,
          imageModelRef: imageModelRef || null,
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? "Session creation failed.")
      }
      const payload = (await response.json()) as SessionSnapshotResponse
      setSessions((current) => [payload.session, ...current.filter((entry) => entry.id !== payload.session.id)])
      setActiveSessionId(payload.session.id)
      setMessages(payload.messages)
      setComposerText("")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Session creation failed.")
    } finally {
      setCreating(false)
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeSessionId || !composerText.trim()) {
      return
    }

    setSending(true)
    setError("")

    try {
      const response = await fetch(`${props.apiRootUrl}/sessions/${activeSessionId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          role: "user",
          text: composerText,
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? "Message send failed.")
      }
      setComposerText("")
      setRunStatus("queued")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Message send failed.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 px-8 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">
          Agent Chat
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Provider-aware session workspace
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          This first slice makes the chat tab real: provider catalog, lazy backend,
          canonical SQLite transcript storage, session creation, and a live session
          surface through the dashboard gateway.
        </p>
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid flex-1 gap-6 p-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-6">
          <form
            onSubmit={createSession}
            className="rounded-3xl border border-white/10 bg-white/5 p-6"
          >
            <h2 className="text-lg font-medium text-white">Create Session</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Provider
                </span>
                <select
                  value={providerKind}
                  onChange={(event) => setProviderKind(event.target.value as ProviderKind)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                >
                  {providers.map((provider) => (
                    <option key={provider.kind} value={provider.kind}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Model
                </span>
                <input
                  value={modelRef}
                  onChange={(event) => setModelRef(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Auth Profile
                </span>
                <input
                  value={authProfile}
                  onChange={(event) => setAuthProfile(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Image Model Override
                </span>
                <input
                  value={imageModelRef}
                  onChange={(event) => setImageModelRef(event.target.value)}
                  placeholder="optional provider/model"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              {activeProvider ? (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-slate-300">
                  <p className="font-medium text-white">{activeProvider.label}</p>
                  <p className="mt-2 leading-6 text-slate-400">
                    {activeProvider.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">
                      transport {activeProvider.transport}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">
                      images {activeProvider.supportsImageInput ? "yes" : "no"}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">
                      cache {activeProvider.supportsCachedContext ? "yes" : "no"}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">
                      approvals {activeProvider.supportsInteractiveApprovals ? "yes" : "no"}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">
                      status {activeProvider.status}
                    </span>
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={creating || !modelRef.trim() || activeProvider?.status !== "ready"}
                className="w-full rounded-2xl bg-fuchsia-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-fuchsia-400/40"
              >
                {creating ? "Creating..." : activeProvider?.status === "ready" ? "Create Session" : "Provider Pending"}
              </button>
            </div>
          </form>

          <section className="min-h-0 flex-1 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Sessions</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {sessions.length}
              </span>
            </div>
            <div className="mt-4 space-y-3 overflow-y-auto">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/60 p-4 text-sm text-slate-400">
                  Loading sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/60 p-4 text-sm text-slate-400">
                  No sessions yet. Create one with a provider and model.
                </div>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setActiveSessionId(session.id)}
                    className={`block w-full rounded-2xl border px-4 py-4 text-left transition ${
                      session.id === activeSessionId
                        ? "border-fuchsia-300/50 bg-fuchsia-300/10"
                        : "border-white/10 bg-slate-950/40 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {session.title}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                          {session.providerKind}
                        </p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {session.messageCount}
                      </span>
                    </div>
                    <p className="mt-3 truncate text-sm text-slate-400">
                      {session.preview ?? session.modelRef}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {session.modelRef} · {formatTime(session.updatedAtMs)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-lg font-medium text-white">
              {activeSession?.title ?? "Conversation Surface"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {activeSession
                ? `${activeSession.providerKind} · ${activeSession.modelRef}`
                : "Select a session to view its canonical transcript."}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
              run {runStatus}
            </p>
          </div>

          <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-2xl bg-slate-950/50 p-4">
            {!activeSession ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No active session selected.
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                This session has no messages yet.
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-2xl border p-4 ${
                    message.role === "user"
                      ? "ml-auto max-w-[80%] border-fuchsia-300/20 bg-fuchsia-300/10"
                      : message.role === "system"
                        ? "border-cyan-300/15 bg-cyan-300/5"
                        : "max-w-[80%] border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {message.role}
                    </p>
                    <p className="text-xs text-slate-500">{formatTime(message.createdAtMs)}</p>
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                    {message.content.map((block, index) =>
                      block.type === "text" ? (
                        <p key={`${message.id}-${index}`}>{block.text}</p>
                      ) : (
                        <div
                          key={`${message.id}-${index}`}
                          className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                        >
                          image {block.url}
                        </div>
                      ),
                    )}
                  </div>
                </article>
              ))
            )}
            {streamingAssistantText ? (
              <article className="max-w-[80%] rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                    assistant
                  </p>
                  <p className="text-xs text-cyan-200/70">streaming...</p>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                  {streamingAssistantText}
                </p>
              </article>
            ) : null}
          </div>

          <form onSubmit={submitMessage} className="mt-4 border-t border-white/10 pt-4">
            <textarea
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              rows={4}
              placeholder={
                activeSession
                  ? "Add a message to the canonical transcript..."
                  : "Select or create a session first."
              }
              disabled={!activeSession || sending}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Codex is wired through app-server now. The other provider adapters are still pending.
              </p>
              <button
                type="submit"
                disabled={!activeSession || sending || !composerText.trim()}
                className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-cyan-300/40"
              >
                {sending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
