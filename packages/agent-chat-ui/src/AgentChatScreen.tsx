import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import {
  type ClipboardEvent,
  type FormEvent,
  Fragment,
  isValidElement,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

type SessionProviderUsage = {
  providerKind: ProviderKind
  modelContextWindow: number | null
  totalTokens: number | null
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  reasoningOutputTokens: number | null
  lastTotalTokens: number | null
  lastInputTokens: number | null
  lastOutputTokens: number | null
  lastCachedInputTokens: number | null
  lastReasoningOutputTokens: number | null
  updatedAtMs: number
}

type SessionWatchdogState = {
  status: "unconfigured" | "unresolved" | "nudged" | "completed" | "blocked"
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
  providerUsage: SessionProviderUsage | null
}

type SessionMessage = {
  id: string
  sessionId: string
  role: "user" | "assistant" | "system"
  kind:
    | "chat"
    | "directoryInstruction"
    | "watchdogPrompt"
    | "thought"
    | "streamCheckpoint"
    | "activity"
  replyToMessageId: string | null
  providerSeenAtMs: number | null
  content: Array<
    { type: "text"; text: string } | { type: "image"; url: string }
  >
  createdAtMs: number
}

type RenderedTranscriptItem =
  | {
      type: "message"
      message: SessionMessage
      precedingStreamCheckpoints: SessionMessage[]
    }
  | {
      type: "activityCluster"
      messages: SessionMessage[]
    }

type ComposerImageAttachment = {
  id: string
  dataUrl: string
  mediaType: string
}

type ComposerSubmitPayload = {
  text: string
  images: ComposerImageAttachment[]
}

type SessionSnapshotResponse = {
  ok: boolean
  session: SessionSummary
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
  activity: SessionActivity
  providerUsage?: SessionProviderUsage | null
}

type MarkdownRenderContext = {
  sessionId: string
  messageId: string
  apiRootUrl: string
  onImageKept: (payload: SessionSnapshotResponse) => void
  activeSessionId: string
  sessionMap: Map<string, SessionSummary>
  messageMap: Map<string, SessionMessage>
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
  catalogOrder: number
  expectation: string
  idlePrompt: string
  completionMode: "exact_reply"
  completionToken: string
  blockedToken: string
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
  providerUsage?: SessionProviderUsage | null
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
const sessionRailWidthStorageKey =
  "agent-infrastructure.agent-chat.session-rail-width"
const defaultSessionRailWidth = 352
const minSessionRailWidth = 280
const maxSessionRailWidth = 520
const completedProcessResolutionSentinel = "__process_done__"
const typingHeartbeatMs = 1000
const composerDraftPersistMs = 250
const transcriptRenderPageSize = 200
const minCollapsedActivityClusterSize = 3
const websocketRetryBackoffMs = [500, 1_000, 2_000, 4_000, 8_000] as const
const websocketWarningDelayMs = 5_000
const chatSessionQueryParam = "sessionId"
const chatMessageHashPrefix = "#message-"
const darkNativeSelectClass = "bg-slate-950 text-slate-100 [color-scheme:dark]"
const darkNativeOptionStyle = {
  backgroundColor: "#020617",
  color: "#f8fafc",
} as const

function preferredChatOrigin() {
  if (typeof window === "undefined") {
    return ""
  }
  return window.location.origin
}

function isEphemeralChatOrigin(origin: string) {
  if (!origin) {
    return true
  }
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return true
  }

  const hostname = url.hostname.toLowerCase()
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".trycloudflare.com") ||
    hostname.endsWith(".baseconnect-agents.com")
  )
}

function buildMessagePermalink(sessionId: string, messageId: string) {
  const origin = preferredChatOrigin()
  const url = new URL("/chat", origin || "http://127.0.0.1:3000")
  url.searchParams.set(chatSessionQueryParam, sessionId)
  url.hash = `message-${messageId}`
  return origin && !isEphemeralChatOrigin(origin)
    ? `${url.origin}${url.pathname}${url.search}${url.hash}`
    : `${url.pathname}${url.search}${url.hash}`
}

function readRequestedSessionIdFromLocation() {
  if (typeof window === "undefined") {
    return ""
  }
  const params = new URLSearchParams(window.location.search)
  return params.get(chatSessionQueryParam)?.trim() || ""
}

function readRequestedMessageIdFromLocation() {
  if (typeof window === "undefined") {
    return ""
  }
  const hash = window.location.hash || ""
  if (!hash.startsWith(chatMessageHashPrefix)) {
    return ""
  }
  return hash.slice(chatMessageHashPrefix.length).trim()
}

function iconButtonChildType(child: ReactNode) {
  return isValidElement(child) ? child.type : child
}

const IconButton = memo(
  function IconButton(props: {
    label: string
    title?: string
    disabled?: boolean
    onClick?: () => void
    children: ReactNode
    tone?: "default" | "primary" | "danger"
  }) {
    useRenderCounter("IconButton")
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
  },
  (previousProps, nextProps) =>
    previousProps.label === nextProps.label &&
    previousProps.title === nextProps.title &&
    previousProps.disabled === nextProps.disabled &&
    previousProps.onClick === nextProps.onClick &&
    previousProps.tone === nextProps.tone &&
    iconButtonChildType(previousProps.children) ===
      iconButtonChildType(nextProps.children),
)

const SessionsIcon = memo(function SessionsIcon() {
  useRenderCounter("SessionsIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <rect x="3.5" y="4.5" width="17" height="5" rx="1.5" />
      <rect x="3.5" y="14.5" width="17" height="5" rx="1.5" />
    </svg>
  )
})

const MenuIcon = memo(function MenuIcon() {
  useRenderCounter("MenuIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
})

const SendIcon = memo(function SendIcon() {
  useRenderCounter("SendIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M4 11.5 20 4l-4.5 16-3.5-6L4 11.5Z" />
      <path d="M11.5 13.5 20 4" />
    </svg>
  )
})

const StopIcon = memo(function StopIcon() {
  useRenderCounter("StopIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    </svg>
  )
})

const PlusIcon = memo(function PlusIcon() {
  useRenderCounter("PlusIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
})

const EditIcon = memo(function EditIcon() {
  useRenderCounter("EditIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M4 20h4l9.5-9.5-4-4L4 16v4Z" />
      <path d="m12.5 7.5 4 4" />
    </svg>
  )
})

const ArchiveIcon = memo(function ArchiveIcon() {
  useRenderCounter("ArchiveIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M4.5 7.5h15" />
      <rect x="3.5" y="5" width="17" height="4" rx="1.5" />
      <path d="M6.5 9.5h11v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-9Z" />
    </svg>
  )
})

const RestoreIcon = memo(function RestoreIcon() {
  useRenderCounter("RestoreIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M8 7H4v4" />
      <path d="M4.5 10.5a7.5 7.5 0 1 0 2.1-5" />
      <path d="M9.5 12h5" />
    </svg>
  )
})

const SearchIcon = memo(function SearchIcon() {
  useRenderCounter("SearchIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
})

const ScrollToBottomIcon = memo(function ScrollToBottomIcon() {
  useRenderCounter("ScrollToBottomIcon")
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current"
      strokeWidth="1.8"
    >
      <path d="M12 4v12" />
      <path d="m7 12 5 5 5-5" />
      <path d="M6 20h12" />
    </svg>
  )
})

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
  content: Array<
    { type: "text"; text: string } | { type: "image"; url: string }
  >,
  maxLength = 88,
) {
  const firstText = content.find(
    (block) => block.type === "text" && block.text.trim(),
  )
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
  const raw = Number(
    window.localStorage.getItem(sessionRailWidthStorageKey) ?? "",
  )
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
  return (
    processBlueprints.find((entry) => entry.id === processBlueprintId)?.title ??
    processBlueprintId
  )
}

function watchdogAttentionLabel(watchdogState: SessionWatchdogState) {
  if (watchdogState.status === "nudged") {
    return "Needs reply"
  }
  if (watchdogState.status === "completed") {
    return "Done"
  }
  if (watchdogState.status === "blocked") {
    return "Blocked"
  }
  return null
}

function formatCompactInteger(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null
  }
  if (value >= 1_000_000) {
    const abbreviated = value / 1_000_000
    return `${abbreviated >= 100 ? Math.round(abbreviated) : abbreviated.toFixed(abbreviated >= 10 ? 1 : 2).replace(/\.?0+$/, "")}m`
  }
  if (value >= 1000) {
    const abbreviated = value / 1000
    return `${abbreviated >= 100 ? Math.round(abbreviated) : abbreviated.toFixed(abbreviated >= 10 ? 1 : 2).replace(/\.?0+$/, "")}k`
  }
  return String(Math.round(value))
}

function formatUsagePercent(
  totalTokens: number | null,
  modelContextWindow: number | null,
) {
  if (
    totalTokens === null ||
    modelContextWindow === null ||
    modelContextWindow <= 0
  ) {
    return null
  }
  const percent = (totalTokens / modelContextWindow) * 100
  if (!Number.isFinite(percent)) {
    return null
  }
  return `${percent >= 10 ? Math.round(percent) : percent.toFixed(1).replace(/\.0$/, "")}%`
}

function summarizeProviderUsage(usage: SessionProviderUsage | null) {
  if (!usage) {
    return null
  }
  const contextUsedValue = usage.lastTotalTokens ?? usage.totalTokens
  const total = formatCompactInteger(contextUsedValue)
  const window = formatCompactInteger(usage.modelContextWindow)
  const last = formatCompactInteger(usage.lastTotalTokens)
  const cached = formatCompactInteger(
    usage.lastCachedInputTokens ?? usage.cachedInputTokens,
  )
  const percent = formatUsagePercent(contextUsedValue, usage.modelContextWindow)
  const parts: string[] = []

  if (total && window) {
    parts.push(`Context ${total} / ${window}`)
  } else if (total) {
    parts.push(`Context ${total}`)
  }

  if (percent) {
    parts.push(percent)
  }

  if (last) {
    parts.push(`Last ${last}`)
  }

  if (cached) {
    parts.push(`Cached ${cached}`)
  }

  return parts.length > 0 ? parts.join(" · ") : null
}

function mergeMessagesById(
  current: SessionMessage[],
  incoming: SessionMessage[],
) {
  const next = new Map<string, SessionMessage>()
  for (const message of current) {
    next.set(message.id, message)
  }
  for (const message of incoming) {
    next.set(message.id, message)
  }
  return Array.from(next.values()).sort(
    (left, right) => left.createdAtMs - right.createdAtMs,
  )
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

function firstTextBlock(message: SessionMessage) {
  const firstText = message.content.find((block) => block.type === "text")
  return firstText?.type === "text" ? firstText.text.trim() : ""
}

function activityClusterKey(messages: SessionMessage[]) {
  const firstId = messages[0]?.id ?? "first"
  const lastId = messages.at(-1)?.id ?? "last"
  return `${firstId}:${lastId}`
}

function normalizeActivitySummaryText(text: string) {
  return text
    .replace(/^Command (started|completed):\s*/i, "")
    .replace(/^Sub-agent (started|completed):\s*/i, "")
    .replace(/^Provider turn (started|completed)\.?\s*/i, "Provider ")
    .trim()
}

function summarizeActivityCluster(messages: SessionMessage[]) {
  const latestLabel = [...messages]
    .reverse()
    .map((message) => firstTextBlock(message))
    .find(Boolean)

  if (!latestLabel) {
    return `${messages.length} activity events`
  }

  return clipText(normalizeActivitySummaryText(latestLabel), 64)
}

function waitingSummaryLabel(
  pendingSystemInstruction: string | null | undefined,
  queuedSystemMessages: SessionMessage[],
) {
  const latestQueued = queuedSystemMessages.at(-1) ?? null
  if (latestQueued?.kind === "watchdogPrompt") {
    return queuedSystemMessages.length > 1
      ? `${queuedSystemMessages.length} waiting items, latest is a watchdog prompt`
      : "Watchdog prompt queued"
  }
  if (latestQueued?.kind === "directoryInstruction") {
    return queuedSystemMessages.length > 1
      ? `${queuedSystemMessages.length} waiting items, latest is a next-turn instruction`
      : "Next-turn instruction queued"
  }
  if (queuedSystemMessages.length > 0) {
    return `${queuedSystemMessages.length} waiting item${queuedSystemMessages.length === 1 ? "" : "s"} queued`
  }
  if (pendingSystemInstruction) {
    return "Next-turn instruction queued"
  }
  return null
}

function normalizeMarkdownImageSource(sourceUrl: string) {
  const trimmed = sourceUrl.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("~/")) {
    return `/home/ec2-user/${trimmed.slice(2)}`
  }
  return trimmed
}

