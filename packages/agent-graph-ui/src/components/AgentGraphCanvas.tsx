import { useMemo } from "react";
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

type CanvasProps = {
  store: AgentGraphStore;
  actions: {
    selectNode(nodeId: string | null): void;
    selectEdge(edgeId: string | null): void;
    moveLayer(layerId: string, x: number, y: number): void;
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
      draggable: false,
    };
  }

  return {
    id: node.id,
    parentId: node.parentLayerId,
    extent: "parent",
    type: "default",
    data: {
      label: node.label,
      summary: node.summary,
      sourceId: node.sourceId,
    },
    position: node.position,
    draggable: false,
    style: {
      width: 168,
      borderRadius: "16px",
      border: "1px solid rgba(90, 81, 72, 0.7)",
      background: "rgba(24, 24, 27, 0.96)",
      color: "#f5f5f4",
      padding: "10px 12px",
      fontSize: 12,
    },
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

  const nodes = useMemo(() => (graph ? mapLayerNodes(graph) : []), [graph]);
  const edges = useMemo(() => (graph ? mapEdges(graph.edges) : []), [graph]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    actions.selectEdge(null);
    actions.selectNode(node.id);
    if (node.type === "hiddenContextPortal") {
      actions.revealHiddenContext(node.id);
    }
  };

  return (
    <section className="min-h-[720px] overflow-hidden rounded-3xl border border-stone-800 bg-stone-900/80">
      <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3">
        <div>
          <h2 className="font-['Space_Grotesk'] text-lg font-medium text-stone-50">
            Shared graph plane
          </h2>
          <p className="text-sm text-stone-400">
            Persistent layers render together in one complete graph workspace.
          </p>
        </div>
      </div>
      <div className="h-[760px]">
        <ReactFlow
          fitView
          nodes={nodes}
          edges={edges}
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
            if (graph?.layers.some((layer) => layer.id === node.id)) {
              actions.moveLayer(node.id, node.position.x, node.position.y);
            }
          }}
          nodeTypes={{
            hiddenContextPortal: HiddenContextPortalNode,
          }}
          edgeTypes={{
            direct: DirectEdgeRenderer,
            derived: DerivedEdgeRenderer,
          }}
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
