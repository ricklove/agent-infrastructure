import type {
  GraphEdge,
  GraphLayer,
  GraphNode,
  SourceEdge,
  SourceNode,
} from "./types.js";

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
    const hiddenNeighbors: Array<{ edge: SourceEdge; neighbor: SourceNode }> = [];
    for (const edge of sourceEdges) {
      if (edge.sourceId !== renderedNode.sourceId) {
        continue;
      }

      const neighbor = sourceNodeById.get(edge.targetId);
      if (!neighbor || visibleSourceIds.has(neighbor.id)) {
        continue;
      }

      hiddenNeighbors.push({ edge, neighbor });
    }

    if (hiddenNeighbors.length === 0) {
      continue;
    }

    const portalId = `portal:${renderedNode.id}`;
    const parentLayer = layerById.get(renderedNode.parentLayerId);
    portals.push({
      id: portalId,
      sourceId: renderedNode.sourceId,
      parentLayerId: renderedNode.parentLayerId,
      label: `${hiddenNeighbors.length} hidden`,
      kind: "hidden-context-portal",
      position:
        nodePositions?.[portalId] ?? {
          x: Math.min(
            renderedNode.position.x + 188,
            Math.max(36, (parentLayer?.width ?? 480) - 144),
          ),
          y: renderedNode.position.y + 12,
        },
      summary: hiddenNeighbors
        .map((entry) => `${entry.edge.kind} -> ${entry.neighbor.label}`)
        .join(", "),
      hiddenCount: hiddenNeighbors.length,
      hiddenKinds: [...new Set(hiddenNeighbors.map((entry) => entry.edge.kind))],
    });

    portalEdges.push({
      id: `portal-edge:${renderedNode.id}`,
      sourceId: null,
      source: renderedNode.id,
      target: portalId,
      kind: "hidden-context",
      label: "",
      multiplicity: hiddenNeighbors.length,
      supportingPathIds: hiddenNeighbors.map((entry) => entry.edge.id),
    });
  }

  return { portals, portalEdges };
}
