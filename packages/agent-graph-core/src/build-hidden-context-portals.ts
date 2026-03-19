import type {
  GraphEdge,
  GraphNode,
  LayerDefinition,
  SourceEdge,
  SourceNode,
} from "./types.js";

export function buildHiddenContextPortals(args: {
  renderedNodes: GraphNode[];
  layers: LayerDefinition[];
  sourceNodes: SourceNode[];
  sourceEdges: SourceEdge[];
  visibleSourceIds: Set<string>;
}): { portals: GraphNode[]; portalEdges: GraphEdge[] } {
  const { renderedNodes, sourceNodes, sourceEdges, visibleSourceIds } = args;
  const sourceNodeById = new Map(sourceNodes.map((node) => [node.id, node]));
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
    portals.push({
      id: portalId,
      sourceId: renderedNode.sourceId,
      parentLayerId: renderedNode.parentLayerId,
      label: `${hiddenNeighbors.length} hidden`,
      kind: "hidden-context-portal",
      position: {
        x: renderedNode.position.x + 220,
        y: renderedNode.position.y,
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
      label: "hidden context",
      multiplicity: hiddenNeighbors.length,
      supportingPathIds: hiddenNeighbors.map((entry) => entry.edge.id),
    });
  }

  return { portals, portalEdges };
}
