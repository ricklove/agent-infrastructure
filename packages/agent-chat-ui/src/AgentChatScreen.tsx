import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
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
  modelOptions: string[]
  authProfiles: string[]
  status: "ready" | "planned"
  supportsImageInput: boolean
  supportsCachedContext: boolean
  supportsInteractiveApprovals: boolean
  transport: string
}

type SessionActivity = {
  status: "idle" | "queued" | "running" | "interrupted" | "error"
  startedAtMs: number | null
  threadId: string | null
  turnId: string | null
  backgroundProcessCount: number
  waitingFlags: string[]
  lastError: string | null
  currentMessageId: string | null
  canInterrupt: boolean
}

type SessionSummary = {
  id: string
  title: string
  providerKind: ProviderKind
  modelRef: string
  cwd: string
  pendingSystemInstruction: string | null
  authProfile: string | null
  imageModelRef: string | null
  createdAtMs: number
  updatedAtMs: number
  preview: string | null
  messageCount: number
  activity: SessionActivity
  queuedMessageCount: number
}

type SessionMessage = {
  id: string
  sessionId: string
  role: "user" | "assistant" | "system"
  kind: "chat" | "directoryInstruction"
  replyToMessageId: string | null
  providerSeenAtMs: number | null
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>
  createdAtMs: number
}

type SessionSnapshotResponse = {
  ok: boolean
  session: SessionSummary
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
  activity: SessionActivity
}

type SessionsResponse = {
  ok: boolean
  sessions: SessionSummary[]
}

type ProvidersResponse = {
  ok: boolean
  providers: ProviderCatalogEntry[]
}

type SessionSnapshotEvent = {
  type: "session.snapshot"
  session: SessionSummary
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
  activity: SessionActivity
}

type SessionUpdatedEvent = {
  type: "session.updated"
  session: SessionSummary | null
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
  activity: SessionActivity
}

type RunStartedEvent = {
  type: "run.started"
  sessionId: string
  providerKind: ProviderKind
  activity: SessionActivity
}

type RunDeltaEvent = {
  type: "run.delta"
  sessionId: string
  threadId: string
  turnId: string
  itemId: string
  delta: string
}

type RunCompletedEvent = {
  type: "run.completed"
  sessionId: string
  activity: SessionActivity
}

type RunFailedEvent = {
  type: "run.failed"
  sessionId: string
  error: string
  activity: SessionActivity
}

type RunInterruptedEvent = {
  type: "run.interrupted"
  sessionId: string
  activity: SessionActivity
}

type RunActivityEvent = {
  type: "run.activity"
  sessionId: string
  activity: SessionActivity
  queuedMessages: SessionMessage[]
}

export type AgentChatScreenProps = {
  apiRootUrl: string
  wsRootUrl: string
}

const sessionStorageKey = "agent-infrastructure.dashboard.session"
const defaultSessionDirectory = "/home/ec2-user/workspace"
const draftStorageKeyPrefix = "agent-infrastructure.agent-chat.draft."

function IconButton(props: {
  label: string
  title?: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
  tone?: "default" | "primary" | "danger"
}) {
  const toneClass =
    props.tone === "primary"
      ? "border-cyan-300/30 bg-cyan-300 text-slate-950"
      : props.tone === "danger"
        ? "border-white/10 bg-white/5 text-rose-100"
        : "border-white/10 bg-white/5 text-slate-200"

  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.title ?? props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${toneClass} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {props.children}
    </button>
  )
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <rect x="3.5" y="4.5" width="17" height="5" rx="1.5" />
      <rect x="3.5" y="14.5" width="17" height="5" rx="1.5" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 11.5 20 4l-4.5 16-3.5-6L4 11.5Z" />
      <path d="M11.5 13.5 20 4" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 20h4l9.5-9.5-4-4L4 16v4Z" />
      <path d="m12.5 7.5 4 4" />
    </svg>
  )
}

function formatTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatElapsed(startedAtMs: number | null, nowMs: number) {
  if (!startedAtMs) {
    return null
  }
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function clipText(text: string, maxLength = 88) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 3)}...`
}

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? ""
}

function draftStorageKey(sessionId: string) {
  return `${draftStorageKeyPrefix}${sessionId}`
}

function readDraft(sessionId: string) {
  if (typeof window === "undefined" || !sessionId) {
    return ""
  }
  return window.localStorage.getItem(draftStorageKey(sessionId)) ?? ""
}

function writeDraft(sessionId: string, draft: string) {
  if (typeof window === "undefined" || !sessionId) {
    return
  }
  if (draft.trim()) {
    window.localStorage.setItem(draftStorageKey(sessionId), draft)
    return
  }
  window.localStorage.removeItem(draftStorageKey(sessionId))
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const sessionToken = readStoredSessionToken().trim()

  if (sessionToken) {
    headers.set("x-dashboard-session", sessionToken)
  }

  return fetch(path, {
    ...init,
    headers,
  })
}

function activityLabel(activity: SessionActivity) {
  switch (activity.status) {
    case "queued":
      return "Queued"
    case "running":
      return "Working"
    case "interrupted":
      return "Interrupted"
    case "error":
      return "Error"
    default:
      return "Idle"
  }
}

function activityTone(activity: SessionActivity) {
  switch (activity.status) {
    case "running":
      return "text-emerald-200 border-emerald-400/30 bg-emerald-400/10"
    case "queued":
      return "text-amber-100 border-amber-400/30 bg-amber-400/10"
    case "interrupted":
      return "text-cyan-100 border-cyan-400/30 bg-cyan-400/10"
    case "error":
      return "text-rose-100 border-rose-400/30 bg-rose-400/10"
    default:
      return "text-slate-300 border-white/10 bg-white/5"
  }
}

export function AgentChatScreen(props: AgentChatScreenProps) {
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState("")
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [queuedMessages, setQueuedMessages] = useState<SessionMessage[]>([])
  const [activity, setActivity] = useState<SessionActivity>({
    status: "idle",
    startedAtMs: null,
    threadId: null,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError: null,
    currentMessageId: null,
    canInterrupt: false,
  })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [interrupting, setInterrupting] = useState(false)
  const [error, setError] = useState("")
  const [streamingAssistantText, setStreamingAssistantText] = useState("")
  const [composerText, setComposerText] = useState("")
  const [providerKind, setProviderKind] = useState<ProviderKind>("codex-app-server")
  const [newChatTitle, setNewChatTitle] = useState("")
  const [modelRef, setModelRef] = useState("")
  const [directory, setDirectory] = useState(defaultSessionDirectory)
  const [authProfile, setAuthProfile] = useState("")
  const [imageModelRef, setImageModelRef] = useState("")
  const [activeSessionDirectory, setActiveSessionDirectory] = useState("")
  const [updatingDirectory, setUpdatingDirectory] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle")
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const activeProvider = useMemo(
    () => providers.find((entry) => entry.kind === providerKind) ?? null,
    [providerKind, providers],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )

  const activeReplyTarget = useMemo(
    () => messages.find((message) => message.id === replyTargetMessageId) ?? null,
    [messages, replyTargetMessageId],
  )

  const messageMap = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  )

  const queuedUserMessages = useMemo(
    () => queuedMessages.filter((message) => message.role === "user" || message.kind === "directoryInstruction"),
    [queuedMessages],
  )

  const updateActiveSessionRuntime = useCallback(
    (nextActivity: SessionActivity, queuedCount: number) => {
      if (!activeSessionId) {
        return
      }
      setSessions((current) =>
        current.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                activity: nextActivity,
                queuedMessageCount: queuedCount,
              }
            : session,
        ),
      )
    },
    [activeSessionId],
  )

  useEffect(() => {
    if (!activeProvider) {
      return
    }
    const nextModel =
      activeProvider.modelOptions.find((option) => option === activeProvider.defaultModelRef) ??
      activeProvider.modelOptions[0] ??
      activeProvider.defaultModelRef
    setModelRef(nextModel)
    setAuthProfile(activeProvider.authProfiles[0] ?? "")
  }, [activeProvider])

  useEffect(() => {
    setActiveSessionDirectory(activeSession?.cwd ?? "")
    setReplyTargetMessageId(null)
    if (activeSession && renamingSessionId === activeSession.id) {
      setRenameTitle(activeSession.title)
    }
  }, [activeSession])

  useEffect(() => {
    if (!activeSessionId) {
      setComposerText("")
      return
    }
    setComposerText(readDraft(activeSessionId))
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }
    writeDraft(activeSessionId, composerText)
  }, [activeSessionId, composerText])

  useEffect(() => {
    if (activity.status !== "running") {
      return
    }
    const handle = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(handle)
    }
  }, [activity.status])

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      setLoading(true)
      setError("")

      try {
        const [providersResponse, sessionsResponse] = await Promise.all([
          apiFetch(`${props.apiRootUrl}/providers`).then(async (response) => {
            const payload = (await response.json()) as ProvidersResponse & { error?: string }
            if (!response.ok || !payload.ok || !Array.isArray(payload.providers)) {
              throw new Error(payload.error ?? "Agent Chat providers failed to load.")
            }
            return payload
          }),
          apiFetch(`${props.apiRootUrl}/sessions`).then(async (response) => {
            const payload = (await response.json()) as SessionsResponse & { error?: string }
            if (!response.ok || !payload.ok || !Array.isArray(payload.sessions)) {
              throw new Error(payload.error ?? "Agent Chat sessions failed to load.")
            }
            return payload
          }),
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
      setQueuedMessages([])
      setActivity({
        status: "idle",
        startedAtMs: null,
        threadId: null,
        turnId: null,
        backgroundProcessCount: 0,
        waitingFlags: [],
        lastError: null,
        currentMessageId: null,
        canInterrupt: false,
      })
      return
    }

    let cancelled = false

    async function loadSession() {
      try {
        const response = await apiFetch(`${props.apiRootUrl}/sessions/${activeSessionId}`)
        const payload = (await response.json()) as SessionSnapshotResponse & { error?: string }
        if (!response.ok || !payload.ok || !Array.isArray(payload.messages)) {
          throw new Error(payload.error ?? "Session load failed.")
        }
        if (!cancelled) {
          setMessages(payload.messages)
          setQueuedMessages(payload.queuedMessages)
          setActivity(payload.activity)
          setSessions((current) =>
            current.map((session) =>
              session.id === payload.session.id ? payload.session : session,
            ),
          )
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
    if (!activeSessionId) {
      setWsStatus("idle")
      return
    }

    const socketUrl = new URL(props.wsRootUrl)
    socketUrl.searchParams.set("sessionId", activeSessionId)
    const sessionToken = readStoredSessionToken().trim()
    if (sessionToken) {
      socketUrl.searchParams.set("sessionToken", sessionToken)
    }

    setWsStatus("connecting")
    const socket = new WebSocket(socketUrl.toString())

    socket.addEventListener("open", () => {
      setWsStatus("ready")
    })

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data)) as
        | SessionSnapshotEvent
        | SessionUpdatedEvent
        | RunStartedEvent
        | RunDeltaEvent
        | RunCompletedEvent
        | RunFailedEvent
        | RunInterruptedEvent
        | RunActivityEvent

      if (payload.type === "session.snapshot") {
        setMessages(payload.messages)
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, payload.queuedMessages.length)
        setStreamingAssistantText("")
        setSessions((current) =>
          current.map((session) =>
            session.id === payload.session.id ? payload.session : session,
          ),
        )
        return
      }

      if (payload.type === "session.updated") {
        if (payload.session) {
          setSessions((current) =>
            current.map((session) =>
              session.id === payload.session!.id ? payload.session! : session,
            ),
          )
        }
        setMessages((current) => [...current, ...payload.messages])
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, payload.queuedMessages.length)
        if (payload.messages.some((message) => message.role === "assistant")) {
          setStreamingAssistantText("")
        }
        return
      }

      if (payload.type === "run.started") {
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, queuedMessages.length)
        setStreamingAssistantText("")
        return
      }

      if (payload.type === "run.activity") {
        setActivity(payload.activity)
        setQueuedMessages(payload.queuedMessages)
        updateActiveSessionRuntime(payload.activity, payload.queuedMessages.length)
        return
      }

      if (payload.type === "run.delta") {
        setActivity((current) => ({
          ...current,
          status: "running",
        }))
        setStreamingAssistantText((current) => current + payload.delta)
        return
      }

      if (payload.type === "run.completed") {
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, queuedMessages.length)
        return
      }

      if (payload.type === "run.interrupted") {
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, queuedMessages.length)
        setStreamingAssistantText("")
        return
      }

      if (payload.type === "run.failed") {
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, queuedMessages.length)
        setStreamingAssistantText("")
        setError(payload.error)
      }
    })

    socket.addEventListener("error", () => {
      setWsStatus("error")
      setError("Agent Chat WebSocket disconnected.")
    })

    socket.addEventListener("close", () => {
      setWsStatus((current) => (current === "error" ? current : "idle"))
    })

    return () => {
      socket.close()
    }
  }, [activeSessionId, props.wsRootUrl, queuedMessages.length, updateActiveSessionRuntime])

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
              label: "WS",
              value: wsStatus,
              tone:
                wsStatus === "ready"
                  ? "good"
                  : wsStatus === "connecting"
                    ? "warn"
                    : wsStatus === "error"
                      ? "bad"
                      : "neutral",
            },
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
  }, [activeSession, error, loading, providerKind, sessions.length, wsStatus])

  const mergeSession = useCallback((session: SessionSummary | null) => {
    if (!session) {
      return
    }
    setSessions((current) => {
      const next = current.some((entry) => entry.id === session.id)
        ? current.map((entry) => (entry.id === session.id ? session : entry))
        : [session, ...current]
      return [...next].sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    })
  }, [])

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError("")

    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: newChatTitle.trim() || null,
          providerKind,
          modelRef,
          cwd: directory,
          authProfile: authProfile || null,
          imageModelRef: imageModelRef || null,
        }),
      })
      const payload = (await response.json()) as SessionSnapshotResponse & { error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Session creation failed.")
      }
      mergeSession(payload.session)
      setActiveSessionId(payload.session.id)
      setMessages(payload.messages)
      setQueuedMessages(payload.queuedMessages)
      setActivity(payload.activity)
      setComposerText("")
      setReplyTargetMessageId(null)
      setNewChatTitle("")
      setSettingsOpen(false)
      setNewChatOpen(false)
      setMobileSessionsOpen(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Session creation failed.")
    } finally {
      setCreating(false)
    }
  }

  async function updateDirectory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeSessionId || !activeSessionDirectory.trim()) {
      return
    }

    setUpdatingDirectory(true)
    setError("")

    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          cwd: activeSessionDirectory,
        }),
      })
      const payload = (await response.json()) as (SessionSnapshotResponse & { error?: string })
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Directory update failed.")
      }
      mergeSession(payload.session)
      setMessages(payload.messages)
      setQueuedMessages(payload.queuedMessages)
      setActivity(payload.activity)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Directory update failed.")
    } finally {
      setUpdatingDirectory(false)
    }
  }

  async function renameSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renamingSessionId || !renameTitle.trim()) {
      return
    }

    setRenaming(true)
    setError("")
    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions/${renamingSessionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: renameTitle,
        }),
      })
      const payload = (await response.json()) as (SessionSnapshotResponse & { error?: string })
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Rename failed.")
      }
      mergeSession(payload.session)
      if (payload.session.id === activeSessionId) {
        setMessages(payload.messages)
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
      }
      setRenamingSessionId(null)
      setRenameTitle("")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Rename failed.")
    } finally {
      setRenaming(false)
    }
  }

  async function sendMessage() {
    if (!activeSessionId || !composerText.trim()) {
      return
    }

    setSending(true)
    setError("")

    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions/${activeSessionId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: composerText,
          replyToMessageId: replyTargetMessageId,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Message send failed.")
      }
      setComposerText("")
      setReplyTargetMessageId(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Message send failed.")
    } finally {
      setSending(false)
    }
  }

  async function interruptRun() {
    if (!activeSessionId || !activity.canInterrupt || !activity.turnId) {
      return
    }

    setInterrupting(true)
    setError("")

    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions/${activeSessionId}/interrupt`, {
        method: "POST",
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string; activity?: SessionActivity }
      if (!response.ok || !payload.ok || !payload.activity) {
        throw new Error(payload.error ?? "Interrupt failed.")
      }
      setActivity(payload.activity)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Interrupt failed.")
    } finally {
      setInterrupting(false)
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendMessage()
  }

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault()
        if (!activeSession || sending || !composerText.trim()) {
          return
        }
        void sendMessage()
        return
      }

      if (
        event.key === "Escape" &&
        activity.canInterrupt &&
        activity.status === "running" &&
        !interrupting
      ) {
        event.preventDefault()
        void interruptRun()
      }
    },
    [activeSession, activity.canInterrupt, activity.status, composerText, interrupting, sending],
  )

  useEffect(() => {
    if (!activeSessionId) {
      return
    }

    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (
        event.key === "Escape" &&
        activity.canInterrupt &&
        activity.status === "running" &&
        !interrupting
      ) {
        event.preventDefault()
        void interruptRun()
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown)
    }
  }, [activeSessionId, activity.canInterrupt, activity.status, interrupting])

  const elapsedLabel = formatElapsed(activity.startedAtMs, nowMs)

  return (
    <div className="flex h-full min-h-0 bg-slate-950 text-slate-100">
      <aside
        className={`${
          mobileSessionsOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-20 w-[86vw] max-w-sm border-r border-white/10 bg-slate-950/95 p-4 backdrop-blur transition md:static md:w-80 md:max-w-none md:translate-x-0 md:border-r md:p-5`}
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">
                Agent Chat
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Current thread first. Everything else stays compact.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileSessionsOpen(false)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 md:hidden"
            >
              Close
            </button>
          </div>

          <div className="flex items-center gap-2">
            <IconButton
              label={newChatOpen ? "Hide new chat form" : "Show new chat form"}
              title={newChatOpen ? "Hide New Chat" : "New Chat"}
              onClick={() => setNewChatOpen((current) => !current)}
            >
              <PlusIcon />
            </IconButton>
          </div>

          {newChatOpen ? (
            <form onSubmit={createSession} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  New Chat
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Start another chat from the sessions side.
                </p>
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Title
                </span>
                <input
                  value={newChatTitle}
                  onChange={(event) => setNewChatTitle(event.target.value)}
                  placeholder="optional"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                />
              </label>
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
                {activeProvider?.modelOptions.length ? (
                  <select
                    value={modelRef}
                    onChange={(event) => setModelRef(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                  >
                    {activeProvider.modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={modelRef}
                    readOnly
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                  />
                )}
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Directory
                </span>
                <input
                  value={directory}
                  onChange={(event) => setDirectory(event.target.value)}
                  placeholder={defaultSessionDirectory}
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
              <button
                type="submit"
                disabled={creating || !modelRef.trim() || activeProvider?.status !== "ready"}
                className="w-full rounded-2xl bg-fuchsia-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-fuchsia-400/40"
              >
                {creating
                  ? "Creating..."
                  : activeProvider?.status === "ready"
                    ? "Create Chat"
                    : "Provider Pending"}
              </button>
            </form>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4 text-sm text-slate-400">
                  Loading sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4 text-sm text-slate-400">
                  No chats yet. Use the settings menu to start one.
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`rounded-2xl border px-4 py-4 transition ${
                      session.id === activeSessionId
                        ? "border-fuchsia-300/40 bg-fuchsia-300/10"
                        : "border-white/10 bg-slate-900/70 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSessionId(session.id)
                          setMobileSessionsOpen(false)
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-semibold text-white">
                          {session.title}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {session.providerKind} · {session.modelRef}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{session.messageCount}</span>
                        {session.id === activeSessionId ? (
                          <IconButton
                            label="Rename chat"
                            title="Rename Chat"
                            onClick={() => {
                              setRenamingSessionId(session.id)
                              setRenameTitle(session.title)
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        ) : null}
                      </div>
                    </div>
                    {renamingSessionId === session.id ? (
                      <form onSubmit={renameSession} className="mt-3 flex gap-2">
                        <input
                          value={renameTitle}
                          onChange={(event) => setRenameTitle(event.target.value)}
                          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                        />
                        <button
                          type="submit"
                          disabled={renaming || !renameTitle.trim() || renameTitle.trim() === session.title}
                          className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {renaming ? "Saving..." : "Save"}
                        </button>
                      </form>
                    ) : null}
                    <p className="mt-3 truncate text-sm text-slate-300">
                      {session.preview ?? "No messages yet"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      <span>{activityLabel(session.activity)}</span>
                      {session.queuedMessageCount > 0 ? <span>queued {session.queuedMessageCount}</span> : null}
                      {session.activity.backgroundProcessCount > 0 ? (
                        <span>bg {session.activity.backgroundProcessCount}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-xs text-slate-500">
                      {session.cwd}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {activeSession?.title ?? "Agent Chat"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {activeSession
                ? `${activeSession.providerKind} · ${activeSession.modelRef}`
                : "Select a session or start a new one."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="md:hidden">
              <IconButton
                label="Open sessions"
                title="Sessions"
                onClick={() => setMobileSessionsOpen(true)}
              >
                <SessionsIcon />
              </IconButton>
            </div>
          </div>
        </div>

        {error ? (
          <div className="border-b border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 md:px-6">
            {error}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
            {!activeSession ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-500">
                Start or select a chat to see the thread.
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-500">
                This chat has no messages yet.
              </div>
            ) : (
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                {messages.map((message) => {
                  const replyTarget = message.replyToMessageId
                    ? messageMap.get(message.replyToMessageId) ?? null
                    : null

                  return (
                    <article
                      key={message.id}
                      className={`rounded-3xl border p-4 md:p-5 ${
                        message.role === "user"
                          ? "ml-auto w-full max-w-[92%] border-fuchsia-300/20 bg-fuchsia-300/10 md:max-w-[80%]"
                          : message.role === "system"
                            ? "w-full border-cyan-300/15 bg-cyan-300/5"
                            : "w-full border-white/10 bg-white/5 md:max-w-[88%]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {message.role}
                          </p>
                          {message.kind === "directoryInstruction" ? (
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                              directory
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">{formatTime(message.createdAtMs)}</p>
                      </div>

                      {replyTarget ? (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                          Replying to {replyTarget.role} ·{" "}
                          {clipText(
                            replyTarget.content.find((block) => block.type === "text")?.text ?? "",
                            72,
                          )}
                        </div>
                      ) : null}

                      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-100">
                        {message.content.map((block, index) =>
                          block.type === "text" ? (
                            <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                              {block.text}
                            </p>
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

                      {message.role === "assistant" ? (
                        <div className="mt-4 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setReplyTargetMessageId(message.id)}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-white/20"
                          >
                            Reply to this
                          </button>
                        </div>
                      ) : null}
                    </article>
                  )
                })}

                {streamingAssistantText ? (
                  <article className="w-full max-w-[88%] rounded-3xl border border-cyan-300/20 bg-cyan-400/5 p-4 md:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                        assistant
                      </p>
                      <p className="text-xs text-cyan-100/70">streaming...</p>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                      {streamingAssistantText}
                    </p>
                  </article>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-slate-950/95 px-4 py-4 md:px-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-3">
              {activeSession ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${activityTone(activity)}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-semibold">{activityLabel(activity)}</span>
                    {elapsedLabel ? <span>time {elapsedLabel}</span> : null}
                    {activity.backgroundProcessCount > 0 ? (
                      <span>background {activity.backgroundProcessCount}</span>
                    ) : null}
                    {activity.waitingFlags.length > 0 ? (
                      <span>{activity.waitingFlags.join(", ")}</span>
                    ) : null}
                    {activity.canInterrupt && activity.status === "running" ? (
                      <span>Esc to interrupt</span>
                    ) : null}
                    {interrupting ? <span>interrupting...</span> : null}
                  </div>
                  {activity.lastError ? (
                    <p className="mt-2 text-xs text-rose-100">{activity.lastError}</p>
                  ) : null}
                </div>
              ) : null}

              {queuedUserMessages.length > 0 ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                    Waiting for Agent
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-amber-50">
                    {queuedUserMessages.map((message) => (
                      <div
                        key={message.id}
                        className="rounded-2xl border border-amber-300/15 bg-black/10 px-3 py-2"
                      >
                        {message.kind === "directoryInstruction" ? (
                          <p>{clipText(message.content[0]?.type === "text" ? message.content[0].text : "", 120)}</p>
                        ) : (
                          <p>
                            {message.replyToMessageId ? "reply queued · " : ""}
                            {clipText(message.content[0]?.type === "text" ? message.content[0].text : "", 120)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeReplyTarget ? (
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">
                  <div className="flex items-center justify-between gap-3">
                    <p>
                      Replying to {activeReplyTarget.role} ·{" "}
                      {clipText(
                        activeReplyTarget.content.find((block) => block.type === "text")?.text ?? "",
                        108,
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setReplyTargetMessageId(null)}
                      className="rounded-full border border-cyan-200/20 px-3 py-1 text-xs text-cyan-100"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}

              {settingsOpen ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <form onSubmit={updateDirectory} className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Current Chat
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          Keep the current thread focused here. Use directory changes when the next turn should work elsewhere.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        <p>{activeSession ? `${activeSession.providerKind} · ${activeSession.modelRef}` : "No active chat selected."}</p>
                      </div>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Directory
                        </span>
                        <input
                          value={activeSessionDirectory}
                          onChange={(event) => setActiveSessionDirectory(event.target.value)}
                          placeholder={defaultSessionDirectory}
                          disabled={!activeSession}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={
                          !activeSession ||
                          updatingDirectory ||
                          !activeSessionDirectory.trim() ||
                          activeSessionDirectory.trim() === activeSession.cwd
                        }
                        className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                      >
                        {updatingDirectory ? "Saving..." : "Queue Directory Change"}
                      </button>
                  </form>
                </div>
              ) : null}

              <form onSubmit={submitMessage} className="space-y-3">
                <textarea
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  rows={4}
                  placeholder={
                    activeSession
                      ? "Write the next message..."
                      : "Select or create a chat first."
                  }
                  disabled={!activeSession || sending}
                  className="w-full rounded-3xl border border-white/10 bg-slate-900/90 px-4 py-4 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Ctrl+Enter sends. Esc interrupts when the provider supports it.
                  </p>
                  <div className="flex items-center gap-2">
                    <IconButton
                      label={settingsOpen ? "Hide settings menu" : "Show settings menu"}
                      title={settingsOpen ? "Hide Menu" : "Menu"}
                      onClick={() => setSettingsOpen((current) => !current)}
                    >
                      <MenuIcon />
                    </IconButton>
                    {activity.canInterrupt && activity.status === "running" ? (
                      <IconButton
                        label={interrupting ? "Interrupting run" : "Interrupt run"}
                        title={interrupting ? "Interrupting..." : "Interrupt"}
                        onClick={() => void interruptRun()}
                        disabled={interrupting}
                        tone="danger"
                      >
                        <StopIcon />
                      </IconButton>
                    ) : null}
                    <button
                      type="submit"
                      aria-label={sending ? "Sending message" : "Send message"}
                      title={sending ? "Sending..." : "Send"}
                      disabled={!activeSession || sending || !composerText.trim()}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300 text-slate-950 disabled:cursor-not-allowed disabled:border-cyan-300/20 disabled:bg-cyan-300/40"
                    >
                      <SendIcon />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
