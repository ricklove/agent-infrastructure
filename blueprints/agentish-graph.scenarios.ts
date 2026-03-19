export type GraphScenarioId =
  | "open-workspace"
  | "inspect-node"
  | "edit-node"
  | "connect-nodes"
  | "move-node"
  | "external-change"
  | "resolve-conflict";

export type GraphScenario = readonly [
  id: GraphScenarioId,
  actor: "human" | "external-editor" | "system",
  preconditions: readonly string[],
  trigger: string,
  system: readonly string[],
  success: readonly string[],
];

export const agentishGraphScenarios = [
  [
    "open-workspace",
    "human",
    ["workspace root contains Agentish documents"],
    "open document set",
    [
      "load the workspace",
      "parse Agentish documents",
      "build the semantic model",
      "project graph workspace",
    ],
    [
      "graph is visible for opened documents",
      "projection follows source structure",
    ],
  ],
  [
    "inspect-node",
    "human",
    ["graph workspace is visible"],
    "select graph node",
    [
      "update selection state",
      "show semantic details",
      "retain graph context",
    ],
    ["meaning is inspectable without reading raw source first"],
  ],
  [
    "edit-node",
    "human",
    ["projected node is selectable and editable"],
    "edit node label or attribute",
    [
      "derive an edit intent",
      "plan a source mutation",
      "apply the mutation",
      "validate and reproject",
    ],
    [
      "visual edit round-trips into source",
      "refresh preserves identity and layout when possible",
    ],
  ],
  [
    "connect-nodes",
    "human",
    ["compatible graph handles are visible"],
    "connect one node handle to another",
    [
      "derive relation-creation intent",
      "apply source mutation",
      "reproject edges and portals",
    ],
    [
      "graph connections become source relationships",
      "cross-layer relationships appear as portals",
    ],
  ],
  [
    "move-node",
    "human",
    ["graph node is draggable"],
    "drag node",
    [
      "record a layout hint",
      "keep source meaning unchanged",
      "reuse hint on reprojection",
    ],
    ["manual layout persists across refresh"],
  ],
  [
    "external-change",
    "external-editor",
    ["projected document changes outside the graph session"],
    "source files change out of band",
    [
      "detect the file change",
      "reparse affected documents",
      "reproject the workspace",
    ],
    [
      "graph reflects out-of-band edits",
      "selection and viewport are preserved when safe",
    ],
  ],
  [
    "resolve-conflict",
    "system",
    ["an edit cannot round-trip cleanly or loses its target due to revision drift"],
    "detect mutation conflict",
    [
      "surface the conflict",
      "pause the affected mutation path",
      "require human resolution",
    ],
    [
      "conflicts are visible and not silently discarded",
      "source authority is protected",
    ],
  ],
] as const satisfies readonly GraphScenario[];
