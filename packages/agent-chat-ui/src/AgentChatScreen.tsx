import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

type SessionWatchdogState = {
  status: "unconfigured" | "unresolved" | "nudged" | "completed"
  nudgeCount: number
  lastNudgedAtMs: number | null
  completedAtMs: number | null
}

type SessionSummary = {
  id: string
  title: string
  archived: boolean
  processBlueprintId: string | null
  watchdogState: SessionWatchdogState
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
  kind: "chat" | "directoryInstruction" | "watchdogPrompt" | "thought" | "streamCheckpoint"
  replyToMessageId: string | null
  providerSeenAtMs: number | null
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>
  createdAtMs: number
}

type RenderedTranscriptItem = {
  message: SessionMessage
  precedingStreamCheckpoints: SessionMessage[]
}

type ComposerImageAttachment = {
  id: string
  dataUrl: string
  mediaType: string
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

type ProcessBlueprint = {
  id: string
  title: string
  expectation: string
  idlePrompt: string
  completionMode: "exact_reply"
  completionToken: string
  stopConditions: string[]
  watchdog: {
    enabled: boolean
    idleTimeoutSeconds: number
    maxNudgesPerIdleEpisode: number
  }
  companionPath: string | null
}

type ProcessBlueprintsResponse = {
  ok: boolean
  processBlueprints: ProcessBlueprint[]
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
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
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
const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."
const defaultSessionDirectory = "/home/ec2-user/workspace"
const draftStorageKeyPrefix = "agent-infrastructure.agent-chat.draft."
const sessionRailWidthStorageKey = "agent-infrastructure.agent-chat.session-rail-width"
const defaultSessionRailWidth = 352
const minSessionRailWidth = 280
const maxSessionRailWidth = 520
const completedProcessResolutionSentinel = "__process_done__"

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

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4.5 7.5h15" />
      <rect x="3.5" y="5" width="17" height="4" rx="1.5" />
      <path d="M6.5 9.5h11v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-9Z" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M8 7H4v4" />
      <path d="M4.5 10.5a7.5 7.5 0 1 0 2.1-5" />
      <path d="M9.5 12h5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
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

function normalizeSessionSearchValue(value: string | null | undefined) {
  return value?.toLowerCase().trim() ?? ""
}

function sessionMatchesSearch(session: SessionSummary, query: string) {
  const normalizedQuery = normalizeSessionSearchValue(query)
  if (!normalizedQuery) {
    return true
  }

  return [
    session.title,
    session.preview,
    session.providerKind,
    session.modelRef,
    session.cwd,
  ]
    .map((value) => normalizeSessionSearchValue(value))
    .some((value) => value.includes(normalizedQuery))
}

function summarizeMessageContent(
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>,
  maxLength = 88,
) {
  const firstText = content.find((block) => block.type === "text" && block.text.trim())
  if (firstText?.type === "text") {
    return clipText(firstText.text, maxLength)
  }

  const imageCount = content.filter((block) => block.type === "image").length
  if (imageCount > 0) {
    return imageCount === 1 ? "image" : `${imageCount} images`
  }

  return ""
}

function readClipboardImage(file: File) {
  return new Promise<ComposerImageAttachment>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => {
      reject(new Error("Clipboard image read failed."))
    }
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : ""
      if (!dataUrl) {
        reject(new Error("Clipboard image read failed."))
        return
      }
      resolve({
        id: crypto.randomUUID(),
        dataUrl,
        mediaType: file.type || "image/png",
      })
    }
    reader.readAsDataURL(file)
  })
}

function insertTextAtSelection(
  textarea: HTMLTextAreaElement,
  currentValue: string,
  insertedText: string,
) {
  const start = textarea.selectionStart ?? currentValue.length
  const end = textarea.selectionEnd ?? currentValue.length
  return `${currentValue.slice(0, start)}${insertedText}${currentValue.slice(end)}`
}

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? ""
}

function authorizationHeaderValue(): string {
  const sessionToken = readStoredSessionToken().trim()
  return sessionToken ? `Bearer ${sessionToken}` : ""
}

function dashboardSessionWebSocketProtocols(): string[] {
  const sessionToken = readStoredSessionToken().trim()
  if (!sessionToken) {
    return []
  }

  return [`${dashboardSessionWebSocketProtocolPrefix}${sessionToken}`]
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

function readSessionRailWidth() {
  if (typeof window === "undefined") {
    return defaultSessionRailWidth
  }
  const raw = Number(window.localStorage.getItem(sessionRailWidthStorageKey) ?? "")
  if (!Number.isFinite(raw)) {
    return defaultSessionRailWidth
  }
  return Math.max(minSessionRailWidth, Math.min(maxSessionRailWidth, raw))
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const authorization = authorizationHeaderValue()

  if (authorization) {
    headers.set("Authorization", authorization)
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

function summarizeSessionWorkerState(
  activity: SessionActivity,
  queuedMessageCount: number,
  nowMs: number,
) {
  const summary = [activityLabel(activity)]
  const elapsed = formatElapsed(activity.startedAtMs, nowMs)

  if (elapsed && activity.status === "running") {
    summary.push(elapsed)
  }

  if (activity.waitingFlags.length > 0) {
    summary.push(activity.waitingFlags.join(", "))
  }

  if (queuedMessageCount > 0) {
    summary.push(`queued ${queuedMessageCount}`)
  }

  if (activity.backgroundProcessCount > 0) {
    summary.push(`bg ${activity.backgroundProcessCount}`)
  }

  if (activity.status === "error" && activity.lastError) {
    summary.push(clipText(activity.lastError, 48))
  }

  return summary
}

function processBlueprintTitle(
  processBlueprints: ProcessBlueprint[],
  processBlueprintId: string | null,
) {
  if (!processBlueprintId) {
    return null
  }
  return processBlueprints.find((entry) => entry.id === processBlueprintId)?.title ?? processBlueprintId
}

function watchdogAttentionLabel(watchdogState: SessionWatchdogState) {
  if (watchdogState.status === "nudged") {
    return "Needs reply"
  }
  if (watchdogState.status === "completed") {
    return "Done"
  }
  return null
}

function mergeMessagesById(current: SessionMessage[], incoming: SessionMessage[]) {
  const next = new Map<string, SessionMessage>()
  for (const message of current) {
    next.set(message.id, message)
  }
  for (const message of incoming) {
    next.set(message.id, message)
  }
  return Array.from(next.values()).sort((left, right) => left.createdAtMs - right.createdAtMs)
}

function threadMessageQueueLabel(message: SessionMessage) {
  if (message.providerSeenAtMs !== null) {
    return null
  }
  if (message.role === "user") {
    return "queued"
  }
  if (message.role === "system" && message.kind === "watchdogPrompt") {
    return "watchdog"
  }
  if (message.role === "system") {
    return "next turn"
  }
  return "pending"
}

function splitDisplayParagraphs(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function summarizeStreamCheckpoint(text: string) {
  return splitDisplayParagraphs(text)[0] ?? "Stream revision"
}

function MessageImageAsset({ path }: { path: string }) {
  const [assetUrl, setAssetUrl] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let nextObjectUrl = ""

    async function loadAsset() {
      try {
        const response = await apiFetch(path)
        if (!response.ok) {
          throw new Error(`Image request failed with status ${response.status}.`)
        }

        const blob = await response.blob()
        nextObjectUrl = URL.createObjectURL(blob)

        if (!active) {
          URL.revokeObjectURL(nextObjectUrl)
          return
        }

        setAssetUrl(nextObjectUrl)
        setError("")
      } catch (nextError) {
        if (!active) {
          return
        }

        setAssetUrl("")
        setError(nextError instanceof Error ? nextError.message : "Image unavailable.")
      }
    }

    void loadAsset()

    return () => {
      active = false
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl)
      }
    }
  }, [path])

  return (
    <div className="block overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
      <div className="flex max-h-[28rem] min-h-24 items-center justify-center bg-slate-950/80 p-3">
        {assetUrl ? (
          <a href={assetUrl} target="_blank" rel="noreferrer">
            <img
              src={assetUrl}
              alt="User supplied"
              className="max-h-[calc(28rem-1.5rem)] max-w-full object-contain"
            />
          </a>
        ) : (
          <div className="text-xs text-slate-400">{error || "Loading image..."}</div>
        )}
      </div>
      <div className="border-t border-white/10 px-3 py-2 text-xs text-slate-300">
        {assetUrl ? (
          <a href={assetUrl} target="_blank" rel="noreferrer">
            Open image
          </a>
        ) : (
          "Image preview"
        )}
      </div>
    </div>
  )
}

