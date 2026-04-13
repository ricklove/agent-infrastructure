import {
  dashboardSessionFetch,
  dashboardSessionWebSocketProtocols,
} from "@agent-infrastructure/dashboard-plugin"
import { observable } from "@legendapp/state"
import type { AgentTicket } from "./ticket-types"

const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."

type ProviderKind =
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
  messagesBySessionId: Record<string, AgentChatV2Message[]>
  queuedMessagesBySessionId: Record<string, AgentChatV2Message[]>
  hasOlderMessagesBySessionId: Record<string, boolean>
  nextBeforeMessageIdBySessionId: Record<string, string | null>
  sessionVersionBySessionId: Record<string, string>
  streamingAssistantText: string
  composerText: string
  sending: boolean
}

export type AgentChatV2Store = ReturnType<typeof createAgentChatV2Store>

export function createAgentChatV2Store(apiRootUrl: string, wsRootUrl: string) {
  const state$ = observable<AgentChatV2StoreState>({
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
    messagesBySessionId: {},
    queuedMessagesBySessionId: {},
    hasOlderMessagesBySessionId: {},
    nextBeforeMessageIdBySessionId: {},
    sessionVersionBySessionId: {},
    streamingAssistantText: "",
    composerText: "",
    sending: false,
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
  store.state$.hasOlderMessagesBySessionId[payload.session.id].set(
    payload.hasOlderMessages,
  )
  store.state$.nextBeforeMessageIdBySessionId[payload.session.id].set(
    payload.nextBeforeMessageId,
  )
  store.state$.sessionVersionBySessionId[payload.session.id].set(
    payload.sessionVersion,
  )
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
}

export function createAgentChatV2Actions(store: AgentChatV2Store) {
  let socket: WebSocket | null = null

  function closeSocket() {
    socket?.close()
    socket = null
    store.state$.connection.wsStatus.set("idle")
  }

  function connectSocket(sessionId: string) {
    closeSocket()
    store.state$.connection.wsStatus.set("connecting")
    const protocols = dashboardSessionWebSocketProtocols(
      dashboardSessionWebSocketProtocolPrefix,
    )
    socket =
      protocols.length > 0
        ? new WebSocket(wsUrl(store, sessionId), protocols)
        : new WebSocket(wsUrl(store, sessionId))
    socket.addEventListener("open", () => {
      store.state$.connection.wsStatus.set("ready")
    })
    socket.addEventListener("message", (event) => {
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
        return
      }
      if (payload.type === "run.delta") {
        store.state$.streamingAssistantText.set(payload.text)
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
    socket.addEventListener("close", () => {
      if (store.state$.connection.wsStatus.get() !== "idle") {
        store.state$.connection.wsStatus.set("error")
      }
    })
    socket.addEventListener("error", () => {
      store.state$.connection.wsStatus.set("error")
    })
  }

  async function openSession(sessionId: string): Promise<void> {
    store.state$.activeSessionId.set(sessionId)
    store.state$.streamingAssistantText.set("")
    const payload = await readJson<SessionWindowResponse>(
      apiPath(store, `/v2/sessions/${encodeURIComponent(sessionId)}/window`),
    )
    setSessionWindow(store, payload, "replace")
    connectSocket(sessionId)
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

    async loadOlderMessages(): Promise<void> {
      const sessionId = store.state$.activeSessionId.get()
      if (!sessionId) {
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
    },

    async sendMessage(): Promise<void> {
      const sessionId = store.state$.activeSessionId.get()
      const text = store.state$.composerText.get().trim()
      if (!sessionId || !text) {
        return
      }
      store.state$.sending.set(true)
      try {
        await readJson<{ ok: true }>(
          apiPath(store, `/sessions/${encodeURIComponent(sessionId)}/messages`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
          },
        )
        store.state$.composerText.set("")
      } finally {
        store.state$.sending.set(false)
      }
    },

    async createSession(): Promise<void> {
      const payload = await readJson<SessionWindowResponse>(
        apiPath(store, "/sessions"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerKind: "codex-app-server" }),
        },
      )
      setSessionWindow(store, payload, "replace")
      store.state$.activeSessionId.set(payload.session.id)
      connectSocket(payload.session.id)
    },

    async interruptSession(): Promise<void> {
      const sessionId = store.state$.activeSessionId.get()
      if (!sessionId) {
        return
      }
      const payload = await readJson<{
        ok: true
        activity: SessionActivity
      }>(
        apiPath(store, `/sessions/${encodeURIComponent(sessionId)}/interrupt`),
        {
          method: "POST",
        },
      )
      updateActiveSessionActivity(
        store,
        sessionId,
        payload.activity,
        store.state$.queuedMessagesBySessionId[sessionId].get() ?? [],
      )
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
