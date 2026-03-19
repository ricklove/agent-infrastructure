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

Scenario.openWorkspace
  .given("A workspace root or document set is available to open.")
  .when(Human.opens(Source.documentSet))
  .then(GraphSystem.loads(Graph.workspace))
  .and(GraphSystem.projects(Graph.node, Graph.edge, Graph.portal))
  .succeeds(`- The workspace is visible.
- The projection matches source structure.`);

Scenario.inspectNode
  .given("A projected node is visible and selectable.")
  .when(Human.selects(Graph.node))
  .then(GraphSystem.updates(Graph.selection))
  .and(GraphSystem.reveals("semantic details"))
  .succeeds("Meaning is inspectable without raw source.");

Scenario.editNode
  .given("A projected node exposes an editable label or attribute.")
  .when(Human.edits(Graph.node))
  .then(GraphSystem.derives("edit intent"))
  .and(GraphSystem.derives("validation result"))
  .whenAccepted("validation result")
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.workspace))
  .succeeds("The visual edit round-trips into source.")
  .preserves("Identity and manual layout are preserved when possible.")
  .conflictsAs("Conflicts are visible instead of silent writes.");

Scenario.connectNodes
  .given("Two compatible handles are visible or discoverable in the graph.")
  .when(Human.connects(Graph.node).to(Graph.node))
  .then(GraphSystem.derives("relation creation intent"))
  .and(GraphSystem.derives("validation result"))
  .whenAccepted("validation result")
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.edge, Graph.portal))
  .succeeds(`- The connection becomes a source relationship.
- A cross-layer relation appears as a portal.`)
  .conflictsAs("An invalid or ambiguous target is surfaced.");

Scenario.moveNode
  .given("A projected node is draggable.")
  .when(Human.drags(Graph.node))
  .then(GraphSystem.records(Graph.layoutHint))
  .and(GraphSystem.reprojects(Graph.workspace))
  .succeeds("Manual layout persists across refresh.")
  .preserves("Source meaning is preserved.");

Scenario.externalChange
  .given("A projected document changes outside the current graph session.")
  .when(ExternalEditor.mutates(Source.document))
  .then(GraphSystem.detects("external source change"))
  .and(GraphSystem.reprojects(Graph.workspace))
  .succeeds("The graph reflects out-of-band edits.")
  .preserves("Selection and viewport are preserved when safe.")
  .conflictsAs("A pending mutation that loses its target is surfaced.");

Scenario.resolveConflict
  .given("A mutation loses its target or conflicts with a newer source revision.")
  .when(GraphSystem.detects(Source.conflict))
  .then(GraphSystem.surfaces(Source.conflict).to(Human))
  .and(GraphSystem.pauses("the affected mutation path"))
  .and(
    GraphSystem.requests(Human, {
      toChoose: "reload, manual edit, or discard local intent",
    }),
  )
  .succeeds("The conflict is visible and explicitly resolved.")
  .protects("Source authority is protected.");
