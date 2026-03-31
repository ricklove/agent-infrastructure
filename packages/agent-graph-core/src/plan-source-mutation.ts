import type {
  ConflictPayload,
  GraphIntent,
  PlannedMutation,
  SourceWorkspace,
  ValidationPayload,
} from "./types.js"

export type MutationPlanResult =
  | {
      ok: true
      validation: ValidationPayload
      mutation: PlannedMutation
    }
  | {
      ok: false
      validation: ValidationPayload
      conflict: ConflictPayload
    }

export function planSourceMutation(args: {
  sourceWorkspace: SourceWorkspace
  intent: GraphIntent
}): MutationPlanResult {
  const { sourceWorkspace, intent } = args

  if (
    intent.kind !== "edit-node-meaning" &&
    intent.kind !== "connect-visible-nodes"
  ) {
    return {
      ok: false,
      validation: {
        accepted: false,
        intentId: "workspace-only",
        message:
          "Workspace operations do not require source mutation planning.",
      },
      conflict: {
        code: "unsupported",
        intentId: "workspace-only",
        message:
          "Workspace operations are handled outside source mutation planning.",
      },
    }
  }

  if (intent.expectedRevision !== sourceWorkspace.revision) {
    return {
      ok: false,
      validation: {
        accepted: false,
        intentId: intent.intentId,
        message: "The edit targeted a stale source revision.",
      },
      conflict: {
        code: "stale-revision",
        intentId: intent.intentId,
        message: "Source revision changed before the edit could be applied.",
      },
    }
  }

  if (intent.kind === "edit-node-meaning") {
    const node = sourceWorkspace.nodes.find(
      (candidate) => candidate.id === intent.sourceNodeId,
    )
    if (!node) {
      return {
        ok: false,
        validation: {
          accepted: false,
          intentId: intent.intentId,
          message: "The visible node no longer maps to source.",
        },
        conflict: {
          code: "ambiguous",
          intentId: intent.intentId,
          message: "The selected node could not be resolved in source.",
        },
      }
    }

    return {
      ok: true,
      validation: {
        accepted: true,
        intentId: intent.intentId,
        message: "Node meaning edit is unambiguous.",
      },
      mutation: {
        kind: "rename-node",
        sourceNodeId: intent.sourceNodeId,
        label: intent.label,
      },
    }
  }

  const duplicate = sourceWorkspace.edges.find(
    (edge) =>
      edge.sourceId === intent.sourceNodeId &&
      edge.targetId === intent.targetNodeId,
  )
  if (duplicate) {
    return {
      ok: false,
      validation: {
        accepted: false,
        intentId: intent.intentId,
        message: "The relationship already exists.",
      },
      conflict: {
        code: "duplicate-relationship",
        intentId: intent.intentId,
        message: "A relationship between the selected nodes already exists.",
      },
    }
  }

  return {
    ok: true,
    validation: {
      accepted: true,
      intentId: intent.intentId,
      message: "Relationship creation is unambiguous.",
    },
    mutation: {
      kind: "connect-nodes",
      sourceNodeId: intent.sourceNodeId,
      targetNodeId: intent.targetNodeId,
    },
  }
}
