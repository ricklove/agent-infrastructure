import {
  dashboardSessionFetch,
  isDashboardSendShortcut,
  readDashboardPreferences,
  subscribeDashboardPreferences,
} from "@agent-infrastructure/dashboard-plugin"
import { observer, useValue } from "@legendapp/state/react"
import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type AgentChatV2ComposerImage,
  type AgentChatV2Message,
  type AgentChatV2Session,
  createAgentChatV2Actions,
  createAgentChatV2Store,
} from "./AgentChatV2Store"

export type AgentChatV2ScreenProps = {
  apiRootUrl?: string
  wsRootUrl?: string
  appVersion?: string
}

type ImageReference = {
  sourceUrl: string
  altText: string
}

const chatSessionQueryParam = "sessionId"
const chatMessageHashPrefix = "#message-"

function messageText(message: AgentChatV2Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : "[image]"))
    .join("\n")
    .trim()
}

function readImageFile(file: File): Promise<AgentChatV2ComposerImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Image read failed."))
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : ""
      if (!dataUrl) {
        reject(new Error("Image read failed."))
        return
      }
      resolve({
        id: crypto.randomUUID(),
        dataUrl,
      })
    }
    reader.readAsDataURL(file)
  })
}

function normalizeImageSource(sourceUrl: string): string {
  const trimmed = sourceUrl.trim()
  if (trimmed.startsWith("~/")) {
    return `/home/ec2-user/${trimmed.slice(2)}`
  }
  return trimmed
}

function isLikelyImageTarget(value: string): boolean {
  const normalized = normalizeImageSource(value).split(/[?#]/u)[0] ?? ""
  return (
    /^\/api\/agent-chat\/sessions\/[^/]+\/attachments\//u.test(value) ||
    /^\/home\/ec2-user\/temp\/.+\.(?:apng|avif|gif|jpe?g|png|webp)$/iu.test(
      normalized,
    ) ||
    /\.(?:apng|avif|gif|jpe?g|png|webp|svg)$/iu.test(normalized)
  )
}

function parseMarkdownImageLine(line: string): ImageReference | null {
  const match = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/u.exec(line)
  if (!match) {
    return null
  }
  return {
    altText: match[1]?.trim() || "Shared image",
    sourceUrl: match[2]?.trim() || "",
  }
}

function parseStandaloneMarkdownLinkLine(line: string): ImageReference | null {
  const match = /^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/u.exec(line)
  if (!match) {
    return null
  }
  const sourceUrl = match[2]?.trim() || ""
  if (!isLikelyImageTarget(sourceUrl)) {
    return null
  }
  return {
    altText: match[1]?.trim() || "Linked image",
    sourceUrl,
  }
}

function parseRawImageReferenceLine(line: string): ImageReference | null {
  const sourceUrl = line.trim()
  if (!sourceUrl || /\s/u.test(sourceUrl) || !isLikelyImageTarget(sourceUrl)) {
    return null
  }
  return {
    altText: "Linked image",
    sourceUrl,
  }
}

function textImageReferences(text: string): ImageReference[] {
  return text
    .split(/\r?\n/u)
    .map(
      (line) =>
        parseMarkdownImageLine(line) ??
        parseStandaloneMarkdownLinkLine(line) ??
        parseRawImageReferenceLine(line),
    )
    .filter((entry): entry is ImageReference => entry !== null)
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function isScrolledNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 24
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

function composerStatusLabel(session: AgentChatV2Session): string {
  if (session.activity.status === "running") {
    return "Working"
  }
  if (session.activity.status === "queued") {
    return "Queued"
  }
  if (session.activity.status === "error") {
    return "Error"
  }
  if (session.activity.status === "interrupted") {
    return "Interrupted"
  }
  return "Idle"
}

function composerStatusTone(session: AgentChatV2Session): string {
  if (session.activity.status === "running") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
  }
  if (session.activity.status === "queued") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100"
  }
  if (session.activity.status === "error") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100"
  }
  if (session.activity.status === "interrupted") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
  }
  return "border-white/10 bg-white/5 text-zinc-300"
}

function formatElapsed(value: number | null): string | null {
  if (!value) {
    return null
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000))
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }
  return `${Math.floor(elapsedSeconds / 60)}m`
}

function composerStatusItems(
  session: AgentChatV2Session,
  queuedMessages: AgentChatV2Message[],
): string[] {
  const items = [composerStatusLabel(session)]
  const elapsed = formatElapsed(session.activity.startedAtMs)
  if (elapsed && session.activity.status === "running") {
    items.push(elapsed)
  }
  if (session.activity.waitingFlags.length > 0) {
    items.push(session.activity.waitingFlags.join(", "))
  }
  if (queuedMessages.length > 0) {
    items.push(`queued ${queuedMessages.length}`)
  }
  if (session.activity.backgroundProcessCount > 0) {
    items.push(`bg ${session.activity.backgroundProcessCount}`)
  }
  if (session.activity.status === "error" && session.activity.lastError) {
    items.push(session.activity.lastError)
  }
  return items
}

