import type {
  WorkbenchDocumentRecord,
  WorkbenchIntNodeRecord,
  WorkbenchNodeComponentProps,
  WorkbenchNodeRecord,
  WorkbenchNodeTypeDefinition,
  WorkbenchSnapshotResponse,
  WorkbenchSummary,
  WorkbenchTextNodeRecord,
} from "@agent-infrastructure/agent-workbench-protocol"
import {
  dashboardSessionFetch,
} from "@agent-infrastructure/dashboard-plugin"
import { useDashboardWindowLayer } from "@agent-infrastructure/dashboard-ui"
import {
  countEvent,
  useRenderCounter,
} from "@agent-infrastructure/render-diagnostics"
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type NodeChange,
  type Node,
  type NodeProps,
  Position,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
  type Viewport,
} from "reactflow"
import { WorkbenchNodeWrapper } from "./WorkbenchNodeWrapper"
import { reactflowStylesLoaded } from "./reactflow-style-runtime.js"
import {
  filterWorkbenchNodeTypes,
  getNextWorkbenchNodeTypeSelection,
  getWorkbenchNodeType,
  mergeWorkbenchNodeTypes,
  resolveWorkbenchNodeTypeSelection,
} from "./workbench-node-types"
import type { WorkbenchFlowNodeData } from "./workbench-types"

void reactflowStylesLoaded

type AddNodeMenuState = {
  clientX: number
  clientY: number
  menuLeft: number
  menuTop: number
  flowX: number
  flowY: number
  searchQuery: string
  selectedTypeId: WorkbenchNodeRecord["type"]
}

type PendingSaveState = {
  dirtyCycleActive: boolean
  pending: boolean
  saveInFlight: boolean
  timerId: number | null
  latestRecord: WorkbenchDocumentRecord | null
  currentPromise: Promise<void> | null
}

const controlsWindowId = "agent-workbench-files"
const autosaveIntervalMs = 5000
const createCooldownMs = 400
const fallbackSelectionNodeWidth = 220
const fallbackSelectionNodeHeight = 120

type WorkbenchControlsWindowProps = {
  workbench: WorkbenchDocumentRecord | null
  availableWorkbenches: WorkbenchSummary[]
  searchQuery: string
  loading: boolean
  creating: boolean
  saving: boolean
  error: string
  onSearchChange(value: string): void
  onLoadWorkbench(id: string): void
  onCreateWorkbench(): void
  onRenameWorkbench(id: string, nextId: string): void
}

type AddNodeMenuProps = {
  menu: AddNodeMenuState
  availableTypes: WorkbenchNodeTypeDefinition[]
  selectedTypeId: WorkbenchNodeRecord["type"] | null
  onSearchChange(value: string): void
  onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void
  onSelect(typeId: WorkbenchNodeRecord["type"]): void
  onConfirm(typeId: WorkbenchNodeRecord["type"]): void
}

function createNodeId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `node-${crypto.randomUUID()}`
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createWorkbenchId() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `workbench-${suffix}`
}

function formatUpdatedAt(updatedAtMs: number) {
  try {
    return new Date(updatedAtMs).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function workbenchReferenceSegment(
  workbench: Pick<WorkbenchSummary, "id">,
): string {
  return workbench.id
}

function WorkbenchIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 9.5h8" />
      <path d="M8 14.5h5" />
    </svg>
  )
}

function CopyIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function TextWorkbenchNode({
  record,
  selected,
  onRecordChange,
}: WorkbenchNodeComponentProps<WorkbenchTextNodeRecord>) {
  useRenderCounter("AgentWorkbenchScreen.TextWorkbenchNode")

  return (
    <div
      className={`h-full w-full overflow-hidden rounded-2xl border bg-white/95 shadow-lg transition ${
        selected ? "border-sky-500 shadow-sky-200/70" : "border-slate-300"
      }`}
    >
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
      />
      <textarea
        value={record.text}
        onChange={(event) =>
          onRecordChange({
            ...record,
            text: event.target.value,
          })
        }
        placeholder="Write here..."
        className="nodrag nopan nowheel h-full w-full resize-none rounded-2xl border-0 bg-transparent px-4 py-3 text-sm leading-6 text-slate-900 outline-none"
      />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
      />
    </div>
  )
}

function IntWorkbenchNode({
  record,
  selected,
  onRecordChange,
}: WorkbenchNodeComponentProps<WorkbenchIntNodeRecord>) {
  useRenderCounter("AgentWorkbenchScreen.IntWorkbenchNode")

  return (
    <div
      className={`h-full w-full overflow-hidden rounded-2xl border bg-white/95 shadow-lg transition ${
        selected ? "border-sky-500 shadow-sky-200/70" : "border-slate-300"
      }`}
    >
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
      />
      <div className="h-full min-w-[180px] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Integer
        </div>
        <input
          type="number"
          value={record.value}
          onChange={(event) =>
            onRecordChange({
              ...record,
              value: Math.trunc(Number(event.target.value) || 0),
            })
          }
          className="nodrag nopan nowheel mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-semibold text-slate-900 outline-none"
        />
      </div>
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
      />
    </div>
  )
}

