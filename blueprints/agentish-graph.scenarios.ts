export type GraphScenario = {
  id:
    | "open-workspace"
    | "inspect-node"
    | "edit-node"
    | "connect-nodes"
    | "move-node"
    | "external-change"
    | "resolve-conflict";
  actor: "human" | "external-editor" | "system";
  preconditions: readonly string[];
  trigger: string;
  system: readonly string[];
  success: readonly string[];
};

export const agentishGraphScenarios = [
  {
    id: "open-workspace",
    actor: "human",
    preconditions: ["a workspace root contains one or more Agentish documents"],
    trigger: "human opens a document set",
    system: [
      "load the workspace",
      "parse openable Agentish documents",
      "build the semantic model",
      "project nodes, edges, and portals into a graph workspace",
    ],
    success: [
      "the human can see the graph for the opened documents",
      "the graph reflects source structure rather than ad hoc UI state",
    ],
  },
  {
    id: "inspect-node",
    actor: "human",
    preconditions: ["the graph workspace is visible"],
    trigger: "human selects a graph node",
    system: [
      "update selection state",
      "show semantic details for the selected node",
      "retain graph context while exposing source meaning",
    ],
    success: [
      "the human can inspect meaning without reading raw source first",
    ],
  },
  {
    id: "edit-node",
    actor: "human",
    preconditions: ["a projected node is selectable and editable"],
    trigger: "human edits a node label or attribute through the graph",
    system: [
      "derive an edit intent",
      "plan a source mutation",
      "apply the mutation",
      "validate and reproject",
    ],
    success: [
      "the visual edit round-trips into source",
      "the refreshed graph preserves identity and manual layout where possible",
    ],
  },
  {
    id: "connect-nodes",
    actor: "human",
    preconditions: ["two compatible graph handles are visible"],
    trigger: "human connects one node handle to another",
    system: [
      "derive a relation-creation intent",
      "apply the corresponding source mutation",
      "reproject edges and portals",
    ],
    success: [
      "graph connections become source relationships",
      "cross-layer relationships appear as portals when appropriate",
    ],
  },
  {
    id: "move-node",
    actor: "human",
    preconditions: ["a graph node is draggable"],
    trigger: "human drags a node",
    system: [
      "record a layout hint",
      "keep source meaning unchanged",
      "reuse the hint on future reprojection",
    ],
    success: [
      "manual layout intent persists across refresh",
    ],
  },
  {
    id: "external-change",
    actor: "external-editor",
    preconditions: ["a projected document is changed outside the graph session"],
    trigger: "source files change out of band",
    system: [
      "detect the file change",
      "reparse affected documents",
      "reproject the workspace",
    ],
    success: [
      "the graph reflects out-of-band edits",
      "selection and viewport are preserved when safe",
    ],
  },
  {
    id: "resolve-conflict",
    actor: "system",
    preconditions: ["an edit cannot round-trip cleanly or loses its target due to revision drift"],
    trigger: "the system detects a mutation conflict",
    system: [
      "surface the conflict explicitly",
      "pause the affected mutation path",
      "require a human resolution choice",
    ],
    success: [
      "conflicts are visible and not silently discarded",
      "source authority is protected",
    ],
  },
] as const satisfies readonly GraphScenario[];
