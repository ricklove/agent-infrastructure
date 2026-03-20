import { useEffect, useMemo, useRef } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useOnSelectionChange,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";
import type {
  GraphEdge,
  GraphNode as AgentGraphNode,
  GraphSnapshot,
} from "@agent-infrastructure/agent-graph-core";
import { DerivedEdgeRenderer } from "../renderers/DerivedEdgeRenderer";
import { DirectEdgeRenderer } from "../renderers/DirectEdgeRenderer";
import { HiddenContextPortalNode } from "../renderers/HiddenContextPortalNode";
import { SemanticGraphNode } from "../renderers/SemanticGraphNode";

const nodeTypes = {
  semanticNode: SemanticGraphNode,
  hiddenContextPortal: HiddenContextPortalNode,
};

const edgeTypes = {
  direct: DirectEdgeRenderer,
  derived: DerivedEdgeRenderer,
};

type CanvasProps = {
  store: AgentGraphStore;
  actions: {
    selectNode(nodeId: string | null): void;
    selectEdge(edgeId: string | null): void;
    setCanvasSelection(nodeIds: string[], edgeIds: string[]): void;
    setPhysicsEnabled(enabled: boolean): void;
    setNodePinned(nodeId: string, pinned: boolean, position?: { x: number; y: number }): void;
    moveLayer(layerId: string, x: number, y: number): void;
    moveNode(nodeId: string, x: number, y: number): void;
    hideNodeFromLayer(layerId: string, sourceNodeId: string): void;
    revealHiddenContext(portalNodeId: string): void;
    inspectDerivedEdge(edgeId: string, supportingPathIds: string[]): void;
  };
};

type ForceNodeDatum = SimulationNodeDatum & {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fx?: number | null;
  fy?: number | null;
};

function nodeDimensions(node: Node): { width: number; height: number } {
  if (typeof node.width === "number" && typeof node.height === "number") {
    return { width: node.width, height: node.height };
  }
  if (node.type === "hiddenContextPortal") {
    return { width: 44, height: 44 };
  }
  if (node.type === "group") {
    return {
      width: Number((node.style as { width?: number } | undefined)?.width ?? 520),
      height: Number((node.style as { height?: number } | undefined)?.height ?? 260),
    };
  }
  return { width: 168, height: 88 };
}

function createHandleStraightenForce(
  links: Array<SimulationLinkDatum<ForceNodeDatum>>,
  strength = 0.14,
  gap = 96,
) {
  return (alpha: number) => {
    for (const link of links) {
      const source = link.source as ForceNodeDatum;
      const target = link.target as ForceNodeDatum;
      if (!source || !target) {
        continue;
      }

      const sourceHandleX = (source.x ?? 0) + source.width / 2;
      const sourceHandleY = source.y ?? 0;
      const targetHandleX = (target.x ?? 0) - target.width / 2;
      const targetHandleY = target.y ?? 0;

      const handleDx = targetHandleX - sourceHandleX;
      const handleDy = targetHandleY - sourceHandleY;
      const targetDx = gap;
      const targetDy = 0;

      const nudgeX = (handleDx - targetDx) * strength * alpha;
      const nudgeY = (handleDy - targetDy) * strength * alpha;

      source.vx = (source.vx ?? 0) + nudgeX * 0.5;
      target.vx = (target.vx ?? 0) - nudgeX * 0.5;
      source.vy = (source.vy ?? 0) + nudgeY * 0.5;
      target.vy = (target.vy ?? 0) - nudgeY * 0.5;
    }
  };
}

function SelectionSync({
  onChange,
}: {
  onChange(nodeIds: string[], edgeIds: string[]): void;
}) {
  useOnSelectionChange({
    onChange: ({ nodes, edges }) => {
      onChange(
        nodes.map((node) => node.id),
        edges.map((edge) => edge.id),
      );
    },
  });

  return null;
}

