import type {
  GraphDiffSnapshot,
  LayerDefinition,
  SourceWorkspace,
  WorkspaceState,
} from "./types.js";

export function buildDiffLayers(args: {
  previous: SourceWorkspace;
  current: SourceWorkspace;
  workspaceState: WorkspaceState;
}): GraphDiffSnapshot {
  const { previous, current, workspaceState } = args;
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));

  const changedNodeIds = new Set<string>();
  for (const node of current.nodes) {
    const prev = previousNodes.get(node.id);
    if (!prev || prev.label !== node.label || prev.summary !== node.summary) {
      changedNodeIds.add(node.id);
    }
  }
  for (const node of previous.nodes) {
    if (!currentNodes.has(node.id)) {
      changedNodeIds.add(node.id);
    }
  }

  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]));
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));
  const changedEdgeIds = new Set<string>();
  for (const edge of current.edges) {
    const prev = previousEdges.get(edge.id);
    if (
      !prev ||
      prev.label !== edge.label ||
      prev.sourceId !== edge.sourceId ||
      prev.targetId !== edge.targetId
    ) {
      changedEdgeIds.add(edge.id);
    }
  }
  for (const edge of previous.edges) {
    if (!currentEdges.has(edge.id)) {
      changedEdgeIds.add(edge.id);
    }
  }

  const baseX = Math.max(...workspaceState.layers.map((layer) => layer.x + 520), 40);
  const layers: LayerDefinition[] = [
    {
      id: "diff-old",
      label: "Old",
      kind: "diff-old",
      nodeIds: previous.nodes.map((node) => node.id),
      visible: true,
      x: baseX,
      y: 40,
      derivedFromLayerId: null,
    },
    {
      id: "diff-new",
      label: "New",
      kind: "diff-new",
      nodeIds: current.nodes.map((node) => node.id),
      visible: true,
      x: baseX + 520,
      y: 40,
      derivedFromLayerId: null,
    },
    {
      id: "diff-changed",
      label: "Changed Only",
      kind: "diff-changed",
      nodeIds: [...changedNodeIds],
      visible: true,
      x: baseX + 1040,
      y: 40,
      derivedFromLayerId: null,
    },
  ];

  return {
    revision: current.revision,
    layers,
    changedNodeIds: [...changedNodeIds],
    changedEdgeIds: [...changedEdgeIds],
  };
}
