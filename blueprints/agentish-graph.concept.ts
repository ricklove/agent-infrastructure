export const agentishGraphConcept = {
  id: "agentish-graph",
  purpose:
    "Project any Agentish document set into a human-editable visual graph without losing source authority.",
  sourceOfTruth: "AgentishDocumentSet",
  primaryActors: ["human-reader-editor"] as const,
  coreModel: {
    source: ["AgentishDocument", "AgentishDocumentSet"] as const,
    normalized: ["SemanticModel", "StableIdentity"] as const,
    projection: [
      "GraphWorkspace",
      "GraphLayer",
      "GraphNode",
      "GraphEdge",
      "PortalEdge",
      "SelectionState",
      "LayoutHint",
    ] as const,
    editing: [
      "EditIntent",
      "SourceMutation",
      "ValidationResult",
      "EditConflict",
    ] as const,
  },
  truths: {
    authoritative: ["source-documents"] as const,
    derived: ["semantic-model", "graph-workspace"] as const,
    preservedAcrossRefresh: ["stable-identity", "manual-layout-intent"] as const,
  },
  invariants: [
    "Documents remain authoritative; the graph never becomes an independent truth source.",
    "Projection is derived from source meaning plus layout hints.",
    "All graph edits must resolve into source mutations or explicit conflicts.",
    "Equivalent semantic meaning should preserve visual identity across refresh.",
    "Conflicts and ambiguity must be surfaced, never hidden.",
  ] as const,
  capabilities: [
    "visualize one or more Agentish documents as a graph workspace",
    "inspect semantic structure without reading raw source first",
    "edit structure through the graph and round-trip into source",
    "persist manual layout intent across reprojection",
    "react to out-of-band source changes",
  ] as const,
  nonGoals: [
    "making the graph the authoritative storage layer",
    "allowing silent lossy edits",
    "embedding parser or mutation authority in the browser",
  ] as const,
  pipeline: [
    "documents -> semantic model",
    "semantic model + layout hints -> projection",
    "graph edits -> edit intents -> source mutations",
    "source mutations -> validation -> reprojection",
  ] as const,
} as const;