function mapLayerNodes(graph: GraphSnapshot): Node[] {
  const groupNodes: Node[] = graph.layers.map((layer) => ({
    id: layer.id,
    type: "group",
    data: { label: layer.label },
    position: { x: layer.x, y: layer.y },
    style: {
      width: layer.width,
      height: layer.height,
      background: "rgba(28, 25, 23, 0.6)",
      border: "1px dashed rgba(168, 162, 158, 0.28)",
      borderRadius: "20px",
      color: "rgba(245, 245, 244, 0.9)",
      padding: 12,
    },
    draggable: true,
    selectable: false,
  }));

  const semanticNodes: Node[] = graph.nodes.map((node) => mapSemanticNode(node));
  return [...groupNodes, ...semanticNodes];
}

function mapNodes(
  graph: GraphSnapshot,
  activeLayerId: string | null,
  pinnedNodeIds: string[],
  hideNodeFromLayer: (layerId: string, sourceNodeId: string) => void,
  toggleNodePinned: (nodeId: string, pinned: boolean, fallbackPosition: { x: number; y: number }) => void,
): Node[] {
  const pinnedSet = new Set(pinnedNodeIds);
  const nodes = mapLayerNodes(graph);
  return nodes.map((node) => {
    const isGroup = node.type === "group";
    const nodeLayerId = isGroup
      ? node.id
      : String((node.data as { layerId?: string }).layerId ?? node.parentId ?? "");
    const isActiveLayer = !activeLayerId || nodeLayerId === activeLayerId;

    return {
      ...node,
      draggable: isGroup ? isActiveLayer : isActiveLayer && node.draggable !== false,
      selectable: isGroup ? false : isActiveLayer,
      style: {
        ...node.style,
        opacity: isActiveLayer ? 1 : 0.38,
      },
      data: {
        ...(node.data as object),
        isActiveLayer,
        isPinned: !isGroup && pinnedSet.has(node.id),
        onTogglePin:
          !isGroup && node.type === "semanticNode"
            ? () => toggleNodePinned(node.id, !pinnedSet.has(node.id), node.position)
            : undefined,
        onHide:
          !isGroup && isActiveLayer && node.type === "semanticNode"
            ? () =>
                hideNodeFromLayer(
                  nodeLayerId,
                  String((node.data as { sourceId?: string }).sourceId),
                )
            : undefined,
      },
    } satisfies Node;
  });
}

function mapSemanticNode(node: AgentGraphNode): Node {
  if (node.kind === "hidden-context-portal") {
    return {
      id: node.id,
      parentId: node.ownerNodeId ?? node.parentLayerId,
      type: "hiddenContextPortal",
      data: {
        label: node.label,
        summary: node.summary,
        hiddenCount: node.hiddenCount ?? 0,
        layerId: node.parentLayerId,
        independentlyPositioned: node.independentlyPositioned ?? false,
      },
      position: node.position,
      draggable: true,
    };
  }

  return {
    id: node.id,
    parentId: node.parentLayerId,
    type: "semanticNode",
    data: {
      label: node.label,
      summary: node.summary,
      sourceId: node.sourceId,
      layerId: node.parentLayerId,
    },
    position: node.position,
    draggable: true,
  };
}

function mapEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type:
      edge.kind === "derived"
        ? "derived"
        : edge.kind === "hidden-context"
          ? "direct"
          : "direct",
    label:
      edge.kind === "derived" && edge.multiplicity > 1
        ? `${edge.label} ×${edge.multiplicity}`
        : edge.label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.kind === "derived" ? "#fbbf24" : "#60a5fa",
    },
    data: edge,
    animated: edge.kind === "derived",
  }));
}

function mergeMappedNodesWithLocalPositions(mappedNodes: Node[], currentNodes: Node[]): Node[] {
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  return mappedNodes.map((mappedNode) => {
    const currentNode = currentNodeById.get(mappedNode.id);
    if (!currentNode) {
      return mappedNode;
    }

    return {
      ...mappedNode,
      position: currentNode.position,
      selected: currentNode.selected,
      dragging: currentNode.dragging,
      width: currentNode.width,
      height: currentNode.height,
    };
  });
}

