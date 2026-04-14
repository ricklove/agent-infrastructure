import {
  dashboardSessionFetch,
  readDashboardPreferences,
  subscribeDashboardPreferences,
} from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
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
  type AgentChatV2Actions,
  type AgentChatV2Session,
  type ProviderKind,
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
const transcriptBottomStickinessPx = 2
const transcriptTopLoadThresholdPx = 240

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

type ProvidersResponse = {
  ok: boolean
  providers: ProviderCatalogEntry[]
  error?: string
}

type OlderMessagesScrollRestore = {
  sessionId: string
  scrollHeight: number
  scrollTop: number
}

function isScrolledNearBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    transcriptBottomStickinessPx
  )
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

function activityDotClass(session: AgentChatV2Session): string {
  if (session.archived) {
    return "border-zinc-500 bg-zinc-700"
  }
  if (session.activity.status === "running") {
    return "border-emerald-300 bg-emerald-400"
  }
  if (session.activity.status === "queued") {
    return "border-amber-300 bg-amber-400"
  }
  if (session.activity.status === "error") {
    return "border-rose-300 bg-rose-400"
  }
  return "border-zinc-600 bg-zinc-800"
}

type AgentChatV2SessionRowProps = {
  session: AgentChatV2Session
  active: boolean
  menuOpen: boolean
  editing: boolean
  editingTitle: string
  archiving: boolean
  actions: AgentChatV2Actions
  onToggleMenu: (sessionId: string) => void
  onBeginEdit: (session: AgentChatV2Session) => void
  onOpenSettings: (session: AgentChatV2Session) => void
  onSetArchived: (sessionId: string, archived: boolean) => void
  onEditingTitleChange: (title: string) => void
  onCancelEdit: () => void
  onSaveTitle: () => void
}

