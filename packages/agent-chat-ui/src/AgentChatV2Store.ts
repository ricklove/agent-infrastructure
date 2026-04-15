import {
  dashboardSessionFetch,
  dashboardSessionWebSocketProtocols,
} from "@agent-infrastructure/dashboard-plugin"
import { batch, ObservableHint, observable, observe } from "@legendapp/state"
import type { AgentTicket } from "./ticket-types"

const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."

export type AgentChatV2ActionSequenceMode = "condensed" | "checkpoint"

export type ProviderKind =
  | "codex-app-server"
  | "openrouter"
  | "claude-agent-sdk"
  | "gemini"

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
  status: "unconfigured" | "unresolved" | "nudged" | "completed" | "blocked"
  nudgeCount: number
  lastNudgedAtMs: number | null
  completedAtMs: number | null
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

type SessionV2ReadState = {
  lastReadAtMs: number
  hasUnread: boolean
  unreadCount: number
  idleCompletedAtMs: number | null
}

export type AgentChatV2Session = {
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
  activeTicket: AgentTicket | null
  v2ReadState?: SessionV2ReadState
}

export type AgentChatV2Message = {
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
    | "ticketEvent"
  replyToMessageId: string | null
  ticketId: string | null
  providerSeenAtMs: number | null
  content: Array<
    { type: "text"; text: string } | { type: "image"; url: string }
  >
  createdAtMs: number
}

export type AgentChatV2PendingMessage = AgentChatV2Message & {
  pendingStatus: "pending" | "queued"
}

export type AgentChatV2OutboxMessage = AgentChatV2Message & {
  pendingStatus: "pending" | "queued"
}

export type AgentChatV2TranscriptItem =
  | { type: "message"; message: AgentChatV2Message }
  | {
      type: "actions"
      messages: AgentChatV2Message[]
      showIdlePreview: boolean
    }

export type AgentChatV2SessionUpdate = {
  title?: string
  archived?: boolean
  cwd?: string
  providerKind?: ProviderKind
  modelRef?: string
  authProfile?: string | null
  imageModelRef?: string | null
}

export type AgentChatV2ActiveSessionActions = {
  sendMessage(images?: AgentChatV2ComposerImage[]): Promise<void>
  loadOlderMessages(): Promise<void>
  interrupt(): Promise<void>
  update(update: AgentChatV2SessionUpdate): Promise<void>
  archive(): Promise<void>
  restore(): Promise<void>
  markRead(): Promise<void>
}

export type AgentChatV2ActiveSession = {
  session: AgentChatV2Session | null
  actions: AgentChatV2ActiveSessionActions | null
  messages: AgentChatV2Message[]
  queuedMessages: AgentChatV2Message[]
  pendingMessages: AgentChatV2PendingMessage[]
  transcriptMessages: AgentChatV2Message[]
  outboxMessages: AgentChatV2OutboxMessage[]
  transcriptItems: AgentChatV2TranscriptItem[]
  autoScrollKey: string
  firstMessageId: string
  hasOlderMessages: boolean
  nextBeforeMessageId: string | null
  sessionVersion: string
  streamingAssistantText: string
}

export type AgentChatV2ComposerImage = {
  id: string
  dataUrl: string
}

type SessionsResponse = {
  ok: boolean
  sessions: AgentChatV2Session[]
  nextCursor: string | null
  totalKnownSessions: number
  error?: string
}

type SessionWindowResponse = {
  ok: boolean
  session: AgentChatV2Session
  messages: AgentChatV2Message[]
  queuedMessages: AgentChatV2Message[]
  activity: SessionActivity
  providerUsage: SessionProviderUsage | null
  hasOlderMessages: boolean
  nextBeforeMessageId: string | null
  sessionVersion: string
  error?: string
}

type SessionSnapshotResponse = {
  ok: boolean
  session: AgentChatV2Session
  messages: AgentChatV2Message[]
  queuedMessages: AgentChatV2Message[]
  activity: SessionActivity
  providerUsage: SessionProviderUsage | null
  error?: string
}

type SessionUpdatedEvent = {
  type: "session.updated"
  session: AgentChatV2Session | null
  messages: AgentChatV2Message[]
  queuedMessages: AgentChatV2Message[]
  activity: SessionActivity
}

type SessionWindowEvent = {
  type: "session.window"
} & SessionWindowResponse