export const AgentGraphCanvas = observer(function AgentGraphCanvas({
  store,
  actions,
}: CanvasProps) {
  const graph = useSelector(store.state$.graph);
  const activeLayerId = useSelector(store.state$.activeLayerId);
  const physicsEnabled = useSelector(store.state$.layout.physicsEnabled);
  const pinnedNodeIds = useSelector(store.state$.layout.pinnedNodeIds);
  const springStrength = useSelector(store.state$.layout.springStrength);
  const springLength = useSelector(store.state$.layout.springLength);
  const straightenStrength = useSelector(store.state$.layout.straightenStrength);
  const repulsionStrength = useSelector(store.state$.layout.repulsionStrength);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const hasFittedInitialViewRef = useRef(false);
  const localNodesRef = useRef<Node[]>([]);
  const localEdgesRef = useRef<Edge[]>([]);
  const pinnedNodeIdsRef = useRef<string[]>([]);
  const physicsModelRef = useRef<{
    nodes: ForceNodeDatum[];
    movableNodeIds: string[];
    simulation: Simulation<ForceNodeDatum, SimulationLinkDatum<ForceNodeDatum>>;
  } | null>(null);
  const persistenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldNodeTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const mappedNodes = useMemo(
    () =>
      graph
        ? mapNodes(
            graph,
            activeLayerId,
            pinnedNodeIds,
            actions.hideNodeFromLayer,
            (nodeId, pinned, fallbackPosition) => {
              const currentPosition =
                reactFlowRef.current?.getNode(nodeId)?.position ??
                localNodesRef.current.find((candidate) => candidate.id === nodeId)?.position ??
                fallbackPosition;
              if (pinned) {
                lockNodeToCurrentPosition(nodeId, currentPosition.x, currentPosition.y);
              }
              actions.setNodePinned(nodeId, pinned, currentPosition);
            },
          )
        : [],
    [actions.hideNodeFromLayer, actions.setNodePinned, graph, activeLayerId, pinnedNodeIds],
  );
  const mappedEdges = useMemo(() => (graph ? mapEdges(graph.edges) : []), [graph]);
  const [localNodes, setLocalNodes, onNodesChange] = useNodesState(mappedNodes);
  const [localEdges, setLocalEdges, onEdgesChange] = useEdgesState(mappedEdges);

  useEffect(() => {
    if (!graph) {
      hasFittedInitialViewRef.current = false;
    }
  }, [graph]);

  useEffect(() => {
    setLocalNodes((current) => mergeMappedNodesWithLocalPositions(mappedNodes, current));
  }, [mappedNodes, physicsEnabled, setLocalNodes]);

  useEffect(() => {
    setLocalEdges(mappedEdges);
  }, [mappedEdges, setLocalEdges]);

  useEffect(() => {
    localNodesRef.current = localNodes;
  }, [localNodes]);

  useEffect(() => {
    localEdgesRef.current = localEdges;
  }, [localEdges]);

  useEffect(() => {
    pinnedNodeIdsRef.current = pinnedNodeIds;
  }, [pinnedNodeIds]);

  useEffect(() => {
    if (!graph || hasFittedInitialViewRef.current || !reactFlowRef.current) {
      return;
    }

    reactFlowRef.current.fitView({
      padding: 0.18,
      duration: 0,
      includeHiddenNodes: false,
    });
    hasFittedInitialViewRef.current = true;
  }, [graph]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const nodeLayerId =
      node.type === "group"
        ? node.id
        : String((node.data as { layerId?: string }).layerId ?? node.parentId ?? "");
    if (activeLayerId && nodeLayerId !== activeLayerId) {
      return;
    }

    if (node.type === "hiddenContextPortal") {
      actions.revealHiddenContext(node.id);
    }
  };

  function schedulePersistence(nodes: ForceNodeDatum[], movableNodeIds: string[]): void {
    if (persistenceTimeoutRef.current) {
      return;
    }
    persistenceTimeoutRef.current = setTimeout(() => {
      persistenceTimeoutRef.current = null;
      persistForcePositions(nodes, movableNodeIds);
    }, 300);
  }

  function flushPendingPersistence(): void {
    if (persistenceTimeoutRef.current) {
      clearTimeout(persistenceTimeoutRef.current);
      persistenceTimeoutRef.current = null;
    }
  }

  function clearHeldNodeTimeout(nodeId: string): void {
    const timeout = heldNodeTimeoutsRef.current.get(nodeId);
    if (timeout) {
      clearTimeout(timeout);
      heldNodeTimeoutsRef.current.delete(nodeId);
    }
  }

  function lockNodeToCurrentPosition(nodeId: string, x: number, y: number): void {
    const forceNode = physicsModelRef.current?.nodes.find((candidate) => candidate.id === nodeId);
    if (!forceNode) {
      return;
    }
    const centerX = x + forceNode.width / 2;
    const centerY = y + forceNode.height / 2;
    forceNode.x = centerX;
    forceNode.y = centerY;
    forceNode.fx = centerX;
    forceNode.fy = centerY;
    physicsModelRef.current?.simulation.alpha(0.18).restart();
  }

  function releaseNodeAfterTimeout(nodeId: string): void {
    if (!physicsEnabled) {
      return;
    }
    clearHeldNodeTimeout(nodeId);
    const timeout = setTimeout(() => {
      heldNodeTimeoutsRef.current.delete(nodeId);
      const forceNode = physicsModelRef.current?.nodes.find((candidate) => candidate.id === nodeId);
      if (!forceNode || pinnedNodeIdsRef.current.includes(nodeId)) {
        return;
      }
      forceNode.fx = null;
      forceNode.fy = null;
      physicsModelRef.current?.simulation.alpha(0.42).restart();
    }, 1200);
    heldNodeTimeoutsRef.current.set(nodeId, timeout);
  }

  function buildForceModel(): {
    nodes: ForceNodeDatum[];
    movableNodeIds: string[];
    simulation: Simulation<ForceNodeDatum, SimulationLinkDatum<ForceNodeDatum>>;
  } | null {
    if (!activeLayerId) {
      return null;
    }

    const layerNodes = localNodesRef.current.filter(
      (node) => {
        const data = node.data as
          | { layerId?: string; independentlyPositioned?: boolean }
          | undefined;
        if (data?.layerId !== activeLayerId) {
          return false;
        }
        if (node.type === "semanticNode") {
          return true;
        }
        return node.type === "hiddenContextPortal" && data?.independentlyPositioned === true;
      },
    );
    const pinnedSet = new Set(pinnedNodeIds);
    const movableNodeIds = layerNodes
      .map((node) => node.id)
      .filter((nodeId) => !pinnedSet.has(nodeId));

    if (movableNodeIds.length === 0) {
      return null;
    }

    const movableSet = new Set(movableNodeIds);
    const nodes: ForceNodeDatum[] = layerNodes.map((node, index) => {
      const movableIndex = movableNodeIds.indexOf(node.id);
      const angle =
        movableIndex >= 0 ? (movableIndex / Math.max(movableNodeIds.length, 1)) * Math.PI * 2 : 0;
      const radius = 24 + movableIndex * 4;
      const { width, height } = nodeDimensions(node);
      const centerX = node.position.x + width / 2;
      const centerY = node.position.y + height / 2;
      return {
        id: node.id,
        width,
        height,
        x: centerX + (movableSet.has(node.id) ? Math.cos(angle) * radius : 0),
        y: centerY + (movableSet.has(node.id) ? Math.sin(angle) * radius : 0),
        fx: movableSet.has(node.id) ? null : centerX,
        fy: movableSet.has(node.id) ? null : centerY,
      };
    });
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const links: SimulationLinkDatum<ForceNodeDatum>[] = localEdgesRef.current
      .filter((edge) => nodeMap.has(String(edge.source)) && nodeMap.has(String(edge.target)))
      .map((edge) => ({
        source: String(edge.source),
        target: String(edge.target),
      }));

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink(links)
          .id((node) => (node as ForceNodeDatum).id)
          .distance((link) => {
            const source = link.source as ForceNodeDatum;
            const target = link.target as ForceNodeDatum;
            return source.width / 2 + target.width / 2 + springLength;
          })
          .strength(springStrength),
      )
      .force("handleStraighten", createHandleStraightenForce(links, straightenStrength, springLength))
      .force("charge", forceManyBody().strength(-repulsionStrength))
      .force("collide", forceCollide(92));

    return { nodes, movableNodeIds, simulation };
  }

  function applyForcePositions(nodes: ForceNodeDatum[]): void {
    const nextPositions = new Map(
      nodes.map((node) => [
        node.id,
        {
          x: (node.x ?? 0) - node.width / 2,
          y: (node.y ?? 0) - node.height / 2,
        },
      ]),
    );

    setLocalNodes((current) =>
      current.map((node) =>
        nextPositions.has(node.id)
          ? {
              ...node,
              position: nextPositions.get(node.id)!,
            }
          : node,
      ),
    );
  }

  function persistForcePositions(nodes: ForceNodeDatum[], movableNodeIds: string[]): void {
    const movableSet = new Set(movableNodeIds);
    const pinnedSet = new Set(pinnedNodeIdsRef.current);
    const currentNodeById = new Map(localNodesRef.current.map((node) => [node.id, node]));
    for (const node of nodes) {
      if (movableSet.has(node.id) && !pinnedSet.has(node.id)) {
        const currentNode = currentNodeById.get(node.id);
        actions.moveNode(
          node.id,
          currentNode?.position.x ?? node.x ?? 0,
          currentNode?.position.y ?? node.y ?? 0,
        );
      }
    }
  }

  useEffect(() => {
    if (!physicsEnabled) {
      flushPendingPersistence();
      physicsModelRef.current = null;
      return;
    }

    const model = buildForceModel();
    if (!model) {
      actions.setPhysicsEnabled(false);
      return;
    }

    physicsModelRef.current = model;
    const simulation = model.simulation;
    simulation.alpha(0.9);
    simulation.on("tick", () => {
      applyForcePositions(model.nodes);
      schedulePersistence(model.nodes, model.movableNodeIds);
    });

    return () => {
      simulation.stop();
      flushPendingPersistence();
      persistForcePositions(model.nodes, model.movableNodeIds);
      physicsModelRef.current = null;
    };
  }, [
    physicsEnabled,
    activeLayerId,
    pinnedNodeIds.join("|"),
    springStrength,
    springLength,
    straightenStrength,
    repulsionStrength,
  ]);

  useEffect(() => {
    if (!physicsEnabled) {
      return;
    }
    const pinnedSet = new Set(pinnedNodeIds);
    for (const nodeId of pinnedSet) {
      clearHeldNodeTimeout(nodeId);
      const localNode = localNodesRef.current.find((candidate) => candidate.id === nodeId);
      if (localNode) {
        lockNodeToCurrentPosition(nodeId, localNode.position.x, localNode.position.y);
      }
    }
  }, [physicsEnabled, pinnedNodeIds.join("|")]);

  useEffect(() => {
    if (!physicsEnabled) {
      for (const timeout of heldNodeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      heldNodeTimeoutsRef.current.clear();
      return;
    }
    actions.setPhysicsEnabled(false);
  }, [activeLayerId]);

  useEffect(
    () => () => {
      for (const timeout of heldNodeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      heldNodeTimeoutsRef.current.clear();
    },
    [],
  );

  return (
    <section className="h-full min-h-[720px] overflow-hidden">
      <div className="h-full w-full">
        <ReactFlow
          className="[&_.react-flow__pane]:bg-transparent [&_.react-flow__renderer]:bg-transparent [&_.react-flow__viewport]:bg-transparent"
          nodes={localNodes}
          edges={localEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          autoPanOnNodeDrag
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => {
            reactFlowRef.current = instance;
          }}
          onNodeClick={onNodeClick}
          onEdgeClick={(_, edge) => {
            const data = edge.data as GraphEdge | undefined;
            if (data?.kind === "derived") {
              actions.inspectDerivedEdge(edge.id, data.supportingPathIds);
            }
          }}
          onNodeDragStart={(_, node) => {
            if (!physicsEnabled) {
              return;
            }
            if (graph?.layers.some((layer) => layer.id === node.id)) {
              return;
            }
            clearHeldNodeTimeout(node.id);
            lockNodeToCurrentPosition(node.id, node.position.x, node.position.y);
          }}
          onNodeDrag={(_, node) => {
            if (!physicsEnabled) {
              return;
            }
            if (graph?.layers.some((layer) => layer.id === node.id)) {
              return;
            }
            lockNodeToCurrentPosition(node.id, node.position.x, node.position.y);
          }}
          onNodeDragStop={(_, node) => {
            const nodeLayerId =
              node.type === "group"
                ? node.id
                : String((node.data as { layerId?: string }).layerId ?? node.parentId ?? "");
            if (activeLayerId && nodeLayerId !== activeLayerId) {
              return;
            }

            if (graph?.layers.some((layer) => layer.id === node.id)) {
              actions.moveLayer(node.id, node.position.x, node.position.y);
            } else {
              actions.moveNode(node.id, node.position.x, node.position.y);
              if (physicsEnabled) {
                releaseNodeAfterTimeout(node.id);
              }
              if (physicsEnabled && pinnedNodeIds.includes(node.id) && physicsModelRef.current) {
                const forceNode = physicsModelRef.current.nodes.find(
                  (candidate) => candidate.id === node.id,
                );
                if (forceNode) {
                  forceNode.x = node.position.x;
                  forceNode.y = node.position.y;
                  forceNode.fx = node.position.x;
                  forceNode.fy = node.position.y;
                  physicsModelRef.current.simulation.alpha(0.45).restart();
                }
              }
            }
          }}
          minZoom={0.2}
          maxZoom={1.8}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
          <SelectionSync onChange={actions.setCanvasSelection} />
          <Background gap={24} color="rgba(120, 113, 108, 0.16)" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            maskColor="rgba(20, 17, 15, 0.72)"
            nodeColor={(node) =>
              node.type === "group"
                ? "rgba(120, 113, 108, 0.22)"
                : node.type === "hiddenContextPortal"
                  ? "#f59e0b"
                  : "#e7e5e4"
            }
            nodeStrokeColor={(node) =>
              node.type === "group"
                ? "rgba(168, 162, 158, 0.36)"
                : node.type === "hiddenContextPortal"
                  ? "#f59e0b"
                  : "#60a5fa"
            }
            nodeBorderRadius={8}
            style={{
              zIndex: 30,
              right: 324,
              bottom: 12,
              backgroundColor: "rgba(18, 17, 15, 0.88)",
              border: "1px solid rgba(41, 37, 36, 0.95)",
              borderRadius: 16,
            }}
          />
          <Controls
            position="bottom-left"
            style={{
              zIndex: 30,
              left: 292,
              bottom: 12,
              background: "rgba(18, 17, 15, 0.88)",
              border: "1px solid rgba(41, 37, 36, 0.95)",
              borderRadius: 16,
            }}
          />
        </ReactFlow>
      </div>
    </section>
  );
});
