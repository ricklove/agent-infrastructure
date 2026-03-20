import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
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
    moveLayer(layerId: string, x: number, y: number): void;
    moveNode(nodeId: string, x: number, y: number): void;
    hideNodeFromLayer(layerId: string, sourceNodeId: string): void;
    revealHiddenContext(portalNodeId: string): void;
    inspectDerivedEdge(edgeId: string, supportingPathIds: string[]): void;
  };
};

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
  hideNodeFromLayer: (layerId: string, sourceNodeId: string) => void,
): Node[] {
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
      selectable: isActiveLayer,
      style: {
        ...node.style,
        opacity: isActiveLayer ? 1 : 0.38,
      },
      data: {
        ...(node.data as object),
        isActiveLayer,
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

export const AgentGraphCanvas = observer(function AgentGraphCanvas({
  store,
  actions,
}: CanvasProps) {
  const graph = useSelector(store.state$.graph);
  const activeLayerId = useSelector(store.state$.activeLayerId);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const hasFittedInitialViewRef = useRef(false);

  const mappedNodes = useMemo(
    () => (graph ? mapNodes(graph, activeLayerId, actions.hideNodeFromLayer) : []),
    [actions.hideNodeFromLayer, graph, activeLayerId],
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
    setLocalNodes(mappedNodes);
  }, [mappedNodes, setLocalNodes]);

  useEffect(() => {
    setLocalEdges(mappedEdges);
  }, [mappedEdges, setLocalEdges]);

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

    actions.selectEdge(null);
    actions.selectNode(node.id);
    if (node.type === "hiddenContextPortal") {
      actions.revealHiddenContext(node.id);
    }
  };

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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => {
            reactFlowRef.current = instance;
          }}
          onNodeClick={onNodeClick}
          onEdgeClick={(_, edge) => {
            actions.selectNode(null);
            actions.selectEdge(edge.id);
            const data = edge.data as GraphEdge | undefined;
            if (data?.kind === "derived") {
              actions.inspectDerivedEdge(edge.id, data.supportingPathIds);
            }
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
            }
          }}
          minZoom={0.2}
          maxZoom={1.8}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
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
