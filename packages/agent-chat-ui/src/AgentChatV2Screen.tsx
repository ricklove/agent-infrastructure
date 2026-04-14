import {
  dashboardSessionFetch,
  readDashboardPreferences,
  subscribeDashboardPreferences,
} from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import type { Observable } from "@legendapp/state"
import { For, observer, useValue } from "@legendapp/state/react"
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
  OutboxMessageBubble,
} from "./AgentChatV2Messages"
import {
  type AgentChatV2ActionSequenceMode,
  type AgentChatV2ActiveSessionActions,
  type AgentChatV2ComposerImage,
  type AgentChatV2OutboxMessage,
  type AgentChatV2Session,
  type AgentChatV2SessionUpdate,
  type AgentChatV2TranscriptItem,
  createAgentChatV2Actions,
  createAgentChatV2Store,
  type ProviderKind,
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
  onOpenSession: (sessionId: string) => void
  onToggleMenu: (sessionId: string) => void
  onBeginEdit: (session: AgentChatV2Session) => void
  onOpenSettings: (session: AgentChatV2Session) => void
  onSetArchived: (sessionId: string, archived: boolean) => void
  onEditingTitleChange: (title: string) => void
  onCancelEdit: () => void
  onSaveTitle: () => void
}

type AgentChatV2TranscriptItemViewProps = {
  item$: Observable<AgentChatV2TranscriptItem>
  apiRootUrl: string
  streamingAssistantText: string
  onCopyMessageLink: (sessionId: string, messageId: string) => Promise<void>
  actionSequenceMode: AgentChatV2ActionSequenceMode
  onActionToggle: () => void
}

const AgentChatV2TranscriptItemView = observer(
  function AgentChatV2TranscriptItemView(
    props: AgentChatV2TranscriptItemViewProps,
  ) {
    const item = useValue(props.item$)

    if (item.type === "actions") {
      return (
        <ActionSequence
          messages={item.messages}
          showPreview={item.showIdlePreview && !props.streamingAssistantText}
          autoSelectStreamCheckpoint={props.actionSequenceMode === "checkpoint"}
          onToggle={props.onActionToggle}
        />
      )
    }

    return (
      <MessageBubble
        message={item.message}
        apiRootUrl={props.apiRootUrl}
        onCopyMessageLink={props.onCopyMessageLink}
      />
    )
  },
)

type AgentChatV2OutboxMessageViewProps = {
  message$: Observable<AgentChatV2OutboxMessage>
  id?: string
  apiRootUrl: string
}

const AgentChatV2OutboxMessageView = observer(
  function AgentChatV2OutboxMessageView(
    props: AgentChatV2OutboxMessageViewProps,
  ) {
    const message = useValue(props.message$)
    return (
      <OutboxMessageBubble
        message={message}
        index={Number.parseInt(props.id ?? "0", 10) || 0}
        apiRootUrl={props.apiRootUrl}
      />
    )
  },
)

