import type {
  GraphEdge,
  GraphLayer,
  GraphNode,
  SourceEdge,
  SourceNode,
} from "./types.js";

type HiddenNeighbor = {
  edge: SourceEdge;
  neighbor: SourceNode;
  direction: "incoming" | "outgoing";
};

export function buildHiddenContextPortals(args: {
  renderedNodes: GraphNode[];
  layers: GraphLayer[];
  sourceNodes: SourceNode[];
  sourceEdges: SourceEdge[];
  visibleSourceIds: Set<string>;
  nodePositions?: Record<string, { x: number; y: number }>;
}): { portals: GraphNode[]; portalEdges: GraphEdge[] } {
  const { renderedNodes, layers, sourceNodes, sourceEdges, visibleSourceIds, nodePositions } = args;
  const sourceNodeById = new Map(sourceNodes.map((node) => [node.id, node]));
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const portals: GraphNode[] = [];
  const portalEdges: GraphEdge[] = [];

  for (const renderedNode of renderedNodes) {
    const hiddenIncoming: HiddenNeighbor[] = [];
    const hiddenOutgoing: HiddenNeighbor[] = [];
    for (const edge of sourceEdges) {
      if (edge.sourceId === renderedNode.sourceId) {
        const neighbor = sourceNodeById.get(edge.targetId);
        if (neighbor && !visibleSourceIds.has(neighbor.id)) {
          hiddenOutgoing.push({ edge, neighbor, direction: "outgoing" });
        }
      }

      if (edge.targetId === renderedNode.sourceId) {
        const neighbor = sourceNodeById.get(edge.sourceId);
        if (neighbor && !visibleSourceIds.has(neighbor.id)) {
          hiddenIncoming.push({ edge, neighbor, direction: "incoming" });
        }
      }
    }

    if (hiddenIncoming.length === 0 && hiddenOutgoing.length === 0) {
      continue;
    }

    const parentLayer = layerById.get(renderedNode.parentLayerId);
    const portalGroups = [
      {
        neighbors: hiddenIncoming,
        direction: "incoming" as const,
        x: Math.max(8, renderedNode.position.x - 68),
      },
      {
        neighbors: hiddenOutgoing,
        direction: "outgoing" as const,
        x: Math.min(
          renderedNode.position.x + 188,
          Math.max(36, (parentLayer?.width ?? 480) - 144),
        ),
      },
    ];

    for (const portalGroup of portalGroups) {
      if (portalGroup.neighbors.length === 0) {
        continue;
      }

      const portalId = `portal:${portalGroup.direction}:${renderedNode.id}`;
      portals.push({
        id: portalId,
        sourceId: renderedNode.sourceId,
        parentLayerId: renderedNode.parentLayerId,
        ownerNodeId: renderedNode.id,
        label: `${portalGroup.neighbors.length} hidden`,
        kind: "hidden-context-portal",
        position:
          nodePositions?.[portalId] ?? {
            x:
              portalGroup.direction === "incoming"
                ? -54
                : 132,
            y: 22,
          },
        summary: portalGroup.neighbors
          .map((entry) =>
            portalGroup.direction === "incoming"
              ? `${entry.neighbor.label} -> ${entry.edge.kind}`
              : `${entry.edge.kind} -> ${entry.neighbor.label}`,
          )
          .join(", "),
        hiddenCount: portalGroup.neighbors.length,
        hiddenKinds: [...new Set(portalGroup.neighbors.map((entry) => entry.edge.kind))],
        independentlyPositioned: Boolean(nodePositions?.[portalId]),
      });

      portalEdges.push({
        id: `portal-edge:${portalGroup.direction}:${renderedNode.id}`,
        sourceId: null,
        source:
          portalGroup.direction === "incoming" ? portalId : renderedNode.id,
        target:
          portalGroup.direction === "incoming" ? renderedNode.id : portalId,
        kind: "hidden-context",
        label: "",
        multiplicity: portalGroup.neighbors.length,
        supportingPathIds: portalGroup.neighbors.map((entry) => entry.edge.id),
      });
    }
  }

  return { portals, portalEdges };
}