function AgentChatV2SessionRow(
  props: AgentChatV2SessionRowProps,
) {
  useRenderCounter("AgentChatV2.SessionRow")
  const session = props.session

  return (
    <div
      className={`relative border-b border-zinc-800 transition ${
        props.active ? "bg-cyan-950/40" : "hover:bg-zinc-800"
      }`}
    >
      <button
        type="button"
        onClick={() => void props.actions.openSession(session.id)}
        className="w-full min-w-0 px-4 py-3 pr-12 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full border ${activityDotClass(
              session,
            )}`}
            title={session.archived ? "Archived" : activityLabel(session)}
          />
          <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
            {session.title}
          </span>
        </div>
        {props.editing ? null : (
          <>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
              {session.preview ?? "No messages yet"}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              {session.messageCount.toLocaleString()} messages ·{" "}
              {formatTime(session.updatedAtMs)}
            </p>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          props.onToggleMenu(session.id)
        }}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-sm text-zinc-300 hover:border-cyan-400 hover:text-cyan-100"
        title="Chat menu"
        aria-label="Chat menu"
      >
        ⋯
      </button>

      {props.menuOpen ? (
        <div className="absolute right-3 top-12 z-20 w-40 rounded border border-zinc-700 bg-zinc-950 py-1 text-sm shadow-xl">
          <button
            type="button"
            onClick={() => props.onBeginEdit(session)}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            Edit chat
          </button>
          <button
            type="button"
            onClick={() => props.onOpenSettings(session)}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            Chat settings
          </button>
          <button
            type="button"
            onClick={() => props.onSetArchived(session.id, !session.archived)}
            disabled={props.archiving}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {session.archived ? "Restore chat" : "Archive chat"}
          </button>
        </div>
      ) : null}

      {props.editing ? (
        <form
          className="px-4 pb-3 pr-12"
          onSubmit={(event) => {
            event.preventDefault()
            props.onSaveTitle()
          }}
        >
          <input
            value={props.editingTitle}
            onChange={(event) => props.onEditingTitleChange(event.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400"
            aria-label="Chat title"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={props.onCancelEdit}
              className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !props.editingTitle.trim() ||
                props.editingTitle.trim() === session.title
              }
              className="rounded border border-cyan-400/40 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-950 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

export const AgentChatV2Screen = observer(function AgentChatV2Screen(
  props: AgentChatV2ScreenProps,
) {
  useRenderCounter("AgentChatV2Screen")
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
  const [newChatTitle, setNewChatTitle] = useState("")
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [sessionSearchQuery, setSessionSearchQuery] = useState("")
  const [showArchivedSessions, setShowArchivedSessions] = useState(false)
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(
    null,
  )
  const [sessionMenuOpenId, setSessionMenuOpenId] = useState<string | null>(
    null,
  )
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingSessionTitle, setEditingSessionTitle] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([])
  const [settingsProviderKind, setSettingsProviderKind] =
    useState<ProviderKind>("codex-app-server")
  const [settingsModelRef, setSettingsModelRef] = useState("")
  const [settingsAuthProfile, setSettingsAuthProfile] = useState("")
  const [settingsDirectory, setSettingsDirectory] = useState("")
  const [settingsImageModelRef, setSettingsImageModelRef] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [transcriptPinnedToBottom, setTranscriptPinnedToBottom] = useState(true)
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const transcriptContentRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const transcriptPinnedToBottomRef = useRef(true)
  const olderMessagesScrollRestoreRef =
    useRef<OlderMessagesScrollRestore | null>(null)
  const loadingOlderMessagesRef = useRef(false)
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

  useEffect(() => {
    let cancelled = false

    void dashboardSessionFetch(`${apiRootUrl}/providers`)
      .then(async (rawResponse) => {
        const response = rawResponse as Response
        const payload = (await response.json()) as ProvidersResponse
        if (!response.ok || !payload.ok || !Array.isArray(payload.providers)) {
          throw new Error(payload.error ?? "Agent Chat providers failed to load.")
        }
        if (!cancelled) {
          setProviders(payload.providers)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          store.state$.connection.error.set(
            error instanceof Error
              ? error.message
              : "Agent Chat providers failed to load.",
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [apiRootUrl, store])

  const connection = useValue(store.state$.connection)
  const sessions = useValue(store.state$.sessions)
  const activeSessionId = useValue(store.state$.activeSessionId)
  const totalKnownSessions = useValue(store.state$.totalKnownSessions)
  const nextSessionsCursor = useValue(store.state$.nextSessionsCursor)
  const messagesBySessionId = useValue(store.state$.messagesBySessionId)
  const queuedMessagesBySessionId = useValue(
    store.state$.queuedMessagesBySessionId,
  )
  const pendingMessagesBySessionId = useValue(
    store.state$.pendingMessagesBySessionId,
  )
  const hasOlderMessagesBySessionId = useValue(
    store.state$.hasOlderMessagesBySessionId,
  )
  const streamingAssistantText =
    useValue(store.state$.streamingAssistantText) ?? ""
  const interrupting = useValue(store.state$.interrupting)
  const activeSession = useMemo(
    () =>
      activeSessionId
        ? (sessions.find((session) => session.id === activeSessionId) ?? null)
        : null,
    [activeSessionId, sessions],
  )
  const canInterruptActiveSession =
    activeSession?.activity.status === "running" && !interrupting
  const activeSettingsProvider = useMemo(
    () =>
      providers.find((provider) => provider.kind === settingsProviderKind) ??
      null,
    [providers, settingsProviderKind],
  )

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return
      }
      if (!canInterruptActiveSession) {
        return
      }
      event.preventDefault()
      void actions.interruptSession()
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [actions, canInterruptActiveSession])

  const filteredSessions = useMemo(() => {
    const query = sessionSearchQuery.trim().toLowerCase()
    return sessions.filter((session) => {
      if (!showArchivedSessions && session.archived) {
        return false
      }
      if (!query) {
        return true
      }
      return [
        session.title,
        session.preview ?? "",
        session.cwd,
        session.providerKind,
        session.modelRef,
      ]
        .join("\n")
        .toLowerCase()
        .includes(query)
    })
  }, [sessionSearchQuery, showArchivedSessions, sessions])
  const activeMessages = activeSession
    ? (messagesBySessionId[activeSession.id] ?? [])
    : []
  const queuedMessages = activeSession
    ? (queuedMessagesBySessionId[activeSession.id] ?? [])
    : []
  const pendingMessages = activeSession
    ? (pendingMessagesBySessionId[activeSession.id] ?? [])
    : []
  const hasOlderMessages = activeSession
    ? (hasOlderMessagesBySessionId[activeSession.id] ?? false)
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
  const firstMessageId = transcriptMessages[0]?.id ?? ""

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
      const scrollElement = transcriptScrollRef.current
      const nearBottom = scrollElement
        ? isScrolledNearBottom(scrollElement)
        : true
      if (nearBottom) {
        transcriptPinnedToBottomRef.current = true
        setTranscriptPinnedToBottom(true)
      }
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

  useLayoutEffect(() => {
    const pendingRestore = olderMessagesScrollRestoreRef.current
    const scrollElement = transcriptScrollRef.current
    if (
      !pendingRestore ||
      !scrollElement ||
      pendingRestore.sessionId !== activeSession?.id
    ) {
      return
    }

    olderMessagesScrollRestoreRef.current = null
    const scrollHeightDelta =
      scrollElement.scrollHeight - pendingRestore.scrollHeight
    scrollElement.scrollTop = pendingRestore.scrollTop + scrollHeightDelta
    transcriptPinnedToBottomRef.current = false
    setTranscriptPinnedToBottom(false)
  }, [activeSession?.id, firstMessageId, transcriptMessages.length])

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

  const createTitledSession = useCallback(async () => {
    await actions.createSession(newChatTitle)
    setNewChatTitle("")
    setNewChatOpen(false)
  }, [actions, newChatTitle])

  const setSessionArchived = useCallback(
    async (sessionId: string, archived: boolean) => {
      setArchivingSessionId(sessionId)
      setSessionMenuOpenId(null)
      try {
        await actions.setSessionArchived(sessionId, archived)
        if (!archived) {
          setShowArchivedSessions(true)
        }
      } finally {
        setArchivingSessionId(null)
      }
    },
    [actions],
  )

  const beginEditSession = useCallback((session: AgentChatV2Session) => {
    setEditingSessionId(session.id)
    setEditingSessionTitle(session.title)
    setSessionMenuOpenId(null)
  }, [])

  const toggleSessionMenu = useCallback((sessionId: string) => {
    setSessionMenuOpenId((current) => (current === sessionId ? null : sessionId))
  }, [])

  const cancelEditSession = useCallback(() => {
    setEditingSessionId(null)
    setEditingSessionTitle("")
  }, [])

  const saveSessionTitle = useCallback(async () => {
    const sessionId = editingSessionId
    const title = editingSessionTitle.trim()
    if (!sessionId || !title) {
      return
    }
    await actions.updateSession(sessionId, { title })
    setEditingSessionId(null)
    setEditingSessionTitle("")
  }, [actions, editingSessionId, editingSessionTitle])

  useEffect(() => {
    if (!activeSession) {
      setSettingsOpen(false)
      return
    }
    setSettingsProviderKind(activeSession.providerKind)
    setSettingsModelRef(activeSession.modelRef)
    setSettingsAuthProfile(activeSession.authProfile ?? "")
    setSettingsDirectory(activeSession.cwd)
    setSettingsImageModelRef(activeSession.imageModelRef ?? "")
  }, [
    activeSession?.authProfile,
    activeSession?.cwd,
    activeSession?.id,
    activeSession?.imageModelRef,
    activeSession?.modelRef,
    activeSession?.providerKind,
    activeSession,
  ])

  useEffect(() => {
    if (!activeSettingsProvider) {
      return
    }
    if (
      activeSettingsProvider.modelOptions.length > 0 &&
      !activeSettingsProvider.modelOptions.includes(settingsModelRef)
    ) {
      setSettingsModelRef(
        activeSettingsProvider.defaultModelRef ||
          activeSettingsProvider.modelOptions[0] ||
          "",
      )
    }
    if (
      activeSettingsProvider.authProfiles.length > 0 &&
      !activeSettingsProvider.authProfiles.includes(settingsAuthProfile)
    ) {
      setSettingsAuthProfile(activeSettingsProvider.authProfiles[0] ?? "")
    }
  }, [activeSettingsProvider, settingsAuthProfile, settingsModelRef])

  const openSessionSettings = useCallback(
    async (session: AgentChatV2Session) => {
      setSessionMenuOpenId(null)
      setEditingSessionId(null)
      if (session.id !== activeSessionId) {
        await actions.openSession(session.id)
      }
      setSettingsOpen(true)
    },
    [actions, activeSessionId],
  )

  const saveSessionSettings = useCallback(async () => {
    if (!activeSession || !settingsDirectory.trim()) {
      return
    }
    const update: Parameters<typeof actions.updateSession>[1] = {}
    if (settingsDirectory.trim() !== activeSession.cwd) {
      update.cwd = settingsDirectory.trim()
    }
    if (settingsProviderKind !== activeSession.providerKind) {
      update.providerKind = settingsProviderKind
    }
    if (settingsModelRef !== activeSession.modelRef) {
      update.modelRef = settingsModelRef
    }
    if (settingsAuthProfile !== (activeSession.authProfile ?? "")) {
      update.authProfile = settingsAuthProfile || null
    }
    if (settingsImageModelRef !== (activeSession.imageModelRef ?? "")) {
      update.imageModelRef = settingsImageModelRef || null
    }
    if (Object.keys(update).length === 0) {
      setSettingsOpen(false)
      return
    }

    setSavingSettings(true)
    try {
      await actions.updateSession(activeSession.id, update)
      setSettingsOpen(false)
    } finally {
      setSavingSettings(false)
    }
  }, [
    actions,
    activeSession,
    settingsAuthProfile,
    settingsDirectory,
    settingsImageModelRef,
    settingsModelRef,
    settingsProviderKind,
  ])

  const loadOlderMessagesPreservingScroll = useCallback(async () => {
    if (loadingOlderMessagesRef.current || !hasOlderMessages) {
      return
    }
    const scrollElement = transcriptScrollRef.current
    const sessionId = activeSession?.id
    if (!scrollElement || !sessionId) {
      loadingOlderMessagesRef.current = true
      setLoadingOlderMessages(true)
      try {
        await actions.loadOlderMessages()
      } finally {
        loadingOlderMessagesRef.current = false
        setLoadingOlderMessages(false)
      }
      return
    }

    loadingOlderMessagesRef.current = true
    setLoadingOlderMessages(true)
    olderMessagesScrollRestoreRef.current = {
      sessionId,
      scrollHeight: scrollElement.scrollHeight,
      scrollTop: scrollElement.scrollTop,
    }
    transcriptPinnedToBottomRef.current = false
    setTranscriptPinnedToBottom(false)

    try {
      await actions.loadOlderMessages()
    } catch (error) {
      olderMessagesScrollRestoreRef.current = null
      throw error
    } finally {
      loadingOlderMessagesRef.current = false
      setLoadingOlderMessages(false)
    }
  }, [actions, activeSession?.id, hasOlderMessages])

  const handleTranscriptScroll = useCallback(() => {
    const scrollElement = transcriptScrollRef.current
    updateTranscriptPinnedToBottom()
    if (
      scrollElement &&
      hasOlderMessages &&
      scrollElement.scrollTop <= transcriptTopLoadThresholdPx
    ) {
      void loadOlderMessagesPreservingScroll()
    }
  }, [
    hasOlderMessages,
    loadOlderMessagesPreservingScroll,
    updateTranscriptPinnedToBottom,
  ])

  return (
    <main className="flex h-screen min-h-0 bg-zinc-950 text-zinc-100">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-cyan-300">
              Agent Chat v2
            </p>
            <button
              type="button"
              onClick={() => setNewChatOpen((current) => !current)}
              className="flex h-8 w-8 items-center justify-center rounded border border-cyan-400/40 bg-zinc-950 text-lg font-semibold text-cyan-100 hover:bg-cyan-950"
              aria-label="New chat"
              title="New chat"
            >
              +
            </button>
          </div>
          {newChatOpen ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void createTitledSession()
              }}
            >
              <input
                value={newChatTitle}
                onChange={(event) => setNewChatTitle(event.target.value)}
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                placeholder="Chat title"
                aria-label="Chat title"
              />
              <button
                type="submit"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-cyan-500 text-base font-semibold text-zinc-950 disabled:opacity-50"
                aria-label="Create chat"
                title="Create chat"
              >
                ↑
              </button>
            </form>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={sessionSearchQuery}
              onChange={(event) => setSessionSearchQuery(event.target.value)}
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400"
              placeholder="Search chats"
              aria-label="Search chats"
            />
            <button
              type="button"
              onClick={() => setShowArchivedSessions((current) => !current)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border text-xs font-semibold ${
                showArchivedSessions
                  ? "border-amber-300/50 bg-amber-950/30 text-amber-100"
                  : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-amber-500"
              }`}
              title={
                showArchivedSessions
                  ? "Hide archived chats"
                  : "Show archived chats"
              }
              aria-label={
                showArchivedSessions
                  ? "Hide archived chats"
                  : "Show archived chats"
              }
            >
              <span className="h-3 w-4 rounded-sm border border-current border-t-2" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400">
          <span>
            {sessions.length}
            {totalKnownSessions == null
              ? ""
              : ` of ${totalKnownSessions}`}{" "}
            sessions
          </span>
          <span>{connection.wsStatus}</span>
        </div>

        {connection.error ? (
          <div className="m-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {connection.error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredSessions.map((session) => {
            return (
              <AgentChatV2SessionRow
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                menuOpen={sessionMenuOpenId === session.id}
                editing={editingSessionId === session.id}
                editingTitle={editingSessionTitle}
                archiving={archivingSessionId === session.id}
                actions={actions}
                onToggleMenu={toggleSessionMenu}
                onBeginEdit={beginEditSession}
                onOpenSettings={openSessionSettings}
                onSetArchived={setSessionArchived}
                onEditingTitleChange={setEditingSessionTitle}
                onCancelEdit={cancelEditSession}
                onSaveTitle={saveSessionTitle}
              />
            )
          })}
          {filteredSessions.length === 0 ? (
            <div className="m-3 rounded border border-dashed border-zinc-700 px-3 py-4 text-sm text-zinc-400">
              {sessionSearchQuery.trim()
                ? "No chats match this search."
                : showArchivedSessions
                  ? "No chats."
                  : "No active chats."}
            </div>
          ) : null}
        </div>

        {nextSessionsCursor ? (
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
                  {activeSession.activity.status === "running" ? (
                    <button
                      type="button"
                      disabled={interrupting}
                      onClick={() => void actions.interruptSession()}
                      className="mt-2 rounded border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-950 disabled:cursor-wait disabled:opacity-60"
                    >
                      {interrupting ? "Stopping" : "Stop"}
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            {settingsOpen ? (
              <form
                className="border-b border-zinc-800 bg-zinc-950 px-5 py-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveSessionSettings()
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase text-cyan-300">
                    Chat settings
                  </p>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-100"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Directory
                    </span>
                    <input
                      value={settingsDirectory}
                      onChange={(event) =>
                        setSettingsDirectory(event.target.value)
                      }
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Provider
                    </span>
                    <select
                      value={settingsProviderKind}
                      onChange={(event) =>
                        setSettingsProviderKind(
                          event.target.value as ProviderKind,
                        )
                      }
                      className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                    >
                      {providers.map((provider) => (
                        <option key={provider.kind} value={provider.kind}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Model
                    </span>
                    {activeSettingsProvider?.modelOptions.length ? (
                      <select
                        value={settingsModelRef}
                        onChange={(event) =>
                          setSettingsModelRef(event.target.value)
                        }
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                      >
                        {activeSettingsProvider.modelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={settingsModelRef}
                        onChange={(event) =>
                          setSettingsModelRef(event.target.value)
                        }
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                      />
                    )}
                  </label>
                  <label className="block min-w-0">
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Auth profile
                    </span>
                    {activeSettingsProvider?.authProfiles.length ? (
                      <select
                        value={settingsAuthProfile}
                        onChange={(event) =>
                          setSettingsAuthProfile(event.target.value)
                        }
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                      >
                        {activeSettingsProvider.authProfiles.map((profile) => (
                          <option key={profile} value={profile}>
                            {profile}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={settingsAuthProfile}
                        onChange={(event) =>
                          setSettingsAuthProfile(event.target.value)
                        }
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                      />
                    )}
                  </label>
                  <label className="block min-w-0 md:col-span-2 xl:col-span-1">
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Image model
                    </span>
                    <input
                      value={settingsImageModelRef}
                      onChange={(event) =>
                        setSettingsImageModelRef(event.target.value)
                      }
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="mt-1 h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <button
                      type="submit"
                      disabled={savingSettings || !settingsDirectory.trim()}
                      className="h-9 rounded border border-cyan-400/40 bg-cyan-950 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-900 disabled:cursor-wait disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500"
                    >
                      {savingSettings ? "Saving" : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            <div
              ref={transcriptScrollRef}
              onScroll={handleTranscriptScroll}
              className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
              {hasOlderMessages ? (
                <button
                  type="button"
                  disabled={loadingOlderMessages}
                  onClick={() => void loadOlderMessagesPreservingScroll()}
                  className="mb-4 w-full rounded border border-zinc-700 px-3 py-2 text-sm text-cyan-200 hover:bg-zinc-900 disabled:cursor-wait disabled:text-zinc-500"
                >
                  {loadingOlderMessages
                    ? "Loading older messages"
                    : "Load older messages"}
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
              composerImages={composerImages}
              composerImageError={composerImageError}
              enterStyle={enterStyle}
              queuedMessages={queuedMessages}
              store={store}
              actions={actions}
              onComposerImagesChange={setComposerImages}
              onComposerImageErrorChange={setComposerImageError}
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-zinc-400">
            {connection.status === "loading"
              ? "Loading sessions"
              : "Select a session"}
          </div>
        )}
      </section>
    </main>
  )
})