type RunDeltaEvent = {
  type: "run.delta"
  text: string
}

type RunActivityEvent = {
  type: "run.activity"
  activity: SessionActivity
  queuedMessages: AgentChatV2Message[]
}

type AgentChatV2StoreState = {
  connection: {
    status: "idle" | "loading" | "ready" | "error"
    wsStatus: "idle" | "connecting" | "ready" | "error"
    apiRootUrl: string
    wsRootUrl: string
    error: string
  }
  sessions: AgentChatV2Session[]
  nextSessionsCursor: string | null
  totalKnownSessions: number | null
  activeSessionId: string | null
  activeSession: AgentChatV2ActiveSession
  messagesBySessionId: Record<string, AgentChatV2Message[]>
  queuedMessagesBySessionId: Record<string, AgentChatV2Message[]>
  pendingMessagesBySessionId: Record<string, AgentChatV2PendingMessage[]>
  hasOlderMessagesBySessionId: Record<string, boolean>
  nextBeforeMessageIdBySessionId: Record<string, string | null>
  sessionVersionBySessionId: Record<string, string>
  streamingAssistantText: string
  composerText: string
  composerHasText: boolean
  sending: boolean
  interrupting: boolean
  actionSequenceMode: AgentChatV2ActionSequenceMode
  connectionSummary: () => Pick<
    AgentChatV2StoreState["connection"],
    "error" | "status" | "wsStatus"
  >
}

export type AgentChatV2Store = ReturnType<typeof createAgentChatV2Store>
export type AgentChatV2Actions = ReturnType<typeof createAgentChatV2Actions>

const activeSessionActionsByStore = new WeakMap<
  AgentChatV2Store,
  Map<string, AgentChatV2ActiveSessionActions>
>()

function emptyActiveSessionView(): AgentChatV2ActiveSession {
  return {
    session: null,
    actions: null,
    messages: [],
    queuedMessages: [],
    pendingMessages: [],
    transcriptMessages: [],
    outboxMessages: [],
    transcriptItems: [],
    autoScrollKey: "",
    firstMessageId: "",
    hasOlderMessages: false,
    nextBeforeMessageId: null,
    sessionVersion: "",
    streamingAssistantText: "",
  }
}

function writeActiveSessionView(
  store: AgentChatV2Store,
  view: AgentChatV2ActiveSession,
): void {
  batch(() => {
    store.state$.activeSession.session.set(view.session)
    store.state$.activeSession.actions.set(view.actions)
    store.state$.activeSession.messages.set(view.messages)
    store.state$.activeSession.queuedMessages.set(view.queuedMessages)
    store.state$.activeSession.pendingMessages.set(view.pendingMessages)
    store.state$.activeSession.transcriptMessages.set(view.transcriptMessages)
    store.state$.activeSession.outboxMessages.set(view.outboxMessages)
    store.state$.activeSession.transcriptItems.set(view.transcriptItems)
    store.state$.activeSession.autoScrollKey.set(view.autoScrollKey)
    store.state$.activeSession.firstMessageId.set(view.firstMessageId)
    store.state$.activeSession.hasOlderMessages.set(view.hasOlderMessages)
    store.state$.activeSession.nextBeforeMessageId.set(view.nextBeforeMessageId)
    store.state$.activeSession.sessionVersion.set(view.sessionVersion)
    store.state$.activeSession.streamingAssistantText.set(
      view.streamingAssistantText,
    )
  })
}

function clearActiveSessionView(store: AgentChatV2Store): void {
  writeActiveSessionView(store, emptyActiveSessionView())
}

function syncActiveSessionView(
  store: AgentChatV2Store,
  view: AgentChatV2ActiveSession,
): void {
  writeActiveSessionView(store, view)
}