function queuedMessageLabel(message: AgentChatV2Message): string {
  if (message.kind === "directoryInstruction") {
    return "Next-turn instruction"
  }
  if (message.kind === "watchdogPrompt") {
    return "Watchdog prompt"
  }
  return `${message.role} ${message.kind}`
}

function queuedMessagePreview(message: AgentChatV2Message): string {
  const text = messageText(message).replace(/\s+/gu, " ").trim()
  if (!text) {
    return "(empty message)"
  }
  return text
}

type TranscriptItem =
  | { type: "message"; message: AgentChatV2Message }
  | { type: "actions"; messages: AgentChatV2Message[] }

function isActionMessage(message: AgentChatV2Message): boolean {
  return message.role === "system" || message.kind !== "chat"
}

function transcriptItems(messages: AgentChatV2Message[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let actionMessages: AgentChatV2Message[] = []

  for (const message of messages) {
    if (isActionMessage(message)) {
      actionMessages.push(message)
      continue
    }

    if (actionMessages.length > 0) {
      items.push({ type: "actions", messages: actionMessages })
      actionMessages = []
    }
    items.push({ type: "message", message })
  }

  if (actionMessages.length > 0) {
    items.push({ type: "actions", messages: actionMessages })
  }

  return items
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
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
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
  const hasOlderMessages = activeSession
    ? (state.hasOlderMessagesBySessionId[activeSession.id] ?? false)
    : false
  const activeTranscriptItems = useMemo(
    () => transcriptItems(activeMessages),
    [activeMessages],
  )
  const composerStatus = activeSession
    ? composerStatusItems(activeSession, queuedMessages)
    : []
  const lastMessage = activeMessages.at(-1) ?? null
  const lastMessageTextLength = lastMessage
    ? messageText(lastMessage).length
    : 0
  const autoScrollKey = `${activeSession?.id ?? ""}:${lastMessage?.id ?? ""}:${lastMessageTextLength}:${streamingAssistantText.length}:${queuedMessages.length}`

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
    transcriptEndRef.current?.scrollIntoView({ block: "end" })
    scrollElement.scrollTop = scrollElement.scrollHeight
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
    void activeMessages.length
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
  }, [activeMessages])

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

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await actions.sendMessage(composerImages)
    setComposerImages([])
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Escape" &&
      activeSession?.activity.canInterrupt &&
      activeSession.activity.status === "running"
    ) {
      event.preventDefault()
      void actions.interruptSession()
      return
    }

    if (!isDashboardSendShortcut(event, enterStyle)) {
      return
    }
    event.preventDefault()
    void actions.sendMessage(composerImages).then(() => setComposerImages([]))
  }

  async function handleComposerPaste(
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const imageFiles = Array.from(event.clipboardData.items || [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    setComposerImageError("")
    try {
      const nextImages = await Promise.all(imageFiles.map(readImageFile))
      setComposerImages((current) => [...current, ...nextImages])
    } catch (error) {
      setComposerImageError(
        error instanceof Error ? error.message : "Image paste failed.",
      )
    }
  }

  async function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const imageFiles = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/"),
    )
    event.target.value = ""
    if (imageFiles.length === 0) {
      return
    }

    setComposerImageError("")
    try {
      const nextImages = await Promise.all(imageFiles.map(readImageFile))
      setComposerImages((current) => [...current, ...nextImages])
    } catch (error) {
      setComposerImageError(
        error instanceof Error ? error.message : "Image selection failed.",
      )
    }
  }

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

              <div className="space-y-3">
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
                {queuedMessages.map((message, index) => (
                  <QueuedMessageBubble
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

            <form
              onSubmit={(event) => void submitMessage(event)}
              className="border-t border-zinc-800 bg-zinc-950 p-4"
            >
              {composerImages.length > 0 ? (
                <div className="mb-3 rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase text-cyan-200">
                      Images to send
                    </p>
                    <button
                      type="button"
                      onClick={() => setComposerImages([])}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-cyan-600"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {composerImages.map((image) => (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded border border-zinc-700 bg-zinc-950"
                      >
                        <img
                          src={image.dataUrl}
                          alt="Selected attachment"
                          className="h-24 w-24 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setComposerImages((current) =>
                              current.filter((entry) => entry.id !== image.id),
                            )
                          }
                          className="block w-full border-t border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {composerImageError ? (
                <p className="mb-2 text-xs text-red-300">
                  {composerImageError}
                </p>
              ) : null}
              <div className="relative rounded border border-zinc-700 bg-zinc-900 px-3 pb-2 pt-5 focus-within:border-cyan-400">
                <div className="absolute -top-3 left-3 flex items-center gap-2">
                  <span
                    className={`inline-flex max-w-[calc(100vw-7rem)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur ${composerStatusTone(activeSession)}`}
                    title={composerStatus.slice(1).join(" · ") || undefined}
                  >
                    <span className="truncate">{composerStatus[0]}</span>
                    {composerStatus.slice(1, 2).map((item) => (
                      <span
                        key={item}
                        className="truncate normal-case tracking-normal"
                      >
                        {item}
                      </span>
                    ))}
                    {state.sending ? (
                      <span className="normal-case tracking-normal">
                        sending...
                      </span>
                    ) : null}
                  </span>
                </div>
                <textarea
                  value={state.composerText}
                  onChange={(event) =>
                    store.state$.composerText.set(event.target.value)
                  }
                  onKeyDown={handleComposerKeyDown}
                  onPaste={(event) => void handleComposerPaste(event)}
                  rows={3}
                  placeholder=""
                  aria-label="Message"
                  className="block w-full resize-none border-0 bg-transparent p-0 text-sm text-zinc-100 outline-none"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleImageInputChange(event)}
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-lg font-semibold text-cyan-100 hover:border-cyan-500"
                      title="Add image"
                      aria-label="Add image"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={
                      state.sending ||
                      (!state.composerText.trim() &&
                        composerImages.length === 0)
                    }
                    className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500 text-lg font-semibold text-zinc-950 disabled:opacity-50"
                    title={state.sending ? "Sending" : "Send"}
                    aria-label={state.sending ? "Sending" : "Send"}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </form>
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

