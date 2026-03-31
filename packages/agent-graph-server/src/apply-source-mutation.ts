import type {
  PlannedMutation,
  SourceWorkspace,
} from "@agent-infrastructure/agent-graph-core"

export function applySourceMutation(args: {
  sourceWorkspace: SourceWorkspace
  mutation: PlannedMutation
}): SourceWorkspace {
  const { sourceWorkspace, mutation } = args
  const nextWorkspace = structuredClone(sourceWorkspace)
  nextWorkspace.revision += 1

  if (mutation.kind === "rename-node") {
    nextWorkspace.nodes = nextWorkspace.nodes.map((node) =>
      node.id === mutation.sourceNodeId
        ? { ...node, label: mutation.label }
        : node,
    )
  }

  if (mutation.kind === "connect-nodes") {
    nextWorkspace.edges.push({
      id: `edge-user-${mutation.sourceNodeId}-${mutation.targetNodeId}-${nextWorkspace.revision}`,
      sourceId: mutation.sourceNodeId,
      targetId: mutation.targetNodeId,
      kind: "traces-to",
      label: "user connected relationship",
    })
  }

  return nextWorkspace
}