function markdownImageProvenance(
  sessionId: string,
  sourceUrl: string,
): "attachment" | "temp" | "external" {
  const normalizedSourceUrl = normalizeMarkdownImageSource(sourceUrl)
  if (
    normalizedSourceUrl.startsWith(
      `/api/agent-chat/sessions/${encodeURIComponent(sessionId)}/attachments/`,
    )
  ) {
    return "attachment"
  }
  if (
    normalizedSourceUrl === "/home/ec2-user/temp" ||
    normalizedSourceUrl.startsWith("/home/ec2-user/temp/")
  ) {
    return "temp"
  }
  return "external"
}

function parseMarkdownImageLine(line: string) {
  const match = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line)
  if (!match) {
    return null
  }
  return {
    altText: match[1] ?? "Shared image",
    sourceUrl: match[2] ?? "",
  }
}

function parseStandaloneMarkdownLinkLine(line: string) {
  const match = /^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/.exec(line)
  if (!match) {
    return null
  }
  return {
    label: match[1] ?? "",
    targetUrl: match[2] ?? "",
  }
}

function parseChatReferenceTarget(targetUrl: string) {
  const normalizedTarget = targetUrl.trim()
  if (!normalizedTarget) {
    return null
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(normalizedTarget, "http://agent-chat.local")
  } catch {
    return null
  }

  if (parsedUrl.pathname !== "/chat") {
    return null
  }

  const sessionId = parsedUrl.searchParams.get(chatSessionQueryParam)?.trim() ?? ""
  const hash = parsedUrl.hash.trim()
  if (!sessionId || !hash.startsWith(chatMessageHashPrefix)) {
    return null
  }

  const messageId = hash.slice(chatMessageHashPrefix.length).trim()
  if (!messageId) {
    return null
  }

  return {
    sessionId,
    messageId,
  }
}

function isLikelyImageTarget(targetUrl: string) {
  const normalizedTarget = normalizeMarkdownImageSource(targetUrl).toLowerCase()
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/.test(normalizedTarget)
}