const WorkbenchControlsWindow = memo(function WorkbenchControlsWindow(
  props: WorkbenchControlsWindowProps,
) {
  useRenderCounter("AgentWorkbenchScreen.WorkbenchControlsWindow")
  const [editingWorkbenchId, setEditingWorkbenchId] = useState<string | null>(
    null,
  )
  const [draftWorkbenchId, setDraftWorkbenchId] = useState("")
  const filteredWorkbenches = useMemo(() => {
    const query = props.searchQuery.trim().toLowerCase()
    if (!query) {
      return props.availableWorkbenches
    }
    return props.availableWorkbenches.filter((entry) => {
      const haystack = `${entry.title} ${entry.id} ${entry.path}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [props.availableWorkbenches, props.searchQuery])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-slate-100">
      <div className="space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
            Workbench Files
          </p>
          <p className="text-xs text-slate-400">
            {props.saving ? "Saving changes…" : "Autosave is active."}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onCreateWorkbench}
          disabled={props.creating || props.loading}
          className="w-full rounded-xl border border-cyan-300/30 bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.creating ? "Creating…" : "Create New Workbench"}
        </button>
        <input
          value={props.searchQuery}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Search workbench files"
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>

      {props.error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {props.error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/70 p-2">
        <div className="space-y-2">
          {filteredWorkbenches.map((entry) => {
            const selected = entry.id === props.workbench?.id
            const editing = editingWorkbenchId === entry.id
            return (
              <div
                key={entry.id}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-cyan-300/40 bg-cyan-300/15 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => props.onLoadWorkbench(entry.id)}
                    disabled={props.loading && selected}
                    className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {editing ? (
                      <input
                        value={draftWorkbenchId}
                        autoFocus
                        onChange={(event) => setDraftWorkbenchId(event.target.value)}
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onBlur={() => {
                          setEditingWorkbenchId(null)
                          props.onRenameWorkbench(entry.id, draftWorkbenchId)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            setEditingWorkbenchId(null)
                            props.onRenameWorkbench(entry.id, draftWorkbenchId)
                          } else if (event.key === "Escape") {
                            setEditingWorkbenchId(null)
                            setDraftWorkbenchId(entry.id)
                          }
                        }}
                        className="w-full rounded-lg border border-cyan-300/50 bg-slate-950/70 px-2 py-1 text-sm font-medium text-white outline-none"
                      />
                    ) : (
                      <div className="truncate text-sm font-medium">
                        {entry.id}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-slate-500">
                      {formatUpdatedAt(entry.updatedAtMs)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditingWorkbenchId(entry.id)
                      setDraftWorkbenchId(entry.id)
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 p-2 text-slate-300 transition hover:text-white"
                    title="Edit workbench file name"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
          {filteredWorkbenches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-500">
              No workbench files match this search.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})

const AddNodeMenu = memo(function AddNodeMenu(props: AddNodeMenuProps) {
  useRenderCounter("AgentWorkbenchScreen.AddNodeMenu")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    const focusInput = () => {
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== inputRef.current
      ) {
        activeElement.blur()
      }
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    const frameHandle = window.requestAnimationFrame(focusInput)
    const timeoutHandles = [32, 96, 180, 320].map((delayMs) =>
      window.setTimeout(focusInput, delayMs),
    )
    return () => {
      window.cancelAnimationFrame(frameHandle)
      for (const handle of timeoutHandles) {
        window.clearTimeout(handle)
      }
    }
  }, [])

  return (
    <div
      data-workbench-add-node-menu="true"
      className="pointer-events-auto absolute z-20 w-72 rounded-2xl border border-slate-800/70 bg-slate-950/95 p-3 text-slate-100 shadow-2xl shadow-slate-950/40"
      style={{
        left: props.menu.menuLeft,
        top: props.menu.menuTop,
      }}
    >
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
          Search Node Types
        </div>
        <input
          ref={inputRef}
          value={props.menu.searchQuery}
          onChange={(event) => props.onSearchChange(event.target.value)}
          onKeyDown={props.onKeyDown}
          placeholder="Search node types"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>
      <div className="mt-3 space-y-1">
        {props.availableTypes.map((entry) => {
          const selected = entry.id === props.selectedTypeId
          return (
            <button
              key={entry.id}
              type="button"
              onMouseEnter={() => props.onSelect(entry.id)}
              onClick={() => props.onConfirm(entry.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                selected
                  ? "bg-cyan-300 text-slate-950"
                  : "bg-white/5 text-slate-100 hover:bg-white/10"
              }`}
            >
              <span className="text-sm font-medium">{entry.label}</span>
              <span className="text-[11px] uppercase tracking-[0.18em] opacity-70">
                {entry.id}
              </span>
            </button>
          )
        })}
        {props.availableTypes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-500">
            No node types match this search.
          </div>
        ) : null}
      </div>
    </div>
  )
})

function RegisteredWorkbenchNode({
  id,
  data,
  selected,
}: NodeProps<WorkbenchFlowNodeData>) {
  useRenderCounter("AgentWorkbenchScreen.RegisteredWorkbenchNode")
  const NodeRenderer = data.definition.renderNode as (
    props: WorkbenchNodeComponentProps,
  ) => JSX.Element | null
  const nodeName = data.record.name?.trim() ?? ""
  return (
    <WorkbenchNodeWrapper
      editableLabelValue={nodeName}
      label={nodeName || data.definition.label}
      labelPlaceholder={!nodeName}
      nodeId={id}
      onLabelChange={(nextName) => data.onNameChange(id, nextName)}
      selected={selected}
      resizable={data.definition.resizable !== false}
      workbenchReferenceSegment={data.workbenchReferenceSegment}
    >
      <NodeRenderer
        id={id}
        record={data.record as never}
        selected={selected}
        onRecordChange={(nextRecord) => data.onRecordChange(id, nextRecord)}
        onResize={data.onResize}
      />
    </WorkbenchNodeWrapper>
  )
}

