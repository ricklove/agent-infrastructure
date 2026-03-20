import { buildDerivedEdges } from "./build-derived-edges.js";
import { buildHiddenContextPortals } from "./build-hidden-context-portals.js";
import type {
  GraphEdge,
  GraphLayer,
  GraphNode,
  SourceWorkspace,
  WorkspaceState,
  GraphSnapshot,
} from "./types.js";

const LAYER_PADDING_X = 32;
const LAYER_PADDING_Y = 40;
const NODE_WIDTH = 168;
const NODE_COLUMN_GAP = 360;
const NODE_ROW_GAP = 156;
const PORTAL_OFFSET_X = 188;
const PORTAL_WIDTH = 112;

function computeLayerLayout(layer: WorkspaceState["layers"][number], nodeCount: number): {
  columns: number;
  rows: number;
  graphLayer: GraphLayer;
} {
  const columns =
    layer.kind === "overview"
      ? Math.min(3, Math.max(1, nodeCount))
      : Math.max(1, Math.ceil(Math.sqrt(Math.max(nodeCount, 1))));
  const rows = Math.max(1, Math.ceil(Math.max(nodeCount, 1) / columns));

  return {
    columns,
    rows,
    graphLayer: {
      ...layer,
      width: Math.max(
        520,
        LAYER_PADDING_X * 2 +
          NODE_WIDTH +
          PORTAL_OFFSET_X +
          PORTAL_WIDTH +
          Math.max(0, columns - 1) * NODE_COLUMN_GAP,
      ),
      height: Math.max(260, LAYER_PADDING_Y * 2 + 96 + Math.max(0, rows - 1) * NODE_ROW_GAP),
    },
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
  const layerLayouts = layers.map((layer) => computeLayerLayout(layer, layer.nodeIds.length));
  const graphLayers = layerLayouts.map((layout) => layout.graphLayer);
  const graphNodes: GraphNode[] = [];

  for (const layerLayout of layerLayouts) {
    const layer = layerLayout.graphLayer;
    layer.nodeIds.forEach((sourceId, index) => {
      const sourceNode = sourceWorkspace.nodes.find((node) => node.id === sourceId);
      if (!sourceNode) {
        return;
      }

      const col = index % layerLayout.columns;
      const row = Math.floor(index / layerLayout.columns);
      const id = `${sourceId}::${layer.id}`;
      const graphNode: GraphNode = {
        id,
        sourceId,
        parentLayerId: layer.id,
        label: sourceNode.label,
        sourcePath: sourceNode.sourcePath,
        kind: "semantic-node",
        position:
          workspaceState.nodePositions[id] ?? {
          x: LAYER_PADDING_X + col * NODE_COLUMN_GAP,
          y: LAYER_PADDING_Y + 16 + row * NODE_ROW_GAP,
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
    layers: graphLayers,
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