function actionIcon(message: AgentChatV2Message): string {
  const text = messageText(message).toLowerCase()
  if (text.includes("error") || text.includes("failed")) {
    return "!"
  }
  if (text.includes("command")) {
    return "$"
  }
  if (message.kind === "ticketEvent") {
    return "#"
  }
  return ">"
}

function actionTitle(message: AgentChatV2Message): string {
  const text = messageText(message) || "(empty action)"
  return `${message.kind} action at ${formatTime(message.createdAtMs)}: ${text}`
}

function actionPreviewText(message: AgentChatV2Message): string {
  const lines = (messageText(message) || "(empty action)")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.slice(-3).join("\n")
}

function ActionSequence(props: {
  messages: AgentChatV2Message[]
  showPreview: boolean
  onToggle: () => void
}) {
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(
    null,
  )
  const expandedMessage =
    props.messages.find((message) => message.id === expandedMessageId) ?? null
  const expandedText = expandedMessage
    ? messageText(expandedMessage) || "(empty action)"
    : ""
  const previewMessage = props.messages.at(-1) ?? null
  const previewText = previewMessage ? actionPreviewText(previewMessage) : ""

  return (
    <section className="max-w-4xl rounded border border-zinc-800 bg-zinc-900/60 px-2 py-2">
      <div className="flex flex-wrap gap-1">
        {props.messages.map((message) => {
          const title = actionTitle(message)
          const expanded = message.id === expandedMessageId
          return (
            <button
              key={message.id}
              type="button"
              onClick={() => {
                setExpandedMessageId((currentValue) =>
                  currentValue === message.id ? null : message.id,
                )
                props.onToggle()
              }}
              className={`flex h-7 w-7 items-center justify-center rounded border text-xs font-semibold ${
                expanded
                  ? "border-cyan-300 bg-cyan-950 text-cyan-100"
                  : "border-zinc-700 bg-zinc-950 text-cyan-200 hover:border-cyan-700"
              }`}
              title={title}
              aria-label={title}
            >
              {actionIcon(message)}
            </button>
          )
        })}
      </div>
      {expandedMessage ? (
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-950 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-500">
            <span>{expandedMessage.kind}</span>
            <span>{formatTime(expandedMessage.createdAtMs)}</span>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-200">
            {expandedText}
          </p>
        </div>
      ) : props.showPreview && previewMessage ? (
        <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-600">
            <span>{previewMessage.kind}</span>
            <span>{formatTime(previewMessage.createdAtMs)}</span>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-zinc-400">
            {previewText}
          </p>
        </div>
      ) : null}
    </section>
  )
}

