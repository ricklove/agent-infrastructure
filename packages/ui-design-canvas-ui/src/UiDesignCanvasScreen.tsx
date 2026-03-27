import { useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "reactflow"
import "reactflow/dist/style.css"

type PromptLifecycle = "draft" | "pending" | "commented" | "generated" | "failed"
type VariantStatus = "idea" | "refined" | "candidate"
type CanvasMode = "navigate" | "draw"
type AgentAction = "comment" | "generate_variant"
type PanelId = "tools" | "feed" | "selection"

type ChatMessage = {
  id: string
  role: "human" | "agent" | "system"
  text: string
  tone?: "comment" | "generate"
  timestampLabel: string
}

type PromptNodeData = {
  kind: "prompt"
  text: string
  state: PromptLifecycle
}

type DraftPromptNodeData = {
  kind: "draft"
  text: string
  onChange(nextText: string): void
  onSubmit(): void
  onCancel(): void
}

type CommentNodeData = {
  kind: "comment"
  title: string
  body: string
}

type VariantNodeData = {
  kind: "variant"
  title: string
  summary: string
  status: VariantStatus
  promptText: string
}

type CanvasNodeData =
  | PromptNodeData
  | DraftPromptNodeData
  | CommentNodeData
  | VariantNodeData

type Stroke = {
  id: string
  points: Array<{ x: number; y: number }>
}

type PanelPosition = { x: number; y: number }
type PanelPositions = Record<PanelId, PanelPosition>
type DragState = { panelId: PanelId; offsetX: number; offsetY: number } | null

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
    },
  },
  {
    id: "seed-variant-2",
    type: "designNode",
    position: { x: 480, y: 220 },
    data: {
      kind: "variant",
      title: "Operations Board Direction",
      summary: "Dense status cards, command rail, and multi-panel layout.",
      status: "idea",
      promptText: "Seed concept",
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

function timestampLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

function pathForPoints(points: Array<{ x: number; y: number }>): string {
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
  if (state === "failed") {
    return "border-rose-400/60 bg-rose-500/10 text-rose-50"
  }
  return "border-stone-600/70 bg-stone-900/92 text-stone-100"
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

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className={`nodrag min-w-[300px] max-w-[360px] rounded-[28px] border bg-stone-950/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur ${
        selected ? "border-amber-300/70" : "border-stone-700/90"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="rounded-full border border-amber-300/35 bg-amber-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
          Prompt Draft
        </span>
        <span className="text-[10px] uppercase tracking-[0.24em] text-stone-500">
          Enter submits
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
        className="h-28 w-full resize-none rounded-[20px] border border-stone-700/80 bg-stone-900/85 px-4 py-3 text-sm leading-6 text-stone-100 outline-none placeholder:text-stone-500"
        placeholder="Describe a direction, sketch note, or ask the agent what to change."
      />
      <div className="mt-3 flex items-center justify-between text-xs text-stone-400">
        <span>Shift+Enter for newline</span>
        <button
          type="button"
          onClick={data.onSubmit}
          className="rounded-full border border-amber-300/45 bg-amber-300/14 px-3 py-1.5 font-medium text-amber-50 hover:bg-amber-300/20"
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
      className={`min-w-[280px] max-w-[340px] rounded-[28px] border border-sky-400/40 bg-sky-950/55 p-4 text-sky-50 shadow-[0_20px_72px_rgba(0,0,0,0.26)] ${
        selected ? "ring-1 ring-sky-300/60" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full border border-sky-300/30 bg-sky-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-100">
          Comment Thread
        </span>
        <span className="text-[10px] uppercase tracking-[0.24em] text-sky-200/65">
          projected
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
      className={`min-w-[320px] max-w-[360px] overflow-hidden rounded-[30px] border border-stone-700/85 bg-stone-950/96 text-stone-100 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ${
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
          <h3 className="mt-4 text-base font-semibold text-white">{data.title}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-300">{data.summary}</p>
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
              <div className="h-20 rounded-[18px] border border-amber-300/14 bg-amber-300/8" />
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
  title,
  eyebrow,
  position,
  widthClass,
  onDragStart,
  children,
}: {
  title: string
  eyebrow: string
  position: PanelPosition
  widthClass: string
  onDragStart(event: React.PointerEvent<HTMLDivElement>): void
  children: React.ReactNode
}) {
  return (
    <section
      className={`pointer-events-auto absolute z-30 overflow-hidden rounded-[26px] border border-stone-700/80 bg-stone-950/90 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur ${widthClass}`}
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="cursor-grab border-b border-stone-800/80 bg-stone-950/95 px-4 py-3 active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/80">
              {eyebrow}
            </div>
            <h2 className="mt-1 text-sm font-semibold text-white">{title}</h2>
          </div>
          <div className="rounded-full border border-stone-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-stone-500">
            Drag
          </div>
        </div>
      </div>
      {children}
    </section>
  )
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
  const clipped = normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized
  return clipped || "New design variant"
}

function buildAgentComment(text: string, hasMarkup: boolean): string {
  const fragments = [
    "Keep this at direction level: hierarchy, tone, rhythm, and framing before component details.",
    "Use the current prompt as the anchor and treat the next change as a branch, not a replacement.",
  ]
  if (hasMarkup) {
    fragments.push(
      "The visible markup reads like spatial feedback, so I would respond to the drawn emphasis before adding new structure.",
    )
  }
  if (text.toLowerCase().includes("premium")) {
    fragments.push(
      "Premium usually means stronger type contrast, less chrome, and more decisive spacing rather than more visual noise.",
    )
  }
  return fragments.join(" ")
}

function buildVariantSummary(text: string, hasMarkup: boolean): string {
  const lead = hasMarkup
    ? "Derived from the marked-up area with a clearer focal zone and tighter visual hierarchy."
    : "Derived from the prompt as a new branch rather than a destructive edit."
  const normalized = text.trim()
  return `${lead} Focus: ${normalized || "high-level design direction"}.`
}

function initialPanelPositions(width: number, height: number): PanelPositions {
  return {
    tools: { x: 24, y: 24 },
    feed: { x: Math.max(24, width - 404), y: 24 },
    selection: { x: Math.max(24, width - 344), y: Math.max(116, height - 236) },
  }
}

export function UiDesignCanvasScreen() {
  const reactFlowRef = useRef<ReactFlowInstance<CanvasNodeData, Edge> | null>(null)
  const canvasRootRef = useRef<HTMLDivElement | null>(null)
  const strokeCounterRef = useRef(0)
  const nodeCounterRef = useRef(2)
  const edgeCounterRef = useRef(1)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [mode, setMode] = useState<CanvasMode>("navigate")
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "system-welcome",
      role: "system",
      text: "Double-click empty canvas space to drop a prompt node. Draw mode lets you mark up the board and send screenshot-guided critique.",
      timestampLabel: timestampLabel(),
    },
  ])
  const [agentStatus, setAgentStatus] = useState("Idle")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [lastPromptId, setLastPromptId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [panelPositions, setPanelPositions] = useState<PanelPositions | null>(null)
  const [dragState, setDragState] = useState<DragState>(null)

  const hasMarkup = strokes.length > 0

  const nodeTypes = useMemo(
    () => ({
      designNode: DesignNode,
    }),
    [],
  )

  useEffect(() => {
    const root = canvasRootRef.current
    if (!root || panelPositions) {
      return
    }
    const bounds = root.getBoundingClientRect()
    setPanelPositions(initialPanelPositions(bounds.width, bounds.height))
  }, [panelPositions])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const activeDrag = dragState

    function handlePointerMove(event: PointerEvent) {
      const root = canvasRootRef.current
      if (!root) {
        return
      }
      const bounds = root.getBoundingClientRect()
      setPanelPositions((current) => {
        if (!current) {
          return current
        }
        const nextX = Math.min(
          Math.max(12, event.clientX - bounds.left - activeDrag.offsetX),
          Math.max(12, bounds.width - 220),
        )
        const nextY = Math.min(
          Math.max(12, event.clientY - bounds.top - activeDrag.offsetY),
          Math.max(12, bounds.height - 84),
        )
        return {
          ...current,
          [activeDrag.panelId]: {
            x: nextX,
            y: nextY,
          },
        }
      })
    }

    function handlePointerUp() {
      setDragState(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [dragState])

  function nextNodeId(prefix: string): string {
    nodeCounterRef.current += 1
    return `${prefix}-${nodeCounterRef.current}`
  }

  function nextEdgeId(): string {
    edgeCounterRef.current += 1
    return `edge-${edgeCounterRef.current}`
  }

  function removeNode(nodeId: string) {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId))
  }

  function updateNodeData(nodeId: string, nextData: CanvasNodeData) {
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === nodeId ? { ...node, data: nextData } : node)),
    )
  }

  function setPromptState(nodeId: string, state: PromptLifecycle) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId && node.data.kind === "prompt"
          ? { ...node, data: { ...node.data, state } }
          : node,
      ),
    )
  }

  function createDraftPrompt(position: { x: number; y: number }) {
    const draftId = nextNodeId("draft")
    const draftData: DraftPromptNodeData = {
      kind: "draft",
      text: "",
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
  }

  async function submitDraftPrompt(draftId: string) {
    const draftNode = nodes.find((node) => node.id === draftId)
    if (!draftNode || draftNode.data.kind !== "draft") {
      return
    }

    const text = draftNode.data.text.trim()
    if (!text) {
      removeNode(draftId)
      return
    }

    const promptId = nextNodeId("prompt")
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
              } satisfies PromptNodeData,
            }
          : node,
      ),
    )
    setSelectedNodeId(promptId)
    setLastPromptId(promptId)
    setChatMessages((current) => [
      ...current,
      {
        id: `chat-${promptId}-human`,
        role: "human",
        text,
        timestampLabel: timestampLabel(),
      },
    ])
    setAgentStatus("Reading prompt and visible canvas context")

    window.setTimeout(() => {
      const action = classifyPrompt(text)
      const promptNode = reactFlowRef.current?.getNode(promptId)
      const promptPosition = promptNode?.position ?? draftNode.position

      if (action === "comment") {
        const commentId = nextNodeId("comment")
        const commentBody = buildAgentComment(text, hasMarkup)
        setNodes((currentNodes) => [
          ...currentNodes,
          {
            id: commentId,
            type: "designNode",
            position: { x: promptPosition.x + 360, y: promptPosition.y - 24 },
            data: {
              kind: "comment",
              title: "Background critique",
              body: commentBody,
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
        setPromptState(promptId, "commented")
        setChatMessages((current) => [
          ...current,
          {
            id: `chat-${commentId}-agent`,
            role: "agent",
            text: commentBody,
            tone: "comment",
            timestampLabel: timestampLabel(),
          },
        ])
        setAgentStatus("Commented on prompt")
        return
      }

      const variantId = nextNodeId("variant")
      const variantTitle = summarizeVariantTitle(text)
      const variantSummary = buildVariantSummary(text, hasMarkup)
      setNodes((currentNodes) => [
        ...currentNodes,
        {
          id: variantId,
          type: "designNode",
          position: { x: promptPosition.x + 380, y: promptPosition.y + 16 },
          data: {
            kind: "variant",
            title: variantTitle,
            summary: variantSummary,
            status: hasMarkup ? "refined" : "idea",
            promptText: text,
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
      setPromptState(promptId, "generated")
      setChatMessages((current) => [
        ...current,
        {
          id: `chat-${variantId}-agent`,
          role: "agent",
          text: `Created a new variant branch: ${variantTitle}. ${variantSummary}`,
          tone: "generate",
          timestampLabel: timestampLabel(),
        },
      ])
      setAgentStatus("Generated a variant branch")
    }, 950)
  }

  function handlePaneDoubleClick(event: React.MouseEvent<Element, MouseEvent>) {
    if (mode === "draw") {
      return
    }
    if (!(event.target instanceof Element) || !event.target.closest(".react-flow__pane")) {
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

  function flowPointFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    return reactFlowRef.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    }) ?? null
  }

  function beginStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== "draw") {
      return
    }
    const point = flowPointFromEvent(event)
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
    const point = flowPointFromEvent(event)
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

  function sendMarkupReview() {
    if (!hasMarkup) {
      return
    }
    const promptId = lastPromptId ?? selectedNodeId
    const summary = promptId
      ? "Use the visible markup to refine the active direction and tighten the focal points."
      : "Use the visible markup to explain what should change and what deserves a new branch."
    setChatMessages((current) => [
      ...current,
      {
        id: `chat-markup-${Date.now()}`,
        role: "human",
        text: summary,
        timestampLabel: timestampLabel(),
      },
    ])
    setAgentStatus("Reading markup overlay")
    window.setTimeout(() => {
      const response = buildAgentComment(summary, true)
      setChatMessages((current) => [
        ...current,
        {
          id: `chat-markup-agent-${Date.now()}`,
          role: "agent",
          text: response,
          tone: "comment",
          timestampLabel: timestampLabel(),
        },
      ])
      setAgentStatus("Commented from markup review")
    }, 900)
  }

  function startPanelDrag(panelId: PanelId, event: React.PointerEvent<HTMLDivElement>) {
    const root = canvasRootRef.current
    const panel = event.currentTarget.parentElement
    if (!root || !panel) {
      return
    }
    const rootBounds = root.getBoundingClientRect()
    const panelBounds = panel.getBoundingClientRect()
    setDragState({
      panelId,
      offsetX: event.clientX - panelBounds.left,
      offsetY: event.clientY - panelBounds.top,
    })
    setPanelPositions((current) =>
      current ?? initialPanelPositions(rootBounds.width, rootBounds.height),
    )
  }

  const selectedNode = selectedNodeId
    ? nodes.find((node) => node.id === selectedNodeId) ?? null
    : null

  return (
    <div
      ref={canvasRootRef}
      className="relative h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_20%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_24%),linear-gradient(180deg,#111212,#050505)] text-stone-100"
    >
      <div className="absolute inset-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onSelectionChange={({ nodes: selectedNodes }) => {
            setSelectedNodeId(selectedNodes[0]?.id ?? null)
          }}
          onMove={(_, nextViewport) => {
            setViewport(nextViewport)
          }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.35}
          maxZoom={1.4}
          zoomOnDoubleClick={false}
          onInit={(instance) => {
            reactFlowRef.current = instance
            setViewport(instance.getViewport())
          }}
          onDoubleClick={handlePaneDoubleClick}
          className="bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.08),transparent_18%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(10,10,10,1))]"
          proOptions={{ hideAttribution: true }}
          selectionOnDrag={mode !== "draw"}
          panOnDrag={mode !== "draw"}
          nodesDraggable={mode !== "draw"}
          elementsSelectable={mode !== "draw"}
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
      </div>

      <svg
        className={`absolute inset-0 z-20 ${mode === "draw" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
        onPointerDown={beginStroke}
        onPointerMove={appendStroke}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={pathForPoints(stroke.points)}
              fill="none"
              stroke="rgba(250, 204, 21, 0.92)"
              strokeWidth={4 / viewport.zoom}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {activeStroke ? (
            <path
              d={pathForPoints(activeStroke.points)}
              fill="none"
              stroke="rgba(250, 204, 21, 0.92)"
              strokeWidth={4 / viewport.zoom}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </g>
      </svg>

      {panelPositions ? (
        <>
          <FloatingPanel
            title="Canvas controls"
            eyebrow="UI Design Canvas"
            widthClass="w-[320px]"
            position={panelPositions.tools}
            onDragStart={(event) => startPanelDrag("tools", event)}
          >
            <div className="space-y-4 px-4 py-4">
              <p className="text-sm leading-6 text-stone-300">
                Double-click empty canvas space to create a focused prompt node immediately. Draw mode lets you annotate the board with zoom-aware SVG markup.
              </p>
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
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sendMarkupReview}
                  disabled={!hasMarkup}
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
              <div className="rounded-[20px] border border-stone-800/80 bg-stone-900/80 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
                  Agent status
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-300">{agentStatus}</p>
              </div>
            </div>
          </FloatingPanel>

          <FloatingPanel
            title="Background conversation"
            eyebrow="Review Feed"
            widthClass="w-[380px]"
            position={panelPositions.feed}
            onDragStart={(event) => startPanelDrag("feed", event)}
          >
            <div className="max-h-[360px] overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-[24px] border px-4 py-3 text-sm leading-6 ${
                      message.role === "human"
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-50"
                        : message.role === "agent"
                          ? message.tone === "generate"
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-50"
                            : "border-sky-400/25 bg-sky-500/10 text-sky-50"
                          : "border-stone-700/75 bg-stone-900/80 text-stone-300"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] opacity-70">
                      <span>{message.role}</span>
                      <span>{message.timestampLabel}</span>
                    </div>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </FloatingPanel>

          <FloatingPanel
            title="Selection"
            eyebrow="Inspector"
            widthClass="w-[320px]"
            position={panelPositions.selection}
            onDragStart={(event) => startPanelDrag("selection", event)}
          >
            <div className="px-4 py-4">
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
                </div>
              ) : (
                <p className="text-sm leading-6 text-stone-400">
                  Select a node to inspect it. In draw mode, mark up any visible area of the board and send that view back to the agent.
                </p>
              )}
            </div>
          </FloatingPanel>
        </>
      ) : null}
    </div>
  )
}
