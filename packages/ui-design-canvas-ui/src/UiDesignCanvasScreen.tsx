import { useEffect, useMemo, useRef, useState } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";

type PromptLifecycle = "draft" | "pending" | "commented" | "generated" | "failed";
type VariantStatus = "idea" | "refined" | "candidate";
type CanvasMode = "select" | "prompt" | "draw";
type AgentAction = "comment" | "generate_variant";

type ChatMessage = {
  id: string;
  role: "human" | "agent" | "system";
  text: string;
  tone?: "comment" | "generate";
  timestampLabel: string;
};

type PromptNodeData = {
  kind: "prompt";
  text: string;
  state: PromptLifecycle;
};

type DraftPromptNodeData = {
  kind: "draft";
  text: string;
  onChange(nextText: string): void;
  onSubmit(): void;
  onCancel(): void;
};

type CommentNodeData = {
  kind: "comment";
  title: string;
  body: string;
};

type VariantNodeData = {
  kind: "variant";
  title: string;
  summary: string;
  status: VariantStatus;
  promptText: string;
};

type CanvasNodeData =
  | PromptNodeData
  | DraftPromptNodeData
  | CommentNodeData
  | VariantNodeData;

type Stroke = {
  id: string;
  points: Array<{ x: number; y: number }>;
};

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
];

const initialEdges: Edge[] = [
  {
    id: "seed-edge-1",
    source: "seed-variant-1",
    target: "seed-variant-2",
    type: "smoothstep",
    animated: false,
    style: { stroke: "rgba(245, 158, 11, 0.35)", strokeWidth: 1.5 },
  },
];

function timestampLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dashedPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function promptStateClasses(state: PromptLifecycle): string {
  if (state === "pending") {
    return "border-amber-400/60 bg-amber-500/10 text-amber-50";
  }
  if (state === "commented") {
    return "border-sky-400/55 bg-sky-500/10 text-sky-50";
  }
  if (state === "generated") {
    return "border-emerald-400/55 bg-emerald-500/10 text-emerald-50";
  }
  if (state === "failed") {
    return "border-rose-400/60 bg-rose-500/10 text-rose-50";
  }
  return "border-stone-600/70 bg-stone-900/92 text-stone-100";
}

function variantStatusClasses(status: VariantStatus): string {
  if (status === "candidate") {
    return "border-emerald-400/45 bg-emerald-400/12 text-emerald-100";
  }
  if (status === "refined") {
    return "border-sky-400/45 bg-sky-400/12 text-sky-100";
  }
  return "border-amber-300/45 bg-amber-300/12 text-amber-100";
}

function DesignNode({ data, selected }: NodeProps<CanvasNodeData>) {
  if (data.kind === "draft") {
    return <DraftPromptCard data={data} selected={selected} />;
  }
  if (data.kind === "prompt") {
    return <PromptCard data={data} selected={selected} />;
  }
  if (data.kind === "comment") {
    return <CommentCard data={data} selected={selected} />;
  }
  return <VariantCard data={data} selected={selected} />;
}

function DraftPromptCard({
  data,
  selected,
}: {
  data: DraftPromptNodeData;
  selected: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className={`nodrag min-w-[300px] max-w-[360px] rounded-[28px] border bg-stone-950/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur ${
        selected ? "border-amber-300/70" : "border-stone-700/90"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
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
            event.preventDefault();
            data.onSubmit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            data.onCancel();
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
  );
}

function PromptCard({
  data,
  selected,
}: {
  data: PromptNodeData;
  selected: boolean;
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
  );
}

function CommentCard({
  data,
  selected,
}: {
  data: CommentNodeData;
  selected: boolean;
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
  );
}

function VariantCard({
  data,
  selected,
}: {
  data: VariantNodeData;
  selected: boolean;
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
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${variantStatusClasses(data.status)}`}>
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
  );
}

function classifyPrompt(text: string): AgentAction {
  const normalized = text.trim().toLowerCase();
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
  ];
  return generationSignals.some((token) => normalized.includes(token))
    ? "generate_variant"
    : "comment";
}

function summarizeVariantTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const clipped = normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
  return clipped || "New design variant";
}

function buildAgentComment(text: string, hasMarkup: boolean): string {
  const fragments = [
    "Keep this at direction level: hierarchy, tone, rhythm, and framing before component details.",
    "Use the current prompt as the anchor and treat the next change as a branch, not a replacement.",
  ];
  if (hasMarkup) {
    fragments.push("The visible markup reads like spatial feedback, so I would respond to the drawn emphasis before adding new structure.");
  }
  if (text.toLowerCase().includes("premium")) {
    fragments.push("Premium usually means stronger type contrast, less chrome, and more decisive spacing rather than more visual noise.");
  }
  return fragments.join(" ");
}