function MessageImagePreview(props: {
  sessionId: string
  apiRootUrl: string
  sourceUrl: string
  altText: string
}) {
  const [assetUrl, setAssetUrl] = useState("")
  const [error, setError] = useState("")
  const normalizedSourceUrl = normalizeImageSource(props.sourceUrl)

  useEffect(() => {
    let active = true
    let objectUrl = ""

    async function loadImage() {
      try {
        const apiRootUrl = props.apiRootUrl.replace(/\/+$/u, "")
        const response = (await dashboardSessionFetch(
          `${apiRootUrl}/sessions/${encodeURIComponent(props.sessionId)}/media?source=${encodeURIComponent(normalizedSourceUrl)}`,
        )) as Response
        if (!response.ok) {
          throw new Error(`Image request failed with ${response.status}.`)
        }
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setAssetUrl(objectUrl)
        setError("")
      } catch (nextError) {
        if (!active) {
          return
        }
        if (/^https?:\/\//iu.test(normalizedSourceUrl)) {
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

    void loadImage()

    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [normalizedSourceUrl, props.apiRootUrl, props.sessionId])

  return (
    <div className="overflow-hidden rounded border border-zinc-700 bg-zinc-950">
      <div className="flex min-h-36 items-center justify-center bg-zinc-950 p-3">
        {assetUrl ? (
          <a href={assetUrl} target="_blank" rel="noreferrer">
            <img
              src={assetUrl}
              alt={props.altText || "Shared image"}
              className="max-h-80 max-w-full object-contain"
            />
          </a>
        ) : (
          <span className="text-xs text-zinc-500">
            {error || "Loading image"}
          </span>
        )}
      </div>
      <div className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <a
          href={assetUrl || normalizedSourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {props.altText || "Open image"}
        </a>
      </div>
    </div>
  )
}

function MessageContent(props: {
  message: AgentChatV2Message
  apiRootUrl: string
}) {
  const textBlocks = props.message.content.filter(
    (block): block is { type: "text"; text: string } => block.type === "text",
  )
  const imageReferences = [
    ...props.message.content
      .filter(
        (block): block is { type: "image"; url: string } =>
          block.type === "image",
      )
      .map((block) => ({
        sourceUrl: block.url,
        altText: "Attached image",
      })),
    ...textBlocks.flatMap((block) => textImageReferences(block.text)),
  ]

  return (
    <div className="space-y-3">
      {textBlocks.map((block) => (
        <p
          key={`${props.message.id}-text-${block.text}`}
          className="whitespace-pre-wrap text-sm leading-6 text-zinc-100"
        >
          {block.text}
        </p>
      ))}
      {imageReferences.map((image) => (
        <MessageImagePreview
          key={`${props.message.id}-image-${image.sourceUrl}-${image.altText}`}
          sessionId={props.message.sessionId}
          apiRootUrl={props.apiRootUrl}
          sourceUrl={image.sourceUrl}
          altText={image.altText}
        />
      ))}
      {textBlocks.length === 0 && imageReferences.length === 0 ? (
        <p className="text-sm leading-6 text-zinc-100">(empty message)</p>
      ) : null}
    </div>
  )
}

function MessageBubble(props: {
  message: AgentChatV2Message
  apiRootUrl: string
  onCopyMessageLink: (sessionId: string, messageId: string) => Promise<void>
}) {
  const tone =
    props.message.role === "user"
      ? "ml-auto border-cyan-500/30 bg-cyan-950/30"
      : props.message.role === "assistant"
        ? "border-zinc-700 bg-zinc-900"
        : "border-amber-500/30 bg-amber-950/20"
  return (
    <article
      id={`message-${props.message.id}`}
      className={`max-w-3xl rounded border px-4 py-3 ${tone}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-500">
        <span>{props.message.role}</span>
        <button
          type="button"
          onClick={() =>
            void props.onCopyMessageLink(
              props.message.sessionId,
              props.message.id,
            )
          }
          className="rounded px-1 text-[11px] uppercase text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          title="Copy message link"
        >
          {formatTime(props.message.createdAtMs)}
        </button>
      </div>
      <MessageContent message={props.message} apiRootUrl={props.apiRootUrl} />
    </article>
  )
}

function QueuedMessageBubble(props: {
  message: AgentChatV2Message
  index: number
  apiRootUrl: string
}) {
  const tone =
    props.message.role === "user"
      ? "ml-auto border-amber-300/40 bg-amber-950/20"
      : "border-amber-300/30 bg-zinc-900/80"
  const preview = queuedMessagePreview(props.message)

  return (
    <article
      className={`max-w-3xl rounded border border-dashed px-4 py-3 opacity-90 ${tone}`}
      title={preview}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-amber-200/80">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-amber-300/30 bg-amber-300/10 text-[10px] font-semibold">
            Q
          </span>
          <span className="truncate">
            Queued {props.index + 1} · {queuedMessageLabel(props.message)}
          </span>
        </span>
        <span className="shrink-0">
          {formatTime(props.message.createdAtMs)}
        </span>
      </div>
      <MessageContent message={props.message} apiRootUrl={props.apiRootUrl} />
    </article>
  )
}