export function createAgentChatV2Store(apiRootUrl: string, wsRootUrl: string) {
  let state$: ReturnType<typeof observable<AgentChatV2StoreState>>
  state$ = observable<AgentChatV2StoreState>({
    connection: {
      status: "idle",
      wsStatus: "idle",
      apiRootUrl,
      wsRootUrl,
      error: "",
    },
    sessions: [],
    nextSessionsCursor: null,
    totalKnownSessions: null,
    activeSessionId: null,
    activeSession: emptyActiveSessionView(),
    messagesBySessionId: {},
    queuedMessagesBySessionId: {},
    pendingMessagesBySessionId: {},
    hasOlderMessagesBySessionId: {},
    nextBeforeMessageIdBySessionId: {},
    sessionVersionBySessionId: {},
    streamingAssistantText: "",
    composerText: "",
    composerHasText: false,
    sending: false,
    interrupting: false,
    actionSequenceMode: "condensed",
    connectionSummary: () => ({
      error: state$.connection.error.get(),
      status: state$.connection.status.get(),
      wsStatus: state$.connection.wsStatus.get(),
    }),
  })
  observe(() => {
    const composerHasText = state$.composerText.get().trim().length > 0
    if (state$.composerHasText.peek() !== composerHasText) {
      state$.composerHasText.set(composerHasText)
    }
  })
  return { state$ }
}

function apiPath(store: AgentChatV2Store, path: string): string {
  const root = store.state$.connection.apiRootUrl.get().replace(/\/+$/u, "")
  return `${root}${path.startsWith("/") ? path : `/${path}`}`
}