function AgentChatV2SessionRow(props: AgentChatV2SessionRowProps) {
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
        onClick={() => props.onOpenSession(session.id)}
        className="w-full min-w-0 px-4 py-3 pr-12 text-left"
        data-session-id={session.id}
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
          throw new Error(
            payload.error ?? "Agent Chat providers failed to load.",
          )
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

  const connection = useValue(() => store.state$.connectionSummary.get())
  const activeSessionId = useValue(() => store.state$.activeSessionId.get())
  const totalKnownSessions = useValue(() =>
    store.state$.totalKnownSessions.get(),
  )
  const nextSessionsCursor = useValue(() =>
    store.state$.nextSessionsCursor.get(),
  )
  const sessions = useValue(() => store.state$.sessions.get())
  const interrupting = useValue(() => store.state$.interrupting.get())
  const actionSequenceMode = useValue(() =>
    store.state$.actionSequenceMode.get(),
  )
  const activeSessionSummary = useValue(() =>
    store.state$.activeSession.session.get(),
  )
  const activeSessionActions = useValue(() =>
    store.state$.activeSession.actions.get(),
  ) as AgentChatV2ActiveSessionActions | null
  const canInterruptActiveSession =
    Boolean(activeSessionSummary?.activity.canInterrupt) && !interrupting
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
      void activeSessionActions?.interrupt()
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [activeSessionActions, canInterruptActiveSession])

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
  const activeMessages = useValue(() =>
    store.state$.activeSession.messages.get(),
  )
  const queuedMessages = useValue(() =>
    store.state$.activeSession.queuedMessages.get(),
  )
  const hasOlderMessages = useValue(() =>
    store.state$.activeSession.hasOlderMessages.get(),
  )
  const streamingAssistantText = useValue(() =>
    store.state$.activeSession.streamingAssistantText.get(),
  )
  const transcriptMessages = useValue(() =>
    store.state$.activeSession.transcriptMessages.get(),
  )
  const autoScrollKey = useValue(() =>
    store.state$.activeSession.autoScrollKey.get(),
  )
  const firstMessageId = useValue(() =>
    store.state$.activeSession.firstMessageId.get(),
  )

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
    const activeSessionId = activeSessionSummary?.id ?? ""
    const sessionChanged =
      previousActiveSessionIdRef.current !== activeSessionId
    previousActiveSessionIdRef.current = activeSessionId
    if (!activeSessionId) {
      return
    }
    scheduleTranscriptScrollToBottom({ force: sessionChanged })
  }, [
    activeSessionSummary?.id,
    autoScrollKey,
    scheduleTranscriptScrollToBottom,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: older-message scroll restoration must rerun after prepended transcript content changes.
  useLayoutEffect(() => {
    const pendingRestore = olderMessagesScrollRestoreRef.current
    const scrollElement = transcriptScrollRef.current
    if (
      !pendingRestore ||
      !scrollElement ||
      pendingRestore.sessionId !== activeSessionSummary?.id
    ) {
      return
    }

    olderMessagesScrollRestoreRef.current = null
    const scrollHeightDelta =
      scrollElement.scrollHeight - pendingRestore.scrollHeight
    scrollElement.scrollTop = pendingRestore.scrollTop + scrollHeightDelta
    transcriptPinnedToBottomRef.current = false
    setTranscriptPinnedToBottom(false)
  }, [activeSessionSummary?.id, firstMessageId, transcriptMessages.length])

  useEffect(() => {
    const activeSessionId = activeSessionSummary?.id ?? ""
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
    activeSessionSummary?.id,
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
    const sessionId = await actions.createSession(newChatTitle)
    if (sessionId && typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.pathname = "/chat-v2"
      url.searchParams.set(chatSessionQueryParam, sessionId)
      url.hash = ""
      window.history.replaceState(null, "", url.pathname + url.search)
    }
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

  const openChatSession = useCallback(
    (sessionId: string) => {
      if (!sessionId) {
        return
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        url.pathname = "/chat-v2"
        url.searchParams.set(chatSessionQueryParam, sessionId)
        url.hash = ""
        window.history.replaceState(null, "", `${url.pathname}${url.search}`)
      }
      setSessionMenuOpenId(null)
      setSettingsOpen(false)
      void actions.openSession(sessionId)
    },
    [actions],
  )

  const toggleSessionMenu = useCallback((sessionId: string) => {
    setSessionMenuOpenId((current) =>
      current === sessionId ? null : sessionId,
    )
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
    if (!activeSessionSummary) {
      setSettingsOpen(false)
      return
    }
    setSettingsProviderKind(activeSessionSummary.providerKind)
    setSettingsModelRef(activeSessionSummary.modelRef)
    setSettingsAuthProfile(activeSessionSummary.authProfile ?? "")
    setSettingsDirectory(activeSessionSummary.cwd)
    setSettingsImageModelRef(activeSessionSummary.imageModelRef ?? "")
  }, [
    activeSessionSummary?.authProfile,
    activeSessionSummary?.cwd,
    activeSessionSummary?.id,
    activeSessionSummary?.imageModelRef,
    activeSessionSummary?.modelRef,
    activeSessionSummary?.providerKind,
    activeSessionSummary,
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
    if (!activeSessionSummary || !settingsDirectory.trim()) {
      return
    }
    const update: AgentChatV2SessionUpdate = {}
    if (settingsDirectory.trim() !== activeSessionSummary.cwd) {
      update.cwd = settingsDirectory.trim()
    }
    if (settingsProviderKind !== activeSessionSummary.providerKind) {
      update.providerKind = settingsProviderKind
    }
    if (settingsModelRef !== activeSessionSummary.modelRef) {
      update.modelRef = settingsModelRef
    }
    if (settingsAuthProfile !== (activeSessionSummary.authProfile ?? "")) {
      update.authProfile = settingsAuthProfile || null
    }
    if (settingsImageModelRef !== (activeSessionSummary.imageModelRef ?? "")) {
      update.imageModelRef = settingsImageModelRef || null
    }
    if (Object.keys(update).length === 0) {
      setSettingsOpen(false)
      return
    }

    setSavingSettings(true)
    try {
      await activeSessionActions?.update(update)
      setSettingsOpen(false)
    } finally {
      setSavingSettings(false)
    }
  }, [
    activeSessionActions,
    activeSessionSummary,
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
    const sessionId = activeSessionSummary?.id
    if (!scrollElement || !sessionId) {
      loadingOlderMessagesRef.current = true
      setLoadingOlderMessages(true)
      try {
        await activeSessionActions?.loadOlderMessages()
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
      await activeSessionActions?.loadOlderMessages()
    } catch (error) {
      olderMessagesScrollRestoreRef.current = null
      throw error
    } finally {
      loadingOlderMessagesRef.current = false
      setLoadingOlderMessages(false)
    }
  }, [activeSessionActions, activeSessionSummary?.id, hasOlderMessages])

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
            {totalKnownSessions == null ? "" : ` of ${totalKnownSessions}`}{" "}
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
                onOpenSession={openChatSession}
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
        {activeSessionSummary && activeSessionActions ? (
          <>
            <header className="border-b border-zinc-800 bg-zinc-950 px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">
                    {activeSessionSummary.title}
                  </h2>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {activeSessionSummary.cwd}
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-400">
                  <p>{activityLabel(activeSessionSummary)}</p>
                  <p className="mt-1">
                    window {activeMessages.length.toLocaleString()} /{" "}
                    {activeSessionSummary.messageCount.toLocaleString()}
                  </p>
                  <fieldset className="mt-2 inline-flex rounded border border-zinc-800 bg-zinc-950 p-0.5">
                    <legend className="sr-only">Action sequence mode</legend>
                    {(["condensed", "checkpoint"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => actions.setActionSequenceMode(mode)}
                        className={`rounded px-2 py-1 text-[11px] font-semibold uppercase ${
                          actionSequenceMode === mode
                            ? "bg-cyan-950 text-cyan-100"
                            : "text-zinc-500 hover:text-zinc-200"
                        }`}
                        aria-pressed={actionSequenceMode === mode}
                      >
                        {mode}
                      </button>
                    ))}
                  </fieldset>
                  {activeSessionSummary.activity.canInterrupt ? (
                    <button
                      type="button"
                      disabled={interrupting}
                      onClick={() => void activeSessionActions.interrupt()}
                      title={interrupting ? "Stopping" : "Stop session"}
                      aria-label={interrupting ? "Stopping" : "Stop session"}
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
                  <label
                    className="block min-w-0"
                    htmlFor="agent-chat-v2-model"
                  >
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Model
                    </span>
                    {activeSettingsProvider?.modelOptions.length ? (
                      <select
                        id="agent-chat-v2-model"
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
                        id="agent-chat-v2-model"
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
                  <label
                    className="block min-w-0"
                    htmlFor="agent-chat-v2-auth-profile"
                  >
                    <span className="text-[11px] font-semibold uppercase text-zinc-500">
                      Auth profile
                    </span>
                    {activeSettingsProvider?.authProfiles.length ? (
                      <select
                        id="agent-chat-v2-auth-profile"
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
                        id="agent-chat-v2-auth-profile"
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
                <For
                  each={store.state$.activeSession.transcriptItems}
                  optimized
                >
                  {(item$) => (
                    <AgentChatV2TranscriptItemView
                      item$={item$ as Observable<AgentChatV2TranscriptItem>}
                      apiRootUrl={apiRootUrl}
                      streamingAssistantText={streamingAssistantText}
                      onCopyMessageLink={copyMessageLink}
                      actionSequenceMode={actionSequenceMode}
                      onActionToggle={scheduleTranscriptScrollToBottom}
                    />
                  )}
                </For>
                {streamingAssistantText ? (
                  <div className="rounded border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm leading-6 text-emerald-50">
                    {streamingAssistantText}
                  </div>
                ) : null}
                <For each={store.state$.activeSession.outboxMessages} optimized>
                  {(message$, id) => (
                    <AgentChatV2OutboxMessageView
                      message$={
                        message$ as Observable<AgentChatV2OutboxMessage>
                      }
                      id={id}
                      apiRootUrl={apiRootUrl}
                    />
                  )}
                </For>
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
              activeSession={activeSessionSummary}
              composerImages={composerImages}
              composerImageError={composerImageError}
              enterStyle={enterStyle}
              queuedMessages={queuedMessages}
              store={store}
              actions={activeSessionActions}
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
