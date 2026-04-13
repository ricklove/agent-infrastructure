import {
  readDashboardPreferences,
  subscribeDashboardPreferences,
} from "@agent-infrastructure/dashboard-plugin"
import { observer, useValue } from "@legendapp/state/react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AgentChatV2Composer } from "./AgentChatV2Composer"
import {
  ActionSequence,
  formatTime,
  MessageBubble,
  messageDisplayKey,
  messageText,
  type OutboxMessage,
  OutboxMessageBubble,
  queuedMessageKeys,
  transcriptItems,
} from "./AgentChatV2Messages"
import {
  type AgentChatV2ComposerImage,
  type AgentChatV2Session,
  createAgentChatV2Actions,
  createAgentChatV2Store,
} from "./AgentChatV2Store"

export type AgentChatV2ScreenProps = {
  apiRootUrl?: string
  wsRootUrl?: string
  appVersion?: string
}

const chatSessionQueryParam = "sessionId"
const chatMessageHashPrefix = "#message-"

function isScrolledNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 48
}

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
  const url = new URL("/chat-v2", origin || "http://127.0.0.1:3000")
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

function readRequestedMessageHashFromLocation() {
  if (typeof window === "undefined") {
    return ""
  }
  const hash = window.location.hash
  return hash.startsWith(chatMessageHashPrefix) ? hash.slice(1) : ""
}

function activityLabel(session: AgentChatV2Session): string {
  if (session.activity.status === "running") {
    return "Working"
  }
  if (session.activity.status === "queued") {
    return "Queued"
  }
  if (session.activity.status === "error") {
    return "Error"
  }
  return "Idle"
}

