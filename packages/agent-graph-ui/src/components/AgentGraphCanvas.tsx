import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
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

function mapNodesWithOverrides(
  graph: GraphSnapshot,
  positionOverrides: Record<string, { x: number; y: number }>,
  activeLayerId: string | null,
): Node[] {
  const nodes = mapLayerNodes(graph);
  return nodes.map((node) => {
    const isGroup = node.type === "group";
    const nodeLayerId = isGroup ? node.id : String(node.parentId ?? "");
    const isActiveLayer = !activeLayerId || nodeLayerId === activeLayerId;
    const override = positionOverrides[node.id];
    const nextNode: Node = {
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
      },
    };

    if (!override) {
      return nextNode;
    }

    return {
      ...nextNode,
      position: override,
    };
  });
}

function mapSemanticNode(node: AgentGraphNode): Node {
  if (node.kind === "hidden-context-portal") {
    return {
      id: node.id,
      parentId: node.parentLayerId,
      extent: "parent",
      type: "hiddenContextPortal",
      data: {
        label: node.label,
        summary: node.summary,
        hiddenCount: node.hiddenCount ?? 0,
      },
      position: node.position,
      draggable: true,
    };
  }

  return {
    id: node.id,
    parentId: node.parentLayerId,
    extent: "parent",
    type: "semanticNode",
    data: {
      label: node.label,
      summary: node.summary,
      sourceId: node.sourceId,
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
  const [positionOverrides, setPositionOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({});

  useEffect(() => {
    if (!graph) {
      setPositionOverrides({});
      return;
    }

    setPositionOverrides((current) => {
      const next: Record<string, { x: number; y: number }> = {};
      const basePositions = new Map<string, { x: number; y: number }>();

      for (const layer of graph.layers) {
        basePositions.set(layer.id, { x: layer.x, y: layer.y });
      }
      for (const node of graph.nodes) {
        basePositions.set(node.id, node.position);
      }

      for (const [id, override] of Object.entries(current)) {
        const base = basePositions.get(id);
        if (!override) {
          continue;
        }

        if (!base || override.x !== base.x || override.y !== base.y) {
          next[id] = override;
        }
      }
      return next;
    });
  }, [graph]);

  const nodes = useMemo(
    () => (graph ? mapNodesWithOverrides(graph, positionOverrides, activeLayerId) : []),
    [graph, positionOverrides, activeLayerId],
  );
  const edges = useMemo(() => (graph ? mapEdges(graph.edges) : []), [graph]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const nodeLayerId = node.type === "group" ? node.id : String(node.parentId ?? "");
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
          fitView
          nodes={nodes}
          edges={edges}
          proOptions={{ hideAttribution: true }}
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
            const nodeLayerId = node.type === "group" ? node.id : String(node.parentId ?? "");
            if (activeLayerId && nodeLayerId !== activeLayerId) {
              return;
            }

            setPositionOverrides((current) => ({
              ...current,
              [node.id]: {
                x: node.position.x,
                y: node.position.y,
              },
            }));
            if (graph?.layers.some((layer) => layer.id === node.id)) {
              actions.moveLayer(node.id, node.position.x, node.position.y);
            } else {
              actions.moveNode(node.id, node.position.x, node.position.y);
            }
          }}
          onNodeDrag={(_, node) => {
            const nodeLayerId = node.type === "group" ? node.id : String(node.parentId ?? "");
            if (activeLayerId && nodeLayerId !== activeLayerId) {
              return;
            }

            setPositionOverrides((current) => ({
              ...current,
              [node.id]: {
                x: node.position.x,
                y: node.position.y,
              },
            }));
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.2}
          maxZoom={1.8}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
          <Background gap={24} color="rgba(120, 113, 108, 0.16)" />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
});
