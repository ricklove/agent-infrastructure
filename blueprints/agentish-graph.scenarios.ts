/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Canonical behavior definition",
});

const AgentishGraphScenarios = define.scenarioSet("AgentishGraphScenarios", {
  format: Agentish,
  describes: "Acceptance flows for Agentish graph",
});

const Human = define.actor("Human", { role: "Graph user" });
const ExternalEditor = define.actor("ExternalEditor", {
  role: "Out-of-band source mutator",
});
const GraphSystem = define.system("AgentishGraphSystem");

const Source = {
  documentSet: define.documentSet("AgentishDocumentSet"),
  document: define.document("AgentishDocument"),
  mutation: define.mutation("SourceMutation"),
};

const Editing = {
  validation: define.validation("ValidationResult"),
  conflict: define.conflict("EditConflict"),
};

const Graph = {
  workspace: define.workspace("GraphWorkspace"),
  node: define.graphNode("GraphNode"),
  edge: define.graphEdge("GraphEdge"),
  portal: define.portal("PortalEdge"),
  selection: define.selection("SelectionState"),
  layoutHint: define.layoutHint("LayoutHint"),
};

const OpenWorkspaceScenario = define.scenario("OpenWorkspaceScenario");
const InspectNodeScenario = define.scenario("InspectNodeScenario");
const EditNodeScenario = define.scenario("EditNodeScenario");
const ConnectNodesScenario = define.scenario("ConnectNodesScenario");
const MoveNodeScenario = define.scenario("MoveNodeScenario");
const ExternalChangeScenario = define.scenario("ExternalChangeScenario");
const ResolveConflictScenario = define.scenario("ResolveConflictScenario");

OpenWorkspaceScenario
  .given("An Agentish document set is available to open.")
  .when(Human.opens(Source.documentSet))
  .then(GraphSystem.loads(Graph.workspace))
  .and(GraphSystem.projects(Graph.node, Graph.edge, Graph.portal))
  .succeeds(`- The workspace is visible.
- The projection matches source structure.`);

InspectNodeScenario
  .given("A projected node is visible and selectable.")
  .when(Human.selects(Graph.node))
  .then(GraphSystem.updates(Graph.selection))
  .and(GraphSystem.reveals("semantic details"))
  .succeeds("Meaning is inspectable without raw source.");

EditNodeScenario
  .given("A projected node exposes an editable label or attribute.")
  .when(Human.edits(Graph.node))
  .then(GraphSystem.derives("edit intent"))
  .and(GraphSystem.derives(Editing.validation))
  .whenAccepted(Editing.validation)
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.workspace))
  .succeeds("The visual edit round-trips into source.")
  .preserves("Identity and manual layout are preserved when possible.")
  .conflictsAs("Conflicts are visible instead of silent writes.");

ConnectNodesScenario
  .given("Two compatible handles are visible or discoverable in the graph.")
  .when(Human.connects(Graph.node).to(Graph.node))
  .then(GraphSystem.derives("relation creation intent"))
  .and(GraphSystem.derives(Editing.validation))
  .whenAccepted(Editing.validation)
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.edge, Graph.portal))
  .succeeds(`- The connection becomes a source relationship.
- A cross-layer relation appears as a portal.`)
  .conflictsAs("An invalid or ambiguous target is surfaced.");

MoveNodeScenario
  .given("A projected node is draggable.")
  .when(Human.drags(Graph.node))
  .then(GraphSystem.records(Graph.layoutHint))
  .and(GraphSystem.reprojects(Graph.workspace))
  .succeeds("Manual layout persists across refresh.")
  .preserves("Source meaning is preserved.");

ExternalChangeScenario
  .given("A projected document changes outside the current graph session.")
  .when(ExternalEditor.mutates(Source.document))
  .then(GraphSystem.detects("external source change"))
  .and(GraphSystem.reprojects(Graph.workspace))
  .succeeds("The graph reflects out-of-band edits.")
  .preserves("Selection and viewport are preserved when safe.")
  .conflictsAs("A pending mutation that loses its target is surfaced.");

ResolveConflictScenario
  .given("A mutation loses its target or conflicts with a newer source revision.")
  .when(GraphSystem.detects(Editing.conflict))
  .then(GraphSystem.surfaces(Editing.conflict).to(Human))
  .and(GraphSystem.pauses("the affected mutation path"))
  .and(
    GraphSystem.requests(Human, {
      toChoose: "reload, manual edit, or discard local intent",
    }),
  )
  .succeeds("The conflict is visible and its handling path is explicit.")
  .protects("Source authority is protected.");