export const AgentChatV2Screen = observer(function AgentChatV2Screen(
  props: AgentChatV2ScreenProps,
) {
  const apiRootUrl = props.apiRootUrl ?? "/api/agent-chat"
  const wsRootUrl = props.wsRootUrl ?? "/ws/agent-chat"
  const [store] = useState(() => createAgentChatV2Store(apiRootUrl, wsRootUrl))
  const [actions] = useState(() => createAgentChatV2Actions(store))
  const [enterStyle, setEnterStyle] = useState(
    () => readDashboardPreferences().enterStyle,
  )
  const [composerImages, setComposerImages] = useState<
    AgentChatV2ComposerImage[]
  >([])
  const [composerImageError, setComposerImageError] = useState("")
  const [transcriptPinnedToBottom, setTranscriptPinnedToBottom] = useState(true)
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const transcriptContentRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const transcriptPinnedToBottomRef = useRef(true)
  const previousActiveSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    void actions.loadSessions().then(async () => {
      const requestedSessionId = readRequestedSessionIdFromLocation()
      if (requestedSessionId) {
        await actions.openSession(requestedSessionId)
      }
    })
    return () => actions.close()
  }, [actions])

  useEffect(() => {
    return subscribeDashboardPreferences(() => {
      setEnterStyle(readDashboardPreferences().enterStyle)
    })
  }, [])

  const state = useValue(store.state$)
  const activeSession = useMemo(
    () =>
      state.activeSessionId
        ? (state.sessions.find(
            (session) => session.id === state.activeSessionId,
          ) ?? null)
        : null,
    [state.activeSessionId, state.sessions],
  )
  const activeMessages = activeSession
    ? (state.messagesBySessionId[activeSession.id] ?? [])
    : []
  const streamingAssistantText = state.streamingAssistantText ?? ""
  const queuedMessages = activeSession
    ? (state.queuedMessagesBySessionId[activeSession.id] ?? [])
    : []
  const pendingMessages = activeSession
    ? (state.pendingMessagesBySessionId[activeSession.id] ?? [])
    : []
  const hasOlderMessages = activeSession
    ? (state.hasOlderMessagesBySessionId[activeSession.id] ?? false)
    : false
  const queuedDisplayKeys = useMemo(
    () => queuedMessageKeys(queuedMessages),
    [queuedMessages],
  )
  const transcriptMessages = useMemo(
    () =>
      activeMessages.filter(
        (message) =>
          !queuedDisplayKeys.has(messageDisplayKey(message)) &&
          !queuedMessages.some(
            (queuedMessage) => queuedMessage.id === message.id,
          ),
      ),
    [activeMessages, queuedDisplayKeys, queuedMessages],
  )
  const displayPendingMessages = useMemo(
    () =>
      pendingMessages.filter(
        (message) =>
          !queuedDisplayKeys.has(messageDisplayKey(message)) &&
          !queuedMessages.some(
            (queuedMessage) => queuedMessage.id === message.id,
          ),
      ),
    [pendingMessages, queuedDisplayKeys, queuedMessages],
  )
  const outboxMessages = useMemo(
    () =>
      [
        ...displayPendingMessages,
        ...queuedMessages.map(
          (message): OutboxMessage => ({
            ...message,
            pendingStatus: "queued",
          }),
        ),
      ].sort((left, right) => left.createdAtMs - right.createdAtMs),
    [displayPendingMessages, queuedMessages],
  )
  const activeTranscriptItems = useMemo(
    () => transcriptItems(transcriptMessages),
    [transcriptMessages],
  )
  const lastMessage = transcriptMessages.at(-1) ?? null
  const lastMessageTextLength = lastMessage
    ? messageText(lastMessage).length
    : 0
  const lastPendingMessage = outboxMessages.at(-1) ?? null
  const autoScrollKey = `${activeSession?.id ?? ""}:${lastMessage?.id ?? ""}:${lastMessageTextLength}:${streamingAssistantText.length}:${queuedMessages.length}:${lastPendingMessage?.id ?? ""}:${lastPendingMessage?.pendingStatus ?? ""}`

  const updateTranscriptPinnedToBottom = useCallback(() => {
    const scrollElement = transcriptScrollRef.current
    const pinned = scrollElement ? isScrolledNearBottom(scrollElement) : true
    transcriptPinnedToBottomRef.current = pinned
    setTranscriptPinnedToBottom(pinned)
  }, [])

  const scrollTranscriptToBottom = useCallback(() => {
    const scrollElement = transcriptScrollRef.current
    if (!scrollElement) {
      return
    }
    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior: "auto",
    })
    transcriptPinnedToBottomRef.current = true
    setTranscriptPinnedToBottom(true)
  }, [])

  const scheduleTranscriptScrollToBottom = useCallback(
    (options?: { force?: boolean }) => {
      if (!options?.force && !transcriptPinnedToBottomRef.current) {
        return
      }
      window.requestAnimationFrame(() => {
        scrollTranscriptToBottom()
        window.requestAnimationFrame(scrollTranscriptToBottom)
      })
    },
    [scrollTranscriptToBottom],
  )

  useLayoutEffect(() => {
    void autoScrollKey
    const activeSessionId = activeSession?.id ?? ""
    const sessionChanged =
      previousActiveSessionIdRef.current !== activeSessionId
    previousActiveSessionIdRef.current = activeSessionId
    if (!activeSessionId) {
      return
    }
    scheduleTranscriptScrollToBottom({ force: sessionChanged })
  }, [activeSession?.id, autoScrollKey, scheduleTranscriptScrollToBottom])

  useEffect(() => {
    const activeSessionId = activeSession?.id ?? ""
    const contentElement = transcriptContentRef.current
    if (!activeSessionId || !contentElement) {
      return
    }
    let frameHandle: number | null = null
    const scheduleFollow = () => {
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
      }
      frameHandle = window.requestAnimationFrame(() => {
        frameHandle = null
        if (transcriptPinnedToBottomRef.current) {
          scrollTranscriptToBottom()
        } else {
          updateTranscriptPinnedToBottom()
        }
      })
    }
    const observer = new ResizeObserver(scheduleFollow)
    observer.observe(contentElement)
    scheduleFollow()
    return () => {
      observer.disconnect()
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
      }
    }
  }, [
    activeSession?.id,
    scrollTranscriptToBottom,
    updateTranscriptPinnedToBottom,
  ])

  useEffect(() => {
    void transcriptMessages.length
    const targetId = readRequestedMessageHashFromLocation()
    if (!targetId) {
      return
    }
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
    })
  }, [transcriptMessages])

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

  return (
    <main className="flex h-screen min-h-0 bg-zinc-950 text-zinc-100">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-cyan-300">
            Agent Chat v2
          </p>
          <button
            type="button"
            onClick={() => void actions.createSession()}
            className="mt-2 w-full rounded bg-cyan-500 px-3 py-2 text-sm font-semibold text-zinc-950"
          >
            New chat
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400">
          <span>
            {state.sessions.length}
            {state.totalKnownSessions == null
              ? ""
              : ` of ${state.totalKnownSessions}`}{" "}
            sessions
          </span>
          <span>{state.connection.wsStatus}</span>
        </div>

        {state.connection.error ? (
          <div className="m-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {state.connection.error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => void actions.openSession(session.id)}
              className={`block w-full border-b border-zinc-800 px-4 py-3 text-left transition ${
                session.id === state.activeSessionId
                  ? "bg-cyan-950/40"
                  : "hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                  {session.title}
                </span>
                <span className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                  {activityLabel(session)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
                {session.preview ?? "No messages yet"}
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                {session.messageCount.toLocaleString()} messages ·{" "}
                {formatTime(session.updatedAtMs)}
              </p>
            </button>
          ))}
        </div>

        {state.nextSessionsCursor ? (
          <button
            type="button"
            onClick={() => void actions.loadSessions(true)}
            className="border-t border-zinc-800 px-4 py-3 text-sm font-medium text-cyan-200 hover:bg-zinc-800"
          >
            Load more sessions
          </button>
        ) : null}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {activeSession ? (
          <>
            <header className="border-b border-zinc-800 bg-zinc-950 px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">
                    {activeSession.title}
                  </h2>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {activeSession.cwd}
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-400">
                  <p>{activityLabel(activeSession)}</p>
                  <p className="mt-1">
                    window {activeMessages.length.toLocaleString()} /{" "}
                    {activeSession.messageCount.toLocaleString()}
                  </p>
                  {activeSession.activity.canInterrupt ? (
                    <button
                      type="button"
                      onClick={() => void actions.interruptSession()}
                      className="mt-2 rounded border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-950"
                    >
                      Stop
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <div
              ref={transcriptScrollRef}
              onScroll={updateTranscriptPinnedToBottom}
              className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
              {hasOlderMessages ? (
                <button
                  type="button"
                  onClick={() => void actions.loadOlderMessages()}
                  className="mb-4 w-full rounded border border-zinc-700 px-3 py-2 text-sm text-cyan-200 hover:bg-zinc-900"
                >
                  Load older messages
                </button>
              ) : null}

              <div ref={transcriptContentRef} className="space-y-3">
                {activeTranscriptItems.map((item, index) =>
                  item.type === "actions" ? (
                    <ActionSequence
                      key={`actions-${item.messages[0]?.id ?? "empty"}`}
                      messages={item.messages}
                      showPreview={
                        index === activeTranscriptItems.length - 1 &&
                        !streamingAssistantText
                      }
                      onToggle={scheduleTranscriptScrollToBottom}
                    />
                  ) : (
                    <MessageBubble
                      key={item.message.id}
                      message={item.message}
                      apiRootUrl={apiRootUrl}
                      onCopyMessageLink={copyMessageLink}
                    />
                  ),
                )}
                {streamingAssistantText ? (
                  <div className="rounded border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm leading-6 text-emerald-50">
                    {streamingAssistantText}
                  </div>
                ) : null}
                {outboxMessages.map((message, index) => (
                  <OutboxMessageBubble
                    key={message.id}
                    message={message}
                    index={index}
                    apiRootUrl={apiRootUrl}
                  />
                ))}
                <div ref={transcriptEndRef} aria-hidden="true" />
              </div>
              {!transcriptPinnedToBottom ? (
                <button
                  type="button"
                  onClick={() => scrollTranscriptToBottom()}
                  className="sticky bottom-3 left-full z-10 mt-3 ml-auto flex h-8 w-8 items-center justify-center rounded border border-cyan-400/40 bg-zinc-950/95 text-sm font-semibold text-cyan-100 shadow-lg backdrop-blur hover:bg-cyan-950"
                  aria-label="Scroll to bottom"
                  title="Scroll to bottom"
                >
                  ↓
                </button>
              ) : null}
            </div>

            <AgentChatV2Composer
              activeSession={activeSession}
              composerText={state.composerText}
              composerImages={composerImages}
              composerImageError={composerImageError}
              sending={state.sending}
              enterStyle={enterStyle}
              queuedMessages={queuedMessages}
              onComposerTextChange={(value) =>
                store.state$.composerText.set(value)
              }
              onComposerImagesChange={setComposerImages}
              onComposerImageErrorChange={setComposerImageError}
              onSendMessage={actions.sendMessage}
              onInterruptSession={actions.interruptSession}
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-zinc-400">
            {state.connection.status === "loading"
              ? "Loading sessions"
              : "Select a session"}
          </div>
        )}
      </section>
    </main>
  )
})