function renderStyledInlineMarkdown(text: string, keyPrefix: string) {
  return text
    .split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((segment, index) => {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(segment)
      if (linkMatch) {
        return (
          <a
            key={`${keyPrefix}-link-${index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-200 underline decoration-cyan-400/50 underline-offset-2 hover:text-cyan-100"
          >
            {linkMatch[1]}
          </a>
        )
      }

      if (segment.startsWith("**") && segment.endsWith("**")) {
        return (
          <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold text-white">
            {segment.slice(2, -2)}
          </strong>
        )
      }

      if (
        segment.startsWith("*") &&
        segment.endsWith("*") &&
        segment.length > 2
      ) {
        return (
          <em key={`${keyPrefix}-em-${index}`} className="italic text-slate-50">
            {segment.slice(1, -1)}
          </em>
        )
      }

      return <Fragment key={`${keyPrefix}-text-${index}`}>{segment}</Fragment>
    })
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((segment, index) => {
      if (
        segment.startsWith("`") &&
        segment.endsWith("`") &&
        segment.length >= 2
      ) {
        return (
          <code
            key={`${keyPrefix}-code-${segment.slice(1, -1)}`}
            className="rounded-md bg-slate-950/90 px-1.5 py-0.5 font-mono text-[0.92em] text-cyan-100"
          >
            {segment.slice(1, -1)}
          </code>
        )
      }
      return (
        <Fragment key={`${keyPrefix}-segment-${index}`}>
          {renderStyledInlineMarkdown(segment, `${keyPrefix}-${index}`)}
        </Fragment>
      )
    })
}

function renderMarkdownParagraph(lines: string[], keyPrefix: string) {
  return lines.map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${line}`}>
      {index > 0 ? <br /> : null}
      {renderInlineMarkdown(line, `${keyPrefix}-${line}`)}
    </Fragment>
  ))
}

function renderMarkdownBlocks(
  text: string,
  keyPrefix: string,
  context: MarkdownRenderContext,
): ReactNode[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) {
    return []
  }

  const nodes: ReactNode[] = []
  const codeBlockPattern = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null
  let blockIndex = 0

  const pushStructuredTextBlock = (lines: string[]) => {
    if (lines.length === 0) {
      return
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? "")
    if (headingMatch && lines.length === 1) {
      const level = headingMatch[1].length
      const headingClass =
        level === 1
          ? "text-lg font-semibold text-white"
          : level === 2
            ? "text-base font-semibold text-slate-100"
            : "text-sm font-semibold uppercase tracking-[0.12em] text-slate-300"
      nodes.push(
        <p key={`${keyPrefix}-heading-${blockIndex}`} className={headingClass}>
          {renderInlineMarkdown(
            headingMatch[2],
            `${keyPrefix}-heading-${blockIndex}`,
          )}
        </p>,
      )
      blockIndex += 1
      return
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      nodes.push(
        <ul
          key={`${keyPrefix}-ul-${blockIndex}`}
          className="space-y-1 pl-5 text-sm leading-6 text-slate-100 list-disc"
        >
          {lines.map((line) => (
            <li key={`${keyPrefix}-ul-${blockIndex}-${line}`}>
              {renderInlineMarkdown(
                line.replace(/^[-*]\s+/, ""),
                `${keyPrefix}-ul-${blockIndex}-${line}`,
              )}
            </li>
          ))}
        </ul>,
      )
      blockIndex += 1
      return
    }

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      nodes.push(
        <ol
          key={`${keyPrefix}-ol-${blockIndex}`}
          className="space-y-1 pl-5 text-sm leading-6 text-slate-100 list-decimal"
        >
          {lines.map((line) => (
            <li key={`${keyPrefix}-ol-${blockIndex}-${line}`}>
              {renderInlineMarkdown(
                line.replace(/^\d+\.\s+/, ""),
                `${keyPrefix}-ol-${blockIndex}-${line}`,
              )}
            </li>
          ))}
        </ol>,
      )
      blockIndex += 1
      return
    }

    if (lines.length === 1) {
      const standaloneLink = parseStandaloneMarkdownLinkLine(lines[0] ?? "")
      if (standaloneLink) {
        if (isLikelyImageTarget(standaloneLink.targetUrl)) {
          nodes.push(
            <div
              key={`${keyPrefix}-linked-image-${blockIndex}`}
              className="space-y-2"
            >
              <p className="break-words whitespace-pre-wrap text-sm leading-6 text-slate-100">
                {renderMarkdownParagraph(lines, `${keyPrefix}-p-${blockIndex}`)}
              </p>
              <MessageImageAsset
                sessionId={context.sessionId}
                messageId={context.messageId}
                apiRootUrl={context.apiRootUrl}
                sourceUrl={standaloneLink.targetUrl}
                altText={standaloneLink.label || "Linked image"}
                onImageKept={context.onImageKept}
              />
            </div>,
          )
          blockIndex += 1
          return
        }

        const chatReference = parseChatReferenceTarget(standaloneLink.targetUrl)
        if (chatReference) {
          nodes.push(
            <div
              key={`${keyPrefix}-chat-reference-${blockIndex}`}
              className="space-y-2"
            >
              <p className="break-words whitespace-pre-wrap text-sm leading-6 text-slate-100">
                {renderMarkdownParagraph(lines, `${keyPrefix}-p-${blockIndex}`)}
              </p>
              <ChatReferenceAsset
                targetUrl={standaloneLink.targetUrl}
                targetSessionId={chatReference.sessionId}
                targetMessageId={chatReference.messageId}
                activeSessionId={context.activeSessionId}
                sessionMap={context.sessionMap}
                messageMap={context.messageMap}
              />
            </div>,
          )
          blockIndex += 1
          return
        }
      }
    }

    nodes.push(
      <p
        key={`${keyPrefix}-p-${blockIndex}`}
        className="break-words whitespace-pre-wrap text-sm leading-6 text-slate-100"
      >
        {renderMarkdownParagraph(lines, `${keyPrefix}-p-${blockIndex}`)}
      </p>,
    )
    blockIndex += 1
  }

  const pushTextBlocks = (chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed) {
      return
    }
    const blocks = trimmed.split(/\n\s*\n/g).filter(Boolean)
    for (const block of blocks) {
      const lines = block.split("\n")
      const pendingTextLines: string[] = []
      const flushPendingTextLines = () => {
        if (pendingTextLines.length === 0) {
          return
        }
        pushStructuredTextBlock([...pendingTextLines])
        pendingTextLines.length = 0
      }

      for (const line of lines) {
        const markdownImage = parseMarkdownImageLine(line)
        if (markdownImage) {
          flushPendingTextLines()
          nodes.push(
            <MessageImageAsset
              key={`${keyPrefix}-image-${blockIndex}`}
              sessionId={context.sessionId}
              messageId={context.messageId}
              apiRootUrl={context.apiRootUrl}
              sourceUrl={markdownImage.sourceUrl}
              altText={markdownImage.altText}
              onImageKept={context.onImageKept}
            />,
          )
          blockIndex += 1
          continue
        }
        pendingTextLines.push(line)
      }

      flushPendingTextLines()
    }
  }

  match = codeBlockPattern.exec(normalized)
  while (match) {
    pushTextBlocks(normalized.slice(lastIndex, match.index))
    const language = match[1]?.trim() ?? ""
    const code = match[2]?.replace(/\n$/, "") ?? ""
    nodes.push(
      <div
        key={`${keyPrefix}-codeblock-${blockIndex}`}
        className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/85"
      >
        {language ? (
          <div className="border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {language}
          </div>
        ) : null}
        <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-6 text-slate-100">
          <code className="font-mono">{code}</code>
        </pre>
      </div>,
    )
    blockIndex += 1
    lastIndex = codeBlockPattern.lastIndex
    match = codeBlockPattern.exec(normalized)
  }

  pushTextBlocks(normalized.slice(lastIndex))
  return nodes
}

function renderRawMessageContent(message: SessionMessage) {
  return (
    <div className="space-y-2">
      {message.content.map((block, index) =>
        block.type === "text" ? (
          <pre
            key={`${message.id}-raw-text-${index}`}
            className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-3 text-[13px] leading-6 text-slate-100 whitespace-pre-wrap"
          >
            <code className="font-mono">{block.text}</code>
          </pre>
        ) : (
          <pre
            key={`${message.id}-raw-image-${index}`}
            className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-3 text-[13px] leading-6 text-slate-100 whitespace-pre-wrap"
          >
            <code className="font-mono">{block.url}</code>
          </pre>
        ),
      )}
    </div>
  )
}

function ChatReferenceAsset(props: {
  targetUrl: string
  targetSessionId: string
  targetMessageId: string
  activeSessionId: string
  sessionMap: Map<string, SessionSummary>
  messageMap: Map<string, SessionMessage>
}) {
  const session = props.sessionMap.get(props.targetSessionId) ?? null
  const message =
    props.targetSessionId === props.activeSessionId
      ? (props.messageMap.get(props.targetMessageId) ?? null)
      : null
  const preview = message ? summarizeMessageContent(message.content, 140) : ""

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04]">
      <div className="border-b border-cyan-300/10 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
              Chat reference
            </span>
            {session ? (
              <span className="min-w-0 truncate text-xs text-slate-200">
                {session.title}
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Chat reference unavailable
              </span>
            )}
          </div>
          <a
            href={props.targetUrl}
            className="text-xs text-cyan-200 underline decoration-cyan-400/50 underline-offset-2 hover:text-cyan-100"
          >
            Open chat
          </a>
        </div>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs text-slate-300">
        <p>
          Session:{" "}
          <span className="font-mono text-slate-200">{props.targetSessionId}</span>
        </p>
        <p>
          Message:{" "}
          <span className="font-mono text-slate-200">{props.targetMessageId}</span>
        </p>
        {message ? (
          <>
            <p>
              {message.role} · {formatTime(message.createdAtMs)}
            </p>
            {preview ? <p className="text-slate-200">{preview}</p> : null}
          </>
        ) : (
          <p className="text-slate-400">
            Open that chat to load the referenced message preview.
          </p>
        )}
      </div>
    </div>
  )
}

function MessageImageAsset(props: {
  sessionId: string
  messageId: string
  apiRootUrl: string
  sourceUrl: string
  altText: string
  onImageKept: (payload: SessionSnapshotResponse) => void
}) {
  useRenderCounter("MessageImageAsset")
  const [assetUrl, setAssetUrl] = useState("")
  const [error, setError] = useState("")
  const [keeping, setKeeping] = useState(false)
  const normalizedSourceUrl = normalizeMarkdownImageSource(props.sourceUrl)
  const provenance = markdownImageProvenance(props.sessionId, props.sourceUrl)
  const canDirectRenderExternal =
    provenance === "external" &&
    /^https?:\/\//i.test(normalizedSourceUrl)

  useEffect(() => {
    let active = true
    let nextObjectUrl = ""

    async function loadAsset() {
      try {
        const response = await apiFetch(
          `${props.apiRootUrl}/sessions/${props.sessionId}/media?source=${encodeURIComponent(normalizedSourceUrl)}`,
        )
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null
          throw new Error(
            payload?.error ??
              `Image request failed with status ${response.status}.`,
          )
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

        if (canDirectRenderExternal) {
          setAssetUrl(normalizedSourceUrl)
          setError("")
          return
        }

        setAssetUrl("")
        setError(
          nextError instanceof Error ? nextError.message : "Image unavailable.",
        )
      }
    }

    void loadAsset()

    return () => {
      active = false
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl)
      }
    }
  }, [
    canDirectRenderExternal,
    normalizedSourceUrl,
    props.apiRootUrl,
    props.sessionId,
  ])

  const keepImage = async () => {
    setKeeping(true)
    setError("")
    try {
      const response = await apiFetch(
        `${props.apiRootUrl}/sessions/${props.sessionId}/messages/${props.messageId}/keep-image`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            sourceUrl: props.sourceUrl,
          }),
        },
      )
      const payload = (await response.json()) as
        | (SessionSnapshotResponse & { error?: string })
        | { error?: string }
      if (!response.ok || !("ok" in payload) || !payload.ok) {
        throw new Error(payload.error ?? "Image could not be kept.")
      }
      props.onImageKept(payload)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Image could not be kept.",
      )
    } finally {
      setKeeping(false)
    }
  }

  const provenanceLabel =
    provenance === "attachment"
      ? "Attached"
      : provenance === "temp"
        ? "Temp image"
        : "External image"
  const provenanceClassName =
    provenance === "attachment"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : provenance === "temp"
        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
        : "border-amber-400/30 bg-amber-400/10 text-amber-100"

  return (
    <div className="block overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
      <div className="flex max-h-[28rem] min-h-24 items-center justify-center bg-slate-950/80 p-3">
        {assetUrl ? (
          <a href={assetUrl} target="_blank" rel="noreferrer">
            <img
              src={assetUrl}
              alt={props.altText || "Shared image"}
              className="max-h-[calc(28rem-1.5rem)] max-w-full object-contain"
            />
          </a>
        ) : (
          <div className="text-xs text-slate-400">
            {error || "Loading image..."}
          </div>
        )}
      </div>
      <div className="border-t border-white/10 px-3 py-2 text-xs text-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${provenanceClassName}`}
            >
              {provenanceLabel}
            </span>
            {error ? <span className="text-rose-300">{error}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {assetUrl ? (
              <a href={assetUrl} target="_blank" rel="noreferrer">
                Open image
              </a>
            ) : (
              <span>Image preview</span>
            )}
            {provenance !== "attachment" ? (
              <button
                type="button"
                onClick={() => void keepImage()}
                disabled={keeping}
                className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {keeping ? "Keeping..." : "Keep image"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

const ComposerPanel = memo(
  function ComposerPanel(props: {
    activeSession: SessionSummary | null
    sending: boolean
    interrupting: boolean
    activity: SessionActivity
    threadStatusSummary: string[]
    processResolutionRequired: boolean
    processTerminalStatus: "completed" | "blocked" | null
    quickProcessSelectValue: string
    processBlueprints: ProcessBlueprint[]
    activeProcessBlueprintId: string | null
    updatingQuickProcessBlueprint: boolean
    settingsOpen: boolean
    onToggleSettings: () => void
    onQuickProcessChange: (nextProcessBlueprintId: string) => void
    onInterrupt: () => void
    onSubmitMessage: (payload: ComposerSubmitPayload) => Promise<boolean>
    onReportTyping: (
      active: boolean,
      options?: { force?: boolean; sessionId?: string },
    ) => Promise<void>
    onSetError: (message: string) => void
  }) {
    useRenderCounter("ComposerPanel")
    const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
    const quickProcessSelectRef = useRef<HTMLSelectElement | null>(null)
    const draftPersistTimeoutRef = useRef<ReturnType<
      typeof window.setTimeout
    > | null>(null)
    const latestDraftRef = useRef("")
    const previousSessionIdRef = useRef<string | null>(null)
    const lastTypingReportAtRef = useRef(0)
    const typingActiveRef = useRef(false)
    const [hasComposerText, setHasComposerText] = useState(false)
    const [composerImages, setComposerImages] = useState<
      ComposerImageAttachment[]
    >([])

    useEffect(() => {
      if (!props.activeSession?.id) {
        if (draftPersistTimeoutRef.current !== null) {
          window.clearTimeout(draftPersistTimeoutRef.current)
          draftPersistTimeoutRef.current = null
        }
        previousSessionIdRef.current = null
        latestDraftRef.current = ""
        lastTypingReportAtRef.current = 0
        typingActiveRef.current = false
        if (composerInputRef.current) {
          composerInputRef.current.value = ""
        }
        setHasComposerText(false)
        setComposerImages([])
        return
      }

      const previousSessionId = previousSessionIdRef.current
      if (previousSessionId && previousSessionId !== props.activeSession.id) {
        writeDraft(previousSessionId, latestDraftRef.current)
      }

      const nextDraft = readDraft(props.activeSession.id)
      previousSessionIdRef.current = props.activeSession.id
      latestDraftRef.current = nextDraft
      lastTypingReportAtRef.current = 0
      typingActiveRef.current = false
      if (composerInputRef.current) {
        composerInputRef.current.value = nextDraft
      }
      setHasComposerText(nextDraft.trim().length > 0)
      setComposerImages([])
    }, [props.activeSession?.id])

    const scheduleDraftPersist = useCallback((sessionId: string) => {
      if (draftPersistTimeoutRef.current !== null) {
        window.clearTimeout(draftPersistTimeoutRef.current)
      }

      draftPersistTimeoutRef.current = window.setTimeout(() => {
        writeDraft(sessionId, latestDraftRef.current)
        draftPersistTimeoutRef.current = null
      }, composerDraftPersistMs)
    }, [])

    useEffect(() => {
      return () => {
        if (draftPersistTimeoutRef.current !== null) {
          window.clearTimeout(draftPersistTimeoutRef.current)
        }
        if (previousSessionIdRef.current) {
          writeDraft(previousSessionIdRef.current, latestDraftRef.current)
        }
      }
    }, [])

    const reportComposerTyping = useCallback(
      async (active: boolean, options?: { force?: boolean }) => {
        const sessionId = props.activeSession?.id
        if (!sessionId) {
          return
        }

        if (!active) {
          typingActiveRef.current = false
          lastTypingReportAtRef.current = 0
          await props.onReportTyping(false, {
            force: options?.force,
            sessionId,
          })
          return
        }

        const now = Date.now()
        if (
          options?.force ||
          !typingActiveRef.current ||
          now - lastTypingReportAtRef.current >= typingHeartbeatMs
        ) {
          typingActiveRef.current = true
          lastTypingReportAtRef.current = now
          await props.onReportTyping(true, {
            force: options?.force,
            sessionId,
          })
          return
        }

        typingActiveRef.current = true
      },
      [props.activeSession?.id, props.onReportTyping],
    )

    const hasComposerContent = hasComposerText || composerImages.length > 0

    const submitComposer = useCallback(async () => {
      if (!props.activeSession || !hasComposerContent) {
        return
      }
      if (props.processResolutionRequired) {
        props.onSetError("Choose the next process before sending.")
        quickProcessSelectRef.current?.focus()
        return
      }

      const didSend = await props.onSubmitMessage({
        text: latestDraftRef.current,
        images: composerImages,
      })
      if (!didSend) {
        return
      }
      latestDraftRef.current = ""
      if (props.activeSession?.id) {
        writeDraft(props.activeSession.id, "")
      }
      if (composerInputRef.current) {
        composerInputRef.current.value = ""
      }
      setHasComposerText(false)
      setComposerImages([])
      await reportComposerTyping(false, { force: true })
    }, [
      composerImages,
      hasComposerContent,
      props.activeSession,
      props.onSetError,
      props.onSubmitMessage,
      props.processResolutionRequired,
      reportComposerTyping,
    ])

    const handleComposerKeyDown = useCallback(
      (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault()
          void submitComposer()
          return
        }

        if (
          event.key === "Escape" &&
          props.activity.canInterrupt &&
          props.activity.status === "running" &&
          !props.interrupting
        ) {
          event.preventDefault()
          props.onInterrupt()
        }
      },
      [
        props.activity.canInterrupt,
        props.activity.status,
        props.interrupting,
        props.onInterrupt,
        submitComposer,
      ],
    )

    const handleComposerPaste = useCallback(
      async (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboardItems = Array.from(event.clipboardData.items || [])
        const imageItems = clipboardItems.filter((item) =>
          item.type.startsWith("image/"),
        )
        if (imageItems.length === 0) {
          return
        }

        event.preventDefault()
        try {
          const nextImages = await Promise.all(
            imageItems.map((item, index) =>
              readClipboardImage(item.getAsFile() as File).then(
                (attachment) => ({
                  ...attachment,
                  id: attachment.id || `${Date.now()}-${index}`,
                }),
              ),
            ),
          )
          setComposerImages((current) => [...current, ...nextImages])
        } catch (error) {
          props.onSetError(
            error instanceof Error ? error.message : "Image paste failed.",
          )
        }
      },
      [props.onSetError],
    )

    return (
      <>
        {composerImages.length > 0 ? (
          <div className="relative z-10 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 shadow-2xl">
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
                          current.filter(
                            (attachment) => attachment.id !== image.id,
                          ),
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

        <div
          className={`relative rounded-none border border-x-0 px-1.5 pb-2 pt-2.5 shadow-[0_0_0_1px_rgba(15,23,42,0.22)] sm:rounded-2xl sm:border-x sm:px-2 sm:pb-2.5 sm:pt-3 md:px-3 md:pb-3 md:pt-4 ${
            props.processResolutionRequired
              ? props.processTerminalStatus === "blocked"
                ? "border-rose-400/35 bg-rose-500/[0.04]"
                : "border-amber-300/30 bg-slate-900/90"
              : "border-white/10 bg-slate-900/90"
          }`}
        >
          {props.activeSession ? (
            <div className="pointer-events-none absolute -top-4.5 left-1.5 z-10 sm:left-2 sm:-top-4 md:-top-3 md:left-3">
              <div
                className={`inline-flex max-w-[calc(100vw-7rem)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur ${activityTone(props.activity)}`}
              >
                <span className="truncate">
                  {props.threadStatusSummary[0] ??
                    activityLabel(props.activity)}
                </span>
                {props.threadStatusSummary.slice(1, 2).map((item) => (
                  <span
                    key={item}
                    className="truncate normal-case tracking-normal"
                  >
                    {item}
                  </span>
                ))}
                {props.interrupting ? (
                  <span className="normal-case tracking-normal">
                    interrupting...
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          <textarea
            ref={composerInputRef}
            defaultValue=""
            onChange={(event) => {
              const nextValue = event.target.value
              latestDraftRef.current = nextValue
              setHasComposerText((current) => {
                const nextHasText = nextValue.trim().length > 0
                return current === nextHasText ? current : nextHasText
              })
              if (props.activeSession?.id) {
                scheduleDraftPersist(props.activeSession.id)
              }
              void reportComposerTyping(true)
            }}
            onFocus={() => void reportComposerTyping(true, { force: true })}
            onBlur={() => void reportComposerTyping(false, { force: true })}
            onKeyDown={handleComposerKeyDown}
            onPaste={(event) => {
              void handleComposerPaste(event)
            }}
            rows={2}
            placeholder={
              props.activeSession
                ? "Write the next message..."
                : "Select or create a chat first."
            }
            disabled={!props.activeSession || props.sending}
            className="min-h-[5rem] w-full resize-y border-0 bg-transparent px-0 py-0.5 text-base text-white outline-none disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[6.25rem] md:px-1 md:py-1 md:text-sm"
          />
          <div className="mt-1.5 flex items-center gap-1.5 md:mt-2 md:gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Quick set current chat process</span>
              <div className="relative">
                <select
                  ref={quickProcessSelectRef}
                  value={props.quickProcessSelectValue}
                  onChange={(event) =>
                    props.onQuickProcessChange(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                    }
                  }}
                  disabled={
                    !props.activeSession || props.updatingQuickProcessBlueprint
                  }
                  title="Quick Set Process"
                  className={`w-full min-w-0 rounded-full border px-3 py-2 pr-8 text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs ${darkNativeSelectClass} ${
                    props.processResolutionRequired
                      ? props.processTerminalStatus === "blocked"
                        ? "border-rose-400/50 pl-24 pr-12 shadow-[0_0_0_1px_rgba(251,113,133,0.16)]"
                        : "border-amber-300/45 pl-20 pr-12 shadow-[0_0_0_1px_rgba(252,211,77,0.12)]"
                      : props.activeProcessBlueprintId
                        ? "border-white/10"
                        : "border-white/10 text-slate-400"
                  }`}
                >
                  {props.processResolutionRequired ? (
                    <option
                      style={darkNativeOptionStyle}
                      value={completedProcessResolutionSentinel}
                      disabled
                    >
                      Choose next process
                    </option>
                  ) : null}
                  <option style={darkNativeOptionStyle} value="">
                    none
                  </option>
                  {props.processBlueprints.map((entry) => (
                    <option
                      style={darkNativeOptionStyle}
                      key={entry.id}
                      value={entry.id}
                    >
                      {entry.title}
                    </option>
                  ))}
                </select>
                {props.processResolutionRequired ? (
                  <>
                    <span
                      className={`pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 px-3 text-sm font-semibold md:text-xs ${
                        props.processTerminalStatus === "blocked"
                          ? "text-rose-200"
                          : "text-amber-100"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          props.processTerminalStatus === "blocked"
                            ? "bg-rose-300"
                            : "bg-amber-200"
                        }`}
                      />
                      {props.processTerminalStatus === "blocked"
                        ? "Blocked"
                        : "Done"}
                    </span>
                    <span
                      title={`Choose the next process before sending. The previous process is ${props.processTerminalStatus === "blocked" ? "blocked" : "done"}.`}
                      className={`pointer-events-none absolute inset-y-0 right-8 flex items-center text-sm md:text-xs ${
                        props.processTerminalStatus === "blocked"
                          ? "text-rose-200"
                          : "text-amber-100"
                      }`}
                    >
                      !
                    </span>
                  </>
                ) : null}
              </div>
            </label>
            <IconButton
              label={
                props.settingsOpen ? "Hide settings menu" : "Show settings menu"
              }
              title={props.settingsOpen ? "Hide Menu" : "Menu"}
              onClick={props.onToggleSettings}
            >
              <MenuIcon />
            </IconButton>
            {props.activity.canInterrupt &&
            props.activity.status === "running" ? (
              <IconButton
                label={
                  props.interrupting ? "Interrupting run" : "Interrupt run"
                }
                title={props.interrupting ? "Interrupting..." : "Interrupt"}
                onClick={props.onInterrupt}
                disabled={props.interrupting}
                tone="danger"
              >
                <StopIcon />
              </IconButton>
            ) : null}
            <button
              type="button"
              aria-label={props.sending ? "Sending message" : "Send message"}
              title={props.sending ? "Sending..." : "Send"}
              onClick={() => void submitComposer()}
              disabled={
                !props.activeSession ||
                props.sending ||
                props.processResolutionRequired ||
                !hasComposerContent
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300 text-slate-950 disabled:cursor-not-allowed disabled:border-cyan-300/20 disabled:bg-cyan-300/40"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </>
    )
  },
  (previousProps, nextProps) => {
    const previousSessionId = previousProps.activeSession?.id ?? null
    const nextSessionId = nextProps.activeSession?.id ?? null
    const previousThreadStatusKey = previousProps.threadStatusSummary.join("|")
    const nextThreadStatusKey = nextProps.threadStatusSummary.join("|")

    return (
      previousSessionId === nextSessionId &&
      previousProps.sending === nextProps.sending &&
      previousProps.interrupting === nextProps.interrupting &&
      previousProps.activity.status === nextProps.activity.status &&
      previousProps.activity.canInterrupt === nextProps.activity.canInterrupt &&
      previousThreadStatusKey === nextThreadStatusKey &&
      previousProps.processResolutionRequired ===
        nextProps.processResolutionRequired &&
      previousProps.processTerminalStatus === nextProps.processTerminalStatus &&
      previousProps.quickProcessSelectValue ===
        nextProps.quickProcessSelectValue &&
      previousProps.processBlueprints === nextProps.processBlueprints &&
      previousProps.activeProcessBlueprintId ===
        nextProps.activeProcessBlueprintId &&
      previousProps.updatingQuickProcessBlueprint ===
        nextProps.updatingQuickProcessBlueprint &&
      previousProps.settingsOpen === nextProps.settingsOpen
    )
  },
)

function sessionCardTone(
  activity: SessionActivity,
  active: boolean,
  archived: boolean,
) {
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

function sessionCardRuntimeNowMs(session: SessionSummary, nowMs: number) {
  return session.activity.status === "running" ? nowMs : 0
}

type SessionCardProps = {
  session: SessionSummary
  isActive: boolean
  processTitle: string | null
  runtimeNowMs: number
  onActivateSession: (sessionId: string) => void
}

type MainSessionCardProps = SessionCardProps & {
  isRenaming: boolean
  renameTitle: string
  renaming: boolean
  isArchiving: boolean
  onBeginRename: (sessionId: string, title: string) => void
  onRenameTitleChange: (value: string) => void
  onRenameSubmit: () => void
  onArchiveSession: (sessionId: string) => void
}

const MainSessionCard = memo(
  function MainSessionCard(props: MainSessionCardProps) {
    useRenderCounter("MainSessionCard")
    const workerSummary = summarizeSessionWorkerState(
      props.session.activity,
      props.session.queuedMessageCount,
      props.runtimeNowMs,
    )
    const watchdogLabel = watchdogAttentionLabel(props.session.watchdogState)

    return (
      <div
        className={`relative rounded-2xl border px-3 py-3 transition ${sessionCardTone(
          props.session.activity,
          props.isActive,
          props.session.archived,
        )}`}
      >
        {!props.isRenaming ? (
          <button
            type="button"
            aria-label={`Open chat ${props.session.title}`}
            onClick={() => props.onActivateSession(props.session.id)}
            className="absolute inset-0 z-10 rounded-2xl"
          />
        ) : null}
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${activityTone(
                  props.session.activity,
                )}`}
              >
                {activityLabel(props.session.activity)}
              </span>
              <span className="text-[11px] text-slate-500">
                {props.session.messageCount}
              </span>
            </div>
            <p className="mt-2 truncate text-base font-semibold leading-5 text-white">
              {props.session.title}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {props.session.providerKind} · {props.session.modelRef}
            </p>
            {props.processTitle ? (
              <p className="mt-2 truncate text-[11px] text-cyan-200/80">
                {props.processTitle}
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
                props.onBeginRename(props.session.id, props.session.title)
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
                props.onArchiveSession(props.session.id)
              }}
              disabled={props.isArchiving}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArchiveIcon />
            </button>
          </div>
        </div>
        {props.isRenaming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              props.onRenameSubmit()
            }}
            className="relative z-20 mt-3 flex gap-2"
          >
            <input
              value={props.renameTitle}
              onChange={(event) =>
                props.onRenameTitleChange(event.target.value)
              }
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
            />
            <button
              type="submit"
              disabled={
                props.renaming ||
                !props.renameTitle.trim() ||
                props.renameTitle.trim() === props.session.title
              }
              className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {props.renaming ? "Saving..." : "Save"}
            </button>
          </form>
        ) : null}
        <p className="mt-3 truncate text-sm text-slate-300">
          {props.session.preview ?? "No messages yet"}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          {workerSummary.join(" · ")}
        </p>
        {watchdogLabel ? (
          <p className="mt-2 text-xs text-amber-200">{watchdogLabel}</p>
        ) : null}
        <p className="mt-2 truncate text-[11px] text-slate-500">
          {props.session.cwd}
        </p>
      </div>
    )
  },
  (previousProps, nextProps) =>
    previousProps.session === nextProps.session &&
    previousProps.isActive === nextProps.isActive &&
    previousProps.processTitle === nextProps.processTitle &&
    previousProps.runtimeNowMs === nextProps.runtimeNowMs &&
    previousProps.isRenaming === nextProps.isRenaming &&
    previousProps.renameTitle === nextProps.renameTitle &&
    previousProps.renaming === nextProps.renaming &&
    previousProps.isArchiving === nextProps.isArchiving &&
    previousProps.onActivateSession === nextProps.onActivateSession &&
    previousProps.onBeginRename === nextProps.onBeginRename &&
    previousProps.onRenameTitleChange === nextProps.onRenameTitleChange &&
    previousProps.onRenameSubmit === nextProps.onRenameSubmit &&
    previousProps.onArchiveSession === nextProps.onArchiveSession,
)

type ArchivedSessionCardProps = SessionCardProps & {
  isArchiving: boolean
  onRestoreSession: (sessionId: string) => void
}

const ArchivedSessionCard = memo(
  function ArchivedSessionCard(props: ArchivedSessionCardProps) {
    useRenderCounter("ArchivedSessionCard")
    const workerSummary = summarizeSessionWorkerState(
      props.session.activity,
      props.session.queuedMessageCount,
      props.runtimeNowMs,
    )
    const watchdogLabel = watchdogAttentionLabel(props.session.watchdogState)

    return (
      <div
        className={`relative rounded-2xl border px-3 py-3 transition ${sessionCardTone(
          props.session.activity,
          props.isActive,
          true,
        )}`}
      >
        <button
          type="button"
          aria-label={`Open chat ${props.session.title}`}
          onClick={() => props.onActivateSession(props.session.id)}
          className="absolute inset-0 z-10 rounded-2xl"
        />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                archived
              </span>
              <span className="text-[11px] text-slate-500">
                {props.session.messageCount}
              </span>
            </div>
            <p className="mt-2 truncate text-base font-semibold text-white">
              {props.session.title}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {props.session.providerKind} · {props.session.modelRef}
            </p>
            {props.processTitle ? (
              <p className="mt-2 truncate text-[11px] text-cyan-200/80">
                {props.processTitle}
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
                props.onRestoreSession(props.session.id)
              }}
              disabled={props.isArchiving}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RestoreIcon />
            </button>
          </div>
        </div>
        <p className="mt-3 truncate text-sm text-slate-300">
          {props.session.preview ?? "No messages yet"}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          {workerSummary.join(" · ")}
        </p>
        {watchdogLabel ? (
          <p className="mt-2 text-xs text-amber-200">{watchdogLabel}</p>
        ) : null}
        <p className="mt-2 truncate text-[11px] text-slate-500">
          {props.session.cwd}
        </p>
      </div>
    )
  },
  (previousProps, nextProps) =>
    previousProps.session === nextProps.session &&
    previousProps.isActive === nextProps.isActive &&
    previousProps.processTitle === nextProps.processTitle &&
    previousProps.runtimeNowMs === nextProps.runtimeNowMs &&
    previousProps.isArchiving === nextProps.isArchiving &&
    previousProps.onActivateSession === nextProps.onActivateSession &&
    previousProps.onRestoreSession === nextProps.onRestoreSession,
)

export function AgentChatScreen(props: AgentChatScreenProps) {
  useRenderCounter("AgentChatScreen")
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null)
  const transcriptContentRef = useRef<HTMLDivElement | null>(null)
  const transcriptBottomSentinelRef = useRef<HTMLDivElement | null>(null)
  const composerDockRef = useRef<HTMLDivElement | null>(null)
  const pendingSessionOpenScrollRef = useRef<string | null>(null)
  const transcriptPinnedToBottomRef = useRef(true)
  const typingStateRef = useRef<{
    sessionId: string
    lastSentAt: number
    active: boolean
  } | null>(null)
  const messageElementRefs = useRef(new Map<string, HTMLElement>())
  const requestedMessageIdRef = useRef(readRequestedMessageIdFromLocation())
  const requestedSessionIdRef = useRef(readRequestedSessionIdFromLocation())
  const sessionRailResizeRef = useRef<{
    startX: number
    startWidth: number
  } | null>(null)
  const queuedMessageCountRef = useRef(0)
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([])
  const [processBlueprints, setProcessBlueprints] = useState<
    ProcessBlueprint[]
  >([])
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
  const [wsWarning, setWsWarning] = useState("")
  const [streamingAssistantText, setStreamingAssistantText] = useState("")
  const [providerKind, setProviderKind] =
    useState<ProviderKind>("codex-app-server")
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
  const [activeSessionImageModelRef, setActiveSessionImageModelRef] =
    useState("")
  const [activeSessionProcessBlueprintId, setActiveSessionProcessBlueprintId] =
    useState("")
  const [updatingDirectory, setUpdatingDirectory] = useState(false)
  const [updatingQuickProcessBlueprint, setUpdatingQuickProcessBlueprint] =
    useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [sessionListMenuOpen, setSessionListMenuOpen] = useState(false)
  const [showArchivedSessions, setShowArchivedSessions] = useState(false)
  const [sessionSearchQuery, setSessionSearchQuery] = useState("")
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  )
  const [renameTitle, setRenameTitle] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(
    null,
  )
  const [wsStatus, setWsStatus] = useState<
    "idle" | "connecting" | "ready" | "error"
  >("idle")
  const [replyTargetMessageId, setReplyTargetMessageId] = useState<
    string | null
  >(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sessionRailWidth, setSessionRailWidth] = useState(() =>
    readSessionRailWidth(),
  )
  const [
    expandedReplacedStreamMessageIds,
    setExpandedReplacedStreamMessageIds,
  ] = useState<Record<string, boolean>>({})
  const [expandedActivityClusterKeys, setExpandedActivityClusterKeys] =
    useState<Record<string, boolean>>({})
  const [rawTranscriptMessageIds, setRawTranscriptMessageIds] = useState<
    Record<string, boolean>
  >({})
  const [highlightedMessageId, setHighlightedMessageId] = useState("")
  const [composerDockHeight, setComposerDockHeight] = useState(0)
  const [transcriptRenderLimit, setTranscriptRenderLimit] = useState(
    transcriptRenderPageSize,
  )
  const [threadViewportMetrics, setThreadViewportMetrics] = useState({
    scrollTop: 0,
    scrollHeight: 1,
    clientHeight: 1,
  })

  const activeProvider = useMemo(
    () => providers.find((entry) => entry.kind === providerKind) ?? null,
    [providerKind, providers],
  )
  const activeSessionProvider = useMemo(
    () =>
      providers.find((entry) => entry.kind === activeSessionProviderKind) ??
      null,
    [activeSessionProviderKind, providers],
  )
  const activeSessionProcessBlueprint = useMemo(
    () =>
      processBlueprints.find(
        (entry) => entry.id === activeSessionProcessBlueprintId,
      ) ?? null,
    [activeSessionProcessBlueprintId, processBlueprints],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )
  const activeSessionUsageSummary = useMemo(
    () => summarizeProviderUsage(activeSession?.providerUsage ?? null),
    [activeSession?.providerUsage],
  )
  const processTerminalStatus =
    activeSession?.processBlueprintId &&
    activeSession.activity.status !== "running" &&
    activeSession.activity.status !== "queued" &&
    !activeSession.pendingSystemInstruction &&
    activeSession.queuedMessageCount === 0 &&
    (activeSession.watchdogState.status === "completed" ||
      activeSession.watchdogState.status === "blocked")
      ? activeSession.watchdogState.status
      : null
  const processResolutionRequired = processTerminalStatus !== null
  const quickProcessSelectValue = processResolutionRequired
    ? completedProcessResolutionSentinel
    : (activeSession?.processBlueprintId ?? "")
  const settingsProcessSelectValue = processResolutionRequired
    ? completedProcessResolutionSentinel
    : activeSessionProcessBlueprintId

  const visibleSessions = useMemo(
    () =>
      sessions.filter((session) =>
        sessionMatchesSearch(session, sessionSearchQuery),
      ),
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
    const payload = (await response.json()) as SessionsResponse & {
      error?: string
    }
    if (!response.ok || !payload.ok || !Array.isArray(payload.sessions)) {
      throw new Error(payload.error ?? "Agent Chat sessions failed to load.")
    }
    return payload.sessions
  }, [props.apiRootUrl])

  const activeReplyTarget = useMemo(
    () =>
      messages.find((message) => message.id === replyTargetMessageId) ?? null,
    [messages, replyTargetMessageId],
  )

  const sessionMap = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )

  const messageMap = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  )

  const renderedTranscriptItems = useMemo(() => {
    const items: RenderedTranscriptItem[] = []
    let pendingStreamCheckpoints: SessionMessage[] = []
    let pendingActivityMessages: SessionMessage[] = []

    const flushActivityMessages = () => {
      if (pendingActivityMessages.length === 0) {
        return
      }
      if (pendingActivityMessages.length >= minCollapsedActivityClusterSize) {
        items.push({
          type: "activityCluster",
          messages: pendingActivityMessages,
        })
      } else {
        for (const activityMessage of pendingActivityMessages) {
          items.push({
            type: "message",
            message: activityMessage,
            precedingStreamCheckpoints: [],
          })
        }
      }
      pendingActivityMessages = []
    }

    for (const message of messages) {
      if (message.kind === "streamCheckpoint") {
        flushActivityMessages()
        pendingStreamCheckpoints.push(message)
        continue
      }

      if (message.kind === "activity") {
        if (pendingStreamCheckpoints.length > 0) {
          for (const streamMessage of pendingStreamCheckpoints) {
            items.push({
              type: "message",
              message: streamMessage,
              precedingStreamCheckpoints: [],
            })
          }
          pendingStreamCheckpoints = []
        }
        pendingActivityMessages.push(message)
        continue
      }

      flushActivityMessages()

      if (message.role === "assistant" && message.kind === "chat") {
        items.push({
          type: "message",
          message,
          precedingStreamCheckpoints: pendingStreamCheckpoints,
        })
        pendingStreamCheckpoints = []
        continue
      }

      if (pendingStreamCheckpoints.length > 0) {
        for (const streamMessage of pendingStreamCheckpoints) {
          items.push({
            type: "message",
            message: streamMessage,
            precedingStreamCheckpoints: [],
          })
        }
        pendingStreamCheckpoints = []
      }

      items.push({
        type: "message",
        message,
        precedingStreamCheckpoints: [],
      })
    }

    flushActivityMessages()

    for (const streamMessage of pendingStreamCheckpoints) {
      items.push({
        type: "message",
        message: streamMessage,
        precedingStreamCheckpoints: [],
      })
    }

    return items
  }, [messages])

  const hasVisibleStreamCheckpoint = useMemo(
    () =>
      renderedTranscriptItems.some(
        (item) =>
          item.type === "message" && item.message.kind === "streamCheckpoint",
      ),
    [renderedTranscriptItems],
  )

  const visibleTranscriptItems = useMemo(() => {
    if (renderedTranscriptItems.length <= transcriptRenderLimit) {
      return renderedTranscriptItems
    }
    return renderedTranscriptItems.slice(
      renderedTranscriptItems.length - transcriptRenderLimit,
    )
  }, [renderedTranscriptItems, transcriptRenderLimit])

  const hiddenTranscriptItemCount =
    renderedTranscriptItems.length - visibleTranscriptItems.length

  const queuedSystemMessages = useMemo(
    () =>
      queuedMessages.filter(
        (message) =>
          message.role === "system" && message.providerSeenAtMs === null,
      ),
    [queuedMessages],
  )
  const compactWaitingSummary = useMemo(
    () =>
      waitingSummaryLabel(
        activeSession?.pendingSystemInstruction,
        queuedSystemMessages,
      ),
    [activeSession?.pendingSystemInstruction, queuedSystemMessages],
  )
  const showScrollToBottomButton = useMemo(() => {
    return (
      threadViewportMetrics.scrollHeight -
        threadViewportMetrics.clientHeight -
        threadViewportMetrics.scrollTop >
      96
    )
  }, [threadViewportMetrics])

  const syncCurrentChatSettingsFromSession = useCallback(
    (session: SessionSummary | null) => {
      setActiveSessionDirectory(session?.cwd ?? "")
      setActiveSessionProviderKind(session?.providerKind ?? "codex-app-server")
      setActiveSessionModelRef(session?.modelRef ?? "")
      setActiveSessionAuthProfile(session?.authProfile ?? "")
      setActiveSessionImageModelRef(session?.imageModelRef ?? "")
      setActiveSessionProcessBlueprintId(session?.processBlueprintId ?? "")
    },
    [],
  )

  const reportTyping = useCallback(
    async (
      active: boolean,
      options?: { force?: boolean; sessionId?: string },
    ) => {
      const targetSessionId = options?.sessionId ?? activeSessionId
      if (!targetSessionId) {
        return
      }

      const now = Date.now()
      const currentState = typingStateRef.current
      if (
        !options?.force &&
        active &&
        currentState?.sessionId === targetSessionId &&
        currentState.active &&
        now - currentState.lastSentAt < typingHeartbeatMs
      ) {
        return
      }

      typingStateRef.current = {
        sessionId: targetSessionId,
        lastSentAt: now,
        active,
      }

      try {
        await apiFetch(
          `${props.apiRootUrl}/sessions/${targetSessionId}/typing`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ active }),
          },
        )
      } catch {
        // Best-effort presence signal only.
      }
    },
    [activeSessionId, props.apiRootUrl],
  )

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

  const isViewportNearBottom = useCallback((viewport: HTMLDivElement) => {
    const distanceFromBottom =
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
    return distanceFromBottom <= 48
  }, [])

  const scrollTranscriptToBottom = useCallback(() => {
    const viewport = transcriptViewportRef.current
    if (!viewport) {
      return
    }
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "auto",
    })
    transcriptPinnedToBottomRef.current = true
    updateThreadViewportMetrics()
    if (
      activeSessionId &&
      pendingSessionOpenScrollRef.current === activeSessionId &&
      isViewportNearBottom(viewport)
    ) {
      pendingSessionOpenScrollRef.current = null
    }
  }, [activeSessionId, isViewportNearBottom, updateThreadViewportMetrics])

  const handleTranscriptViewportScroll = useCallback(() => {
    const viewport = transcriptViewportRef.current
    if (!viewport) {
      return
    }
    const nearBottom = isViewportNearBottom(viewport)
    transcriptPinnedToBottomRef.current = nearBottom
    if (
      nearBottom &&
      activeSessionId &&
      pendingSessionOpenScrollRef.current === activeSessionId
    ) {
      pendingSessionOpenScrollRef.current = null
    }
    updateThreadViewportMetrics()
  }, [activeSessionId, isViewportNearBottom, updateThreadViewportMetrics])

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

  const setMessageElementRef = useCallback(
    (messageId: string, element: HTMLElement | null) => {
      if (!element) {
        messageElementRefs.current.delete(messageId)
        return
      }
      messageElementRefs.current.set(messageId, element)
    },
    [],
  )

  const scrollMessageIntoView = useCallback((messageId: string) => {
    if (!messageId) {
      return
    }
    const element = messageElementRefs.current.get(messageId)
    if (!element) {
      return
    }
    element.scrollIntoView({
      block: "center",
      behavior: "smooth",
    })
    setHighlightedMessageId(messageId)
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setHighlightedMessageId((current) =>
          current === messageId ? "" : current,
        )
      }, 2500)
    }
  }, [])

  const copyMessageLink = useCallback(
    async (sessionId: string, messageId: string) => {
      if (typeof navigator === "undefined" || !sessionId || !messageId) {
        return
      }
      await navigator.clipboard.writeText(
        buildMessagePermalink(sessionId, messageId),
      )
    },
    [],
  )

  const toggleRawTranscriptMessage = useCallback((messageId: string) => {
    setRawTranscriptMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }))
  }, [])

  const toggleExpandedReplacedStreams = useCallback((messageId: string) => {
    setExpandedReplacedStreamMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }))
  }, [])

  const toggleExpandedActivityCluster = useCallback((clusterKey: string) => {
    setExpandedActivityClusterKeys((current) => ({
      ...current,
      [clusterKey]: !current[clusterKey],
    }))
  }, [])

  useEffect(() => {
    if (!activeProvider) {
      return
    }
    const nextModel =
      (modelRef && activeProvider.modelOptions.includes(modelRef)
        ? modelRef
        : null) ??
      activeProvider.modelOptions.find(
        (option) => option === activeProvider.defaultModelRef,
      ) ??
      activeProvider.modelOptions[0] ??
      activeProvider.defaultModelRef
    setModelRef(nextModel)
    setAuthProfile(activeProvider.authProfiles[0] ?? "")
  }, [activeProvider, modelRef])

  useEffect(() => {
    const previousTypingState = typingStateRef.current
    if (
      previousTypingState?.sessionId &&
      previousTypingState.sessionId !== activeSessionId &&
      previousTypingState.active
    ) {
      void reportTyping(false, {
        force: true,
        sessionId: previousTypingState.sessionId,
      })
    }
    syncCurrentChatSettingsFromSession(activeSession)
    setReplyTargetMessageId(null)
  }, [
    activeSessionId,
    syncCurrentChatSettingsFromSession,
    activeSession,
    reportTyping,
  ])

  useEffect(() => {
    if (activeSession && renamingSessionId === activeSession.id) {
      setRenameTitle(activeSession.title)
    }
  }, [activeSession, renamingSessionId])

  useEffect(() => {
    if (!activeSessionProvider) {
      return
    }
    const nextModel =
      (activeSessionModelRef &&
      activeSessionProvider.modelOptions.includes(activeSessionModelRef)
        ? activeSessionModelRef
        : null) ??
      activeSessionProvider.modelOptions.find(
        (option) => option === activeSessionModelRef,
      ) ??
      activeSessionProvider.modelOptions.find(
        (option) => option === activeSessionProvider.defaultModelRef,
      ) ??
      activeSessionProvider.modelOptions[0] ??
      activeSessionProvider.defaultModelRef
    if (nextModel !== activeSessionModelRef) {
      setActiveSessionModelRef(nextModel)
    }

    const nextAuthProfile =
      activeSessionProvider.authProfiles.find(
        (option) => option === activeSessionAuthProfile,
      ) ??
      activeSessionProvider.authProfiles[0] ??
      ""
    if (nextAuthProfile !== activeSessionAuthProfile) {
      setActiveSessionAuthProfile(nextAuthProfile)
    }
  }, [activeSessionAuthProfile, activeSessionModelRef, activeSessionProvider])

  useEffect(() => {
    return () => {
      if (typingStateRef.current?.active) {
        void reportTyping(false, {
          force: true,
          sessionId: typingStateRef.current.sessionId,
        })
      }
    }
  }, [reportTyping])

  useEffect(() => {
    pendingSessionOpenScrollRef.current = activeSessionId || null
    transcriptPinnedToBottomRef.current = true
    setTranscriptRenderLimit(transcriptRenderPageSize)
  }, [activeSessionId])

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
    queuedMessageCountRef.current = queuedMessages.length
  }, [queuedMessages.length])

  useEffect(() => {
    if (
      !activeSessionId ||
      (pendingSessionOpenScrollRef.current !== activeSessionId &&
        !transcriptPinnedToBottomRef.current)
    ) {
      return
    }
    const handle = window.requestAnimationFrame(() => {
      scrollTranscriptToBottom()
    })
    return () => {
      window.cancelAnimationFrame(handle)
    }
  }, [activeSessionId, scrollTranscriptToBottom])

  useEffect(() => {
    if (!activeSessionId) {
      return
    }
    const content = transcriptContentRef.current
    if (!content || typeof ResizeObserver === "undefined") {
      return
    }

    let frameHandle: number | null = null
    const scheduleFollow = () => {
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
      }
      frameHandle = window.requestAnimationFrame(() => {
        frameHandle = null
        if (
          pendingSessionOpenScrollRef.current === activeSessionId ||
          transcriptPinnedToBottomRef.current
        ) {
          scrollTranscriptToBottom()
        } else {
          updateThreadViewportMetrics()
        }
      })
    }

    const observer = new ResizeObserver(() => {
      scheduleFollow()
    })
    observer.observe(content)
    scheduleFollow()

    return () => {
      observer.disconnect()
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
      }
    }
  }, [activeSessionId, scrollTranscriptToBottom, updateThreadViewportMetrics])

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
  }, [updateThreadViewportMetrics])

  useEffect(() => {
    const composerDock = composerDockRef.current
    if (!composerDock || typeof ResizeObserver === "undefined") {
      return
    }

    const updateHeight = () => {
      setComposerDockHeight(
        Math.ceil(composerDock.getBoundingClientRect().height),
      )
    }

    const observer = new ResizeObserver(() => {
      updateHeight()
    })
    observer.observe(composerDock)
    updateHeight()

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(
      sessionRailWidthStorageKey,
      String(sessionRailWidth),
    )
  }, [sessionRailWidth])

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      const resizeState = sessionRailResizeRef.current
      if (!resizeState) {
        return
      }
      const delta = event.clientX - resizeState.startX
      setSessionRailWidth(
        Math.max(
          minSessionRailWidth,
          Math.min(maxSessionRailWidth, resizeState.startWidth + delta),
        ),
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
        const [providersResponse, processBlueprintsResponse, sessionsResponse] =
          await Promise.all([
            apiFetch(`${props.apiRootUrl}/providers`).then(async (response) => {
              const payload = (await response.json()) as ProvidersResponse & {
                error?: string
              }
              if (
                !response.ok ||
                !payload.ok ||
                !Array.isArray(payload.providers)
              ) {
                throw new Error(
                  payload.error ?? "Agent Chat providers failed to load.",
                )
              }
              return payload
            }),
            apiFetch(`${props.apiRootUrl}/process-blueprints`).then(
              async (response) => {
                const payload =
                  (await response.json()) as ProcessBlueprintsResponse & {
                    error?: string
                  }
                if (
                  !response.ok ||
                  !payload.ok ||
                  !Array.isArray(payload.processBlueprints)
                ) {
                  throw new Error(
                    payload.error ??
                      "Agent Chat process blueprints failed to load.",
                  )
                }
                return payload
              },
            ),
            loadSessions().then((sessions) => ({
              ok: true as const,
              sessions,
            })),
          ])

        if (cancelled) {
          return
        }

        setProviders(providersResponse.providers)
        setProcessBlueprints(processBlueprintsResponse.processBlueprints)
        setSessions(sessionsResponse.sessions)
        const requestedSessionId = requestedSessionIdRef.current
        const initialSession =
          sessionsResponse.sessions.find(
            (session) => session.id === requestedSessionId,
          ) ??
          sessionsResponse.sessions.find((session) => !session.archived) ??
          sessionsResponse.sessions[0]
        if (initialSession) {
          setActiveSessionId((current) => current || initialSession.id)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Agent Chat failed to load.",
          )
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
            nextSessions.find((session) => !session.archived) ??
            nextSessions[0] ??
            null
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
        const response = await apiFetch(
          `${props.apiRootUrl}/sessions/${activeSessionId}`,
        )
        const payload = (await response.json()) as SessionSnapshotResponse & {
          error?: string
        }
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
          if (requestedMessageIdRef.current) {
            window.requestAnimationFrame(() => {
              scrollMessageIntoView(requestedMessageIdRef.current)
            })
          }
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Session load failed.",
          )
        }
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [activeSessionId, props.apiRootUrl, scrollMessageIntoView])

  useEffect(() => {
    if (!activeSessionId) {
      setWsStatus("idle")
      setWsWarning("")
      return
    }

    const socketUrl = new URL(props.wsRootUrl)
    socketUrl.searchParams.set("sessionId", activeSessionId)
    const protocols = dashboardSessionWebSocketProtocols()
    let socket: WebSocket | null = null
    let disposed = false
    let reconnectAttempt = 0
    let reconnectTimer: number | null = null
    let warningTimer: number | null = null

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const clearWarningTimer = () => {
      if (warningTimer !== null) {
        window.clearTimeout(warningTimer)
        warningTimer = null
      }
    }

    const scheduleDisconnectWarning = () => {
      if (warningTimer !== null) {
        return
      }
      warningTimer = window.setTimeout(() => {
        warningTimer = null
        setWsStatus("error")
        setWsWarning("Agent Chat WebSocket disconnected. Retrying…")
      }, websocketWarningDelayMs)
    }

    const connect = () => {
      if (disposed) {
        return
      }

      setWsStatus("connecting")
      socket =
        protocols.length > 0
          ? new WebSocket(socketUrl.toString(), protocols)
          : new WebSocket(socketUrl.toString())

      socket.addEventListener("open", () => {
        reconnectAttempt = 0
        clearReconnectTimer()
        clearWarningTimer()
        setWsWarning("")
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
          updateActiveSessionRuntime(
            payload.activity,
            payload.queuedMessages.length,
          )
          setStreamingAssistantText("")
          setSessions((current) =>
            current.map((session) =>
              session.id === payload.session.id ? payload.session : session,
            ),
          )
          if (requestedMessageIdRef.current) {
            window.requestAnimationFrame(() => {
              scrollMessageIntoView(requestedMessageIdRef.current)
            })
          }
          return
        }

        if (payload.type === "session.updated") {
          const updatedSession = payload.session
          if (updatedSession) {
            setSessions((current) =>
              current.map((session) =>
                session.id === updatedSession.id ? updatedSession : session,
              ),
            )
          }
          setMessages((current) => mergeMessagesById(current, payload.messages))
          setQueuedMessages(payload.queuedMessages)
          setActivity(payload.activity)
          updateActiveSessionRuntime(
            payload.activity,
            payload.queuedMessages.length,
          )
          if (
            payload.messages.some((message) => message.role === "assistant")
          ) {
            setStreamingAssistantText("")
          }
          return
        }

        if (payload.type === "run.started") {
          setMessages((current) => mergeMessagesById(current, payload.messages))
          setQueuedMessages(payload.queuedMessages)
          setActivity(payload.activity)
          updateActiveSessionRuntime(
            payload.activity,
            payload.queuedMessages.length,
          )
          setStreamingAssistantText("")
          return
        }

        if (payload.type === "run.activity") {
          setActivity(payload.activity)
          setQueuedMessages(payload.queuedMessages)
          updateActiveSessionRuntime(
            payload.activity,
            payload.queuedMessages.length,
          )
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
          updateActiveSessionRuntime(
            payload.activity,
            queuedMessageCountRef.current,
          )
          return
        }

        if (payload.type === "run.interrupted") {
          setActivity(payload.activity)
          updateActiveSessionRuntime(
            payload.activity,
            queuedMessageCountRef.current,
          )
          setStreamingAssistantText("")
          return
        }

        if (payload.type === "run.failed") {
          setActivity(payload.activity)
          updateActiveSessionRuntime(
            payload.activity,
            queuedMessageCountRef.current,
          )
          setStreamingAssistantText("")
          setError(payload.error)
        }
      })

      socket.addEventListener("error", () => {
        scheduleDisconnectWarning()
      })

      socket.addEventListener("close", () => {
        if (disposed) {
          return
        }
        scheduleDisconnectWarning()
        const delayMs =
          websocketRetryBackoffMs[
            Math.min(reconnectAttempt, websocketRetryBackoffMs.length - 1)
          ] ??
          websocketRetryBackoffMs.at(-1) ??
          8000
        reconnectAttempt += 1
        clearReconnectTimer()
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connect()
        }, delayMs)
      })
    }

    connect()

    return () => {
      disposed = true
      clearReconnectTimer()
      clearWarningTimer()
      socket?.close()
    }
  }, [activeSessionId, props.wsRootUrl, updateActiveSessionRuntime])

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
      return [...next].sort(
        (left, right) => right.updatedAtMs - left.updatedAtMs,
      )
    })
  }, [])

  const activateSessionFromList = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setMobileSessionsOpen(false)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !activeSessionId) {
      return
    }
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set(chatSessionQueryParam, activeSessionId)
    if (!window.location.hash.startsWith(chatMessageHashPrefix)) {
      currentUrl.hash = ""
    }
    window.history.replaceState(
      {},
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    )
  }, [activeSessionId])

  useEffect(() => {
    const requestedMessageId = requestedMessageIdRef.current
    if (!requestedMessageId) {
      return
    }
    if (!messages.some((message) => message.id === requestedMessageId)) {
      return
    }
    const handle = window.requestAnimationFrame(() => {
      scrollMessageIntoView(requestedMessageId)
    })
    return () => {
      window.cancelAnimationFrame(handle)
    }
  }, [messages, scrollMessageIntoView])

  const setSessionArchived = useCallback(
    async (sessionId: string, archived: boolean) => {
      setArchivingSessionId(sessionId)
      setError("")

      try {
        const response = await apiFetch(
          `${props.apiRootUrl}/sessions/${sessionId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              archived,
            }),
          },
        )
        const payload = (await response.json()) as SessionSnapshotResponse & {
          error?: string
        }
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ?? (archived ? "Archive failed." : "Restore failed."),
          )
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
    },
    [activeSessionId, mergeSession, props.apiRootUrl],
  )

  const beginRenamingSession = useCallback(
    (sessionId: string, title: string) => {
      setRenamingSessionId(sessionId)
      setRenameTitle(title)
    },
    [],
  )

  const updateRenameTitle = useCallback((value: string) => {
    setRenameTitle(value)
  }, [])

  const archiveSession = useCallback(
    (sessionId: string) => {
      void setSessionArchived(sessionId, true)
    },
    [setSessionArchived],
  )

  const restoreSession = useCallback(
    (sessionId: string) => {
      void setSessionArchived(sessionId, false)
    },
    [setSessionArchived],
  )

  const applySessionSnapshot = useCallback(
    (payload: SessionSnapshotResponse) => {
      mergeSession(payload.session)
      if (payload.session.id === activeSessionId) {
        setMessages(payload.messages)
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
      }
    },
    [activeSessionId, mergeSession],
  )

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
      const payload = (await response.json()) as SessionSnapshotResponse & {
        error?: string
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Session creation failed.")
      }
      mergeSession(payload.session)
      setActiveSessionId(payload.session.id)
      setMessages(payload.messages)
      setQueuedMessages(payload.queuedMessages)
      setActivity(payload.activity)
      setReplyTargetMessageId(null)
      setNewChatTitle("")
      setSettingsOpen(false)
      setNewChatOpen(false)
      setMobileSessionsOpen(false)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Session creation failed.",
      )
    } finally {
      setCreating(false)
    }
  }

  async function updateCurrentChatSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeSessionId || !activeSession || !activeSessionDirectory.trim()) {
      return
    }

    const nextPayload: Record<string, string | null | boolean> = {}
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
    if (
      activeSessionProcessBlueprintId !==
      (activeSession.processBlueprintId ?? "")
    ) {
      nextPayload.processBlueprintId = activeSessionProcessBlueprintId || null
    } else if (processResolutionRequired) {
      nextPayload.processBlueprintId = activeSessionProcessBlueprintId || null
      nextPayload.forceProcessBlueprintReapply = true
    }

    if (Object.keys(nextPayload).length === 0) {
      return
    }

    setUpdatingDirectory(true)
    setError("")

    try {
      const response = await apiFetch(
        `${props.apiRootUrl}/sessions/${activeSessionId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(nextPayload),
        },
      )
      const payload = (await response.json()) as SessionSnapshotResponse & {
        error?: string
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Chat settings update failed.")
      }
      mergeSession(payload.session)
      setMessages(payload.messages)
      setQueuedMessages(payload.queuedMessages)
      setActivity(payload.activity)
      syncCurrentChatSettingsFromSession(payload.session)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Chat settings update failed.",
      )
    } finally {
      setUpdatingDirectory(false)
    }
  }

  function handleCurrentChatSettingsFieldKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const updateActiveSessionProcessQuickSet = useCallback(
    async (nextProcessBlueprintId: string) => {
      if (!activeSessionId || !activeSession) {
        return
      }

      const normalizedProcessBlueprintId = nextProcessBlueprintId || null
      const forceProcessBlueprintReapply =
        processResolutionRequired &&
        (activeSession.processBlueprintId ?? null) ===
          normalizedProcessBlueprintId
      if (
        (activeSession.processBlueprintId ?? null) ===
          normalizedProcessBlueprintId &&
        !forceProcessBlueprintReapply
      ) {
        return
      }

      setUpdatingQuickProcessBlueprint(true)
      setError("")

      try {
        const response = await apiFetch(
          `${props.apiRootUrl}/sessions/${activeSessionId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              processBlueprintId: normalizedProcessBlueprintId,
              forceProcessBlueprintReapply,
            }),
          },
        )
        const payload = (await response.json()) as SessionSnapshotResponse & {
          error?: string
        }
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Process update failed.")
        }
        mergeSession(payload.session)
        setMessages(payload.messages)
        setQueuedMessages(payload.queuedMessages)
        setActivity(payload.activity)
        syncCurrentChatSettingsFromSession(payload.session)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Process update failed.",
        )
      } finally {
        setUpdatingQuickProcessBlueprint(false)
      }
    },
    [
      activeSession,
      activeSessionId,
      mergeSession,
      processResolutionRequired,
      props.apiRootUrl,
      syncCurrentChatSettingsFromSession,
    ],
  )

  const submitRenameSession = useCallback(() => {
    if (!renamingSessionId || !renameTitle.trim()) {
      return
    }

    void (async () => {
      setRenaming(true)
      setError("")
      try {
        const response = await apiFetch(
          `${props.apiRootUrl}/sessions/${renamingSessionId}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              title: renameTitle,
            }),
          },
        )
        const payload = (await response.json()) as SessionSnapshotResponse & {
          error?: string
        }
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
        setError(
          nextError instanceof Error ? nextError.message : "Rename failed.",
        )
      } finally {
        setRenaming(false)
      }
    })()
  }, [
    activeSessionId,
    mergeSession,
    props.apiRootUrl,
    renameTitle,
    renamingSessionId,
  ])

  const sendMessage = useCallback(
    async (payload: ComposerSubmitPayload) => {
      if (!activeSessionId) {
        return false
      }
      if (!payload.text.trim() && payload.images.length === 0) {
        return false
      }
      if (processResolutionRequired) {
        setError("Choose the next process before sending.")
        return false
      }

      setSending(true)
      setError("")

      try {
        const response = await apiFetch(
          `${props.apiRootUrl}/sessions/${activeSessionId}/messages`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              text: payload.text,
              content: [
                ...(payload.text.trim()
                  ? [
                      {
                        type: "text" as const,
                        text: payload.text,
                      },
                    ]
                  : []),
                ...payload.images.map((image) => ({
                  type: "image" as const,
                  dataUrl: image.dataUrl,
                })),
              ],
              replyToMessageId: replyTargetMessageId,
            }),
          },
        )
        const responsePayload = (await response.json()) as { error?: string }
        if (!response.ok) {
          throw new Error(responsePayload.error ?? "Message send failed.")
        }
        setReplyTargetMessageId(null)
        return true
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Message send failed.",
        )
        return false
      } finally {
        setSending(false)
      }
    },
    [
      activeSessionId,
      processResolutionRequired,
      props.apiRootUrl,
      replyTargetMessageId,
    ],
  )

  const interruptRun = useCallback(async () => {
    if (!activeSessionId || !activity.canInterrupt || !activity.turnId) {
      return
    }

    setInterrupting(true)
    setError("")

    try {
      const response = await apiFetch(
        `${props.apiRootUrl}/sessions/${activeSessionId}/interrupt`,
        {
          method: "POST",
        },
      )
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        activity?: SessionActivity
      }
      if (!response.ok || !payload.ok || !payload.activity) {
        throw new Error(payload.error ?? "Interrupt failed.")
      }
      setActivity(payload.activity)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Interrupt failed.",
      )
    } finally {
      setInterrupting(false)
    }
  }, [
    activeSessionId,
    activity.canInterrupt,
    activity.turnId,
    props.apiRootUrl,
  ])

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
  }, [
    activeSessionId,
    activity.canInterrupt,
    activity.status,
    interrupting,
    interruptRun,
  ])

  const threadStatusSummary = summarizeSessionWorkerState(
    activity,
    queuedMessages.length,
    nowMs,
  )
  const hideComposerDockForMobileSessionRail = mobileSessionsOpen

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
                label={
                  sessionListMenuOpen
                    ? "Hide session list menu"
                    : "Show session list menu"
                }
                title={
                  sessionListMenuOpen
                    ? "Hide Session List Menu"
                    : "Session List Menu"
                }
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
                    <span>
                      {showArchivedSessions
                        ? "Hide archived chats"
                        : "Show archived chats"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {sessions.filter((session) => session.archived).length}
                    </span>
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
                  onChange={(event) =>
                    setProviderKind(event.target.value as ProviderKind)
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none"
                >
                  {providers.map((provider) => (
                    <option
                      className="text-slate-950"
                      key={provider.kind}
                      value={provider.kind}
                    >
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block">
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
                      <option
                        className="text-slate-950"
                        key={model}
                        value={model}
                      >
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
              </div>
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
                  onChange={(event) =>
                    setProcessBlueprintId(event.target.value)
                  }
                  className={`mt-2 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm outline-none ${darkNativeSelectClass}`}
                >
                  <option style={darkNativeOptionStyle} value="">
                    none
                  </option>
                  {processBlueprints.map((entry) => (
                    <option
                      style={darkNativeOptionStyle}
                      key={entry.id}
                      value={entry.id}
                    >
                      {entry.title}
                    </option>
                  ))}
                </select>
                {processBlueprintId ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {processBlueprints.find(
                      (entry) => entry.id === processBlueprintId,
                    )?.expectation ?? ""}
                  </p>
                ) : null}
              </label>
              <button
                type="submit"
                disabled={
                  creating ||
                  !modelRef.trim() ||
                  activeProvider?.status !== "ready"
                }
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
              ) : mainSessions.length === 0 &&
                (!showArchivedSessions || archivedSessions.length === 0) ? (
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
                        <p className="text-[11px] text-slate-600">
                          {mainSessions.length}
                        </p>
                      </div>
                      {mainSessions.map((session) => (
                        <MainSessionCard
                          key={session.id}
                          session={session}
                          isActive={session.id === activeSessionId}
                          processTitle={processBlueprintTitle(
                            processBlueprints,
                            session.processBlueprintId,
                          )}
                          runtimeNowMs={sessionCardRuntimeNowMs(session, nowMs)}
                          isRenaming={renamingSessionId === session.id}
                          renameTitle={
                            renamingSessionId === session.id ? renameTitle : ""
                          }
                          renaming={renaming}
                          isArchiving={archivingSessionId === session.id}
                          onActivateSession={activateSessionFromList}
                          onBeginRename={beginRenamingSession}
                          onRenameTitleChange={updateRenameTitle}
                          onRenameSubmit={submitRenameSession}
                          onArchiveSession={archiveSession}
                        />
                      ))}
                    </div>
                  ) : null}

                  {showArchivedSessions ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Archived
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {archivedSessions.length}
                        </p>
                      </div>
                      {archivedSessions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-4 text-sm text-slate-400">
                          {sessionSearchQuery.trim()
                            ? "No archived chats match this search."
                            : "No archived chats."}
                        </div>
                      ) : (
                        archivedSessions.map((session) => (
                          <ArchivedSessionCard
                            key={session.id}
                            session={session}
                            isActive={session.id === activeSessionId}
                            processTitle={processBlueprintTitle(
                              processBlueprints,
                              session.processBlueprintId,
                            )}
                            runtimeNowMs={sessionCardRuntimeNowMs(
                              session,
                              nowMs,
                            )}
                            isArchiving={archivingSessionId === session.id}
                            onActivateSession={activateSessionFromList}
                            onRestoreSession={restoreSession}
                          />
                        ))
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Resize session rail"
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
          </button>
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
            {activeSessionUsageSummary ? (
              <p className="truncate text-[11px] text-cyan-300/80">
                {activeSessionUsageSummary}
              </p>
            ) : null}
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
        {wsWarning ? (
          <div className="border-b border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 md:px-6">
            {wsWarning}
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={transcriptViewportRef}
            onScroll={handleTranscriptViewportScroll}
            data-agent-chat-transcript-viewport="true"
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-3 sm:px-3 sm:py-4 md:px-6"
            style={{
              paddingBottom: `${Math.max(composerDockHeight + 12, 104)}px`,
            }}
          >
            <div ref={transcriptContentRef} className="min-h-full">
              {!activeSession ? (
                <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-500">
                  Start or select a chat to see the thread.
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-500">
                  This chat has no messages yet.
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-[78rem] min-w-0 gap-3 sm:gap-4 overflow-x-hidden">
                  <div className="min-w-0 flex-1">
                    <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:gap-4">
                      {hiddenTranscriptItemCount > 0 ? (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              setTranscriptRenderLimit(
                                (current) => current + transcriptRenderPageSize,
                              )
                            }
                            className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300"
                          >
                            Show{" "}
                            {Math.min(
                              transcriptRenderPageSize,
                              hiddenTranscriptItemCount,
                            )}{" "}
                            earlier items · {hiddenTranscriptItemCount} hidden
                          </button>
                        </div>
                      ) : null}

                      {visibleTranscriptItems.map((item) => {
                        if (item.type === "activityCluster") {
                          const clusterKey = activityClusterKey(item.messages)
                          const expanded =
                            !!expandedActivityClusterKeys[clusterKey]
                          return (
                            <article
                              key={clusterKey}
                              className="w-full overflow-hidden rounded-3xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2.5 sm:px-4 sm:py-3 md:max-w-[64%] md:px-5 md:py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                                      assistant
                                    </p>
                                    <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-100">
                                      activity
                                    </span>
                                  </div>
                                  <p className="mt-2 break-words text-sm text-slate-100">
                                    {summarizeActivityCluster(item.messages)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleExpandedActivityCluster(clusterKey)
                                  }
                                  className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100"
                                >
                                  {expanded
                                    ? "Collapse"
                                    : `Show ${item.messages.length}`}
                                </button>
                              </div>

                              {expanded ? (
                                <div className="mt-3 space-y-2">
                                  {item.messages.map((message) => (
                                    <div
                                      key={message.id}
                                      className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-100">
                                          activity
                                        </span>
                                        <p className="text-[10px] text-slate-500">
                                          {formatTime(message.createdAtMs)}
                                        </p>
                                      </div>
                                      <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-200">
                                        {firstTextBlock(message) || "Activity"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </article>
                          )
                        }

                        const { message, precedingStreamCheckpoints } = item
                        const replyTarget = message.replyToMessageId
                          ? (messageMap.get(message.replyToMessageId) ?? null)
                          : null
                        const queueLabel = threadMessageQueueLabel(message)
                        const replacedStreamsExpanded =
                          !!expandedReplacedStreamMessageIds[message.id]
                        const rawTranscriptVisible =
                          !!rawTranscriptMessageIds[message.id]

                        return (
                          <article
                            key={message.id}
                            id={`message-${message.id}`}
                            ref={(element) =>
                              setMessageElementRef(message.id, element)
                            }
                            className={`min-w-0 overflow-hidden rounded-3xl border px-3 py-2.5 sm:px-4 sm:py-3 md:px-5 md:py-4 ${
                              message.kind === "thought" ||
                              message.kind === "streamCheckpoint" ||
                              message.kind === "activity"
                                ? message.kind === "activity"
                                  ? "w-full border-amber-300/15 bg-amber-300/[0.06] md:max-w-[64%]"
                                  : "w-full border-white/10 bg-slate-950/60 md:max-w-[64%]"
                                : message.role === "user"
                                  ? "ml-auto w-full max-w-[92%] border-fuchsia-300/20 bg-fuchsia-300/10 md:max-w-[80%]"
                                  : message.role === "system"
                                    ? "w-full border-slate-300/15 bg-slate-300/[0.04]"
                                    : "w-full border-white/10 bg-white/5 md:max-w-[88%]"
                            } ${
                              highlightedMessageId === message.id
                                ? "ring-2 ring-cyan-300/40"
                                : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="relative flex min-w-0 items-center gap-2">
                                <p
                                  className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                                    message.kind === "activity"
                                      ? "text-amber-100"
                                      : message.role === "system"
                                        ? "text-slate-300"
                                        : "text-slate-400"
                                  }`}
                                >
                                  {message.kind === "activity"
                                    ? "assistant"
                                    : message.role}
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
                                {message.kind === "activity" ? (
                                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-100">
                                    activity
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
                                    onClick={() =>
                                      toggleExpandedReplacedStreams(message.id)
                                    }
                                    className="inline-flex items-center rounded-full border border-cyan-300/15 bg-cyan-300/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100"
                                    aria-expanded={replacedStreamsExpanded}
                                  >
                                    Replaced Streams{" "}
                                    {precedingStreamCheckpoints.length}
                                  </button>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-slate-500">
                                  {formatTime(message.createdAtMs)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleRawTranscriptMessage(message.id)
                                  }
                                  className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-400 hover:border-white/20 hover:text-slate-200"
                                >
                                  {rawTranscriptVisible ? "Rendered" : "Raw"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyMessageLink(
                                      message.sessionId,
                                      message.id,
                                    )
                                  }
                                  className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-400 hover:border-white/20 hover:text-slate-200"
                                >
                                  Copy link
                                </button>
                              </div>
                            </div>

                            {replyTarget ? (
                              <div className="mt-2 min-w-0 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                                Replying to {replyTarget.role} ·{" "}
                                {summarizeMessageContent(
                                  replyTarget.content,
                                  72,
                                )}
                              </div>
                            ) : null}

                            {message.role === "assistant" &&
                            message.kind === "chat" &&
                            precedingStreamCheckpoints.length > 0 &&
                            replacedStreamsExpanded ? (
                              <div className="mt-2.5 space-y-2">
                                {precedingStreamCheckpoints.map(
                                  (checkpoint, checkpointIndex) => (
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
                                  ),
                                )}
                              </div>
                            ) : null}

                            {rawTranscriptVisible ? (
                              <div className="mt-2.5">
                                {renderRawMessageContent(message)}
                              </div>
                            ) : message.kind === "thought" ? (
                              <details className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Collapsed Thought Checkpoint
                                </summary>
                                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-200">
                                  {message.content.map((block, index) =>
                                    block.type === "text" ? (
                                      <div
                                        key={`${message.id}-${block.text}`}
                                        className="space-y-3"
                                      >
                                        {renderMarkdownBlocks(
                                          block.text,
                                          `${message.id}-${index}`,
                                          {
                                            sessionId: message.sessionId,
                                            messageId: message.id,
                                            apiRootUrl: props.apiRootUrl,
                                            onImageKept: applySessionSnapshot,
                                            activeSessionId,
                                            sessionMap,
                                            messageMap,
                                          },
                                        )}
                                      </div>
                                    ) : null,
                                  )}
                                </div>
                              </details>
                            ) : (
                              <div className="mt-2.5 space-y-3 text-sm leading-6 text-slate-100">
                                {message.content.map((block, index) =>
                                  block.type === "text" ? (
                                    <div
                                      key={`${message.id}-${block.text}`}
                                      className={
                                        message.kind === "activity"
                                          ? "text-slate-100"
                                          : message.role === "system"
                                            ? "text-slate-200"
                                            : ""
                                      }
                                    >
                                      {renderMarkdownBlocks(
                                        block.text,
                                        `${message.id}-${index}`,
                                        {
                                          sessionId: message.sessionId,
                                          messageId: message.id,
                                          apiRootUrl: props.apiRootUrl,
                                          onImageKept: applySessionSnapshot,
                                          activeSessionId,
                                          sessionMap,
                                          messageMap,
                                        },
                                      )}
                                    </div>
                                  ) : (
                                    <MessageImageAsset
                                      key={`${message.id}-${block.url}`}
                                      sessionId={message.sessionId}
                                      messageId={message.id}
                                      apiRootUrl={props.apiRootUrl}
                                      sourceUrl={block.url}
                                      altText="Shared image"
                                      onImageKept={applySessionSnapshot}
                                    />
                                  ),
                                )}
                              </div>
                            )}

                            {message.role === "assistant" &&
                            message.kind !== "thought" &&
                            message.kind !== "streamCheckpoint" &&
                            message.kind !== "activity" ? (
                              <div className="mt-3 flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyTargetMessageId(message.id)
                                  }
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
                        <article className="w-full max-w-[88%] min-w-0 overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-400/5 p-3 sm:p-4 md:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                              assistant
                            </p>
                            <p className="text-xs text-cyan-100/70">
                              streaming...
                            </p>
                          </div>
                          <div className="mt-3 space-y-3">
                            {renderMarkdownBlocks(
                              streamingAssistantText,
                              "streaming",
                              {
                                sessionId: activeSessionId,
                                messageId: "streaming-assistant",
                                apiRootUrl: props.apiRootUrl,
                                onImageKept: applySessionSnapshot,
                                activeSessionId,
                                sessionMap,
                                messageMap,
                              },
                            )}
                          </div>
                        </article>
                      ) : null}
                      <div
                        ref={transcriptBottomSentinelRef}
                        className="h-px w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            ref={composerDockRef}
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 px-0 pb-[env(safe-area-inset-bottom)] sm:px-3 sm:pb-3 md:px-6 ${
              hideComposerDockForMobileSessionRail ? "hidden md:block" : ""
            }`}
          >
            <div className="mx-auto flex w-full max-w-[78rem]">
              <div className="pointer-events-auto mx-auto flex w-full max-w-4xl flex-col gap-2.5">
                {showScrollToBottomButton ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => scrollTranscriptToBottom()}
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-lg backdrop-blur"
                    >
                      <ScrollToBottomIcon />
                      <span>Scroll to bottom</span>
                    </button>
                  </div>
                ) : null}

                {activeReplyTarget ? (
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">
                    <div className="flex items-center justify-between gap-3">
                      <p>
                        Replying to {activeReplyTarget.role} ·{" "}
                        {summarizeMessageContent(
                          activeReplyTarget.content,
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
                  <div className="max-h-[min(34rem,calc(100dvh-15rem))] overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-4">
                    <form
                      onSubmit={updateCurrentChatSettings}
                      className="space-y-4"
                    >
                      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 rounded-t-3xl border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Current Chat
                          </p>
                          <p className="mt-2 text-sm text-slate-400">
                            Keep the current thread focused here. Use directory
                            changes when the next turn should work elsewhere.
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
                        <p>
                          {activeSession
                            ? `${activeSession.providerKind} · ${activeSession.modelRef}`
                            : "No active chat selected."}
                        </p>
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
                            onClick={() =>
                              void setSessionArchived(
                                activeSession.id,
                                !activeSession.archived,
                              )
                            }
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
                            setActiveSessionProcessBlueprintId(
                              event.target.value,
                            )
                            void updateActiveSessionProcessQuickSet(
                              event.target.value,
                            )
                          }}
                          disabled={
                            !activeSession || updatingQuickProcessBlueprint
                          }
                          className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${darkNativeSelectClass} ${
                            processResolutionRequired
                              ? "border-rose-400/60"
                              : "border-white/10"
                          }`}
                        >
                          {processResolutionRequired ? (
                            <option
                              style={darkNativeOptionStyle}
                              value={completedProcessResolutionSentinel}
                              disabled
                            >
                              Choose next process
                            </option>
                          ) : null}
                          <option style={darkNativeOptionStyle} value="">
                            none
                          </option>
                          {processBlueprints.map((entry) => (
                            <option
                              style={darkNativeOptionStyle}
                              key={entry.id}
                              value={entry.id}
                            >
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
                            {processTerminalStatus === "blocked"
                              ? "Blocked"
                              : "Done"}
                            . Choose the next process before sending the next
                            message.
                          </p>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Provider
                        </span>
                        <select
                          value={activeSessionProviderKind}
                          onChange={(event) =>
                            setActiveSessionProviderKind(
                              event.target.value as ProviderKind,
                            )
                          }
                          disabled={!activeSession}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {providers.map((provider) => (
                            <option
                              className="text-slate-950"
                              key={provider.kind}
                              value={provider.kind}
                            >
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Model
                        </span>
                        {activeSessionProvider?.modelOptions.length ? (
                          <select
                            value={activeSessionModelRef}
                            onChange={(event) =>
                              setActiveSessionModelRef(event.target.value)
                            }
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {activeSessionProvider.modelOptions.map((model) => (
                              <option
                                className="text-slate-950"
                                key={model}
                                value={model}
                              >
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
                      </div>
                      <div className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Auth Profile
                        </span>
                        {activeSessionProvider?.authProfiles.length ? (
                          <select
                            value={activeSessionAuthProfile}
                            onChange={(event) =>
                              setActiveSessionAuthProfile(event.target.value)
                            }
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {activeSessionProvider.authProfiles.map(
                              (profile) => (
                                <option
                                  className="text-slate-950"
                                  key={profile}
                                  value={profile}
                                >
                                  {profile}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          <input
                            value={activeSessionAuthProfile}
                            readOnly
                            disabled={!activeSession}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        )}
                      </div>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Directory
                        </span>
                        <input
                          value={activeSessionDirectory}
                          onChange={(event) =>
                            setActiveSessionDirectory(event.target.value)
                          }
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
                          onChange={(event) =>
                            setActiveSessionImageModelRef(event.target.value)
                          }
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
                            (activeSessionDirectory.trim() ===
                              activeSession.cwd &&
                              activeSessionProviderKind ===
                                activeSession.providerKind &&
                              activeSessionModelRef ===
                                activeSession.modelRef &&
                              activeSessionAuthProfile ===
                                (activeSession.authProfile ?? "") &&
                              activeSessionImageModelRef ===
                                (activeSession.imageModelRef ?? "") &&
                              activeSessionProcessBlueprintId ===
                                (activeSession.processBlueprintId ?? "") &&
                              !processResolutionRequired)
                          }
                          className="w-full rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                        >
                          {updatingDirectory
                            ? "Saving..."
                            : "Save Chat Settings"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}

                {compactWaitingSummary ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                        Waiting
                      </span>
                      <p className="min-w-0 truncate text-sm text-amber-50">
                        {compactWaitingSummary}
                      </p>
                    </div>
                  </div>
                ) : null}

                <ComposerPanel
                  activeSession={activeSession}
                  sending={sending}
                  interrupting={interrupting}
                  activity={activity}
                  threadStatusSummary={threadStatusSummary}
                  processResolutionRequired={processResolutionRequired}
                  processTerminalStatus={processTerminalStatus}
                  quickProcessSelectValue={quickProcessSelectValue}
                  processBlueprints={processBlueprints}
                  activeProcessBlueprintId={
                    activeSession?.processBlueprintId ?? null
                  }
                  updatingQuickProcessBlueprint={updatingQuickProcessBlueprint}
                  settingsOpen={settingsOpen}
                  onToggleSettings={() =>
                    setSettingsOpen((current) => !current)
                  }
                  onQuickProcessChange={(nextProcessBlueprintId) =>
                    void updateActiveSessionProcessQuickSet(
                      nextProcessBlueprintId,
                    )
                  }
                  onInterrupt={() => void interruptRun()}
                  onSubmitMessage={sendMessage}
                  onReportTyping={reportTyping}
                  onSetError={setError}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