function wsUrl(store: AgentChatV2Store, sessionId: string): string {
  const root = store.state$.connection.wsRootUrl.get()
  const url = new URL(root, window.location.href)
  url.searchParams.set("sessionId", sessionId)
  url.searchParams.set("mode", "v2")
  return url.toString()
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = (await dashboardSessionFetch(path, init)) as Response
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`)
  }
  return payload
}

function upsertSession(
  sessions: AgentChatV2Session[],
  session: AgentChatV2Session,
): AgentChatV2Session[] {
  const next = sessions.filter((entry) => entry.id !== session.id)
  next.push(session)
  return next.sort((left, right) => right.updatedAtMs - left.updatedAtMs)
}

function mergeMessages(
  current: AgentChatV2Message[],
  incoming: AgentChatV2Message[],
): AgentChatV2Message[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) {
    byId.set(message.id, message)
  }
  return Array.from(byId.values()).sort(
    (left, right) => left.createdAtMs - right.createdAtMs,
  )
}

function messageContentKey(message: AgentChatV2Message): string {
  return JSON.stringify(message.content)
}

function removePendingMessagesMatching(
  pendingMessages: AgentChatV2PendingMessage[],
  resolvedMessages: AgentChatV2Message[],
): AgentChatV2PendingMessage[] {
  if (pendingMessages.length === 0 || resolvedMessages.length === 0) {
    return pendingMessages
  }
  const resolvedCounts = new Map<string, number>()
  for (const message of resolvedMessages) {
    const key = `${message.role}:${messageContentKey(message)}`
    resolvedCounts.set(key, (resolvedCounts.get(key) ?? 0) + 1)
  }
  return pendingMessages.filter((message) => {
    const key = `${message.role}:${messageContentKey(message)}`
    const count = resolvedCounts.get(key) ?? 0
    if (count === 0) {
      return true
    }
    resolvedCounts.set(key, count - 1)
    return false
  })
}

function reconcilePendingMessages(
  store: AgentChatV2Store,
  sessionId: string,
  resolvedMessages: AgentChatV2Message[],
): void {
  const currentPending =
    store.state$.pendingMessagesBySessionId[sessionId].get() ?? []
  store.state$.pendingMessagesBySessionId[sessionId].set(
    removePendingMessagesMatching(currentPending, resolvedMessages),
  )
}

function activeMessageText(message: AgentChatV2Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : "[image]"))
    .join("\n")
    .trim()
}

function activeMessageDisplayKey(message: AgentChatV2Message): string {
  return `${message.role}:${JSON.stringify(message.content)}`
}

function isActionTranscriptMessage(message: AgentChatV2Message): boolean {
  return message.role === "system" || message.kind !== "chat"
}

function buildTranscriptItems(
  messages: AgentChatV2Message[],
  mode: AgentChatV2ActionSequenceMode,
): AgentChatV2TranscriptItem[] {
  const items: AgentChatV2TranscriptItem[] = []
  let actionMessages: AgentChatV2Message[] = []

  const flushActionMessages = (showIdlePreview: boolean) => {
    if (actionMessages.length === 0) {
      return
    }
    items.push({
      type: "actions",
      messages: actionMessages,
      showIdlePreview,
    })
    actionMessages = []
  }

  for (const message of messages) {
    if (isActionTranscriptMessage(message)) {
      actionMessages.push(message)
      if (mode === "checkpoint" && message.kind === "streamCheckpoint") {
        flushActionMessages(false)
      }
      continue
    }

    flushActionMessages(false)
    items.push({ type: "message", message })
  }

  flushActionMessages(true)

  return items
}

function buildActiveSessionTranscript(
  sessionId: string,
  messages: AgentChatV2Message[],
  queuedMessages: AgentChatV2Message[],
  pendingMessages: AgentChatV2PendingMessage[],
  streamingAssistantText: string,
  actionSequenceMode: AgentChatV2ActionSequenceMode,
): Pick<
  AgentChatV2ActiveSession,
  | "transcriptMessages"
  | "outboxMessages"
  | "transcriptItems"
  | "autoScrollKey"
  | "firstMessageId"
> {
  const queuedDisplayKeys = new Set(
    queuedMessages.map((message) => activeMessageDisplayKey(message)),
  )
  const transcriptMessages = messages.filter(
    (message) =>
      !queuedDisplayKeys.has(activeMessageDisplayKey(message)) &&
      !queuedMessages.some((queuedMessage) => queuedMessage.id === message.id),
  )
  const displayPendingMessages = pendingMessages.filter(
    (message) =>
      !queuedDisplayKeys.has(activeMessageDisplayKey(message)) &&
      !queuedMessages.some((queuedMessage) => queuedMessage.id === message.id),
  )
  const outboxMessages: AgentChatV2OutboxMessage[] = [
    ...displayPendingMessages,
    ...queuedMessages.map(
      (message): AgentChatV2OutboxMessage => ({
        ...message,
        pendingStatus: "queued",
      }),
    ),
  ].sort((left, right) => left.createdAtMs - right.createdAtMs)
  const lastMessage = transcriptMessages.at(-1) ?? null
  const lastMessageTextLength = lastMessage
    ? activeMessageText(lastMessage).length
    : 0
  const lastPendingMessage = outboxMessages.at(-1) ?? null

  return {
    transcriptMessages,
    outboxMessages,
    transcriptItems: buildTranscriptItems(
      transcriptMessages,
      actionSequenceMode,
    ),
    autoScrollKey: `${sessionId}:${lastMessage?.id ?? ""}:${lastMessageTextLength}:${streamingAssistantText.length}:${queuedMessages.length}:${lastPendingMessage?.id ?? ""}:${lastPendingMessage?.pendingStatus ?? ""}`,
    firstMessageId: transcriptMessages[0]?.id ?? "",
  }
}

function readActiveSessionActions(
  store: AgentChatV2Store,
  sessionId: string,
): AgentChatV2ActiveSessionActions {
  let actionsBySessionId = activeSessionActionsByStore.get(store)
  if (!actionsBySessionId) {
    actionsBySessionId = new Map()
    activeSessionActionsByStore.set(store, actionsBySessionId)
  }

  const cachedActions = actionsBySessionId.get(sessionId)
  if (cachedActions) {
    return cachedActions
  }

  const actions: AgentChatV2ActiveSessionActions = {
    sendMessage: (images = []) =>
      sendMessageForSession(store, sessionId, images, { requireActive: true }),
    loadOlderMessages: () =>
      loadOlderMessagesForSession(store, sessionId, { requireActive: true }),
    interrupt: () =>
      interruptSessionById(store, sessionId, { requireActive: true }),
    update: (update) =>
      updateSessionById(store, sessionId, update, { requireActive: true }),
    archive: () =>
      updateSessionById(
        store,
        sessionId,
        { archived: true },
        { requireActive: true },
      ),
    restore: () =>
      updateSessionById(
        store,
        sessionId,
        { archived: false },
        { requireActive: true },
      ),
    markRead: () => markSessionReadById(store, sessionId),
  }
  actionsBySessionId.set(sessionId, actions)
  return actions
}

function readActiveSessionView(
  store: AgentChatV2Store,
  session: AgentChatV2Session,
): AgentChatV2ActiveSession {
  const sessionId = session.id
  const messages = store.state$.messagesBySessionId[sessionId].get() ?? []
  const queuedMessages =
    store.state$.queuedMessagesBySessionId[sessionId].get() ?? []
  const pendingMessages =
    store.state$.pendingMessagesBySessionId[sessionId].get() ?? []
  const streamingAssistantText = store.state$.streamingAssistantText.get() ?? ""

  return {
    session,
    actions: ObservableHint.opaque(readActiveSessionActions(store, sessionId)),
    messages,
    queuedMessages,
    pendingMessages,
    ...buildActiveSessionTranscript(
      sessionId,
      messages,
      queuedMessages,
      pendingMessages,
      streamingAssistantText,
      store.state$.actionSequenceMode.get(),
    ),
    hasOlderMessages:
      store.state$.hasOlderMessagesBySessionId[sessionId].get() ?? false,
    nextBeforeMessageId:
      store.state$.nextBeforeMessageIdBySessionId[sessionId].get() ?? null,
    sessionVersion:
      store.state$.sessionVersionBySessionId[sessionId].get() ?? "",
    streamingAssistantText,
  }
}

function syncActiveSession(store: AgentChatV2Store, sessionId: string): void {
  if (store.state$.activeSessionId.get() !== sessionId) {
    return
  }
  const session =
    store.state$.sessions.get().find((entry) => entry.id === sessionId) ?? null
  if (!session) {
    clearActiveSessionView(store)
    return
  }
  syncActiveSessionView(store, readActiveSessionView(store, session))
}

function setSessionWindow(
  store: AgentChatV2Store,
  payload: SessionWindowResponse,
  mode: "replace" | "prepend",
): void {
  store.state$.sessions.set(
    upsertSession(store.state$.sessions.get(), payload.session),
  )
  const currentMessages =
    store.state$.messagesBySessionId[payload.session.id].get() ?? []
  store.state$.messagesBySessionId[payload.session.id].set(
    mode === "prepend"
      ? mergeMessages(payload.messages, currentMessages)
      : mergeMessages([], payload.messages),
  )
  store.state$.queuedMessagesBySessionId[payload.session.id].set(
    payload.queuedMessages,
  )
  reconcilePendingMessages(store, payload.session.id, [
    ...payload.messages,
    ...payload.queuedMessages,
  ])
  store.state$.hasOlderMessagesBySessionId[payload.session.id].set(
    payload.hasOlderMessages,
  )
  store.state$.nextBeforeMessageIdBySessionId[payload.session.id].set(
    payload.nextBeforeMessageId,
  )
  store.state$.sessionVersionBySessionId[payload.session.id].set(
    payload.sessionVersion,
  )
  syncActiveSession(store, payload.session.id)
}

function applySessionUpdate(
  store: AgentChatV2Store,
  payload: SessionUpdatedEvent,
): void {
  if (payload.session) {
    store.state$.sessions.set(
      upsertSession(store.state$.sessions.get(), payload.session),
    )
    const currentMessages =
      store.state$.messagesBySessionId[payload.session.id].get() ?? []
    store.state$.messagesBySessionId[payload.session.id].set(
      mergeMessages(currentMessages, payload.messages),
    )
    store.state$.queuedMessagesBySessionId[payload.session.id].set(
      payload.queuedMessages,
    )
    reconcilePendingMessages(store, payload.session.id, [
      ...payload.messages,
      ...payload.queuedMessages,
    ])
    syncActiveSession(store, payload.session.id)
  }
}

function updateActiveSessionActivity(
  store: AgentChatV2Store,
  sessionId: string,
  activity: SessionActivity,
  queuedMessages: AgentChatV2Message[],
): void {
  store.state$.sessions.set(
    store.state$.sessions.get().map((session) =>
      session.id === sessionId
        ? {
            ...session,
            activity,
            queuedMessageCount: queuedMessages.length,
          }
        : session,
    ),
  )
  store.state$.queuedMessagesBySessionId[sessionId].set(queuedMessages)
  reconcilePendingMessages(store, sessionId, queuedMessages)
  syncActiveSession(store, sessionId)
}

async function markSessionReadById(
  store: AgentChatV2Store,
  sessionId: string,
): Promise<void> {
  const payload = await readJson<{
    ok: true
    session: AgentChatV2Session | null
  }>(apiPath(store, `/v2/sessions/${encodeURIComponent(sessionId)}/read`), {
    method: "POST",
  })
  if (!payload.session) {
    return
  }
  store.state$.sessions.set(
    upsertSession(store.state$.sessions.get(), payload.session),
  )
  syncActiveSession(store, sessionId)
}

function setSessionSnapshot(
  store: AgentChatV2Store,
  payload: SessionSnapshotResponse,
) {
  store.state$.sessions.set(
    upsertSession(store.state$.sessions.get(), payload.session),
  )
  store.state$.messagesBySessionId[payload.session.id].set(
    mergeMessages([], payload.messages),
  )
  store.state$.queuedMessagesBySessionId[payload.session.id].set(
    payload.queuedMessages,
  )
  store.state$.hasOlderMessagesBySessionId[payload.session.id].set(false)
  store.state$.nextBeforeMessageIdBySessionId[payload.session.id].set(null)
  store.state$.sessionVersionBySessionId[payload.session.id].set("")
  syncActiveSession(store, payload.session.id)
}

function shouldSkipInactiveSessionAction(
  store: AgentChatV2Store,
  sessionId: string,
  options?: { requireActive?: boolean },
): boolean {
  return Boolean(
    options?.requireActive && store.state$.activeSessionId.get() !== sessionId,
  )
}

async function loadOlderMessagesForSession(
  store: AgentChatV2Store,
  sessionId: string,
  options?: { requireActive?: boolean },
): Promise<void> {
  if (shouldSkipInactiveSessionAction(store, sessionId, options)) {
    return
  }
  const beforeMessageId =
    store.state$.nextBeforeMessageIdBySessionId[sessionId].get()
  if (!beforeMessageId) {
    return
  }
  const params = new URLSearchParams({
    limit: "80",
    beforeMessageId,
  })
  const payload = await readJson<SessionWindowResponse>(
    apiPath(
      store,
      `/v2/sessions/${encodeURIComponent(sessionId)}/window?${params.toString()}`,
    ),
  )
  setSessionWindow(store, payload, "prepend")
}

async function sendMessageForSession(
  store: AgentChatV2Store,
  sessionId: string,
  images: AgentChatV2ComposerImage[] = [],
  options?: { requireActive?: boolean },
): Promise<void> {
  if (shouldSkipInactiveSessionAction(store, sessionId, options)) {
    return
  }
  const text = store.state$.composerText.get().trim()
  if (!text && images.length === 0) {
    return
  }
  const content: AgentChatV2Message["content"] = [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...images.map((image) => ({
      type: "image" as const,
      url: image.dataUrl,
    })),
  ]
  const pendingMessage: AgentChatV2PendingMessage = {
    id: `pending-${crypto.randomUUID()}`,
    sessionId,
    role: "user",
    kind: "chat",
    replyToMessageId: null,
    ticketId: null,
    providerSeenAtMs: null,
    content,
    createdAtMs: Date.now(),
    pendingStatus: "pending",
  }
  store.state$.pendingMessagesBySessionId[sessionId].set([
    ...(store.state$.pendingMessagesBySessionId[sessionId].get() ?? []),
    pendingMessage,
  ])
  syncActiveSession(store, sessionId)
  store.state$.composerText.set("")
  store.state$.sending.set(true)
  try {
    const payload = await readJson<{
      ok: true
      queuedMessages?: AgentChatV2Message[]
    }>(apiPath(store, `/sessions/${encodeURIComponent(sessionId)}/messages`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        content: [
          ...(text ? [{ type: "text" as const, text }] : []),
          ...images.map((image) => ({
            type: "image" as const,
            dataUrl: image.dataUrl,
          })),
        ],
      }),
    })
    if (payload.queuedMessages) {
      store.state$.queuedMessagesBySessionId[sessionId].set(
        payload.queuedMessages,
      )
      reconcilePendingMessages(store, sessionId, payload.queuedMessages)
      const pendingMessages =
        store.state$.pendingMessagesBySessionId[sessionId].get() ?? []
      store.state$.pendingMessagesBySessionId[sessionId].set(
        pendingMessages.map((message) =>
          message.id === pendingMessage.id
            ? { ...message, pendingStatus: "queued" as const }
            : message,
        ),
      )
      syncActiveSession(store, sessionId)
    }
  } catch (error) {
    const pendingMessages =
      store.state$.pendingMessagesBySessionId[sessionId].get() ?? []
    store.state$.pendingMessagesBySessionId[sessionId].set(
      pendingMessages.filter((message) => message.id !== pendingMessage.id),
    )
    syncActiveSession(store, sessionId)
    store.state$.composerText.set(text)
    throw error
  } finally {
    store.state$.sending.set(false)
  }
}

async function updateSessionById(
  store: AgentChatV2Store,
  sessionId: string,
  update: AgentChatV2SessionUpdate,
  options?: { requireActive?: boolean },
): Promise<void> {
  if (shouldSkipInactiveSessionAction(store, sessionId, options)) {
    return
  }
  const payload = await readJson<SessionSnapshotResponse>(
    apiPath(store, `/sessions/${encodeURIComponent(sessionId)}`),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    },
  )
  setSessionSnapshot(store, payload)
}

async function interruptSessionById(
  store: AgentChatV2Store,
  sessionId: string,
  options?: { requireActive?: boolean },
): Promise<void> {
  if (
    shouldSkipInactiveSessionAction(store, sessionId, options) ||
    store.state$.interrupting.get()
  ) {
    return
  }
  store.state$.interrupting.set(true)
  store.state$.connection.error.set("")
  try {
    const payload = await readJson<{
      ok: true
      activity: SessionActivity
    }>(apiPath(store, `/sessions/${encodeURIComponent(sessionId)}/interrupt`), {
      method: "POST",
    })
    updateActiveSessionActivity(
      store,
      sessionId,
      payload.activity,
      store.state$.queuedMessagesBySessionId[sessionId].get() ?? [],
    )
  } catch (error) {
    store.state$.connection.error.set(
      error instanceof Error ? error.message : "Interrupt failed.",
    )
  } finally {
    store.state$.interrupting.set(false)
  }
}

export function createAgentChatV2Actions(store: AgentChatV2Store) {
  let socket: WebSocket | null = null
  let openSessionRequestId = 0

  function closeSocket() {
    socket?.close()
    socket = null
    store.state$.connection.wsStatus.set("idle")
  }

  function clearActiveSessionState(sessionId: string) {
    store.state$.messagesBySessionId[sessionId].set([])
    store.state$.queuedMessagesBySessionId[sessionId].set([])
    store.state$.pendingMessagesBySessionId[sessionId].set([])
    store.state$.hasOlderMessagesBySessionId[sessionId].set(false)
    store.state$.nextBeforeMessageIdBySessionId[sessionId].set(null)
    store.state$.sessionVersionBySessionId[sessionId].set("")
    clearActiveSessionView(store)
    store.state$.streamingAssistantText.set("")
    store.state$.composerText.set("")
    store.state$.sending.set(false)
    store.state$.interrupting.set(false)
  }

  function connectSocket(sessionId: string) {
    closeSocket()
    store.state$.connection.wsStatus.set("connecting")
    const protocols = dashboardSessionWebSocketProtocols(
      dashboardSessionWebSocketProtocolPrefix,
    )
    const nextSocket =
      protocols.length > 0
        ? new WebSocket(wsUrl(store, sessionId), protocols)
        : new WebSocket(wsUrl(store, sessionId))
    socket = nextSocket
    nextSocket.addEventListener("open", () => {
      if (socket !== nextSocket) {
        return
      }
      store.state$.connection.wsStatus.set("ready")
    })
    nextSocket.addEventListener("message", (event) => {
      if (
        socket !== nextSocket ||
        store.state$.activeSessionId.get() !== sessionId
      ) {
        return
      }
      const payload = JSON.parse(String(event.data)) as
        | SessionWindowEvent
        | SessionUpdatedEvent
        | RunDeltaEvent
        | RunActivityEvent
      if (payload.type === "session.window") {
        setSessionWindow(store, payload, "replace")
        return
      }
      if (payload.type === "session.updated") {
        applySessionUpdate(store, payload)
        store.state$.streamingAssistantText.set("")
        syncActiveSession(store, sessionId)
        return
      }
      if (payload.type === "run.delta") {
        store.state$.streamingAssistantText.set(payload.text)
        syncActiveSession(store, sessionId)
        return
      }
      if (payload.type === "run.activity") {
        updateActiveSessionActivity(
          store,
          sessionId,
          payload.activity,
          payload.queuedMessages,
        )
      }
    })
    nextSocket.addEventListener("close", () => {
      if (
        socket === nextSocket &&
        store.state$.connection.wsStatus.get() !== "idle"
      ) {
        store.state$.connection.wsStatus.set("error")
      }
    })
    nextSocket.addEventListener("error", () => {
      if (socket !== nextSocket) {
        return
      }
      store.state$.connection.wsStatus.set("error")
    })
  }

  async function openSession(sessionId: string): Promise<void> {
    const requestId = ++openSessionRequestId
    closeSocket()
    store.state$.activeSessionId.set(sessionId)
    clearActiveSessionState(sessionId)
    const payload = await readJson<SessionWindowResponse>(
      apiPath(store, `/v2/sessions/${encodeURIComponent(sessionId)}/window`),
    )
    if (requestId !== openSessionRequestId) {
      return
    }
    store.state$.activeSessionId.set(sessionId)
    setSessionWindow(store, payload, "replace")
    connectSocket(sessionId)
    void markSessionReadById(store, sessionId)
  }

  const actions = {
    async loadSessions(append = false): Promise<void> {
      store.state$.connection.status.set("loading")
      store.state$.connection.error.set("")
      try {
        const cursor = append ? store.state$.nextSessionsCursor.get() : null
        const params = new URLSearchParams({ limit: "40" })
        if (cursor) {
          params.set("cursor", cursor)
        }
        const payload = await readJson<SessionsResponse>(
          apiPath(store, `/v2/sessions?${params.toString()}`),
        )
        store.state$.sessions.set(
          append
            ? mergeSessionPages(store.state$.sessions.get(), payload.sessions)
            : payload.sessions,
        )
        store.state$.nextSessionsCursor.set(payload.nextCursor)
        store.state$.totalKnownSessions.set(payload.totalKnownSessions)
        store.state$.connection.status.set("ready")
        if (!store.state$.activeSessionId.get() && payload.sessions[0]) {
          await openSession(payload.sessions[0].id)
        }
      } catch (error) {
        store.state$.connection.status.set("error")
        store.state$.connection.error.set(
          error instanceof Error ? error.message : "Failed to load sessions.",
        )
      }
    },

    openSession,

    loadOlderMessages(): Promise<void> {
      const sessionId = store.state$.activeSessionId.get()
      if (!sessionId) {
        return Promise.resolve()
      }
      return loadOlderMessagesForSession(store, sessionId, {
        requireActive: true,
      })
    },

    sendMessage(images: AgentChatV2ComposerImage[] = []): Promise<void> {
      const sessionId = store.state$.activeSessionId.get()
      if (!sessionId) {
        return Promise.resolve()
      }
      return sendMessageForSession(store, sessionId, images, {
        requireActive: true,
      })
    },

    async createSession(title?: string): Promise<string> {
      const payload = await readJson<SessionWindowResponse>(
        apiPath(store, "/sessions"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            providerKind: "codex-app-server",
            title: title?.trim() || undefined,
          }),
        },
      )
      store.state$.activeSessionId.set(payload.session.id)
      setSessionWindow(store, payload, "replace")
      connectSocket(payload.session.id)
      void markSessionReadById(store, payload.session.id)
      return payload.session.id
    },

    async setSessionArchived(
      sessionId: string,
      archived: boolean,
    ): Promise<void> {
      await updateSessionById(store, sessionId, { archived })
    },

    async updateSession(
      sessionId: string,
      update: AgentChatV2SessionUpdate,
    ): Promise<void> {
      await updateSessionById(store, sessionId, update)
    },

    setActionSequenceMode(mode: AgentChatV2ActionSequenceMode): void {
      store.state$.actionSequenceMode.set(mode)
      const sessionId = store.state$.activeSessionId.get()
      if (sessionId) {
        syncActiveSession(store, sessionId)
      }
    },

    markSessionRead(sessionId: string): Promise<void> {
      return markSessionReadById(store, sessionId)
    },

    interruptSession(): Promise<void> {
      const sessionId = store.state$.activeSessionId.get()
      if (!sessionId) {
        return Promise.resolve()
      }
      return interruptSessionById(store, sessionId, { requireActive: true })
    },

    close(): void {
      closeSocket()
    },
  }

  return actions
}

function mergeSessionPages(
  current: AgentChatV2Session[],
  incoming: AgentChatV2Session[],
): AgentChatV2Session[] {
  let next = current
  for (const session of incoming) {
    next = upsertSession(next, session)
  }
  return next
}
