import type {
  WorkbenchDocumentRecord,
  WorkbenchNodeRecord,
  WorkbenchSnapshotResponse,
  WorkbenchSummary,
} from "@agent-infrastructure/agent-workbench-protocol"
import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import { useDashboardWindowLayer } from "@agent-infrastructure/dashboard-ui"
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import ReactFlow, {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
  type Viewport,
} from "reactflow"
import "reactflow/dist/style.css"

type WorkbenchNodeData = {
  text: string
  onTextChange(nodeId: string, text: string): void
  onResize(nodeId: string, width: number, height: number): void
}

type PaneClickState = {
  atMs: number
  clientX: number
  clientY: number
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

function TextWorkbenchNode({
  id,
  data,
  selected,
}: NodeProps<WorkbenchNodeData>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      data.onResize(id, entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [data, id])

  return (
    <div
      className={`rounded-2xl border bg-white/95 shadow-lg transition ${
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
        ref={textareaRef}
        value={data.text}
        onChange={(event) => data.onTextChange(id, event.target.value)}
        placeholder="Write here..."
        className="min-h-[140px] min-w-[220px] resize rounded-2xl border-0 bg-transparent px-4 py-3 text-sm leading-6 text-slate-900 outline-none"
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

function WorkbenchControlsWindow(props: WorkbenchControlsWindowProps) {
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
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => props.onLoadWorkbench(entry.id)}
                disabled={props.loading && selected}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-cyan-300/40 bg-cyan-300/15 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="truncate text-sm font-medium">
                  {entry.title || entry.id}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {entry.id}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {formatUpdatedAt(entry.updatedAtMs)}
                </div>
              </button>
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
}

const nodeTypes = {
  textWorkbenchNode: TextWorkbenchNode,
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
  nodes: Node<WorkbenchNodeData>[],
): WorkbenchNodeRecord[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "text",
    text: node.data.text,
    x: node.position.x,
    y: node.position.y,
    width: typeof node.width === "number" ? Math.round(node.width) : undefined,
    height:
      typeof node.height === "number" ? Math.round(node.height) : undefined,
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

export function AgentWorkbenchScreen({ apiRootUrl }: { apiRootUrl: string }) {
  const { openWindow, updateWindow, closeWindow } = useDashboardWindowLayer()
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkbenchNodeData>([])
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
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const suspendAutosaveRef = useRef(true)
  const workbenchRef = useRef<WorkbenchDocumentRecord | null>(null)
  const nodesRef = useRef<Node<WorkbenchNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  const lastPaneClickRef = useRef<PaneClickState | null>(null)
  const createCooldownUntilRef = useRef(0)
  const nodeDragActiveRef = useRef(false)
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
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const applySavedSnapshot = useCallback(
    (payload: WorkbenchSnapshotResponse) => {
      setWorkbench(payload.workbench)
      setAvailableWorkbenches(payload.availableWorkbenches)
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
        applySavedSnapshot(payload)
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
      nextNodes: Node<WorkbenchNodeData>[],
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
    (record: WorkbenchNodeRecord): Node<WorkbenchNodeData> => ({
      id: record.id,
      type: "textWorkbenchNode",
      position: { x: record.x, y: record.y },
      width: record.width,
      height: record.height,
      data: {
        text: record.text,
        onTextChange(nodeId, text) {
          setNodes((currentNodes) => {
            const nextNodes = currentNodes.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      text,
                    },
                  }
                : node,
            )
            requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
            return nextNodes
          })
        },
        onResize(nodeId, width, height) {
          setNodes((currentNodes) => {
            const nextNodes = currentNodes.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    width,
                    height,
                  }
                : node,
            )
            requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
            return nextNodes
          })
        },
      },
    }),
    [requestAutosave, setNodes],
  )

  const applyLoadedSnapshot = useCallback(
    (payload: WorkbenchSnapshotResponse) => {
      suspendAutosaveRef.current = true
      setWorkbench(payload.workbench)
      setAvailableWorkbenches(payload.availableWorkbenches)
      setNodes(payload.workbench.nodes.map(nodeRecordToFlowNode))
      setEdges(payload.workbench.edges.map(edgeRecordToFlowEdge))
      setViewport(payload.workbench.viewport)
      viewportRef.current = payload.workbench.viewport
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
    [nodeRecordToFlowNode, setEdges, setNodes],
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
    void loadWorkbench()
    return () => {
      const saveState = pendingSaveRef.current
      if (saveState.timerId != null) {
        window.clearTimeout(saveState.timerId)
      }
    }
  }, [loadWorkbench])

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
      />
    ),
    [
      availableWorkbenches,
      createWorkbench,
      creatingWorkbench,
      error,
      loadWorkbench,
      loading,
      saving,
      searchQuery,
      workbench,
    ],
  )

  useEffect(() => {
    openWindow({
      id: controlsWindowId,
      title: "Workbench Files",
      icon: <WorkbenchIcon className="h-3.5 w-3.5" />,
      body: controlsBody,
      width: 320,
      height: 460,
      x: 24,
      y: 24,
      fitContentWidth: 320,
    })
    return () => {
      closeWindow(controlsWindowId)
    }
  }, [closeWindow, controlsBody, openWindow])

  useEffect(() => {
    updateWindow(controlsWindowId, {
      title: "Workbench Files",
      icon: <WorkbenchIcon className="h-3.5 w-3.5" />,
      body: controlsBody,
    })
  }, [controlsBody, updateWindow])

  const createNodeAtClientPoint = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (!canvasRef.current) {
        return false
      }
      if (target instanceof Element && target.closest(".react-flow__node")) {
        return false
      }

      const viewportState = viewportRef.current
      const point =
        reactFlowInstance && "screenToFlowPosition" in reactFlowInstance
          ? reactFlowInstance.screenToFlowPosition({
              x: clientX,
              y: clientY,
            })
          : (() => {
              const bounds = canvasRef.current?.getBoundingClientRect()
              if (!bounds) {
                return null
              }
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
      const newNode = nodeRecordToFlowNode({
        id: createNodeId(),
        type: "text",
        text: "",
        x: point.x,
        y: point.y,
      })
      const nextNodes = [...nodesRef.current, newNode]
      setNodes(nextNodes)
      requestAutosave(nextNodes, edgesRef.current, viewportRef.current)
      lastPaneClickRef.current = null
      createCooldownUntilRef.current = performance.now() + createCooldownMs
      return true
    },
    [nodeRecordToFlowNode, reactFlowInstance, requestAutosave, setNodes],
  )

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element>) => {
      const nowMs = performance.now()
      if (nodeDragActiveRef.current || nowMs < createCooldownUntilRef.current) {
        lastPaneClickRef.current = null
        return
      }
      const lastClick = lastPaneClickRef.current
      const isSecondClick =
        lastClick != null &&
        nowMs - lastClick.atMs <= 900 &&
        Math.abs(lastClick.clientX - event.clientX) <= 32 &&
        Math.abs(lastClick.clientY - event.clientY) <= 32

      if (isSecondClick) {
        lastPaneClickRef.current = null
        createNodeAtClientPoint(event.clientX, event.clientY, event.target)
        return
      }

      lastPaneClickRef.current = {
        atMs: nowMs,
        clientX: event.clientX,
        clientY: event.clientY,
      }
    },
    [createNodeAtClientPoint],
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
    lastPaneClickRef.current = null
  }, [])

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
      className="h-full min-h-0 bg-[radial-gradient(circle_at_top,_#eff6ff,_#e2e8f0_55%,_#cbd5e1)]"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
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