function sessionCardTone(activity: SessionActivity, active: boolean, archived: boolean) {
  if (active) {
    switch (activity.status) {
      case "running":
        return "border-emerald-300/40 bg-emerald-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      case "queued":
        return "border-amber-300/40 bg-amber-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      case "error":
        return "border-rose-300/40 bg-rose-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      default:
        return archived
          ? "border-cyan-300/40 bg-cyan-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border-fuchsia-300/40 bg-fuchsia-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    }
  }

  switch (activity.status) {
    case "running":
      return "border-emerald-400/20 bg-emerald-400/5 hover:border-emerald-300/30"
    case "queued":
      return "border-amber-400/20 bg-amber-400/5 hover:border-amber-300/30"
    case "error":
      return "border-rose-400/20 bg-rose-400/5 hover:border-rose-300/30"
    case "interrupted":
      return "border-cyan-400/20 bg-cyan-400/5 hover:border-cyan-300/30"
    default:
      return archived
        ? "border-cyan-400/15 bg-slate-900/65 hover:border-cyan-300/25"
        : "border-white/10 bg-slate-900/70 hover:border-white/20"
  }
}

export function AgentChatScreen(props: AgentChatScreenProps) {
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null)
  const pendingSessionOpenScrollRef = useRef<string | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const quickProcessSelectRef = useRef<HTMLSelectElement | null>(null)
  const messageElementRefs = useRef(new Map<string, HTMLElement>())
  const sessionRailResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([])
  const [processBlueprints, setProcessBlueprints] = useState<ProcessBlueprint[]>([])
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
  const [processBlueprintId, setProcessBlueprintId] = useState("")
  const [activeSessionDirectory, setActiveSessionDirectory] = useState("")
  const [activeSessionProviderKind, setActiveSessionProviderKind] =
    useState<ProviderKind>("codex-app-server")
  const [activeSessionModelRef, setActiveSessionModelRef] = useState("")
  const [activeSessionAuthProfile, setActiveSessionAuthProfile] = useState("")
  const [activeSessionImageModelRef, setActiveSessionImageModelRef] = useState("")
  const [activeSessionProcessBlueprintId, setActiveSessionProcessBlueprintId] = useState("")
  const [updatingDirectory, setUpdatingDirectory] = useState(false)
  const [updatingQuickProcessBlueprint, setUpdatingQuickProcessBlueprint] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [sessionListMenuOpen, setSessionListMenuOpen] = useState(false)
  const [showArchivedSessions, setShowArchivedSessions] = useState(false)
  const [sessionSearchQuery, setSessionSearchQuery] = useState("")
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle")
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null)
  const [composerImages, setComposerImages] = useState<ComposerImageAttachment[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sessionRailWidth, setSessionRailWidth] = useState(() => readSessionRailWidth())
  const [expandedReplacedStreamMessageIds, setExpandedReplacedStreamMessageIds] = useState<
    Record<string, boolean>
  >({})
  const [, setThreadViewportMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 1,
    clientHeight: 1,
  })

  const activeProvider = useMemo(
    () => providers.find((entry) => entry.kind === providerKind) ?? null,
    [providerKind, providers],
  )
  const activeSessionProvider = useMemo(
    () => providers.find((entry) => entry.kind === activeSessionProviderKind) ?? null,
    [activeSessionProviderKind, providers],
  )
  const activeSessionProcessBlueprint = useMemo(
    () =>
      processBlueprints.find((entry) => entry.id === activeSessionProcessBlueprintId) ?? null,
    [activeSessionProcessBlueprintId, processBlueprints],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )
  const processResolutionRequired =
    activeSession?.watchdogState.status === "completed" && !!activeSession?.processBlueprintId
  const quickProcessSelectValue = processResolutionRequired
    ? completedProcessResolutionSentinel
    : activeSession?.processBlueprintId ?? ""
  const settingsProcessSelectValue = processResolutionRequired
    ? completedProcessResolutionSentinel
    : activeSessionProcessBlueprintId

  const visibleSessions = useMemo(
    () => sessions.filter((session) => sessionMatchesSearch(session, sessionSearchQuery)),
    [sessionSearchQuery, sessions],
  )

  const mainSessions = useMemo(
    () => visibleSessions.filter((session) => !session.archived),
    [visibleSessions],
  )

  const archivedSessions = useMemo(
    () => visibleSessions.filter((session) => session.archived),
    [visibleSessions],
  )

  const loadSessions = useCallback(async () => {
    const response = await apiFetch(`${props.apiRootUrl}/sessions`)
    const payload = (await response.json()) as SessionsResponse & { error?: string }
    if (!response.ok || !payload.ok || !Array.isArray(payload.sessions)) {
      throw new Error(payload.error ?? "Agent Chat sessions failed to load.")
    }
    return payload.sessions
  }, [props.apiRootUrl])

  const activeReplyTarget = useMemo(
    () => messages.find((message) => message.id === replyTargetMessageId) ?? null,
    [messages, replyTargetMessageId],
  )

  const messageMap = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  )

  const renderedTranscriptItems = useMemo(() => {
    const items: RenderedTranscriptItem[] = []
    let pendingStreamCheckpoints: SessionMessage[] = []

    for (const message of messages) {
      if (message.kind === "streamCheckpoint") {
        pendingStreamCheckpoints.push(message)
        continue
      }

      if (message.role === "assistant" && message.kind === "chat") {
        items.push({
          message,
          precedingStreamCheckpoints: pendingStreamCheckpoints,
        })
        pendingStreamCheckpoints = []
        continue
      }

      if (pendingStreamCheckpoints.length > 0) {
        for (const streamMessage of pendingStreamCheckpoints) {
          items.push({
            message: streamMessage,
            precedingStreamCheckpoints: [],
          })
        }
        pendingStreamCheckpoints = []
      }

      items.push({
        message,
        precedingStreamCheckpoints: [],
      })
    }

    for (const streamMessage of pendingStreamCheckpoints) {
      items.push({
        message: streamMessage,
        precedingStreamCheckpoints: [],
      })
    }

    return items
  }, [messages])

  const hasVisibleStreamCheckpoint = useMemo(
    () => renderedTranscriptItems.some(({ message }) => message.kind === "streamCheckpoint"),
    [renderedTranscriptItems],
  )

  const queuedSystemMessages = useMemo(
    () =>
      queuedMessages.filter(
        (message) =>
          message.role === "system" &&
          message.providerSeenAtMs === null,
      ),
    [queuedMessages],
  )

  const syncCurrentChatSettingsFromSession = useCallback((session: SessionSummary | null) => {
    setActiveSessionDirectory(session?.cwd ?? "")
    setActiveSessionProviderKind(session?.providerKind ?? "codex-app-server")
    setActiveSessionModelRef(session?.modelRef ?? "")
    setActiveSessionAuthProfile(session?.authProfile ?? "")
    setActiveSessionImageModelRef(session?.imageModelRef ?? "")
    setActiveSessionProcessBlueprintId(session?.processBlueprintId ?? "")
  }, [])

  const updateThreadViewportMetrics = useCallback(() => {
    const viewport = transcriptViewportRef.current
    if (!viewport) {
      return
    }
    setThreadViewportMetrics({
      scrollTop: viewport.scrollTop,
      scrollHeight: Math.max(1, viewport.scrollHeight),
      clientHeight: Math.max(1, viewport.clientHeight),
    })
  }, [])

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

  const setMessageElementRef = useCallback((messageId: string, element: HTMLElement | null) => {
    if (!element) {
      messageElementRefs.current.delete(messageId)
      return
    }
    messageElementRefs.current.set(messageId, element)
  }, [])

  const toggleExpandedReplacedStreams = useCallback((messageId: string) => {
    setExpandedReplacedStreamMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }))
  }, [])

  useEffect(() => {
    if (!activeProvider) {
      return
    }
    const nextModel =
      (modelRef && activeProvider.modelOptions.includes(modelRef) ? modelRef : null) ??
      activeProvider.modelOptions.find((option) => option === activeProvider.defaultModelRef) ??
      activeProvider.modelOptions[0] ??
      activeProvider.defaultModelRef
    setModelRef(nextModel)
    setAuthProfile(activeProvider.authProfiles[0] ?? "")
  }, [activeProvider, modelRef])

  useEffect(() => {
    syncCurrentChatSettingsFromSession(activeSession)
    setReplyTargetMessageId(null)
  }, [activeSessionId, syncCurrentChatSettingsFromSession])

  useEffect(() => {
    if (activeSession && renamingSessionId === activeSession.id) {
      setRenameTitle(activeSession.title)
    }
  }, [activeSession?.title, activeSession?.id, renamingSessionId])

  useEffect(() => {
    if (!activeSessionProvider) {
      return
    }
    const nextModel =
      (activeSessionModelRef && activeSessionProvider.modelOptions.includes(activeSessionModelRef)
        ? activeSessionModelRef
        : null) ??
      activeSessionProvider.modelOptions.find((option) => option === activeSessionModelRef) ??
      activeSessionProvider.modelOptions.find(
        (option) => option === activeSessionProvider.defaultModelRef,
      ) ??
      activeSessionProvider.modelOptions[0] ??
      activeSessionProvider.defaultModelRef
    if (nextModel !== activeSessionModelRef) {
      setActiveSessionModelRef(nextModel)
    }

    const nextAuthProfile =
      activeSessionProvider.authProfiles.find((option) => option === activeSessionAuthProfile) ??
      activeSessionProvider.authProfiles[0] ??
      ""
    if (nextAuthProfile !== activeSessionAuthProfile) {
      setActiveSessionAuthProfile(nextAuthProfile)
    }
  }, [activeSessionAuthProfile, activeSessionModelRef, activeSessionProvider])

  useEffect(() => {
    if (!activeSessionId) {
      setComposerText("")
      setComposerImages([])
      return
    }
    setComposerText(readDraft(activeSessionId))
    setComposerImages([])
  }, [activeSessionId])

  useEffect(() => {
    pendingSessionOpenScrollRef.current = activeSessionId || null
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
    if (!activeSessionId || pendingSessionOpenScrollRef.current !== activeSessionId) {
      return
    }

    const viewport = transcriptViewportRef.current
    if (!viewport) {
      return
    }

    let cancelled = false
    const timerHandles: number[] = []

    const flushScrollToBottom = () => {
      if (cancelled) {
        return
      }
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "auto",
      })
      updateThreadViewportMetrics()
    }

    timerHandles.push(
      window.setTimeout(flushScrollToBottom, 0),
      window.setTimeout(flushScrollToBottom, 80),
      window.setTimeout(() => {
        flushScrollToBottom()
        pendingSessionOpenScrollRef.current = null
      }, 220),
    )

    return () => {
      cancelled = true
      for (const handle of timerHandles) {
        window.clearTimeout(handle)
      }
    }
  }, [activeSessionId, messages.length, updateThreadViewportMetrics])

  useEffect(() => {
    updateThreadViewportMetrics()
    const viewport = transcriptViewportRef.current
    if (!viewport) {
      return
    }
    const handle = window.requestAnimationFrame(() => {
      updateThreadViewportMetrics()
    })
    return () => {
      window.cancelAnimationFrame(handle)
    }
  }, [activeSessionId, messages.length, streamingAssistantText, updateThreadViewportMetrics])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(sessionRailWidthStorageKey, String(sessionRailWidth))
  }, [sessionRailWidth])

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      const resizeState = sessionRailResizeRef.current
      if (!resizeState) {
        return
      }
      const delta = event.clientX - resizeState.startX
      setSessionRailWidth(
        Math.max(minSessionRailWidth, Math.min(maxSessionRailWidth, resizeState.startWidth + delta)),
      )
    }

    function handlePointerUp() {
      sessionRailResizeRef.current = null
    }

    window.addEventListener("mousemove", handlePointerMove)
    window.addEventListener("mouseup", handlePointerUp)
    return () => {
      window.removeEventListener("mousemove", handlePointerMove)
      window.removeEventListener("mouseup", handlePointerUp)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      setLoading(true)
      setError("")

      try {
        const [providersResponse, processBlueprintsResponse, sessionsResponse] = await Promise.all([
          apiFetch(`${props.apiRootUrl}/providers`).then(async (response) => {
            const payload = (await response.json()) as ProvidersResponse & { error?: string }
            if (!response.ok || !payload.ok || !Array.isArray(payload.providers)) {
              throw new Error(payload.error ?? "Agent Chat providers failed to load.")
            }
            return payload
          }),
          apiFetch(`${props.apiRootUrl}/process-blueprints`).then(async (response) => {
            const payload = (await response.json()) as ProcessBlueprintsResponse & { error?: string }
            if (!response.ok || !payload.ok || !Array.isArray(payload.processBlueprints)) {
              throw new Error(payload.error ?? "Agent Chat process blueprints failed to load.")
            }
            return payload
          }),
          loadSessions().then((sessions) => ({ ok: true as const, sessions })),
        ])

        if (cancelled) {
          return
        }

        setProviders(providersResponse.providers)
        setProcessBlueprints(processBlueprintsResponse.processBlueprints)
        setSessions(sessionsResponse.sessions)
        const initialSession =
          sessionsResponse.sessions.find((session) => !session.archived) ?? sessionsResponse.sessions[0]
        if (initialSession) {
          setActiveSessionId((current) => current || initialSession.id)
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
  }, [loadSessions, props.apiRootUrl])

  useEffect(() => {
    let cancelled = false

    async function refreshSessions() {
      try {
        const nextSessions = await loadSessions()
        if (cancelled) {
          return
        }
        setSessions(nextSessions)
        if (!nextSessions.some((session) => session.id === activeSessionId)) {
          const fallbackSession =
            nextSessions.find((session) => !session.archived) ?? nextSessions[0] ?? null
          setActiveSessionId(fallbackSession?.id ?? "")
        }
      } catch {
        // Keep the current list when background refresh fails.
      }
    }

    const intervalHandle = window.setInterval(() => {
      void refreshSessions()
    }, 4000)

    return () => {
      cancelled = true
      window.clearInterval(intervalHandle)
    }
  }, [activeSessionId, loadSessions])

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
    setWsStatus("connecting")
    const protocols = dashboardSessionWebSocketProtocols()
    const socket =
      protocols.length > 0
        ? new WebSocket(socketUrl.toString(), protocols)
        : new WebSocket(socketUrl.toString())

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
        setMessages((current) => mergeMessagesById(current, payload.messages))
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, payload.queuedMessages.length)
        if (payload.messages.some((message) => message.role === "assistant")) {
          setStreamingAssistantText("")
        }
        return
      }

      if (payload.type === "run.started") {
        setMessages((current) => mergeMessagesById(current, payload.messages))
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
        updateActiveSessionRuntime(payload.activity, payload.queuedMessages.length)
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

  const activateSessionFromList = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setMobileSessionsOpen(false)
  }, [])

  async function setSessionArchived(sessionId: string, archived: boolean) {
    setArchivingSessionId(sessionId)
    setError("")

    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          archived,
        }),
      })
      const payload = (await response.json()) as SessionSnapshotResponse & { error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? (archived ? "Archive failed." : "Restore failed."))
      }

      mergeSession(payload.session)
      if (payload.session.id === activeSessionId) {
        setMessages(payload.messages)
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
      }
      if (!archived) {
        setShowArchivedSessions(true)
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : archived
            ? "Archive failed."
            : "Restore failed.",
      )
    } finally {
      setArchivingSessionId(null)
    }
  }

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
          processBlueprintId: processBlueprintId || null,
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
      setComposerImages([])
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

  async function updateCurrentChatSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeSessionId || !activeSession || !activeSessionDirectory.trim()) {
      return
    }

    const nextPayload: Record<string, string | null> = {}
    if (activeSessionDirectory.trim() !== activeSession.cwd) {
      nextPayload.cwd = activeSessionDirectory.trim()
    }
    if (activeSessionProviderKind !== activeSession.providerKind) {
      nextPayload.providerKind = activeSessionProviderKind
    }
    if (activeSessionModelRef !== activeSession.modelRef) {
      nextPayload.modelRef = activeSessionModelRef
    }
    if (activeSessionAuthProfile !== (activeSession.authProfile ?? "")) {
      nextPayload.authProfile = activeSessionAuthProfile || null
    }
    if (activeSessionImageModelRef !== (activeSession.imageModelRef ?? "")) {
      nextPayload.imageModelRef = activeSessionImageModelRef || null
    }
    if (activeSessionProcessBlueprintId !== (activeSession.processBlueprintId ?? "")) {
      nextPayload.processBlueprintId = activeSessionProcessBlueprintId || null
    }

    if (Object.keys(nextPayload).length === 0) {
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
        body: JSON.stringify(nextPayload),
      })
      const payload = (await response.json()) as SessionSnapshotResponse & { error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Chat settings update failed.")
      }
      mergeSession(payload.session)
      setMessages(payload.messages)
      setQueuedMessages(payload.queuedMessages)
      setActivity(payload.activity)
      syncCurrentChatSettingsFromSession(payload.session)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Chat settings update failed.")
    } finally {
      setUpdatingDirectory(false)
    }
  }

  function handleCurrentChatSettingsFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  async function updateActiveSessionProcessQuickSet(nextProcessBlueprintId: string) {
    if (!activeSessionId || !activeSession) {
      return
    }

    const normalizedProcessBlueprintId = nextProcessBlueprintId || null
    const forceProcessBlueprintReapply =
      processResolutionRequired &&
      (activeSession.processBlueprintId ?? null) === normalizedProcessBlueprintId
    if (
      (activeSession.processBlueprintId ?? null) === normalizedProcessBlueprintId &&
      !forceProcessBlueprintReapply
    ) {
      return
    }

    setUpdatingQuickProcessBlueprint(true)
    setError("")

    try {
      const response = await apiFetch(`${props.apiRootUrl}/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          processBlueprintId: normalizedProcessBlueprintId,
          forceProcessBlueprintReapply,
        }),
      })
      const payload = (await response.json()) as SessionSnapshotResponse & { error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Process update failed.")
      }
      mergeSession(payload.session)
      setMessages(payload.messages)
      setQueuedMessages(payload.queuedMessages)
      setActivity(payload.activity)
      syncCurrentChatSettingsFromSession(payload.session)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Process update failed.")
    } finally {
      setUpdatingQuickProcessBlueprint(false)
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
    if (!activeSessionId || (!composerText.trim() && composerImages.length === 0)) {
      return
    }
    if (processResolutionRequired) {
      setError("Choose the next process before sending.")
      quickProcessSelectRef.current?.focus()
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
          content: [
            ...(composerText.trim()
              ? [
                  {
                    type: "text" as const,
                    text: composerText,
                  },
                ]
              : []),
            ...composerImages.map((image) => ({
              type: "image" as const,
              dataUrl: image.dataUrl,
            })),
          ],
          replyToMessageId: replyTargetMessageId,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Message send failed.")
      }
      setComposerText("")
      setComposerImages([])
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
        if (
          !activeSession ||
          sending ||
          processResolutionRequired ||
          (!composerText.trim() && composerImages.length === 0)
        ) {
          if (processResolutionRequired) {
            setError("Choose the next process before sending.")
            quickProcessSelectRef.current?.focus()
          }
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
    [
      activeSession,
      activity.canInterrupt,
      activity.status,
      composerImages.length,
      composerText,
      interrupting,
      processResolutionRequired,
      sending,
    ],
  )

  const handleComposerPaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)

      if (imageFiles.length === 0) {
        return
      }

      event.preventDefault()

      const pastedText = event.clipboardData.getData("text/plain")
      if (pastedText && composerInputRef.current) {
        setComposerText((current) =>
          insertTextAtSelection(composerInputRef.current!, current, pastedText),
        )
      }

      try {
        const nextImages = await Promise.all(imageFiles.map((file) => readClipboardImage(file)))
        setComposerImages((current) => [...current, ...nextImages])
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "Clipboard image paste failed.",
        )
      }
    },
    [],
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
      {mobileSessionsOpen ? (
        <button
          type="button"
          aria-label="Close sessions"
          onClick={() => setMobileSessionsOpen(false)}
          className="fixed inset-0 z-10 bg-slate-950/70 backdrop-blur-sm md:hidden"
        />
      ) : null}
      <aside
        className={`${
          mobileSessionsOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-20 w-[86vw] max-w-sm border-r border-white/10 bg-slate-950/95 p-3 backdrop-blur transition md:static md:max-w-none md:translate-x-0 md:border-r md:p-4`}
        style={!mobileSessionsOpen ? { width: sessionRailWidth } : undefined}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">
                Agent Chat
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
            <div className="relative">
              <IconButton
                label={sessionListMenuOpen ? "Hide session list menu" : "Show session list menu"}
                title={sessionListMenuOpen ? "Hide Session List Menu" : "Session List Menu"}
                onClick={() => setSessionListMenuOpen((current) => !current)}
              >
                <MenuIcon />
              </IconButton>
              {sessionListMenuOpen ? (
                <div className="absolute left-0 top-12 z-10 w-56 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      setShowArchivedSessions((current) => !current)
                      setSessionListMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                  >
                    <span>{showArchivedSessions ? "Hide archived chats" : "Show archived chats"}</span>
                    <span className="text-xs text-slate-500">{sessions.filter((session) => session.archived).length}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <label className="block">
            <span className="sr-only">Search sessions</span>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-slate-400">
              <SearchIcon />
              <input
                value={sessionSearchQuery}
                onChange={(event) => setSessionSearchQuery(event.target.value)}
                placeholder="Search chats"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </label>

          {newChatOpen ? (
            <form
              onSubmit={createSession}
              className="max-h-[min(34rem,calc(100dvh-15rem))] space-y-4 overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-4"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  New Chat
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
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Process
                </span>
                <select
                  value={processBlueprintId}
                  onChange={(event) => setProcessBlueprintId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="">none</option>
                  {processBlueprints.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
                {processBlueprintId ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {processBlueprints.find((entry) => entry.id === processBlueprintId)?.expectation ?? ""}
                  </p>
                ) : null}
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

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4 text-sm text-slate-400">
                  Loading sessions...
                </div>
              ) : mainSessions.length === 0 && (!showArchivedSessions || archivedSessions.length === 0) ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4 text-sm text-slate-400">
                  {sessionSearchQuery.trim()
                    ? "No chats match this search."
                    : "No chats yet. Use the settings menu to start one."}
                </div>
              ) : (
                <>
                  {mainSessions.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Chats
                        </p>
                        <p className="text-[11px] text-slate-600">{mainSessions.length}</p>
                      </div>
                      {mainSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`relative rounded-2xl border px-3 py-3 transition ${sessionCardTone(
                            session.activity,
                            session.id === activeSessionId,
                            session.archived,
                          )}`}
                        >
                          {renamingSessionId !== session.id ? (
                            <button
                              type="button"
                              aria-label={`Open chat ${session.title}`}
                              onClick={() => activateSessionFromList(session.id)}
                              className="absolute inset-0 z-10 rounded-2xl"
                            />
                          ) : null}
                          <div className="relative flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 text-left">
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                  session.activity.status === "running"
                                    ? "bg-emerald-300/15 text-emerald-100"
                                    : session.activity.status === "queued"
                                      ? "bg-amber-300/15 text-amber-100"
                                      : session.activity.status === "error"
                                        ? "bg-rose-300/15 text-rose-100"
                                        : "bg-white/10 text-slate-300"
                                }`}>
                                  {activityLabel(session.activity)}
                                </span>
                                <span className="text-[11px] text-slate-500">{session.messageCount}</span>
                              </div>
                              <p className="mt-2 truncate text-base font-semibold leading-5 text-white">
                                {session.title}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-slate-500">
                                {session.providerKind} · {session.modelRef}
                              </p>
                              {processBlueprintTitle(processBlueprints, session.processBlueprintId) ? (
                                <p className="mt-2 truncate text-[11px] text-cyan-200/80">
                                  {processBlueprintTitle(processBlueprints, session.processBlueprintId)}
                                </p>
                              ) : null}
                            </div>
                            <div className="relative z-20 flex items-center gap-1">
                              <button
                                type="button"
                                aria-label="Rename chat"
                                title="Rename Chat"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setRenamingSessionId(session.id)
                                  setRenameTitle(session.title)
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300"
                              >
                                <EditIcon />
                              </button>
                              <button
                                type="button"
                                aria-label="Archive chat"
                                title="Archive Chat"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void setSessionArchived(session.id, true)
                                }}
                                disabled={archivingSessionId === session.id}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <ArchiveIcon />
                              </button>
                            </div>
                          </div>
                          {renamingSessionId === session.id ? (
                            <form
                              onSubmit={renameSession}
                              className="relative z-20 mt-3 flex gap-2"
                            >
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
                          <p className="mt-2 text-xs text-slate-400">
                            {summarizeSessionWorkerState(
                              session.activity,
                              session.queuedMessageCount,
                              nowMs,
                            ).join(" · ")}
                          </p>
                          {watchdogAttentionLabel(session.watchdogState) ? (
                            <p className="mt-2 text-xs text-amber-200">
                              {watchdogAttentionLabel(session.watchdogState)}
                            </p>
                          ) : null}
                          <p className="mt-2 truncate text-[11px] text-slate-500">
                            {session.cwd}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {showArchivedSessions ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Archived
                        </p>
                        <p className="text-[11px] text-slate-600">{archivedSessions.length}</p>
                      </div>
                      {archivedSessions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4 text-sm text-slate-400">
                          {sessionSearchQuery.trim()
                            ? "No archived chats match this search."
                            : "No archived chats."}
                        </div>
                      ) : (
                        archivedSessions.map((session) => (
                          <div
                            key={session.id}
                            className={`relative rounded-2xl border px-3 py-3 transition ${sessionCardTone(
                              session.activity,
                              session.id === activeSessionId,
                              true,
                            )}`}
                          >
                            <button
                              type="button"
                              aria-label={`Open chat ${session.title}`}
                              onClick={() => activateSessionFromList(session.id)}
                              className="absolute inset-0 z-10 rounded-2xl"
                            />
                            <div className="relative flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 text-left">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                                    archived
                                  </span>
                                  <span className="text-[11px] text-slate-500">{session.messageCount}</span>
                                </div>
                                <p className="mt-2 truncate text-base font-semibold text-white">
                                  {session.title}
                                </p>
                                <p className="mt-1 truncate text-[11px] text-slate-500">
                                  {session.providerKind} · {session.modelRef}
                                </p>
                                {processBlueprintTitle(processBlueprints, session.processBlueprintId) ? (
                                  <p className="mt-2 truncate text-[11px] text-cyan-200/80">
                                    {processBlueprintTitle(processBlueprints, session.processBlueprintId)}
                                  </p>
                                ) : null}
                              </div>
                              <div className="relative z-20 flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label="Restore chat"
                                  title="Restore Chat"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void setSessionArchived(session.id, false)
                                  }}
                                  disabled={archivingSessionId === session.id}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <RestoreIcon />
                                </button>
                              </div>
                            </div>
                            <p className="mt-3 truncate text-sm text-slate-300">
                              {session.preview ?? "No messages yet"}
                            </p>
                            <p className="mt-3 text-xs text-slate-400">
                              {summarizeSessionWorkerState(
                                session.activity,
                                session.queuedMessageCount,
                                nowMs,
                              ).join(" · ")}
                            </p>
                            {watchdogAttentionLabel(session.watchdogState) ? (
                              <p className="mt-2 text-xs text-amber-200">
                                {watchdogAttentionLabel(session.watchdogState)}
                              </p>
                            ) : null}
                            <p className="mt-2 truncate text-[11px] text-slate-500">
                              {session.cwd}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <div
            className="absolute inset-y-0 right-0 hidden w-3 cursor-col-resize md:block"
            onMouseDown={(event) => {
              sessionRailResizeRef.current = {
                startX: event.clientX,
                startWidth: sessionRailWidth,
              }
              event.preventDefault()
            }}
          >
            <div className="absolute inset-y-0 right-0 w-px bg-white/10" />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
          <div className="min-w-0 pl-12 md:pl-0">
            <p className="truncate text-sm font-semibold text-white">
              {activeSession?.title ?? "Agent Chat"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {activeSession
                ? `${activeSession.providerKind} · ${activeSession.modelRef}${activeSession.archived ? " · archived" : ""}`
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
          <div
            ref={transcriptViewportRef}
            onScroll={updateThreadViewportMetrics}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 md:px-6"
          >
            {!activeSession ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-500">
                Start or select a chat to see the thread.
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-500">
                This chat has no messages yet.
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-[78rem] min-w-0 gap-4 overflow-x-hidden">
                <div className="min-w-0 flex-1">
                  <div className="mx-auto flex max-w-4xl flex-col gap-4">
                    {renderedTranscriptItems.map(({ message, precedingStreamCheckpoints }) => {
                      const replyTarget = message.replyToMessageId
                        ? messageMap.get(message.replyToMessageId) ?? null
                        : null
                      const queueLabel = threadMessageQueueLabel(message)
                      const replacedStreamsExpanded = !!expandedReplacedStreamMessageIds[message.id]

                      return (
                        <article
                          key={message.id}
                          ref={(element) => setMessageElementRef(message.id, element)}
                          className={`min-w-0 overflow-hidden rounded-3xl border px-4 py-3 md:px-5 md:py-4 ${
                            message.kind === "thought" || message.kind === "streamCheckpoint"
                              ? "w-full border-white/10 bg-slate-950/60 md:max-w-[64%]"
                              : message.role === "user"
                              ? "ml-auto w-full max-w-[92%] border-fuchsia-300/20 bg-fuchsia-300/10 md:max-w-[80%]"
                              : message.role === "system"
                                ? "w-full border-cyan-300/15 bg-cyan-300/5"
                                : "w-full border-white/10 bg-white/5 md:max-w-[88%]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="relative flex min-w-0 items-center gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                {message.role}
                              </p>
                              {message.kind === "directoryInstruction" ? (
                                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                                  directory
                                </span>
                              ) : null}
                              {message.kind === "thought" ? (
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                                  thought
                                </span>
                              ) : null}
                              {message.kind === "streamCheckpoint" ? (
                                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                                  stream
                                </span>
                              ) : null}
                              {queueLabel ? (
                                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-100">
                                  {queueLabel}
                                </span>
                              ) : null}
                              {message.role === "assistant" &&
                              message.kind === "chat" &&
                              precedingStreamCheckpoints.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandedReplacedStreams(message.id)}
                                  className="inline-flex items-center rounded-full border border-cyan-300/15 bg-cyan-300/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100"
                                  aria-expanded={replacedStreamsExpanded}
                                >
                                  Replaced Streams {precedingStreamCheckpoints.length}
                                </button>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-500">{formatTime(message.createdAtMs)}</p>
                          </div>

                          {replyTarget ? (
                            <div className="mt-2 min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                              Replying to {replyTarget.role} ·{" "}
                              {summarizeMessageContent(replyTarget.content, 72)}
                            </div>
                          ) : null}

                          {message.role === "assistant" &&
                          message.kind === "chat" &&
                          precedingStreamCheckpoints.length > 0 &&
                          replacedStreamsExpanded ? (
                            <div className="mt-2.5 space-y-2">
                              {precedingStreamCheckpoints.map((checkpoint, checkpointIndex) => (
                                <div
                                  key={checkpoint.id}
                                  className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                                      Replaced Stream {checkpointIndex + 1}
                                    </span>
                                    <p className="text-[10px] text-slate-500">
                                      {formatTime(checkpoint.createdAtMs)}
                                    </p>
                                  </div>
                                  <p className="mt-1.5 break-words text-sm leading-6 text-slate-200 whitespace-pre-wrap">
                                    {summarizeStreamCheckpoint(
                                      checkpoint.content[0]?.type === "text"
                                        ? checkpoint.content[0].text
                                        : "",
                                    )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {message.kind === "thought" ? (
                            <details className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Collapsed Thought Checkpoint
                              </summary>
                              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                                {message.content.map((block, index) =>
                                  block.type === "text" ? (
                                    <div key={`${message.id}-${index}`} className="space-y-3">
                                      {splitDisplayParagraphs(block.text).map((paragraph, paragraphIndex) => (
                                        <p
                                          key={`${message.id}-${index}-${paragraphIndex}`}
                                          className="break-words whitespace-pre-wrap"
                                        >
                                          {paragraph}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null,
                                )}
                              </div>
                            </details>
                          ) : (
                            <div className="mt-2.5 space-y-3 text-sm leading-6 text-slate-100">
                              {message.content.map((block, index) =>
                                block.type === "text" ? (
                                  <p key={`${message.id}-${index}`} className="break-words whitespace-pre-wrap">
                                    {block.text}
                                  </p>
                                ) : (
                                  <MessageImageAsset
                                    key={`${message.id}-${index}`}
                                    path={block.url}
                                  />
                                ),
                              )}
                            </div>
                          )}

                          {message.role === "assistant" &&
                          message.kind !== "thought" &&
                          message.kind !== "streamCheckpoint" ? (
                            <div className="mt-3 flex items-center justify-end">
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

                    {streamingAssistantText && !hasVisibleStreamCheckpoint ? (
                      <article className="w-full max-w-[88%] min-w-0 overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-400/5 p-4 md:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                            assistant
                          </p>
                          <p className="text-xs text-cyan-100/70">streaming...</p>
                        </div>
                        <p className="mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-slate-100">
                          {streamingAssistantText}
                        </p>
                      </article>
                    ) : null}
                  </div>
                </div>
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

              {activeSession?.pendingSystemInstruction && queuedSystemMessages.length === 0 ? (
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                    Next Turn Instruction
                  </p>
                  <p className="mt-3 text-sm text-cyan-50">
                    {clipText(activeSession.pendingSystemInstruction, 240)}
                  </p>
                </div>
              ) : null}

              {queuedSystemMessages.length > 0 ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                    Waiting for Agent
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-amber-50">
                    {queuedSystemMessages.map((message) => (
                      <div
                        key={message.id}
                        className="rounded-2xl border border-amber-300/15 bg-black/10 px-3 py-2"
                      >
                        {message.role === "system" && message.kind === "directoryInstruction" ? (
                          <p>{clipText(message.content[0]?.type === "text" ? message.content[0].text : "", 120)}</p>
                        ) : message.role === "system" && message.kind === "watchdogPrompt" ? (
                          <p>
                            watchdog ·{" "}
                            {clipText(message.content[0]?.type === "text" ? message.content[0].text : "", 120)}
                          </p>
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
                      {summarizeMessageContent(activeReplyTarget.content, 108)}
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
                <div className="max-h-[min(34rem,calc(100dvh-15rem))] overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-4">
                  <form onSubmit={updateCurrentChatSettings} className="space-y-4">
                      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 rounded-t-3xl border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Current Chat
                          </p>
                          <p className="mt-2 text-sm text-slate-400">
                            Keep the current thread focused here. Use directory changes when the next turn should work elsewhere.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSettingsOpen(false)}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300"
                        >
                          Close
                        </button>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        <p>{activeSession ? `${activeSession.providerKind} · ${activeSession.modelRef}` : "No active chat selected."}</p>
                        {activeSessionProcessBlueprint ? (
                          <p className="mt-2 text-xs text-cyan-200/80">
                            {activeSessionProcessBlueprint.title}
                          </p>
                        ) : null}
                      </div>
                      {activeSession ? (
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                              Visibility
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              {activeSession.archived
                                ? "This chat is archived and hidden from the main list."
                                : "This chat is visible in the main session list."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void setSessionArchived(activeSession.id, !activeSession.archived)}
                            disabled={archivingSessionId === activeSession.id}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {archivingSessionId === activeSession.id
                              ? activeSession.archived
                                ? "Restoring..."
                                : "Archiving..."
                              : activeSession.archived
                                ? "Restore"
                                : "Archive"}
                          </button>
                        </div>
                      ) : null}
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Process
                        </span>
                        <select
                          value={settingsProcessSelectValue}
                          onChange={(event) => {
                            setActiveSessionProcessBlueprintId(event.target.value)
                            void updateActiveSessionProcessQuickSet(event.target.value)
                          }}
                          disabled={!activeSession || updatingQuickProcessBlueprint}
                          className={`mt-2 w-full rounded-2xl border bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                            processResolutionRequired
                              ? "border-rose-400/60 text-rose-100"
                              : "border-white/10"
                          }`}
                        >
                          {processResolutionRequired ? (
                            <option value={completedProcessResolutionSentinel} disabled>
                              Done
                            </option>
                          ) : null}
                          <option value="">none</option>
                          {processBlueprints.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.title}
                            </option>
                          ))}
                        </select>
                        {activeSessionProcessBlueprint ? (
                          <p className="mt-2 text-xs text-slate-500">
                            {activeSessionProcessBlueprint.expectation}
                          </p>
                        ) : null}
                        {processResolutionRequired ? (
                          <p className="mt-2 text-xs font-semibold text-rose-200">
                            Done. Choose the next process before sending the next message.
                          </p>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Provider
                        </span>
                        <select
                          value={activeSessionProviderKind}
                          onChange={(event) => setActiveSessionProviderKind(event.target.value as ProviderKind)}
                          disabled={!activeSession}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                        {activeSessionProvider?.modelOptions.length ? (
                          <select
                            value={activeSessionModelRef}
                            onChange={(event) => setActiveSessionModelRef(event.target.value)}
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {activeSessionProvider.modelOptions.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={activeSessionModelRef}
                            readOnly
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        )}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Auth Profile
                        </span>
                        {activeSessionProvider?.authProfiles.length ? (
                          <select
                            value={activeSessionAuthProfile}
                            onChange={(event) => setActiveSessionAuthProfile(event.target.value)}
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {activeSessionProvider.authProfiles.map((profile) => (
                              <option key={profile} value={profile}>
                                {profile}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={activeSessionAuthProfile}
                            readOnly
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        )}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Directory
                        </span>
                        <input
                          value={activeSessionDirectory}
                          onChange={(event) => setActiveSessionDirectory(event.target.value)}
                          onKeyDown={handleCurrentChatSettingsFieldKeyDown}
                          placeholder={defaultSessionDirectory}
                          enterKeyHint="done"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          disabled={!activeSession}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Image Model Override
                        </span>
                        <input
                          value={activeSessionImageModelRef}
                          onChange={(event) => setActiveSessionImageModelRef(event.target.value)}
                          onKeyDown={handleCurrentChatSettingsFieldKeyDown}
                          placeholder="optional provider/model"
                          enterKeyHint="done"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          disabled={!activeSession}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </label>
                      <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-white/10 bg-slate-950/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
                        <button
                          type="submit"
                          disabled={
                            !activeSession ||
                            updatingDirectory ||
                            !activeSessionDirectory.trim() ||
                            (
                              activeSessionDirectory.trim() === activeSession.cwd &&
                              activeSessionProviderKind === activeSession.providerKind &&
                              activeSessionModelRef === activeSession.modelRef &&
                              activeSessionAuthProfile === (activeSession.authProfile ?? "") &&
                              activeSessionImageModelRef === (activeSession.imageModelRef ?? "") &&
                              activeSessionProcessBlueprintId === (activeSession.processBlueprintId ?? "")
                            )
                          }
                          className="w-full rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                        >
                          {updatingDirectory ? "Saving..." : "Save Chat Settings"}
                        </button>
                      </div>
                  </form>
                </div>
              ) : null}

              {composerImages.length > 0 ? (
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                      Pasted Images
                    </p>
                    <button
                      type="button"
                      onClick={() => setComposerImages([])}
                      className="rounded-full border border-cyan-200/20 px-3 py-1 text-xs text-cyan-100"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {composerImages.map((image) => (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70"
                      >
                        <div className="flex min-h-28 min-w-28 items-center justify-center bg-slate-950/80 p-3">
                          <img
                            src={image.dataUrl}
                            alt="Pasted attachment"
                            className="max-h-28 max-w-28 object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                            image
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setComposerImages((current) =>
                                current.filter((attachment) => attachment.id !== image.id),
                              )
                            }
                            className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-slate-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <form onSubmit={submitMessage} className="space-y-3">
                <textarea
                  ref={composerInputRef}
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onPaste={(event) => {
                    void handleComposerPaste(event)
                  }}
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
                    {processResolutionRequired
                      ? "This process is done. Choose the next process before sending."
                      : "Paste images directly from the clipboard. Ctrl+Enter sends. Esc interrupts when the provider supports it."}
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="min-w-0">
                      <span className="sr-only">Quick set current chat process</span>
                      <div className="relative">
                        <select
                          ref={quickProcessSelectRef}
                          value={quickProcessSelectValue}
                          onChange={(event) => void updateActiveSessionProcessQuickSet(event.target.value)}
                          disabled={!activeSession || updatingQuickProcessBlueprint}
                          title="Quick Set Process"
                          className={`max-w-44 rounded-full border px-3 py-2 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                            processResolutionRequired
                              ? "border-rose-400/70 bg-rose-400/10 text-transparent shadow-[0_0_0_1px_rgba(251,113,133,0.18)]"
                              : activeSession?.processBlueprintId
                                ? "border-white/10 bg-slate-900/80 text-slate-200"
                                : "border-white/10 bg-slate-950/70 text-slate-500"
                          }`}
                        >
                          {processResolutionRequired ? (
                            <option value={completedProcessResolutionSentinel} disabled>
                              Done
                            </option>
                          ) : null}
                          <option value="">none</option>
                          {processBlueprints.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.title}
                            </option>
                          ))}
                        </select>
                        {processResolutionRequired ? (
                          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-xs font-semibold text-rose-200">
                            Done
                          </span>
                        ) : null}
                      </div>
                    </label>
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
                      disabled={
                        !activeSession ||
                        sending ||
                        processResolutionRequired ||
                        (!composerText.trim() && composerImages.length === 0)
                      }
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
