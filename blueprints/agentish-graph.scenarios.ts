/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Canonical behavior definition",
});

const AgentishGraphScenarios = define.entity("AgentishGraphScenarios", {
  format: Agentish,
  describes: "Acceptance flows for Agentish graph",
});

const Human = define.actor("Human", { role: "Graph user" });
const ExternalEditor = define.actor("ExternalEditor", {
  role: "Out-of-band source mutator",
});
const GraphSystem = define.system("AgentishGraphSystem");

const Source = {
  documentSet: define.entity("AgentishDocumentSet"),
  document: define.entity("AgentishDocument"),
  mutation: define.entity("SourceMutation"),
  conflict: define.entity("EditConflict"),
};

const Graph = {
  workspace: define.entity("GraphWorkspace"),
  node: define.entity("GraphNode"),
  edge: define.entity("GraphEdge"),
  portal: define.entity("PortalEdge"),
  selection: define.entity("SelectionState"),
  layoutHint: define.entity("LayoutHint"),
};

const Scenario = {
  openWorkspace: define.entity("OpenWorkspaceScenario"),
  inspectNode: define.entity("InspectNodeScenario"),
  editNode: define.entity("EditNodeScenario"),
  connectNodes: define.entity("ConnectNodesScenario"),
  moveNode: define.entity("MoveNodeScenario"),
  externalChange: define.entity("ExternalChangeScenario"),
  resolveConflict: define.entity("ResolveConflictScenario"),
};

AgentishGraphScenarios.contains(
  Scenario.openWorkspace,
  Scenario.inspectNode,
  Scenario.editNode,
  Scenario.connectNodes,
  Scenario.moveNode,
  Scenario.externalChange,
  Scenario.resolveConflict,
);

Scenario.openWorkspace.requires(
  "A workspace root or document set is available to open.",
);
when(Human.opens(Source.documentSet).through(Scenario.openWorkspace))
  .then(GraphSystem.loads(Graph.workspace))
  .and(GraphSystem.projects(Graph.node, Graph.edge, Graph.portal))
  .and(
    Scenario.openWorkspace.succeeds(`- The workspace is visible.
- The projection matches source structure.`),
  );

Scenario.inspectNode.requires("A projected node is visible and selectable.");
when(Human.selects(Graph.node).through(Scenario.inspectNode))
  .then(GraphSystem.updates(Graph.selection))
  .and(GraphSystem.reveals("semantic details"))
  .and(Scenario.inspectNode.succeeds("Meaning is inspectable without raw source."));

Scenario.editNode.requires("A projected node exposes an editable label or attribute.");
when(Human.edits(Graph.node).through(Scenario.editNode))
  .then(GraphSystem.derives("edit intent"))
  .and(GraphSystem.derives("validation result"))
  .and(Scenario.editNode.succeeds("The visual edit round-trips into source."))
  .and(
    Scenario.editNode.preserves(
      "Identity and manual layout are preserved when possible.",
    ),
  )
  .and(Scenario.editNode.conflictsAs("Conflicts are visible instead of silent writes."));

when(GraphSystem.accepts("validation result").through(Scenario.editNode))
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.workspace));

Scenario.connectNodes.requires(
  "Two compatible handles are visible or discoverable in the graph.",
);
when(Human.connects(Graph.node).to(Graph.node).through(Scenario.connectNodes))
  .then(GraphSystem.derives("relation creation intent"))
  .and(GraphSystem.derives("validation result"))
  .and(
    Scenario.connectNodes.succeeds(`- The connection becomes a source relationship.
- A cross-layer relation appears as a portal.`),
  )
  .and(
    Scenario.connectNodes.conflictsAs(
      "An invalid or ambiguous target is surfaced.",
    ),
  );

when(GraphSystem.accepts("validation result").through(Scenario.connectNodes))
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.edge, Graph.portal));

Scenario.moveNode.requires("A projected node is draggable.");
when(Human.drags(Graph.node).through(Scenario.moveNode))
  .then(GraphSystem.records(Graph.layoutHint))
  .and(GraphSystem.reprojects(Graph.workspace))
  .and(Scenario.moveNode.succeeds("Manual layout persists across refresh."))
  .and(Scenario.moveNode.preserves("Source meaning is preserved."));

Scenario.externalChange.requires(
  "A projected document changes outside the current graph session.",
);
when(ExternalEditor.mutates(Source.document).through(Scenario.externalChange))
  .then(GraphSystem.detects("external source change"))
  .and(GraphSystem.reprojects(Graph.workspace))
  .and(Scenario.externalChange.succeeds("The graph reflects out-of-band edits."))
  .and(
    Scenario.externalChange.preserves(
      "Selection and viewport are preserved when safe.",
    ),
  )
  .and(
    Scenario.externalChange.conflictsAs(
      "A pending mutation that loses its target is surfaced.",
    ),
  );

Scenario.resolveConflict.requires(
  "A mutation loses its target or conflicts with a newer source revision.",
);
when(GraphSystem.detects(Source.conflict).through(Scenario.resolveConflict))
  .then(GraphSystem.surfaces(Source.conflict).to(Human))
  .and(GraphSystem.pauses("the affected mutation path"))
  .and(GraphSystem.requests(Human, { toChoose: "reload, manual edit, or discard local intent" }))
  .and(Scenario.resolveConflict.succeeds("The conflict is visible and explicitly resolved."))
  .and(Scenario.resolveConflict.protects("Source authority is protected."));