const defaultWorkbenchNodeTypes: WorkbenchNodeTypeDefinition[] = [
  {
    id: "text",
    label: "Text",
    keywords: ["text", "note", "string"],
    sortOrder: 0,
    createRecord({ id, x, y }) {
      return {
        id,
        type: "text",
        text: "",
        x,
        y,
        width: 220,
        height: 140,
      }
    },
    renderNode: TextWorkbenchNode as WorkbenchNodeTypeDefinition["renderNode"],
  },
  {
    id: "int",
    label: "Int",
    keywords: ["int", "integer", "number"],
    sortOrder: 1,
    createRecord({ id, x, y }) {
      return {
        id,
        type: "int",
        value: 0,
        x,
        y,
        width: 180,
        height: 96,
      }
    },
    renderNode: IntWorkbenchNode as WorkbenchNodeTypeDefinition["renderNode"],
  },
]

const nodeTypes = {
  registeredWorkbenchNode: RegisteredWorkbenchNode,
}

function edgeRecordToFlowEdge(
  record: WorkbenchDocumentRecord["edges"][number],
): Edge {
  return {
    id: record.id,
    source: record.sourceNodeId,
    target: record.targetNodeId,
    sourceHandle: record.sourceHandleId,
    targetHandle: record.targetHandleId,
    label: record.text,
    type: "smoothstep",
  }
}

function flowNodesToRecords(
  nodes: Node<WorkbenchFlowNodeData>[],
): WorkbenchNodeRecord[] {
  return nodes.map((node) => ({
    ...node.data.record,
    x: node.position.x,
    y: node.position.y,
    width: normalizeNodeDimension(
      typeof node.width === "number"
        ? Math.round(node.width)
        : node.data.record.width,
    ),
    height: normalizeNodeDimension(
      typeof node.height === "number"
        ? Math.round(node.height)
        : node.data.record.height,
    ),
  }))
}

function flowEdgesToRecords(edges: Edge[]): WorkbenchDocumentRecord["edges"] {
  return edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    sourceHandleId: edge.sourceHandle ?? undefined,
    targetHandleId: edge.targetHandle ?? undefined,
    text: typeof edge.label === "string" ? edge.label : undefined,
  }))
}

function normalizeNodeDimension(value: number | null | undefined) {
  return typeof value === "number" && value > 0 ? value : undefined
}

const fixedWorkbenchNodeDimensions: Partial<
  Record<WorkbenchNodeRecord["type"], { width: number; height: number }>
> = {
  text: {
    width: 220,
    height: 140,
  },
  int: {
    width: 180,
    height: 96,
  },
}

function resolveFlowNodeDimensions(record: WorkbenchNodeRecord) {
  const width = normalizeNodeDimension(record.width)
  const height = normalizeNodeDimension(record.height)
  const fallback = fixedWorkbenchNodeDimensions[record.type]
  return {
    width: width ?? fallback?.width,
    height: height ?? fallback?.height,
  }
}

