import type { GraphEdge, LayerDefinition, SourceEdge } from "./types.js";

type PathResult = {
  pathEdgeIds: string[];
  targetId: string;
};

function shortestHiddenPath(args: {
  sourceId: string;
  targetId: string;
  sourceEdges: SourceEdge[];
  visibleSourceIds: Set<string>;
}): PathResult | null {
  const { sourceId, targetId, sourceEdges, visibleSourceIds } = args;
  const queue: Array<{ nodeId: string; pathEdgeIds: string[] }> = [
    { nodeId: sourceId, pathEdgeIds: [] },
  ];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of sourceEdges.filter((candidate) => candidate.sourceId === current.nodeId)) {
      const isTarget = edge.targetId === targetId;
      const nextVisible = visibleSourceIds.has(edge.targetId);
      const nextHiddenAllowed = !nextVisible || isTarget;

      if (!nextHiddenAllowed || visited.has(edge.targetId)) {
        continue;
      }

      const nextPath = [...current.pathEdgeIds, edge.id];
      if (isTarget && nextPath.length > 1) {
        return {
          pathEdgeIds: nextPath,
          targetId,
        };
      }

      visited.add(edge.targetId);
      queue.push({
        nodeId: edge.targetId,
        pathEdgeIds: nextPath,
      });
    }
  }

  return null;
}

export function buildDerivedEdges(args: {
  layers: LayerDefinition[];
  renderedNodeIdsBySourceId: Map<string, string[]>;
  sourceEdges: SourceEdge[];
  visibleSourceIds: Set<string>;
}): GraphEdge[] {
  const { layers, renderedNodeIdsBySourceId, sourceEdges, visibleSourceIds } = args;
  const visibleIds = [...visibleSourceIds];
  const derivedEdges: GraphEdge[] = [];
  const directPairs = new Set(sourceEdges.map((edge) => `${edge.sourceId}->${edge.targetId}`));
  const visibleLayerIds = new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id));

  for (const sourceId of visibleIds) {
    for (const targetId of visibleIds) {
      if (sourceId === targetId || directPairs.has(`${sourceId}->${targetId}`)) {
        continue;
      }

      const path = shortestHiddenPath({
        sourceId,
        targetId,
        sourceEdges,
        visibleSourceIds,
      });
      if (!path) {
        continue;
      }

      const sourceRenderedIds =
        renderedNodeIdsBySourceId.get(sourceId)?.filter((id) => {
          const [, layerId] = id.split("::");
          return visibleLayerIds.has(layerId);
        }) ?? [];
      const targetRenderedIds =
        renderedNodeIdsBySourceId.get(targetId)?.filter((id) => {
          const [, layerId] = id.split("::");
          return visibleLayerIds.has(layerId);
        }) ?? [];

      for (const sourceRenderedId of sourceRenderedIds) {
        for (const targetRenderedId of targetRenderedIds) {
          const edgeId = `derived:${sourceRenderedId}:${targetRenderedId}`;
          if (derivedEdges.some((edge) => edge.id === edgeId)) {
            continue;
          }

          derivedEdges.push({
            id: edgeId,
            sourceId: null,
            source: sourceRenderedId,
            target: targetRenderedId,
            kind: "derived",
            label: "derived connection",
            multiplicity: 1,
            supportingPathIds: path.pathEdgeIds,
          });
        }
      }
    }
  }

  return derivedEdges;
}