function buildVariantSummary(text: string, hasMarkup: boolean): string {
  const lead = hasMarkup
    ? "Derived from the marked-up area with a clearer focal zone and tighter visual hierarchy."
    : "Derived from the prompt as a new branch rather than a destructive edit.";
  const normalized = text.trim();
  return `${lead} Focus: ${normalized || "high-level design direction"}.`;
}

export function UiDesignCanvasScreen() {
  const reactFlowRef = useRef<ReactFlowInstance<CanvasNodeData, Edge> | null>(null);
  const canvasBoundsRef = useRef<HTMLDivElement | null>(null);
  const strokeCounterRef = useRef(0);
  const nodeCounterRef = useRef(2);
  const edgeCounterRef = useRef(1);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "system-welcome",
      role: "system",
      text: "Double-click anywhere on the canvas to drop a prompt node. Draw mode lets you mark up the current board before sending feedback.",
      timestampLabel: timestampLabel(),
    },
  ]);
  const [agentStatus, setAgentStatus] = useState("Idle");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [lastPromptId, setLastPromptId] = useState<string | null>(null);

  const hasMarkup = strokes.length > 0;

  const nodeTypes = useMemo(
    () => ({
      designNode: DesignNode,
    }),
    [],
  );

  function nextNodeId(prefix: string): string {
    nodeCounterRef.current += 1;
    return `${prefix}-${nodeCounterRef.current}`;
  }

  function nextEdgeId(): string {
    edgeCounterRef.current += 1;
    return `edge-${edgeCounterRef.current}`;
  }

  function removeNode(nodeId: string) {
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId));
  }

  function updateNodeData(nodeId: string, nextData: CanvasNodeData) {
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === nodeId ? { ...node, data: nextData } : node)),
    );
  }

  function setPromptState(nodeId: string, state: PromptLifecycle) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId && node.data.kind === "prompt"
          ? { ...node, data: { ...node.data, state } }
          : node,
      ),
    );
  }

  function createDraftPrompt(position: { x: number; y: number }) {
    const draftId = nextNodeId("draft");
    const draftData: DraftPromptNodeData = {
      kind: "draft",
      text: "",
      onChange(nextText) {
        updateNodeData(draftId, { ...draftData, text: nextText });
      },
      onSubmit() {
        void submitDraftPrompt(draftId);
      },
      onCancel() {
        removeNode(draftId);
      },
    };
    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: draftId,
        type: "designNode",
        position,
        data: draftData,
      },
    ]);
    setSelectedNodeId(draftId);
  }

  async function submitDraftPrompt(draftId: string) {
    const draftNode = nodes.find((node) => node.id === draftId);
    if (!draftNode || draftNode.data.kind !== "draft") {
      return;
    }

    const text = draftNode.data.text.trim();
    if (!text) {
      removeNode(draftId);
      return;
    }

    const promptId = nextNodeId("prompt");
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
    );
    setSelectedNodeId(promptId);
    setLastPromptId(promptId);
    setChatMessages((current) => [
      ...current,
      {
        id: `chat-${promptId}-human`,
        role: "human",
        text,
        timestampLabel: timestampLabel(),
      },
    ]);
    setAgentStatus("Reading prompt and visible canvas context");

    window.setTimeout(() => {
      const action = classifyPrompt(text);
      const promptNode = reactFlowRef.current?.getNode(promptId);
      const promptPosition = promptNode?.position ?? draftNode.position;

      if (action === "comment") {
        const commentId = nextNodeId("comment");
        const commentBody = buildAgentComment(text, hasMarkup);
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
        ]);
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
        ]);
        setPromptState(promptId, "commented");
        setChatMessages((current) => [
          ...current,
          {
            id: `chat-${commentId}-agent`,
            role: "agent",
            text: commentBody,
            tone: "comment",
            timestampLabel: timestampLabel(),
          },
        ]);
        setAgentStatus("Commented on prompt");
        return;
      }

      const variantId = nextNodeId("variant");
      const variantTitle = summarizeVariantTitle(text);
      const variantSummary = buildVariantSummary(text, hasMarkup);
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
      ]);
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
      ]);
      setPromptState(promptId, "generated");
      setChatMessages((current) => [
        ...current,
        {
          id: `chat-${variantId}-agent`,
          role: "agent",
          text: `Created a new variant branch: ${variantTitle}. ${variantSummary}`,
          tone: "generate",
          timestampLabel: timestampLabel(),
        },
      ]);
      setAgentStatus("Generated a variant branch");
    }, 950);
  }

  function handlePaneDoubleClick(event: React.MouseEvent<Element, MouseEvent>) {
    if (mode === "draw") {
      return;
    }
    const position = reactFlowRef.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (!position) {
      return;
    }
    createDraftPrompt(position);
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
    );
  }

  function coordinateFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = canvasBoundsRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function beginStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== "draw") {
      return;
    }
    const point = coordinateFromEvent(event);
    if (!point) {
      return;
    }
    strokeCounterRef.current += 1;
    setActiveStroke({
      id: `stroke-${strokeCounterRef.current}`,
      points: [point],
    });
  }

  function appendStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== "draw" || !activeStroke) {
      return;
    }
    const point = coordinateFromEvent(event);
    if (!point) {
      return;
    }
    setActiveStroke((currentStroke) =>
      currentStroke
        ? {
            ...currentStroke,
            points: [...currentStroke.points, point],
          }
        : currentStroke,
    );
  }

  function endStroke() {
    if (mode !== "draw" || !activeStroke) {
      return;
    }
    setStrokes((current) => [...current, activeStroke]);
    setActiveStroke(null);
  }

  function clearMarkup() {
    setStrokes([]);
    setActiveStroke(null);
  }

  function sendMarkupReview() {
    if (!hasMarkup) {
      return;
    }
    const promptId = lastPromptId ?? selectedNodeId;
    const summary = promptId
      ? "Use the visible markup to refine the active direction and tighten the focal points."
      : "Use the visible markup to explain what should change and what deserves a new branch.";
    setChatMessages((current) => [
      ...current,
      {
        id: `chat-markup-${Date.now()}`,
        role: "human",
        text: summary,
        timestampLabel: timestampLabel(),
      },
    ]);
    setAgentStatus("Reading markup overlay");
    window.setTimeout(() => {
      const response = buildAgentComment(summary, true);
      setChatMessages((current) => [
        ...current,
        {
          id: `chat-markup-agent-${Date.now()}`,
          role: "agent",
          text: response,
          tone: "comment",
          timestampLabel: timestampLabel(),
        },
      ]);
      setAgentStatus("Commented from markup review");
    }, 900);
  }

  const selectedNode = selectedNodeId
    ? nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_24%),linear-gradient(180deg,#111212,#050505)] text-stone-100">
      <div className="border-b border-stone-800/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-100 inline-flex">
              UI Design Canvas
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-white">
              Spatial prompts, design variants, and markup-driven critique
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              Double-click the canvas to drop a text prompt. The background agent responds in the review feed and either comments on the direction or generates a new high-level design branch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["select", "prompt", "draw"] as CanvasMode[]).map((nextMode) => (
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
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[540px] border-b border-stone-800/70 xl:border-b-0 xl:border-r" ref={canvasBoundsRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onSelectionChange={({ nodes: selectedNodes }) => {
              setSelectedNodeId(selectedNodes[0]?.id ?? null);
            }}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.35}
            maxZoom={1.4}
            onInit={(instance) => {
              reactFlowRef.current = instance;
            }}
            onDoubleClick={handlePaneDoubleClick}
            className="bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.08),transparent_18%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(10,10,10,1))]"
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
            className={`absolute inset-0 z-20 ${mode === "draw" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
            onPointerDown={beginStroke}
            onPointerMove={appendStroke}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
          >
            {strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={dashedPath(stroke.points)}
                fill="none"
                stroke="rgba(250, 204, 21, 0.92)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {activeStroke ? (
              <path
                d={dashedPath(activeStroke.points)}
                fill="none"
                stroke="rgba(250, 204, 21, 0.92)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>
          <div className="pointer-events-none absolute bottom-4 left-4 z-30 max-w-sm rounded-[24px] border border-stone-700/75 bg-stone-950/92 px-4 py-3 text-xs text-stone-300 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
              Current agent status
            </div>
            <p className="mt-2 leading-5">{agentStatus}</p>
          </div>
        </div>
        <aside className="flex min-h-0 flex-col bg-stone-950/92">
          <div className="border-b border-stone-800/70 px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500">
              Review Feed
            </div>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Background conversation
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              This vertical slice keeps the transcript visible beside the canvas while the feature projects comments and variant branches back into the board.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
          <div className="border-t border-stone-800/70 px-5 py-4">
            <div className="rounded-[24px] border border-stone-800/80 bg-stone-900/80 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                Selection
              </div>
              {selectedNode ? (
                <div className="mt-3 space-y-2 text-sm text-stone-300">
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
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  Select a node to inspect its current summary. In draw mode, use the overlay to mark up the current composition before sending feedback.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