export function AgentWorkbenchScreen({
  apiRootUrl,
  nodeTypeDefinitions = [],
}: {
  apiRootUrl: string
  nodeTypeDefinitions?: WorkbenchNodeTypeDefinition[]
}) {
  useRenderCounter("AgentWorkbenchScreen")
  const { openWindow, updateWindow, closeWindow } = useDashboardWindowLayer()
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkbenchFlowNodeData>(
    [],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [workbench, setWorkbench] = useState<WorkbenchDocumentRecord | null>(
    null,
  )
  const [availableWorkbenches, setAvailableWorkbenches] = useState<
    WorkbenchSummary[]
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingWorkbench, setCreatingWorkbench] = useState(false)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [addNodeMenu, setAddNodeMenu] = useState<AddNodeMenuState | null>(null)
  const [controlsVisible, setControlsVisible] = useState(
    () => window.location.pathname === "/workbench",
  )
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null)
  const availableNodeTypeDefinitions = useMemo(
    () =>
      mergeWorkbenchNodeTypes(defaultWorkbenchNodeTypes, nodeTypeDefinitions),
    [nodeTypeDefinitions],
  )
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const suspendAutosaveRef = useRef(true)
  const workbenchRef = useRef<WorkbenchDocumentRecord | null>(null)
  const availableWorkbenchesRef = useRef<WorkbenchSummary[]>([])
  const activeLoadRequestIdRef = useRef(0)
  const nodesRef = useRef<Node<WorkbenchFlowNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  const initialLoadApiRootRef = useRef<string | null>(null)
  const createCooldownUntilRef = useRef(0)
  const nodeDragActiveRef = useRef(false)
  const controlsWindowOpenedRef = useRef(false)
  const openWindowRef = useRef(openWindow)
  const updateWindowRef = useRef(updateWindow)
  const closeWindowRef = useRef(closeWindow)
  const controlsIconRef = useRef<ReturnType<typeof WorkbenchIcon> | null>(null)
  const controlsBodyRef = useRef<ReturnType<
    typeof WorkbenchControlsWindow
  > | null>(null)
  const pendingSaveRef = useRef<PendingSaveState>({
    dirtyCycleActive: false,
    pending: false,
    saveInFlight: false,
    timerId: null,
    latestRecord: null,
    currentPromise: null,
  })

  useEffect(() => {
    workbenchRef.current = workbench
  }, [workbench])

  useEffect(() => {
    availableWorkbenchesRef.current = availableWorkbenches
  }, [availableWorkbenches])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((currentNodes) => {
        const resizedNodeIds = new Set(
          changes
            .filter((change) => change.type === "dimensions")
            .map((change) => change.id),
        )
        const nextNodes = applyNodeChanges(changes, currentNodes).map((node) => {
          if (!resizedNodeIds.has(node.id)) {
            return node
          }
          const width = normalizeNodeDimension(node.width)
          const height = normalizeNodeDimension(node.height)
          return {
            ...node,
            style: {
              ...node.style,
              width,
              height,
            },
            data: {
              ...node.data,
              record: {
                ...node.data.record,
                width,
                height,
              },
            },
          }
        })
        return nextNodes
      })
    },
    [setNodes],
  )

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    openWindowRef.current = openWindow
  }, [openWindow])

  useEffect(() => {
    updateWindowRef.current = updateWindow
  }, [updateWindow])

  useEffect(() => {
    closeWindowRef.current = closeWindow
  }, [closeWindow])

  useEffect(() => {
    function handleActiveFeatureChange(event: Event) {
      const detail = (event as CustomEvent<{ featureId?: string }>).detail
      setControlsVisible(detail?.featureId === "workbench")
    }

    window.addEventListener(
      "dashboard-active-feature-change",
      handleActiveFeatureChange as EventListener,
    )
    return () => {
      window.removeEventListener(
        "dashboard-active-feature-change",
        handleActiveFeatureChange as EventListener,
      )
    }
  }, [])

  const applySavedSnapshot = useCallback(
    (
      payload: WorkbenchSnapshotResponse,
      options?: { allowWorkbenchReplace?: boolean },
    ) => {
      setAvailableWorkbenches(payload.availableWorkbenches)
      if (options?.allowWorkbenchReplace ?? true) {
        setWorkbench(payload.workbench)
      }
    },
    [],
  )

  const persistRecord = useCallback(
    async (record: WorkbenchDocumentRecord) => {
      setSaving(true)
      setError("")
      try {
        const response = (await dashboardSessionFetch(
          `${apiRootUrl}/workbench?id=${encodeURIComponent(record.id)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(record),
          } as RequestInit,
        )) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as WorkbenchSnapshotResponse
        applySavedSnapshot(payload, {
          allowWorkbenchReplace: workbenchRef.current?.id === record.id,
        })
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : String(saveError),
        )
      } finally {
        setSaving(false)
      }
    },
    [apiRootUrl, applySavedSnapshot],
  )

  const flushPendingSave = useCallback(async () => {
    const saveState = pendingSaveRef.current
    if (
      saveState.saveInFlight ||
      !saveState.pending ||
      !saveState.latestRecord
    ) {
      return
    }
    if (saveState.timerId != null) {
      window.clearTimeout(saveState.timerId)
      saveState.timerId = null
    }
    const record = saveState.latestRecord
    saveState.pending = false
    saveState.saveInFlight = true
    const savePromise = persistRecord(record)
    saveState.currentPromise = savePromise
    try {
      await savePromise
    } finally {
      const nextState = pendingSaveRef.current
      nextState.saveInFlight = false
      nextState.currentPromise = null
      if (nextState.pending) {
        if (nextState.timerId == null) {
          nextState.timerId = window.setTimeout(() => {
            pendingSaveRef.current.timerId = null
            void flushPendingSave()
          }, autosaveIntervalMs)
        }
      } else {
        nextState.dirtyCycleActive = false
      }
    }
  }, [persistRecord])

  const requestAutosave = useCallback(
    (
      nextNodes: Node<WorkbenchFlowNodeData>[],
      nextEdges: Edge[],
      nextViewport: Viewport,
    ) => {
      const currentWorkbench = workbenchRef.current
      if (suspendAutosaveRef.current || !currentWorkbench) {
        return
      }
      const nextRecord: WorkbenchDocumentRecord = {
        ...currentWorkbench,
        nodes: flowNodesToRecords(nextNodes),
        edges: flowEdgesToRecords(nextEdges),
        viewport: nextViewport,
      }
      const saveState = pendingSaveRef.current
      saveState.latestRecord = nextRecord
      saveState.pending = true
      if (!saveState.dirtyCycleActive) {
        saveState.dirtyCycleActive = true
        void flushPendingSave()
        return
      }
      if (saveState.timerId == null && !saveState.saveInFlight) {
        saveState.timerId = window.setTimeout(() => {
          pendingSaveRef.current.timerId = null
          void flushPendingSave()
        }, autosaveIntervalMs)
      }
    },
    [flushPendingSave],
  )

  const nodeRecordToFlowNode = useCallback(
    (record: WorkbenchNodeRecord): Node<WorkbenchFlowNodeData> => {
      const onResize = (nodeId: string, width: number, height: number) => {
        const nextWidth = normalizeNodeDimension(width)
        const nextHeight = normalizeNodeDimension(height)
        setNodes((currentNodes) => {
          const nextNodes = currentNodes.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  width: nextWidth,
                  height: nextHeight,
                  style: {
                    ...node.style,
                    width: nextWidth,
                    height: nextHeight,
                  },
                  data: {
                    ...node.data,
                    record: {
                      ...node.data.record,
                      width: nextWidth,
                      height: nextHeight,
                    },
                  },
                }
              : node,
          )
          requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
          return nextNodes
        })
      }

      const { width, height } = resolveFlowNodeDimensions(record)

      return {
        id: record.id,
        type: "registeredWorkbenchNode",
        position: { x: record.x, y: record.y },
        width,
        height,
        initialWidth: width,
        initialHeight: height,
        style:
          width !== undefined || height !== undefined
            ? {
                width,
                height,
              }
            : undefined,
        data: {
          workbenchReferenceSegment: workbenchRef.current
            ? workbenchReferenceSegment(workbenchRef.current)
            : null,
          record,
          definition:
            getWorkbenchNodeType(availableNodeTypeDefinitions, record.type) ??
            defaultWorkbenchNodeTypes[0],
          onNameChange(nodeId, nextName) {
            const normalizedName = nextName.trim()
            setNodes((currentNodes) => {
              const nextNodes = currentNodes.map((node) =>
                node.id === nodeId
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        record: {
                          ...node.data.record,
                          name: normalizedName || undefined,
                        },
                      },
                    }
                  : node,
              )
              requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
              return nextNodes
            })
          },
          onRecordChange(nodeId, nextRecord) {
            setNodes((currentNodes) => {
              const nextNodes = currentNodes.map((node) =>
                node.id === nodeId
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        record: nextRecord,
                      },
                    }
                  : node,
              )
              requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
              return nextNodes
            })
          },
          onResize,
        },
      } as Node<WorkbenchFlowNodeData>
    },
    [availableNodeTypeDefinitions, requestAutosave, setNodes],
  )

  const applyLoadedSnapshot = useCallback(
    (payload: WorkbenchSnapshotResponse) => {
      suspendAutosaveRef.current = true
      setAddNodeMenu(null)
      workbenchRef.current = payload.workbench
      availableWorkbenchesRef.current = payload.availableWorkbenches
      setWorkbench(payload.workbench)
      setAvailableWorkbenches(payload.availableWorkbenches)
      setNodes(payload.workbench.nodes.map(nodeRecordToFlowNode))
      setEdges(payload.workbench.edges.map(edgeRecordToFlowEdge))
      setViewport(payload.workbench.viewport)
      viewportRef.current = payload.workbench.viewport
      if (reactFlowInstance) {
        void reactFlowInstance.setViewport(payload.workbench.viewport)
      }
      pendingSaveRef.current = {
        dirtyCycleActive: false,
        pending: false,
        saveInFlight: false,
        timerId: null,
        latestRecord: null,
        currentPromise: null,
      }
      window.setTimeout(() => {
        suspendAutosaveRef.current = false
      }, 0)
    },
    [nodeRecordToFlowNode, reactFlowInstance, setEdges, setNodes],
  )

  const flushAllSaves = useCallback(async () => {
    const saveState = pendingSaveRef.current
    if (saveState.timerId != null) {
      window.clearTimeout(saveState.timerId)
      saveState.timerId = null
    }
    if (saveState.currentPromise) {
      await saveState.currentPromise
    }
    if (saveState.pending) {
      await flushPendingSave()
    }
  }, [flushPendingSave])

  const loadWorkbench = useCallback(
    async (id?: string) => {
      await flushAllSaves()
      const requestId = activeLoadRequestIdRef.current + 1
      activeLoadRequestIdRef.current = requestId
      setLoading(true)
      setError("")
      try {
        const target = id?.trim()
        const url = target
          ? `${apiRootUrl}/workbench?id=${encodeURIComponent(target)}`
          : `${apiRootUrl}/workbench`
        const response = (await dashboardSessionFetch(url)) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as WorkbenchSnapshotResponse
        if (activeLoadRequestIdRef.current !== requestId) {
          return
        }
        applyLoadedSnapshot(payload)
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
      } finally {
        setLoading(false)
      }
    },
    [apiRootUrl, applyLoadedSnapshot, flushAllSaves],
  )

  useEffect(() => {
    if (initialLoadApiRootRef.current !== apiRootUrl) {
      initialLoadApiRootRef.current = apiRootUrl
      void loadWorkbench()
    }
  }, [apiRootUrl, loadWorkbench])

  useEffect(() => {
    return () => {
      const saveState = pendingSaveRef.current
      if (saveState.timerId != null) {
        window.clearTimeout(saveState.timerId)
      }
    }
  }, [])

  const createWorkbench = useCallback(async () => {
    await flushAllSaves()
    setCreatingWorkbench(true)
    setError("")
    try {
      const nextRecord: WorkbenchDocumentRecord = {
        id: createWorkbenchId(),
        title: "New Workbench",
        nodes: [],
        edges: [],
        handles: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }
      const response = (await dashboardSessionFetch(
        `${apiRootUrl}/workbench?id=${encodeURIComponent(nextRecord.id)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(nextRecord),
        } as RequestInit,
      )) as Response
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as WorkbenchSnapshotResponse
      applyLoadedSnapshot(payload)
      setSearchQuery("")
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : String(createError),
      )
    } finally {
      setCreatingWorkbench(false)
      setLoading(false)
    }
  }, [apiRootUrl, applyLoadedSnapshot, flushAllSaves])

  const renameWorkbench = useCallback(
    async (id: string, nextId: string) => {
      const normalizedId = id.trim()
      const normalizedNextId = nextId.trim()
      if (!normalizedId) {
        return
      }
      if (!normalizedNextId || normalizedNextId === normalizedId) {
        return
      }

      await flushAllSaves()
      setSaving(true)
      setError("")
      try {
        const loadResponse = (await dashboardSessionFetch(
          `${apiRootUrl}/workbench?id=${encodeURIComponent(normalizedId)}`,
        )) as Response
        if (!loadResponse.ok) {
          throw new Error(await loadResponse.text())
        }
        const loadPayload = (await loadResponse.json()) as WorkbenchSnapshotResponse
        const nextRecord: WorkbenchDocumentRecord = {
          ...loadPayload.workbench,
          id: normalizedNextId,
          title: normalizedNextId,
        }
        const response = (await dashboardSessionFetch(
          `${apiRootUrl}/workbench?id=${encodeURIComponent(normalizedNextId)}&previousId=${encodeURIComponent(normalizedId)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(nextRecord),
          } as RequestInit,
        )) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as WorkbenchSnapshotResponse
        if (workbenchRef.current?.id === normalizedId) {
          applyLoadedSnapshot(payload)
        } else {
          applySavedSnapshot(payload, {
            allowWorkbenchReplace: false,
          })
        }
      } catch (renameError) {
        setError(
          renameError instanceof Error ? renameError.message : String(renameError),
        )
      } finally {
        setSaving(false)
      }
    },
    [apiRootUrl, applyLoadedSnapshot, applySavedSnapshot, flushAllSaves],
  )

  const controlsIcon = useMemo(
    () => <WorkbenchIcon className="h-3.5 w-3.5" />,
    [],
  )

  useEffect(() => {
    controlsIconRef.current = controlsIcon
  }, [controlsIcon])

  const controlsBody = useMemo(
    () => (
      <WorkbenchControlsWindow
        workbench={workbench}
        availableWorkbenches={availableWorkbenches}
        searchQuery={searchQuery}
        loading={loading}
        creating={creatingWorkbench}
        saving={saving}
        error={error}
        onSearchChange={setSearchQuery}
        onLoadWorkbench={(id) => {
          void loadWorkbench(id)
        }}
        onCreateWorkbench={() => {
          void createWorkbench()
        }}
        onRenameWorkbench={(id, nextId) => {
          void renameWorkbench(id, nextId)
        }}
      />
    ),
    [
      availableWorkbenches,
      createWorkbench,
      creatingWorkbench,
      error,
      loadWorkbench,
      loading,
      renameWorkbench,
      saving,
      searchQuery,
      workbench,
    ],
  )

  if (controlsIconRef.current == null) {
    controlsIconRef.current = controlsIcon
  }
  if (controlsBodyRef.current == null) {
    controlsBodyRef.current = controlsBody
  }

  useEffect(() => {
    if (!controlsVisible) {
      if (controlsWindowOpenedRef.current) {
        closeWindowRef.current(controlsWindowId)
        controlsWindowOpenedRef.current = false
      }
      return
    }

    if (!controlsWindowOpenedRef.current) {
      openWindowRef.current({
        id: controlsWindowId,
        title: "Workbench Menu",
        icon: controlsIconRef.current,
        body: controlsBodyRef.current,
        width: 320,
        height: 460,
        x: 24,
        y: 24,
        fitContentWidth: 320,
      })
      controlsWindowOpenedRef.current = true
      return
    }

    updateWindowRef.current(controlsWindowId, {
      title: "Workbench Menu",
      icon: controlsIcon,
      body: controlsBody,
    })
  }, [controlsBody, controlsIcon, controlsVisible])

  useEffect(() => {
    return () => {
      controlsWindowOpenedRef.current = false
      closeWindowRef.current(controlsWindowId)
    }
  }, [])

  const closeAddNodeMenu = useCallback(() => {
    setAddNodeMenu(null)
  }, [])

  const visibleNodeTypes = useMemo(
    () =>
      filterWorkbenchNodeTypes(
        availableNodeTypeDefinitions,
        addNodeMenu?.searchQuery ?? "",
      ),
    [addNodeMenu?.searchQuery, availableNodeTypeDefinitions],
  )

  const selectedNodeTypeId = useMemo(
    () =>
      resolveWorkbenchNodeTypeSelection(
        visibleNodeTypes,
        addNodeMenu?.selectedTypeId ?? null,
      ),
    [addNodeMenu?.selectedTypeId, visibleNodeTypes],
  )

  const openAddNodeMenuAtClientPoint = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (!canvasRef.current) {
        return false
      }
      if (
        target instanceof Element &&
        (target.closest(".react-flow__node") ||
          target.closest("[data-workbench-add-node-menu='true']"))
      ) {
        return false
      }

      const bounds = canvasRef.current.getBoundingClientRect()
      const viewportState = viewportRef.current
      const point =
        reactFlowInstance && "screenToFlowPosition" in reactFlowInstance
          ? reactFlowInstance.screenToFlowPosition({
              x: clientX,
              y: clientY,
            })
          : (() => {
              return {
                x:
                  (clientX - bounds.left - viewportState.x) /
                  viewportState.zoom,
                y:
                  (clientY - bounds.top - viewportState.y) / viewportState.zoom,
              }
            })()
      if (!point) {
        return false
      }

      countEvent("agent-workbench.open-add-node-menu")
      setAddNodeMenu({
        clientX,
        clientY,
        menuLeft: clientX - bounds.left,
        menuTop: clientY - bounds.top,
        flowX: point.x,
        flowY: point.y,
        searchQuery: "",
        selectedTypeId: "text",
      })
      createCooldownUntilRef.current = performance.now() + createCooldownMs
      return true
    },
    [reactFlowInstance],
  )

  const createNodeFromType = useCallback(
    (typeId: WorkbenchNodeRecord["type"]) => {
      const menuState = addNodeMenu
      if (!menuState) {
        return false
      }
      const definition = filterWorkbenchNodeTypes(
        availableNodeTypeDefinitions,
        menuState.searchQuery,
      ).find((entry) => entry.id === typeId)
      if (!definition) {
        return false
      }

      const newNode = nodeRecordToFlowNode(
        definition.createRecord({
          id: createNodeId(),
          x: menuState.flowX,
          y: menuState.flowY,
        }),
      )
      const nextNodes = [...nodesRef.current, newNode]
      setNodes(nextNodes)
      requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
      countEvent(`agent-workbench.create-node.${typeId}`)
      closeAddNodeMenu()
      createCooldownUntilRef.current = performance.now() + createCooldownMs
      return true
    },
    [
      addNodeMenu,
      availableNodeTypeDefinitions,
      closeAddNodeMenu,
      nodeRecordToFlowNode,
      requestAutosave,
      setNodes,
    ],
  )

  useEffect(() => {
    if (!addNodeMenu) {
      return
    }

    const currentSearchQuery = addNodeMenu.searchQuery

    function targetAcceptsTyping(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tagName = target.tagName
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target.isContentEditable
      )
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element)) {
        return
      }
      if (event.target.closest("[data-workbench-add-node-menu='true']")) {
        return
      }
      closeAddNodeMenu()
    }

    function updateSearchQuery(nextQuery: string) {
      setAddNodeMenu((current) => {
        if (current == null) {
          return current
        }
        return {
          ...current,
          searchQuery: nextQuery,
          selectedTypeId:
            resolveWorkbenchNodeTypeSelection(
              filterWorkbenchNodeTypes(availableNodeTypeDefinitions, nextQuery),
              current.selectedTypeId,
            ) ?? "text",
        }
      })
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (targetAcceptsTyping(event.target)) {
        return
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        event.stopPropagation()
        const nextTypeId = getNextWorkbenchNodeTypeSelection(
          visibleNodeTypes,
          selectedNodeTypeId,
          event.key === "ArrowDown" ? 1 : -1,
        )
        if (!nextTypeId) {
          return
        }
        setAddNodeMenu((current) =>
          current == null
            ? current
            : {
                ...current,
                selectedTypeId: nextTypeId,
              },
        )
        return
      }
      if (event.key === "Enter") {
        if (!selectedNodeTypeId) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        createNodeFromType(selectedNodeTypeId)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        closeAddNodeMenu()
        return
      }
      if (event.key === "Backspace") {
        event.preventDefault()
        event.stopPropagation()
        updateSearchQuery(currentSearchQuery.slice(0, -1))
        return
      }
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        event.stopPropagation()
        updateSearchQuery(`${currentSearchQuery}${event.key}`)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleWindowKeyDown, true)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleWindowKeyDown, true)
    }
  }, [
    addNodeMenu,
    availableNodeTypeDefinitions,
    closeAddNodeMenu,
    createNodeFromType,
    selectedNodeTypeId,
    visibleNodeTypes,
  ])

  const handleAddNodeMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (visibleNodeTypes.length === 0) {
        if (event.key === "Escape") {
          event.preventDefault()
          closeAddNodeMenu()
        }
        return
      }

      if (event.key === "Enter" && selectedNodeTypeId) {
        event.preventDefault()
        createNodeFromType(selectedNodeTypeId)
        return
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const nextTypeId = getNextWorkbenchNodeTypeSelection(
          visibleNodeTypes,
          selectedNodeTypeId,
          event.key === "ArrowDown" ? 1 : -1,
        )
        if (!nextTypeId) {
          return
        }
        setAddNodeMenu((current) =>
          current == null
            ? current
            : {
                ...current,
                selectedTypeId: nextTypeId,
              },
        )
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        closeAddNodeMenu()
      }
    },
    [
      closeAddNodeMenu,
      createNodeFromType,
      selectedNodeTypeId,
      visibleNodeTypes,
    ],
  )

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element>) => {
      const nowMs = performance.now()
      if (nodeDragActiveRef.current || nowMs < createCooldownUntilRef.current) {
        return
      }
      if (event.detail !== 2) {
        return
      }
      openAddNodeMenuAtClientPoint(event.clientX, event.clientY, event.target)
    },
    [openAddNodeMenuAtClientPoint],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        const nextEdges = addEdge(
          {
            ...connection,
            type: "smoothstep",
          },
          currentEdges,
        )
        requestAutosave(nodesRef.current, nextEdges, viewportRef.current)
        return nextEdges
      })
    },
    [requestAutosave, setEdges],
  )

  const handleNodeDragStart = useCallback(() => {
    nodeDragActiveRef.current = true
    closeAddNodeMenu()
  }, [closeAddNodeMenu])

  const handleNodeDragStop = useCallback(() => {
    nodeDragActiveRef.current = false
    createCooldownUntilRef.current = performance.now() + createCooldownMs
    requestAutosave(nodesRef.current, edgesRef.current, viewportRef.current)
  }, [requestAutosave])

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      setViewport(nextViewport)
      requestAutosave(nodesRef.current, edgesRef.current, nextViewport)
    },
    [requestAutosave],
  )

  const selectedNodes = useMemo(
    () => nodes.filter((node) => node.selected),
    [nodes],
  )
  const selectedNodeIds = useMemo(
    () => new Set(selectedNodes.map((node) => node.id)),
    [selectedNodes],
  )
  const selectedEdges = useMemo(
    () =>
      edges.filter(
        (edge) =>
          edge.selected ||
          (selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)),
      ),
    [edges, selectedNodeIds],
  )
  const multiSelectionCopyAnchor = useMemo(() => {
    if (selectedNodes.length < 2) {
      return null
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY

    for (const node of selectedNodes) {
      const width =
        typeof node.width === "number"
          ? node.width
          : node.data.record.width ?? fallbackSelectionNodeWidth
      const height =
        typeof node.height === "number"
          ? node.height
          : node.data.record.height ?? fallbackSelectionNodeHeight
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + width)
      void height
    }

    return {
      left: maxX * viewport.zoom + viewport.x,
      top: minY * viewport.zoom + viewport.y,
    }
  }, [selectedNodes, viewport.x, viewport.y, viewport.zoom])
  const copySelectedWorkbenchItems = useCallback(() => {
    if (selectedNodes.length < 2) {
      return
    }

    const currentWorkbench = workbenchRef.current
    const workbenchSegment = currentWorkbench
      ? workbenchReferenceSegment(currentWorkbench)
      : null

    const nodeRefs = selectedNodes.map((node) =>
      workbenchSegment
        ? `/workbench/${workbenchSegment}/node/${node.id}`
        : node.id,
    )
    const edgeRefs = selectedEdges.map((edge) =>
      workbenchSegment
        ? `/workbench/${workbenchSegment}/edge/${edge.id}`
        : edge.id,
    )

    void navigator.clipboard.writeText([...nodeRefs, ...edgeRefs].join("\n"))
  }, [selectedEdges, selectedNodes])

  if (loading && workbench == null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading workbench…
      </div>
    )
  }

  return (
    <div
      ref={canvasRef}
      className="relative h-full min-h-0 bg-[radial-gradient(circle_at_top,_#eff6ff,_#e2e8f0_55%,_#cbd5e1)]"
    >
      {multiSelectionCopyAnchor ? (
        <button
          type="button"
          className="absolute z-20 inline-flex -translate-y-[calc(100%+10px)] items-center gap-2 rounded-xl border border-cyan-200/80 bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.22)] transition hover:bg-cyan-200"
          style={{
            left: `${multiSelectionCopyAnchor.left}px`,
            top: `${multiSelectionCopyAnchor.top}px`,
          }}
          onClick={copySelectedWorkbenchItems}
          title="Copy selected nodes and edges"
        >
          <CopyIcon className="h-4 w-4" />
          <span>Copy All</span>
        </button>
      ) : null}
      {addNodeMenu ? (
        <AddNodeMenu
          menu={addNodeMenu}
          availableTypes={visibleNodeTypes}
          selectedTypeId={selectedNodeTypeId}
          onSearchChange={(value) => {
            setAddNodeMenu((current) => {
              if (current == null) {
                return current
              }
              const nextSelectedTypeId =
                resolveWorkbenchNodeTypeSelection(
                  filterWorkbenchNodeTypes(availableNodeTypeDefinitions, value),
                  current.selectedTypeId,
                ) ?? "text"
              return {
                ...current,
                searchQuery: value,
                selectedTypeId: nextSelectedTypeId,
              }
            })
          }}
          onKeyDown={handleAddNodeMenuKeyDown}
          onSelect={(typeId) => {
            setAddNodeMenu((current) =>
              current == null
                ? current
                : {
                    ...current,
                    selectedTypeId: typeId,
                  },
            )
          }}
          onConfirm={(typeId) => {
            createNodeFromType(typeId)
          }}
        />
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        deleteKeyCode={["Delete", "Backspace"]}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onPaneClick={handlePaneClick}
        onInit={(instance) => {
          setReactFlowInstance(instance)
          instance.setViewport(viewportRef.current)
        }}
        nodeTypes={nodeTypes}
        fitView={nodes.length === 0}
        defaultViewport={viewport}
        minZoom={0.01}
        maxZoom={8}
        className="h-full w-full"
      >
        <Background gap={20} size={1} color="#94a3b8" />
        <MiniMap
          pannable
          zoomable
          className="!bg-white/90"
          nodeStrokeColor={() => "#0f172a"}
          nodeColor={() => "#e2e8f0"}
        />
        <Controls />
      </ReactFlow>
    </div>
  )
}
