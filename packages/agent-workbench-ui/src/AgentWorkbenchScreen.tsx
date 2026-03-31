import type {
  WorkbenchDocumentRecord,
  WorkbenchNodeRecord,
  WorkbenchSnapshotResponse,
} from "@agent-infrastructure/agent-workbench-protocol"
import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
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

function createNodeId() {
  return `node-${crypto.randomUUID()}`
}

export function AgentWorkbenchScreen({ apiRootUrl }: { apiRootUrl: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkbenchNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [workbench, setWorkbench] = useState<WorkbenchDocumentRecord | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [loadedAtLeastOnce, setLoadedAtLeastOnce] = useState(false)
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const suspendAutosaveRef = useRef(true)
  const workbenchRef = useRef<WorkbenchDocumentRecord | null>(null)
  const edgesRef = useRef<Edge[]>([])
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })

  useEffect(() => {
    workbenchRef.current = workbench
  }, [workbench])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const queueSave = useCallback(
    (
      nextNodes: Node<WorkbenchNodeData>[],
      nextEdges: Edge[],
      nextViewport: Viewport,
    ) => {
      const currentWorkbench = workbenchRef.current
      if (suspendAutosaveRef.current || !currentWorkbench) {
        return
      }
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = window.setTimeout(async () => {
        setSaving(true)
        setError("")
        try {
          const response = (await dashboardSessionFetch(
            `${apiRootUrl}/workbench?id=${encodeURIComponent(currentWorkbench.id)}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...currentWorkbench,
                nodes: flowNodesToRecords(nextNodes),
                edges: flowEdgesToRecords(nextEdges),
                viewport: nextViewport,
              } satisfies WorkbenchDocumentRecord),
            } as RequestInit,
          )) as Response
          if (!response.ok) {
            throw new Error(await response.text())
          }
          const payload = (await response.json()) as WorkbenchSnapshotResponse
          setWorkbench(payload.workbench)
        } catch (saveError) {
          setError(
            saveError instanceof Error ? saveError.message : String(saveError),
          )
        } finally {
          setSaving(false)
        }
      }, 350)
    },
    [apiRootUrl],
  )

  const handleTextChange = useCallback(
    (nodeId: string, text: string) => {
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
        queueSave(nextNodes, edgesRef.current, viewportRef.current)
        return nextNodes
      })
    },
    [queueSave, setNodes],
  )

  const handleNodeResize = useCallback(
    (nodeId: string, width: number, height: number) => {
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
        queueSave(nextNodes, edgesRef.current, viewportRef.current)
        return nextNodes
      })
    },
    [queueSave, setNodes],
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
        onTextChange: handleTextChange,
        onResize: handleNodeResize,
      },
    }),
    [handleNodeResize, handleTextChange],
  )

  useEffect(() => {
    async function loadWorkbench() {
      setLoading(true)
      setError("")
      try {
        const response = (await dashboardSessionFetch(
          `${apiRootUrl}/workbench`,
        )) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as WorkbenchSnapshotResponse
        suspendAutosaveRef.current = true
        setWorkbench(payload.workbench)
        setNodes(payload.workbench.nodes.map(nodeRecordToFlowNode))
        setEdges(payload.workbench.edges.map(edgeRecordToFlowEdge))
        setViewport(payload.workbench.viewport)
        setLoadedAtLeastOnce(true)
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        )
      } finally {
        setLoading(false)
      }
    }

    void loadWorkbench()
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [apiRootUrl, nodeRecordToFlowNode, setEdges, setNodes])

  useEffect(() => {
    if (!loadedAtLeastOnce) {
      return
    }
    suspendAutosaveRef.current = false
  }, [loadedAtLeastOnce])

  function handleConnect(connection: Connection) {
    setEdges((currentEdges) => {
      const nextEdges = addEdge(
        {
          ...connection,
          type: "smoothstep",
        },
        currentEdges,
      )
      queueSave(nodes, nextEdges, viewportRef.current)
      return nextEdges
    })
  }

  const createNodeAtClientPoint = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (!canvasRef.current) {
        return
      }
      if (target instanceof Element && target.closest(".react-flow__node")) {
        return
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
        return
      }
      const newNode = nodeRecordToFlowNode({
        id: createNodeId(),
        type: "text",
        text: "",
        x: point.x,
        y: point.y,
      })
      setNodes((currentNodes) => {
        const nextNodes = [...currentNodes, newNode]
        queueSave(nextNodes, edgesRef.current, viewportRef.current)
        return nextNodes
      })
    },
    [nodeRecordToFlowNode, queueSave, reactFlowInstance, setNodes],
  )

  const handlePaneDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) {
        return
      }
      if (!event.target.closest(".react-flow__pane")) {
        return
      }
      createNodeAtClientPoint(event.clientX, event.clientY, event.target)
    },
    [createNodeAtClientPoint],
  )

  function handleNodeDragStop() {
    queueSave(nodes, edgesRef.current, viewportRef.current)
  }

  function handleMoveEnd(
    _event: MouseEvent | TouchEvent | null,
    nextViewport: Viewport,
  ) {
    setViewport(nextViewport)
    queueSave(nodes, edgesRef.current, nextViewport)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading workbench…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,_#eff6ff,_#e2e8f0_55%,_#cbd5e1)]">
      <div className="flex items-center justify-between border-b border-slate-300/80 bg-white/80 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-600">
            {workbench?.title ?? "Agent Workbench"}
          </h1>
          <p className="text-xs text-slate-500">
            Double-click empty space to create a text node.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {saving ? <span>Saving…</span> : <span>Saved</span>}
          {error ? <span className="text-rose-600">{error}</span> : null}
        </div>
      </div>
      <div ref={canvasRef} className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onMoveEnd={handleMoveEnd}
          onDoubleClick={handlePaneDoubleClick}
          onInit={(instance) => {
            setReactFlowInstance(instance)
            instance.setViewport(viewport)
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
    </div>
  )
}
