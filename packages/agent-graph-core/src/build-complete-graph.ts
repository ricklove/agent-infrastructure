import { buildDerivedEdges } from "./build-derived-edges.js";
import { buildHiddenContextPortals } from "./build-hidden-context-portals.js";
import type {
  GraphEdge,
  GraphLayer,
  GraphNode,
  LayerDefinition,
  SourceWorkspace,
  WorkspaceState,
  GraphSnapshot,
} from "./types.js";

function computeLayerDimensions(layer: LayerDefinition, nodeCount: number): GraphLayer {
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(nodeCount, 1))));
  const rows = Math.max(1, Math.ceil(Math.max(nodeCount, 1) / columns));

  return {
    ...layer,
    width: 440,
    height: Math.max(240, rows * 144 + 96),
  };
}

export function buildCompleteGraph(args: {
  sourceWorkspace: SourceWorkspace;
  workspaceState: WorkspaceState;
}): GraphSnapshot {
  const { sourceWorkspace, workspaceState } = args;
  const layers = workspaceState.layers.filter((layer) => layer.visible);
  const visibleSourceIds = new Set(layers.flatMap((layer) => layer.nodeIds));
  const renderedNodeIdsBySourceId = new Map<string, string[]>();
  const graphLayers = layers.map((layer) => computeLayerDimensions(layer, layer.nodeIds.length));
  const graphNodes: GraphNode[] = [];

  for (const layer of graphLayers) {
    layer.nodeIds.forEach((sourceId, index) => {
      const sourceNode = sourceWorkspace.nodes.find((node) => node.id === sourceId);
      if (!sourceNode) {
        return;
      }

      const col = index % 2;
      const row = Math.floor(index / 2);
      const id = `${sourceId}::${layer.id}`;
      const graphNode: GraphNode = {
        id,
        sourceId,
        parentLayerId: layer.id,
        label: sourceNode.label,
        kind: "semantic-node",
        position: {
          x: 28 + col * 196,
          y: 56 + row * 124,
        },
        summary: sourceNode.summary,
      };
      graphNodes.push(graphNode);
      renderedNodeIdsBySourceId.set(sourceId, [
        ...(renderedNodeIdsBySourceId.get(sourceId) ?? []),
        graphNode.id,
      ]);
    });
  }

  const directEdges: GraphEdge[] = [];
  for (const edge of sourceWorkspace.edges) {
    const sourceIds = renderedNodeIdsBySourceId.get(edge.sourceId) ?? [];
    const targetIds = renderedNodeIdsBySourceId.get(edge.targetId) ?? [];
    for (const source of sourceIds) {
      for (const target of targetIds) {
        directEdges.push({
          id: `${edge.id}::${source}::${target}`,
          sourceId: edge.id,
          source,
          target,
          kind: "direct",
          label: edge.label,
          multiplicity: 1,
          supportingPathIds: [edge.id],
        });
      }
    }
  }

  const derivedEdges = buildDerivedEdges({
    layers: graphLayers,
    renderedNodeIdsBySourceId,
    sourceEdges: sourceWorkspace.edges,
    visibleSourceIds,
  });

  const { portals, portalEdges } = buildHiddenContextPortals({
    renderedNodes: graphNodes,
    layers,
    sourceNodes: sourceWorkspace.nodes,
    sourceEdges: sourceWorkspace.edges,
    visibleSourceIds,
  });

  return {
    workspaceId: sourceWorkspace.id,
    revision: sourceWorkspace.revision,
    layers: graphLayers,
    nodes: [...graphNodes, ...portals],
    edges: [...directEdges, ...derivedEdges, ...portalEdges],
  };
}
