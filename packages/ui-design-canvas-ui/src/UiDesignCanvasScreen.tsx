import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
  type Viewport,
} from "reactflow"
import { reactflowStylesLoaded } from "./reactflow-style-runtime.js"

void reactflowStylesLoaded

type PromptLifecycle = "pending" | "commented" | "generated" | "failed"
type VariantStatus = "idea" | "refined" | "candidate"
type CanvasMode = "navigate" | "draw"
type AgentAction = "comment" | "generate_variant"
type ProviderKind =
  | "codex-app-server"
  | "openrouter"
  | "claude-agent-sdk"
  | "gemini"
type SessionRole = "user" | "assistant" | "system"

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
  archived: boolean
  providerKind: ProviderKind
  modelRef: string
  cwd: string
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
  role: SessionRole
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

type SessionSnapshotResponse = {
  ok: boolean
  session: SessionSummary
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
  activity: SessionActivity
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

type ChatSessionState = {
  session: SessionSummary | null
  messages: SessionMessage[]
  queuedMessages: SessionMessage[]
  activity: SessionActivity
  streamingAssistantText: string
  wsStatus: "idle" | "connecting" | "ready" | "error"
  error: string
}

type DraftPromptNodeData = {
  kind: "draft"
  text: string
  sessionId: string | null
  sessionStatus: "provisioning" | "ready" | "failed"
  onDragBy(deltaX: number, deltaY: number): void
  onChange(nextText: string): void
  onSubmit(): void
  onCancel(): void
}

type PromptNodeData = {
  kind: "prompt"
  text: string
  state: PromptLifecycle
  sessionId: string | null
  projectedMessageId: string | null
}

type CommentNodeData = {
  kind: "comment"
  title: string
  body: string
  sessionId: string | null
  sourceMessageId: string
}

type VariantNodeData = {
  kind: "variant"
  title: string
  summary: string
  status: VariantStatus
  promptText: string
  sessionId: string | null
  sourceMessageId: string | null
}

type CanvasNodeData =
  | DraftPromptNodeData
  | PromptNodeData
  | CommentNodeData
  | VariantNodeData

type Stroke = {
  id: string
  points: Array<{ x: number; y: number }>
}

type FloatingPanelId = "controls" | "chat" | "selection"
type PanelPosition = { x: number; y: number }
type PanelPositions = Record<FloatingPanelId, PanelPosition>

const sessionStorageKey = "agent-infrastructure.dashboard.session"
const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."
const defaultSessionDirectory =
  "/home/ec2-user/workspace/projects-worktrees/agent-infrastructure/feature-ui-design-canvas"
const defaultSessionProcessBlueprintId = "discuss"
const websocketRetryBackoffMs = [500, 1_000, 2_000, 4_000, 8_000] as const
const websocketWarningDelayMs = 5_000

const emptyActivity: SessionActivity = {
  status: "idle",
  startedAtMs: null,
  threadId: null,
  turnId: null,
  backgroundProcessCount: 0,
  waitingFlags: [],
  lastError: null,
  currentMessageId: null,
  canInterrupt: false,
}

const initialPanelPositions: PanelPositions = {
  controls: { x: 20, y: 20 },
  chat: { x: 380, y: 20 },
  selection: { x: 380, y: 420 },
}

const initialNodes: Node<CanvasNodeData>[] = [
  {
    id: "seed-variant-1",
    type: "designNode",
    position: { x: 120, y: 120 },
    data: {
      kind: "variant",
      title: "Editorial Dashboard Direction",
      summary: "Large type, confident contrast, and strong content hierarchy.",
      status: "candidate",
      promptText: "Seed concept",
      sessionId: null,
      sourceMessageId: null,
    },
  },
  {
    id: "seed-variant-2",
    type: "designNode",
    position: { x: 520, y: 240 },
    data: {
      kind: "variant",
      title: "Operations Board Direction",
      summary: "Dense status cards, command rail, and multi-panel layout.",
      status: "idea",
      promptText: "Seed concept",
      sessionId: null,
      sourceMessageId: null,
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: "seed-edge-1",
    source: "seed-variant-1",
    target: "seed-variant-2",
    type: "smoothstep",
    animated: false,
    style: { stroke: "rgba(245, 158, 11, 0.35)", strokeWidth: 1.5 },
  },
]

function readStoredSessionToken(): string {
  if (typeof window === "undefined") {
    return ""
  }
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

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const authorization = authorizationHeaderValue()
  if (authorization) {
    headers.set("Authorization", authorization)
  }
  return fetch(path, { ...init, headers })
}

function timestampLabel(dateMs: number): string {
  return new Date(dateMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

function dashedPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ""
  }
  const [first, ...rest] = points
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`
}

function promptStateClasses(state: PromptLifecycle): string {
  if (state === "pending") {
    return "border-amber-400/60 bg-amber-500/10 text-amber-50"
  }
  if (state === "commented") {
    return "border-sky-400/55 bg-sky-500/10 text-sky-50"
  }
  if (state === "generated") {
    return "border-emerald-400/55 bg-emerald-500/10 text-emerald-50"
  }
  return "border-rose-400/60 bg-rose-500/10 text-rose-50"
}

function variantStatusClasses(status: VariantStatus): string {
  if (status === "candidate") {
    return "border-emerald-400/45 bg-emerald-400/12 text-emerald-100"
  }
  if (status === "refined") {
    return "border-sky-400/45 bg-sky-400/12 text-sky-100"
  }
  return "border-amber-300/45 bg-amber-300/12 text-amber-100"
}

function classifyPrompt(text: string): AgentAction {
  const normalized = text.trim().toLowerCase()
  const generationSignals = [
    "create",
    "make",
    "add",
    "generate",
    "hero",
    "screen",
    "page",
    "landing",
    "checkout",
    "dashboard",
    "variant",
    "layout",
  ]
  return generationSignals.some((token) => normalized.includes(token))
    ? "generate_variant"
    : "comment"
}

function summarizeVariantTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ")
  const clipped =
    normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized
  return clipped || "New design variant"
}

function extractMessageText(
  message: SessionMessage | null | undefined,
): string {
  if (!message) {
    return ""
  }
  return message.content
    .map((block) => (block.type === "text" ? block.text : "[image]"))
    .join("\n")
    .trim()
}

function summarizeAssistantResponse(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= 180) {
    return normalized
  }
  return `${normalized.slice(0, 177)}...`
}

function nodeSessionId(
  node: Node<CanvasNodeData> | null | undefined,
): string | null {
  if (!node) {
    return null
  }
  if (node.data.kind === "draft" || node.data.kind === "prompt") {
    return node.data.sessionId
  }
  if (node.data.kind === "comment" || node.data.kind === "variant") {
    return node.data.sessionId
  }
  return null
}

function defaultChatSessionState(): ChatSessionState {
  return {
    session: null,
    messages: [],
    queuedMessages: [],
    activity: emptyActivity,
    streamingAssistantText: "",
    wsStatus: "idle",
    error: "",
  }
}

function DesignNode({ data, selected }: NodeProps<CanvasNodeData>) {
  if (data.kind === "draft") {
    return <DraftPromptCard data={data} selected={selected} />
  }
  if (data.kind === "prompt") {
    return <PromptCard data={data} selected={selected} />
  }
  if (data.kind === "comment") {
    return <CommentCard data={data} selected={selected} />
  }
  return <VariantCard data={data} selected={selected} />
}

function DraftPromptCard({
  data,
  selected,
}: {
  data: DraftPromptNodeData
  selected: boolean
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const dragStateRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }
      const deltaX = event.clientX - dragState.x
      const deltaY = event.clientY - dragState.y
      if (deltaX !== 0 || deltaY !== 0) {
        data.onDragBy(deltaX, deltaY)
        dragStateRef.current = { x: event.clientX, y: event.clientY }
      }
    }

    function handlePointerUp() {
      dragStateRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [data])

  return (
    <div
      className={`min-w-[320px] max-w-[380px] rounded-[28px] border bg-stone-950/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur ${
        selected ? "border-amber-300/70" : "border-stone-700/90"
      }`}
    >
      <div
        className="nodrag mb-3 flex cursor-grab items-center justify-between active:cursor-grabbing"
        onPointerDown={(event) => {
          dragStateRef.current = { x: event.clientX, y: event.clientY }
        }}
      >
        <span className="rounded-full border border-amber-300/35 bg-amber-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
          Prompt Draft
        </span>
        <span className="text-[10px] uppercase tracking-[0.24em] text-stone-500">
          {data.sessionStatus === "provisioning"
            ? "Starting chat"
            : data.sessionStatus === "failed"
              ? "Chat failed"
              : "Enter submits"}
        </span>
      </div>
      <textarea
        ref={inputRef}
        value={data.text}
        onChange={(event) => data.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            data.onSubmit()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            data.onCancel()
          }
        }}
        className="nodrag h-28 w-full resize-none rounded-[20px] border border-stone-700/80 bg-stone-900/85 px-4 py-3 text-sm leading-6 text-stone-100 outline-none placeholder:text-stone-500"
        placeholder="Describe a direction, sketch note, or ask the agent what to change."
      />
      <div className="mt-3 flex items-center justify-between text-xs text-stone-400">
        <span>
          {data.sessionStatus === "ready"
            ? "Shift+Enter for newline"
            : "Preparing session"}
        </span>
        <button
          type="button"
          onClick={data.onSubmit}
          className="nodrag rounded-full border border-amber-300/45 bg-amber-300/14 px-3 py-1.5 font-medium text-amber-50 hover:bg-amber-300/20"
        >
          Send to agent
        </button>
      </div>
    </div>
  )
}

function PromptCard({
  data,
  selected,
}: {
  data: PromptNodeData
  selected: boolean
}) {
  return (
    <div
      className={`min-w-[280px] max-w-[340px] rounded-[28px] border p-4 shadow-[0_20px_72px_rgba(0,0,0,0.28)] backdrop-blur ${
        selected ? "ring-1 ring-amber-300/65" : ""
      } ${promptStateClasses(data.state)}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
          Prompt
        </span>
        <span className="text-[10px] uppercase tracking-[0.24em] opacity-70">
          {data.state}
        </span>
      </div>
      <p className="text-sm leading-6">{data.text}</p>
    </div>
  )
}

function CommentCard({
  data,
  selected,
}: {
  data: CommentNodeData
  selected: boolean
}) {
  return (
    <div
      className={`min-w-[280px] max-w-[360px] rounded-[28px] border border-sky-400/40 bg-sky-950/55 p-4 text-sky-50 shadow-[0_20px_72px_rgba(0,0,0,0.26)] ${
        selected ? "ring-1 ring-sky-300/60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full border border-sky-300/30 bg-sky-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-100">
          Agent Comment
        </span>
        <span className="text-[10px] uppercase tracking-[0.24em] text-sky-200/65">
          chat-backed
        </span>
      </div>
      <h3 className="text-sm font-semibold text-white">{data.title}</h3>
      <p className="mt-2 text-sm leading-6 text-sky-50/88">{data.body}</p>
    </div>
  )
}

function VariantCard({
  data,
  selected,
}: {
  data: VariantNodeData
  selected: boolean
}) {
  return (
    <div
      className={`min-w-[320px] max-w-[380px] overflow-hidden rounded-[30px] border border-stone-700/85 bg-stone-950/96 text-stone-100 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ${
        selected ? "ring-1 ring-emerald-300/55" : ""
      }`}
    >
      <div className="relative border-b border-stone-800/80 px-5 pb-5 pt-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.14),transparent_42%)]" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${variantStatusClasses(data.status)}`}
            >
              {data.status}
            </span>
            <span className="text-[10px] uppercase tracking-[0.24em] text-stone-500">
              Variant
            </span>
          </div>
          <h3 className="mt-4 text-base font-semibold text-white">
            {data.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-300">
            {data.summary}
          </p>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="rounded-[24px] border border-stone-800/80 bg-stone-900/80 p-3">
          <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-stone-500">
            <span>Preview</span>
            <span>High-level</span>
          </div>
          <div className="grid grid-cols-[1.3fr,0.7fr] gap-3">
            <div className="rounded-[20px] border border-stone-800 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] p-3">
              <div className="h-3 w-1/2 rounded-full bg-white/75" />
              <div className="mt-3 h-16 rounded-[16px] border border-white/10 bg-white/5" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="h-9 rounded-xl bg-white/7" />
                <div className="h-9 rounded-xl bg-white/7" />
                <div className="h-9 rounded-xl bg-white/7" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="h-14 rounded-[18px] border border-white/10 bg-white/5" />
              <div className="h-22 rounded-[18px] border border-amber-300/14 bg-amber-300/8" />
              <div className="h-10 rounded-[18px] border border-sky-300/12 bg-sky-300/8" />
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-[20px] border border-stone-800/80 bg-stone-900/80 px-3 py-2 text-xs text-stone-400">
          From prompt: {data.promptText}
        </div>
      </div>
    </div>
  )
}

function FloatingPanel({
  panelId,
  title,
  subtitle,
  position,
  onMove,
  widthClass,
  children,
}: {
  panelId: FloatingPanelId
  title: string
  subtitle?: string
  position: PanelPosition
  onMove(panelId: FloatingPanelId, nextPosition: PanelPosition): void
  widthClass?: string
  children: ReactNode
}) {
  const dragStateRef = useRef<{
    originX: number
    originY: number
    startX: number
    startY: number
  } | null>(null)

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }
      onMove(panelId, {
        x: Math.max(12, dragState.originX + (event.clientX - dragState.startX)),
        y: Math.max(12, dragState.originY + (event.clientY - dragState.startY)),
      })
    }

    function handlePointerUp() {
      dragStateRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [onMove, panelId])

  return (
    <section
      className={`absolute z-30 rounded-[28px] border border-stone-700/75 bg-stone-950/90 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur ${widthClass ?? "w-[320px]"}`}
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="flex cursor-grab items-start justify-between gap-3 rounded-t-[28px] border-b border-stone-800/80 px-4 py-3 active:cursor-grabbing"
        onPointerDown={(event) => {
          dragStateRef.current = {
            originX: position.x,
            originY: position.y,
            startX: event.clientX,
            startY: event.clientY,
          }
        }}
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
            {title}
          </div>
          {subtitle ? (
            <p className="mt-1 text-xs leading-5 text-stone-400">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export type UiDesignCanvasScreenProps = {
  apiRootUrl: string
  wsRootUrl: string
  defaultSessionDirectory?: string
  defaultProcessBlueprintId?: string
}

export function UiDesignCanvasScreen({
  apiRootUrl,
  wsRootUrl,
  defaultSessionDirectory: sessionDirectory = defaultSessionDirectory,
  defaultProcessBlueprintId = defaultSessionProcessBlueprintId,
}: UiDesignCanvasScreenProps) {
  const reactFlowRef = useRef<ReactFlowInstance<CanvasNodeData, Edge> | null>(
    null,
  )
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  const strokeCounterRef = useRef(0)
  const nodeCounterRef = useRef(2)
  const edgeCounterRef = useRef(1)
  const createSessionPromiseRef = useRef(new Map<string, Promise<string>>())
  const pollingSessionIdsRef = useRef(new Set<string>())
  const nodesRef = useRef<Node<CanvasNodeData>[]>(initialNodes)
  const [nodes, setNodes, onNodesChange] =
    useNodesState<CanvasNodeData>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [mode, setMode] = useState<CanvasMode>("navigate")
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)
  const [panelPositions, setPanelPositions] = useState<PanelPositions>(
    initialPanelPositions,
  )
  const [chatDraft, setChatDraft] = useState("")
  const [chatSessions, setChatSessions] = useState<
    Record<string, ChatSessionState>
  >({})
  const [globalError, setGlobalError] = useState("")

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const hasMarkup = strokes.length > 0

  const nodeTypes = useMemo(
    () => ({
      designNode: DesignNode,
    }),
    [],
  )

  function nextNodeId(prefix: string): string {
    nodeCounterRef.current += 1
    return `${prefix}-${nodeCounterRef.current}`
  }

  function nextEdgeId(): string {
    edgeCounterRef.current += 1
    return `edge-${edgeCounterRef.current}`
  }

  function updatePanelPosition(
    panelId: FloatingPanelId,
    nextPosition: PanelPosition,
  ) {
    setPanelPositions((current) => ({ ...current, [panelId]: nextPosition }))
  }

  function updateNodeData(nodeId: string, nextData: CanvasNodeData) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId ? { ...node, data: nextData } : node,
      ),
    )
  }

  function removeNode(nodeId: string) {
    setNodes((currentNodes) =>
      currentNodes.filter((node) => node.id !== nodeId),
    )
  }

  function updatePromptNode(
    nodeId: string,
    updater: (currentData: PromptNodeData) => PromptNodeData,
  ) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId && node.data.kind === "prompt"
          ? { ...node, data: updater(node.data) }
          : node,
      ),
    )
  }

  function upsertChatSession(
    sessionId: string,
    updater: (current: ChatSessionState) => ChatSessionState,
  ) {
    setChatSessions((current) => ({
      ...current,
      [sessionId]: updater(current[sessionId] ?? defaultChatSessionState()),
    }))
  }

  function setSessionSnapshot(snapshot: SessionSnapshotResponse) {
    upsertChatSession(snapshot.session.id, (current) => ({
      ...current,
      session: snapshot.session,
      messages: snapshot.messages,
      queuedMessages: snapshot.queuedMessages,
      activity: snapshot.activity,
    }))
  }

  function activeSessionId(): string | null {
    const selectedNode = selectedNodeId
      ? (nodesRef.current.find((node) => node.id === selectedNodeId) ?? null)
      : null
    return nodeSessionId(selectedNode) ?? lastSessionId
  }

  async function createAgentChatSession(title: string | null) {
    const response = await apiFetch(`${apiRootUrl}/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title,
        providerKind: "codex-app-server",
        modelRef: "openai-codex/gpt-5.4",
        cwd: sessionDirectory,
        authProfile: "chatgpt",
        imageModelRef: null,
        processBlueprintId: defaultProcessBlueprintId,
      }),
    })
    const payload = (await response.json()) as SessionSnapshotResponse & {
      error?: string
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Agent chat session creation failed.")
    }
    setSessionSnapshot(payload)
    setLastSessionId(payload.session.id)
    return payload.session.id
  }

  async function ensureChatSessionForNode(
    nodeId: string,
    title: string | null,
  ) {
    const existingPromise = createSessionPromiseRef.current.get(nodeId)
    if (existingPromise) {
      return existingPromise
    }

    const nextPromise = createAgentChatSession(title)
      .then((sessionId) => {
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id !== nodeId) {
              return node
            }
            if (node.data.kind === "draft") {
              return {
                ...node,
                data: { ...node.data, sessionId, sessionStatus: "ready" },
              }
            }
            if (node.data.kind === "prompt") {
              return {
                ...node,
                data: { ...node.data, sessionId },
              }
            }
            return node
          }),
        )
        return sessionId
      })
      .catch((error: unknown) => {
        setGlobalError(
          error instanceof Error
            ? error.message
            : "Agent chat session creation failed.",
        )
        setNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === nodeId && node.data.kind === "draft"
              ? {
                  ...node,
                  data: { ...node.data, sessionStatus: "failed" },
                }
              : node,
          ),
        )
        throw error
      })
      .finally(() => {
        createSessionPromiseRef.current.delete(nodeId)
      })

    createSessionPromiseRef.current.set(nodeId, nextPromise)
    return nextPromise
  }

  async function sendChatMessage(sessionId: string, text: string) {
    const response = await apiFetch(
      `${apiRootUrl}/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text,
          content: [
            {
              type: "text",
              text,
            },
          ],
          replyToMessageId: null,
        }),
      },
    )
    const payload = (await response.json()) as { error?: string }
    if (!response.ok) {
      throw new Error(payload.error ?? "Message send failed.")
    }
  }

  async function renameChatSession(sessionId: string, title: string) {
    await apiFetch(`${apiRootUrl}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ title }),
    }).catch(() => {
      // Best-effort only.
    })
  }

  function createDraftPrompt(position: { x: number; y: number }) {
    const draftId = nextNodeId("draft")
    const draftData: DraftPromptNodeData = {
      kind: "draft",
      text: "",
      sessionId: null,
      sessionStatus: "provisioning",
      onDragBy(deltaX, deltaY) {
        const zoom = viewportRef.current.zoom || 1
        setNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === draftId
              ? {
                  ...node,
                  position: {
                    x: node.position.x + deltaX / zoom,
                    y: node.position.y + deltaY / zoom,
                  },
                }
              : node,
          ),
        )
      },
      onChange(nextText) {
        updateNodeData(draftId, { ...draftData, text: nextText })
      },
      onSubmit() {
        void submitDraftPrompt(draftId)
      },
      onCancel() {
        removeNode(draftId)
      },
    }

    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: draftId,
        type: "designNode",
        position,
        data: draftData,
      },
    ])
    setSelectedNodeId(draftId)
    void ensureChatSessionForNode(draftId, "Canvas prompt")
  }

  async function fetchSessionSnapshot(sessionId: string) {
    const response = await apiFetch(`${apiRootUrl}/sessions/${sessionId}`)
    const payload = (await response.json()) as SessionSnapshotResponse & {
      error?: string
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Session load failed.")
    }
    setSessionSnapshot(payload)
    return payload
  }

  function projectAssistantReply(
    promptId: string,
    snapshot: SessionSnapshotResponse,
  ) {
    const promptNode = nodesRef.current.find((node) => node.id === promptId)
    if (!promptNode || promptNode.data.kind !== "prompt") {
      return
    }

    const assistantMessage =
      [...snapshot.messages]
        .reverse()
        .find(
          (message) => message.role === "assistant" && message.kind === "chat",
        ) ?? null

    if (
      !assistantMessage ||
      promptNode.data.projectedMessageId === assistantMessage.id
    ) {
      return
    }

    const assistantText = summarizeAssistantResponse(
      extractMessageText(assistantMessage),
    )
    const promptText = promptNode.data.text
    const action = classifyPrompt(promptText)
    const promptPosition = promptNode.position

    if (action === "comment") {
      const commentId = nextNodeId("comment")
      setNodes((currentNodes) => [
        ...currentNodes,
        {
          id: commentId,
          type: "designNode",
          position: { x: promptPosition.x + 360, y: promptPosition.y - 24 },
          data: {
            kind: "comment",
            title: "Background critique",
            body: assistantText,
            sessionId: snapshot.session.id,
            sourceMessageId: assistantMessage.id,
          },
        },
      ])
      setEdges((currentEdges) => [
        ...currentEdges,
        {
          id: nextEdgeId(),
          source: promptId,
          target: commentId,
          type: "smoothstep",
          animated: true,
          style: { stroke: "rgba(125, 211, 252, 0.45)", strokeWidth: 1.6 },
        },
      ])
      updatePromptNode(promptId, (currentData) => ({
        ...currentData,
        state: "commented",
        projectedMessageId: assistantMessage.id,
      }))
      return
    }

    const variantId = nextNodeId("variant")
    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: variantId,
        type: "designNode",
        position: { x: promptPosition.x + 380, y: promptPosition.y + 16 },
        data: {
          kind: "variant",
          title: summarizeVariantTitle(promptText),
          summary: assistantText,
          status: hasMarkup ? "refined" : "idea",
          promptText,
          sessionId: snapshot.session.id,
          sourceMessageId: assistantMessage.id,
        },
      },
    ])
    setEdges((currentEdges) => [
      ...currentEdges,
      {
        id: nextEdgeId(),
        source: promptId,
        target: variantId,
        type: "smoothstep",
        animated: true,
        style: { stroke: "rgba(74, 222, 128, 0.45)", strokeWidth: 1.6 },
      },
    ])
    updatePromptNode(promptId, (currentData) => ({
      ...currentData,
      state: "generated",
      projectedMessageId: assistantMessage.id,
    }))
  }

  async function submitDraftPrompt(draftId: string) {
    const draftNode = nodesRef.current.find((node) => node.id === draftId)
    if (!draftNode || draftNode.data.kind !== "draft") {
      return
    }

    const text = draftNode.data.text.trim()
    if (!text) {
      removeNode(draftId)
      return
    }

    const promptId = nextNodeId("prompt")

    try {
      const sessionId =
        draftNode.data.sessionId ??
        (await ensureChatSessionForNode(draftId, summarizeVariantTitle(text)))

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === draftId
            ? {
                ...node,
                id: promptId,
                data: {
                  kind: "prompt",
                  text,
                  state: "pending",
                  sessionId,
                  projectedMessageId: null,
                } satisfies PromptNodeData,
              }
            : node,
        ),
      )
      setSelectedNodeId(promptId)
      setLastSessionId(sessionId)
      await renameChatSession(sessionId, summarizeVariantTitle(text))
      await sendChatMessage(sessionId, text)
      void fetchSessionSnapshot(sessionId)
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Prompt submission failed.",
      )
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === draftId
            ? {
                ...node,
                id: promptId,
                data: {
                  kind: "prompt",
                  text,
                  state: "failed",
                  sessionId: null,
                  projectedMessageId: null,
                } satisfies PromptNodeData,
              }
            : node,
        ),
      )
      setSelectedNodeId(promptId)
    }
  }

  function handlePaneDoubleClick(event: React.MouseEvent<Element, MouseEvent>) {
    if (mode === "draw") {
      return
    }
    if (event.detail < 2) {
      return
    }
    const target = event.target as HTMLElement | null
    if (!target) {
      return
    }
    if (
      target.closest(".react-flow__node") ||
      target.closest(".react-flow__controls") ||
      target.closest(".react-flow__minimap")
    ) {
      return
    }
    const position = reactFlowRef.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    if (!position) {
      return
    }
    createDraftPrompt(position)
  }

  function handleConnect(connection: Connection) {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          id: nextEdgeId(),
          type: "smoothstep",
          style: { stroke: "rgba(245, 158, 11, 0.35)", strokeWidth: 1.5 },
        },
        currentEdges,
      ),
    )
  }

  function coordinateFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    return (
      reactFlowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? null
    )
  }

  function beginStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== "draw") {
      return
    }
    const point = coordinateFromEvent(event)
    if (!point) {
      return
    }
    strokeCounterRef.current += 1
    setActiveStroke({
      id: `stroke-${strokeCounterRef.current}`,
      points: [point],
    })
  }

  function appendStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== "draw" || !activeStroke) {
      return
    }
    const point = coordinateFromEvent(event)
    if (!point) {
      return
    }
    setActiveStroke((currentStroke) =>
      currentStroke
        ? {
            ...currentStroke,
            points: [...currentStroke.points, point],
          }
        : currentStroke,
    )
  }

  function endStroke() {
    if (mode !== "draw" || !activeStroke) {
      return
    }
    setStrokes((current) => [...current, activeStroke])
    setActiveStroke(null)
  }

  function clearMarkup() {
    setStrokes([])
    setActiveStroke(null)
  }

  async function sendMarkupReview() {
    const sessionId = activeSessionId()
    if (!sessionId || !hasMarkup) {
      return
    }
    const summary =
      "Use the visible canvas markup to refine the active UI direction and respond to the highlighted areas."
    try {
      await sendChatMessage(sessionId, summary)
      setChatDraft("")
      await fetchSessionSnapshot(sessionId)
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Markup send failed.",
      )
    }
  }

  async function submitChatDraft() {
    const sessionId = activeSessionId()
    const text = chatDraft.trim()
    if (!sessionId || !text) {
      return
    }
    try {
      await sendChatMessage(sessionId, text)
      setChatDraft("")
      await fetchSessionSnapshot(sessionId)
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Message send failed.",
      )
    }
  }

  useEffect(() => {
    const pendingPrompts = nodes.filter(
      (node): node is Node<PromptNodeData> =>
        node.data.kind === "prompt" &&
        node.data.state === "pending" &&
        Boolean(node.data.sessionId),
    )

    if (pendingPrompts.length === 0) {
      return
    }

    const intervalHandle = window.setInterval(() => {
      pendingPrompts.forEach((node) => {
        const sessionId = node.data.sessionId
        if (!sessionId || pollingSessionIdsRef.current.has(sessionId)) {
          return
        }
        pollingSessionIdsRef.current.add(sessionId)
        void fetchSessionSnapshot(sessionId)
          .then((snapshot) => {
            projectAssistantReply(node.id, snapshot)
          })
          .catch((error) => {
            setGlobalError(
              error instanceof Error
                ? error.message
                : "Session polling failed.",
            )
          })
          .finally(() => {
            pollingSessionIdsRef.current.delete(sessionId)
          })
      })
    }, 1500)

    return () => {
      window.clearInterval(intervalHandle)
    }
  }, [
    nodes,
    // biome-ignore lint/correctness/useExhaustiveDependencies: helper is intentionally recreated around ref-backed session state
    fetchSessionSnapshot,
    // biome-ignore lint/correctness/useExhaustiveDependencies: helper is intentionally recreated around ref-backed session state
    projectAssistantReply,
  ])

  useEffect(() => {
    const sessionId = activeSessionId()
    if (!sessionId) {
      return
    }

    const socketUrl = new URL(wsRootUrl)
    socketUrl.searchParams.set("sessionId", sessionId)
    const protocols = dashboardSessionWebSocketProtocols()
    let socket: WebSocket | null = null
    let disposed = false
    let reconnectAttempt = 0
    let reconnectTimer: number | null = null
    let warningTimer: number | null = null

    const updateSession = (
      updater: (current: ChatSessionState) => ChatSessionState,
    ) => {
      upsertChatSession(sessionId, updater)
    }

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
        updateSession((current) => ({
          ...current,
          wsStatus: "error",
          error: "Agent Chat WebSocket disconnected. Retrying…",
        }))
      }, websocketWarningDelayMs)
    }

    const connect = () => {
      if (disposed) {
        return
      }

      updateSession((current) => ({
        ...current,
        wsStatus: "connecting",
        error: "",
      }))
      socket =
        protocols.length > 0
          ? new WebSocket(socketUrl.toString(), protocols)
          : new WebSocket(socketUrl.toString())

      socket.addEventListener("open", () => {
        reconnectAttempt = 0
        clearReconnectTimer()
        clearWarningTimer()
        updateSession((current) => ({
          ...current,
          wsStatus: "ready",
          error: "",
        }))
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
          updateSession((current) => ({
            ...current,
            session: payload.session,
            messages: payload.messages,
            queuedMessages: payload.queuedMessages,
            activity: payload.activity,
            streamingAssistantText: "",
          }))
          projectAssistantReply(
            sessionId === activeSessionId() ? (selectedNodeId ?? "") : "",
            {
              ok: true,
              session: payload.session,
              messages: payload.messages,
              queuedMessages: payload.queuedMessages,
              activity: payload.activity,
            },
          )
          return
        }

        if (payload.type === "session.updated") {
          updateSession((current) => ({
            ...current,
            session: payload.session ?? current.session,
            messages: payload.messages,
            queuedMessages: payload.queuedMessages,
            activity: payload.activity,
            streamingAssistantText: payload.messages.some(
              (message) => message.role === "assistant",
            )
              ? ""
              : current.streamingAssistantText,
          }))
          return
        }

        if (payload.type === "run.started") {
          updateSession((current) => ({
            ...current,
            messages: payload.messages,
            queuedMessages: payload.queuedMessages,
            activity: payload.activity,
            streamingAssistantText: "",
          }))
          return
        }

        if (payload.type === "run.activity") {
          updateSession((current) => ({
            ...current,
            activity: payload.activity,
            queuedMessages: payload.queuedMessages,
          }))
          return
        }

        if (payload.type === "run.delta") {
          updateSession((current) => ({
            ...current,
            activity: { ...current.activity, status: "running" },
            streamingAssistantText:
              current.streamingAssistantText + payload.delta,
          }))
          return
        }

        if (
          payload.type === "run.completed" ||
          payload.type === "run.interrupted"
        ) {
          updateSession((current) => ({
            ...current,
            activity: payload.activity,
            streamingAssistantText:
              payload.type === "run.interrupted"
                ? ""
                : current.streamingAssistantText,
          }))
          return
        }

        if (payload.type === "run.failed") {
          updateSession((current) => ({
            ...current,
            activity: payload.activity,
            error: payload.error,
            streamingAssistantText: "",
          }))
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
          ]
        reconnectAttempt += 1
        reconnectTimer = window.setTimeout(connect, delayMs)
      })
    }

    connect()

    return () => {
      disposed = true
      clearReconnectTimer()
      clearWarningTimer()
      socket?.close()
    }
  }, [
    selectedNodeId,
    wsRootUrl,
    // biome-ignore lint/correctness/useExhaustiveDependencies: helper is intentionally recreated around ref-backed session state
    activeSessionId,
    // biome-ignore lint/correctness/useExhaustiveDependencies: helper is intentionally recreated around ref-backed session state
    projectAssistantReply,
    // biome-ignore lint/correctness/useExhaustiveDependencies: helper is intentionally recreated around ref-backed session state
    upsertChatSession,
  ])

  const selectedNode = selectedNodeId
    ? (nodes.find((node) => node.id === selectedNodeId) ?? null)
    : null
  const linkedSessionId = activeSessionId()
  const linkedSession = linkedSessionId
    ? (chatSessions[linkedSessionId] ?? defaultChatSessionState())
    : null
  const transcriptMessages =
    linkedSession?.messages.filter(
      (message) => message.kind !== "streamCheckpoint",
    ) ?? []

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,#0e1116,#040506)] text-stone-100">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas surface uses double-click for prompt creation while remaining non-focusable */}
      <div
        className="absolute inset-0"
        role="presentation"
        onDoubleClick={handlePaneDoubleClick}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onSelectionChange={({ nodes: selectedNodes }) => {
            const nextSelectedId = selectedNodes[0]?.id ?? null
            setSelectedNodeId(nextSelectedId)
            const nextSelectedNode = nextSelectedId
              ? (nodesRef.current.find((node) => node.id === nextSelectedId) ??
                null)
              : null
            const nextSessionId = nodeSessionId(nextSelectedNode)
            if (nextSessionId) {
              setLastSessionId(nextSessionId)
            }
          }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={1.6}
          zoomOnDoubleClick={false}
          onInit={(instance) => {
            reactFlowRef.current = instance
            const nextViewport = instance.getViewport()
            viewportRef.current = nextViewport
            setViewport(nextViewport)
          }}
          onMove={(_, nextViewport) => {
            viewportRef.current = nextViewport
            setViewport(nextViewport)
          }}
          className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.08),transparent_18%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(10,10,10,1))]"
          proOptions={{ hideAttribution: true }}
          selectionOnDrag={mode !== "draw"}
          panOnDrag={mode !== "draw"}
        >
          <Background color="rgba(245, 158, 11, 0.12)" gap={24} size={1.2} />
          <MiniMap
            pannable
            zoomable
            className="!bg-stone-950/95 !border !border-stone-700/70"
            maskColor="rgba(17, 24, 39, 0.62)"
          />
          <Controls className="!bg-stone-950/95 !border !border-stone-700/70 !shadow-none" />
        </ReactFlow>
        <svg
          aria-label="Canvas markup overlay"
          className={`absolute inset-0 z-20 h-full w-full ${mode === "draw" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
          onPointerDown={beginStroke}
          onPointerMove={appendStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
        >
          <title>Canvas markup overlay</title>
          <g
            transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
          >
            {strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={dashedPath(stroke.points)}
                fill="none"
                stroke="rgba(250, 204, 21, 0.92)"
                strokeWidth={4 / viewport.zoom}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {activeStroke ? (
              <path
                d={dashedPath(activeStroke.points)}
                fill="none"
                stroke="rgba(250, 204, 21, 0.92)"
                strokeWidth={4 / viewport.zoom}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </g>
        </svg>
      </div>
      <FloatingPanel
        panelId="controls"
        title="Canvas controls"
        subtitle="Double-click empty space for a prompt node. Draw mode annotates the whole board viewport."
        position={panelPositions.controls}
        onMove={updatePanelPosition}
      >
        <div className="flex flex-wrap gap-2">
          {(["navigate", "draw"] as CanvasMode[]).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => setMode(nextMode)}
              className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] ${
                mode === nextMode
                  ? "border-amber-300/55 bg-amber-300/14 text-amber-50"
                  : "border-stone-700/80 bg-stone-900/80 text-stone-300 hover:bg-stone-800/80"
              }`}
            >
              {nextMode}
            </button>
          ))}
          <button
            type="button"
            onClick={sendMarkupReview}
            disabled={!hasMarkup || !linkedSessionId}
            className="rounded-full border border-sky-300/45 bg-sky-300/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send markup
          </button>
          <button
            type="button"
            onClick={clearMarkup}
            disabled={!hasMarkup && !activeStroke}
            className="rounded-full border border-stone-700/80 bg-stone-900/80 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear overlay
          </button>
        </div>
        <div className="mt-4 rounded-[20px] border border-stone-800/80 bg-stone-900/80 px-3 py-3 text-xs leading-5 text-stone-400">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
            Current agent status
          </div>
          <div className="mt-2">
            {linkedSession?.activity.status === "running"
              ? "Agent is responding in the linked chat session."
              : linkedSession?.activity.status === "queued"
                ? "Agent turn is queued in the linked chat session."
                : linkedSession?.error || globalError || "Idle"}
          </div>
        </div>
      </FloatingPanel>
      <FloatingPanel
        panelId="chat"
        title="Background conversation"
        subtitle="This panel is backed by the real Agent Chat session linked to the selected prompt or variant."
        position={panelPositions.chat}
        onMove={updatePanelPosition}
        widthClass="w-[420px]"
      >
        {linkedSessionId ? (
          <>
            <div className="mb-3 flex items-center justify-between rounded-[20px] border border-stone-800/80 bg-stone-900/80 px-3 py-2 text-xs text-stone-400">
              <span className="truncate">
                {linkedSession?.session?.title ?? "Canvas session"}
              </span>
              <span className="uppercase tracking-[0.2em] text-stone-500">
                {linkedSession?.wsStatus ?? "idle"} /{" "}
                {linkedSession?.activity.status ?? "idle"}
              </span>
            </div>
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {transcriptMessages.map((message) => {
                const text = extractMessageText(message)
                return (
                  <div
                    key={message.id}
                    className={`rounded-[24px] border px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-50"
                        : message.role === "assistant"
                          ? "border-sky-400/25 bg-sky-500/10 text-sky-50"
                          : "border-stone-700/75 bg-stone-900/80 text-stone-300"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] opacity-70">
                      <span>{message.role}</span>
                      <span>{timestampLabel(message.createdAtMs)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{text || "[empty]"}</p>
                  </div>
                )
              })}
              {linkedSession?.streamingAssistantText ? (
                <div className="rounded-[24px] border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-50">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.22em] opacity-70">
                    assistant streaming
                  </div>
                  <p className="whitespace-pre-wrap">
                    {linkedSession.streamingAssistantText}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-4">
              <textarea
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void submitChatDraft()
                  }
                }}
                className="h-24 w-full resize-none rounded-[20px] border border-stone-800/90 bg-stone-900/90 px-4 py-3 text-sm leading-6 text-stone-100 outline-none placeholder:text-stone-500"
                placeholder="Continue the linked agent-chat session."
              />
              <div className="mt-3 flex items-center justify-between text-xs text-stone-400">
                <span>Each prompt node gets its own backing chat session.</span>
                <button
                  type="button"
                  onClick={() => void submitChatDraft()}
                  disabled={!chatDraft.trim()}
                  className="rounded-full border border-amber-300/45 bg-amber-300/14 px-3 py-1.5 font-medium text-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm leading-6 text-stone-400">
            Double-click the canvas to create a prompt node. A real Agent Chat
            session is created immediately and this panel follows the selected
            canvas thread.
          </p>
        )}
      </FloatingPanel>
      <FloatingPanel
        panelId="selection"
        title="Selection"
        subtitle="Selected node context and linked session identity."
        position={panelPositions.selection}
        onMove={updatePanelPosition}
      >
        {selectedNode ? (
          <div className="space-y-3 text-sm text-stone-300">
            <div className="font-medium text-white">{selectedNode.id}</div>
            <div className="rounded-[18px] border border-stone-800/80 bg-stone-950/75 px-3 py-2 text-xs leading-5">
              {selectedNode.data.kind === "variant"
                ? selectedNode.data.summary
                : selectedNode.data.kind === "comment"
                  ? selectedNode.data.body
                  : selectedNode.data.text}
            </div>
            <div className="rounded-[18px] border border-stone-800/80 bg-stone-900/70 px-3 py-2 text-xs leading-5 text-stone-400">
              Linked chat: {nodeSessionId(selectedNode) ?? "none"}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-400">
            Select a node to inspect its linked chat session and current
            summary.
          </p>
        )}
      </FloatingPanel>
    </div>
  )
}
