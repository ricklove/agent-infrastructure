/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentWorkbench = define.system("AgentWorkbench", {
  format: Agentish,
  role: "Workspace-native React Flow workbench for authoring, viewing, and persisting minimal graph documents",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");

const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

AgentWorkbench.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

when(SubjectBlueprint.contains(Section.concept))
  .then(Section.concept.answers("why the minimal workbench exists, what is authoritative, and what the initial graph primitives are"));

when(SubjectBlueprint.contains(Section.scenarios))
  .then(Section.scenarios.answers("what an operator can do end to end in the initial feature slice"));

when(SubjectBlueprint.contains(Section.implementationPlan))
  .then(Section.implementationPlan.answers("where the React Flow surface, persistence layer, and Agentish workbench-doc parsing should live"));

when(SubjectBlueprint.contains(Section.contracts))
  .then(Section.contracts.answers("the exact workbench document shape, node shape, edge shape, and authoring-lift conventions"));

const Actor = {
  operator: define.actor("WorkbenchOperator"),
  agent: define.actor("WorkbenchAgent"),
};

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("AgentWorkbenchPlugin"),
  route: define.entity("AgentWorkbenchRoute"),
  screen: define.entity("AgentWorkbenchScreen"),
};

const Workbench = {
  workspace: define.workspace("WorkbenchWorkspace"),
  document: define.document("WorkbenchDocument"),
  store: define.workspace("WorkbenchDocumentStore"),
  directory: define.workspace("WorkbenchDirectory"),
  viewport: define.entity("WorkbenchViewport"),
  canvas: define.entity("WorkbenchCanvas"),
  selection: define.entity("WorkbenchSelection"),
};

const Graph = {
  node: define.graphNode("WorkbenchNode"),
  textNode: define.graphNode("WorkbenchTextNode"),
  edge: define.graphEdge("WorkbenchEdge"),
  textEdge: define.graphEdge("WorkbenchTextEdge"),
  handle: define.entity("WorkbenchHandle"),
  textHandle: define.entity("WorkbenchTextHandle"),
};

const Language = {
  textDefinition: define.entity("TextNodeDefinition"),
  fluentRelation: define.entity("FluentNodeRelationship"),
  handleField: define.entity("HandleDefinedField"),
  lift: define.entity("WorkbenchToAgentishLift"),
};

const Storage = {
  file: define.document("WorkbenchSourceFile"),
  path: define.document("WorkbenchSourcePath"),
  record: define.document("WorkbenchRecord"),
  nodeRecord: define.document("WorkbenchNodeRecord"),
  edgeRecord: define.document("WorkbenchEdgeRecord"),
  handleRecord: define.document("WorkbenchHandleRecord"),
};

const Policy = {
  graphFirst: define.concept("GraphFirstFeatureSurface"),
  minimalScope: define.concept("MinimalInitialFeatureScope"),
  bootstrapSlice: define.concept("BootstrapTextNodeVerticalSlice"),
  reactFlowAdapterOnly: define.concept("ReactFlowIsWorkbenchAdapter"),
  sourceAuthoritative: define.concept("WorkbenchSourceDocumentsAreAuthoritative"),
  editorPrimitivesMinimal: define.concept("MinimalEditorPrimitives"),
  textOptionalOnEdgesAndHandles: define.concept("EdgeAndHandleTextMayBeAbsent"),
  workbenchLiftedMeaning: define.concept("WorkbenchNamesLiftToAgentishMeaning"),
};

AgentWorkbench.enforces(`
- AgentWorkbench begins as a fresh minimal subject rather than as an extension of prior graph or canvas doctrine.
- The initial feature surface is a full workbench view rendered through React Flow.
- The initial editor primitives are node, edge, and handle.
- The only initial node type is a text node.
- Text edges and text handles are allowed, but neither requires visible text to exist.
- Double-clicking empty workbench space creates a new text node at the clicked location.
- A text node should be directly editable through a resizable text area.
- Workbench state must persist as source documents under workspace/workbenches rather than as opaque browser-only state.
- The first implementation milestone should close a full text-node vertical slice before richer workbench behavior expands.
- The first implementation milestone is loading a workbench document, rendering the React Flow canvas, creating text nodes, editing text nodes, moving text nodes, and persisting those changes durably.
- Labeled edges, handles, and Agentish lift tooling may be modeled now without blocking the first implementation milestone.
- Workbench source documents are authoritative over React Flow runtime state.
- React Flow is the rendering and interaction adapter for the workbench, not the durable source of truth.
- A named text node lifts to an Agentish constant definition with a stable semantic name and description.
- A named relationship between nodes lifts to a fluent callable relationship between node constants.
- A named handle may lift to a field or contained semantic member when that meaning is later stabilized.
- The initial feature slice should stay minimal and should not require richer projected node types, agent automation, or layout intelligence before basic authoring works.
`);

AgentWorkbench.defines(`
- WorkbenchWorkspace means the dashboard feature surface where one workbench document is viewed and edited.
- WorkbenchDocument means one durable graph document stored as source under workspace/workbenches.
- WorkbenchCanvas means the graph editing plane shown to the operator.
- WorkbenchViewport means the persisted pan and zoom state for one workbench view.
- WorkbenchTextNode means the initial authorable graph object with editable multiline text content.
- WorkbenchTextEdge means the initial relationship line between workbench nodes, optionally carrying text.
- WorkbenchTextHandle means the initial attachable handle on a node, optionally carrying text.
- TextNodeDefinition means a lifted Agentish `define.text(...)` style constant emitted from a named text node.
- FluentNodeRelationship means a lifted callable relationship such as aTextNode[\`Gives a High Five To\`](bTextNode).
- HandleDefinedField means a named handle whose meaning has stabilized enough to act as a field, member, or relation role in lifted Agentish.
- WorkbenchToAgentishLift means the projection from editable workbench graph material into named Agentish source structure.
- GraphFirstFeatureSurface means the workbench route is the primary full-feature graph view rather than a sidecar inspector.
- MinimalInitialFeatureScope means the v1 subject closes only text-node authoring, edge authoring, persistence, and workbench-doc structure.
- BootstrapTextNodeVerticalSlice means the first shipped implementation milestone closes only the React Flow surface plus durable text-node creation, editing, movement, loading, and saving.
- ReactFlowIsWorkbenchAdapter means React Flow owns interaction mechanics but does not own the canonical workbench record.
- WorkbenchSourceDocumentsAreAuthoritative means persisted `.workbench.ts` source files are the durable truth for workbench data.
- WorkbenchNamesLiftToAgentishMeaning means named nodes, edges, and handles should eventually compile into proper Agentish structure rather than remaining anonymous editor geometry forever.
`);

Workbench.workspace.contains(
  Workbench.document,
  Workbench.viewport,
  Workbench.canvas,
  Workbench.selection,
  Graph.node,
  Graph.textNode,
  Graph.edge,
  Graph.textEdge,
  Graph.handle,
  Graph.textHandle,
  Storage.record,
  Language.textDefinition,
  Language.fluentRelation,
  Language.handleField,
  Language.lift,
  Policy.graphFirst,
  Policy.minimalScope,
  Policy.bootstrapSlice,
  Policy.reactFlowAdapterOnly,
  Policy.sourceAuthoritative,
  Policy.editorPrimitivesMinimal,
  Policy.textOptionalOnEdgesAndHandles,
  Policy.workbenchLiftedMeaning,
);

Workbench.store.contains(Workbench.directory, Storage.file, Storage.path, Storage.record);
Storage.record.contains(Storage.nodeRecord, Storage.edgeRecord, Storage.handleRecord, Workbench.viewport);

Dashboard.shell.contains(Dashboard.route, Dashboard.screen, Dashboard.plugin);
Dashboard.screen.contains(Workbench.workspace);

// Scenarios

when(Actor.operator.opens(Dashboard.route))
  .then(AgentWorkbench.loads(Workbench.document))
  .and(AgentWorkbench.presents(Workbench.canvas))
  .and(AgentWorkbench.requires(Policy.graphFirst));

when(Actor.operator.doubleClicks(Workbench.canvas))
  .then(AgentWorkbench.creates(Graph.textNode))
  .and(AgentWorkbench.positions(Graph.textNode).at("the clicked canvas coordinates"))
  .and(Actor.operator.starts("direct text entry in a resizable text area"));

when(Actor.operator.edits(Graph.textNode))
  .then(AgentWorkbench.updates(Storage.nodeRecord))
  .and(AgentWorkbench.preserves("multiline text content"))
  .and(AgentWorkbench.preserves("resized node dimensions when changed by the operator"));

when(Actor.operator.moves(Graph.textNode))
  .then(AgentWorkbench.updates(Storage.nodeRecord))
  .and(AgentWorkbench.preserves("the persisted node coordinates"));

when(Actor.operator.connects(Graph.textNode).to(Graph.textNode))
  .then(AgentWorkbench.creates(Graph.textEdge))
  .and(AgentWorkbench.updates(Storage.edgeRecord));

when(Actor.operator.labels(Graph.textEdge))
  .then(AgentWorkbench.preserves("the edge text when present"))
  .and(AgentWorkbench.allows("the edge text to be empty"));

when(Actor.operator.adds(Graph.textHandle).to(Graph.textNode))
  .then(AgentWorkbench.creates(Storage.handleRecord))
  .and(AgentWorkbench.allows("the handle text to be empty"));

when(Actor.operator.saves(Workbench.document))
  .then(AgentWorkbench.writes(Storage.file))
  .and(Storage.file.belongsTo(Workbench.directory))
  .and(Storage.file.uses("*.workbench.ts source form"))
  .and(AgentWorkbench.requires(Policy.sourceAuthoritative));

when(Actor.agent.lifts(Workbench.document))
  .then(AgentWorkbench.derives(Language.textDefinition).from(Graph.textNode))
  .and(AgentWorkbench.derives(Language.fluentRelation).from(Graph.textEdge))
  .and(AgentWorkbench.mayDerive(Language.handleField).from(Graph.textHandle));

when(Graph.textNode.has("a stabilized semantic name"))
  .then(Graph.textNode.liftsTo("const SomeName = define.text(`...`)"));

when(Graph.textEdge.has("a stabilized semantic label"))
  .then(Graph.textEdge.liftsTo("sourceNode[`Relationship Label`](targetNode)"));

when(Graph.textHandle.has("a stabilized semantic field meaning"))
  .then(Graph.textHandle.liftsTo(Language.handleField));

// ImplementationPlan

const Package = {
  dashboardUi: define.package("DashboardUiPackage"),
  dashboardServer: define.package("DashboardGatewayPackage"),
  workbenchUi: define.package("AgentWorkbenchUiPackage"),
  workbenchServer: define.package("AgentWorkbenchServerPackage"),
  workbenchProtocol: define.package("AgentWorkbenchProtocolPackage"),
};

Package.dashboardUi.dependsOn(Package.workbenchUi, Package.workbenchProtocol);
Package.dashboardServer.dependsOn(Package.workbenchServer, Package.workbenchProtocol);
Package.workbenchUi.dependsOn(Package.workbenchProtocol);
Package.workbenchServer.dependsOn(Package.workbenchProtocol);

AgentWorkbench.implementsThrough(`
- packages/agent-workbench-ui owns the React Flow workbench screen, text-node rendering, text-node editing, edge labeling, and save-triggering UI.
- The first implementation milestone should prioritize canvas boot, text-node creation, text-node editing, text-node movement, and file-backed save or reload before richer graph authoring.
- packages/agent-workbench-server owns workbench document discovery, `.workbench.ts` read and write behavior, and source-of-truth persistence under workspace/workbenches.
- packages/agent-workbench-protocol owns the shared workbench record contracts used by the dashboard UI and server.
- packages/dashboard-ui and packages/dashboard register the Agent Workbench feature as a first-party full-screen dashboard route.
- The initial workbench route should open directly into the graph surface rather than into a list-first shell that hides the main workbench.
- React Flow should be used only as the interaction and rendering layer mapped from canonical workbench records.
- The workbench server should preserve stable ids and explicit geometry rather than persisting raw React Flow internals as canonical product truth.
`);

Package.workbenchUi.owns(
  "React Flow integration",
  "text node renderer",
  "resizable text area editing",
  "edge label editing",
  "viewport synchronization",
);

Package.workbenchServer.owns(
  "workbench source file discovery",
  "workbench source parsing and serialization",
  "source-of-truth persistence in workspace/workbenches",
);

Package.workbenchProtocol.owns(
  "workbench document record shape",
  "node record shape",
  "edge record shape",
  "handle record shape",
);

AgentWorkbench.usesFiles(`
- blueprints/agent-workbench/agent-workbench.agentish.ts
- workspace/workbenches/*.workbench.ts
- packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx
- packages/agent-workbench-ui/src/TextWorkbenchNode.tsx
- packages/agent-workbench-server/src/index.ts
- packages/agent-workbench-server/src/workbench-store.ts
- packages/agent-workbench-protocol/src/index.ts
`);

// Contracts

const Contract = {
  workbenchId: define.document("WorkbenchId"),
  workbenchTitle: define.document("WorkbenchTitle"),
  nodeId: define.document("WorkbenchNodeId"),
  edgeId: define.document("WorkbenchEdgeId"),
  handleId: define.document("WorkbenchHandleId"),
  nodeText: define.document("WorkbenchNodeText"),
  edgeText: define.document("WorkbenchEdgeText"),
  handleText: define.document("WorkbenchHandleText"),
  x: define.document("WorkbenchX"),
  y: define.document("WorkbenchY"),
  width: define.document("WorkbenchWidth"),
  height: define.document("WorkbenchHeight"),
  sourceNodeId: define.document("WorkbenchEdgeSourceNodeId"),
  targetNodeId: define.document("WorkbenchEdgeTargetNodeId"),
  sourceHandleId: define.document("WorkbenchEdgeSourceHandleId"),
  targetHandleId: define.document("WorkbenchEdgeTargetHandleId"),
  handleNodeId: define.document("WorkbenchHandleNodeId"),
  handlePlacement: define.document("WorkbenchHandlePlacement"),
  viewportX: define.document("WorkbenchViewportX"),
  viewportY: define.document("WorkbenchViewportY"),
  viewportZoom: define.document("WorkbenchViewportZoom"),
  filePath: define.document("WorkbenchFilePath"),
};

Storage.record.contains(Contract.workbenchId, Contract.workbenchTitle);
Storage.nodeRecord.contains(
  Contract.nodeId,
  Contract.nodeText,
  Contract.x,
  Contract.y,
  Contract.width,
  Contract.height,
);
Storage.edgeRecord.contains(
  Contract.edgeId,
  Contract.sourceNodeId,
  Contract.targetNodeId,
  Contract.sourceHandleId,
  Contract.targetHandleId,
  Contract.edgeText,
);
Storage.handleRecord.contains(
  Contract.handleId,
  Contract.handleNodeId,
  Contract.handlePlacement,
  Contract.handleText,
);
Workbench.viewport.contains(Contract.viewportX, Contract.viewportY, Contract.viewportZoom);
Storage.file.contains(Contract.filePath);

Storage.record.defines(`
- WorkbenchRecord contains one durable workbench id, title, viewport state, node records, edge records, and handle records.
- WorkbenchNodeRecord contains stable node identity, multiline text content, persisted position, and optional persisted size.
- WorkbenchEdgeRecord contains stable edge identity, source node identity, target node identity, optional source and target handle ids, and optional edge text.
- WorkbenchHandleRecord contains stable handle identity, owning node identity, placement on the node, and optional handle text.
- WorkbenchSourceFile is a `.workbench.ts` source document stored under workspace/workbenches.
`);

when(Storage.file.exists())
  .then(Storage.file.expects("a `.workbench.ts` extension"))
  .and(Storage.file.expects("a location under workspace/workbenches"));

when(Storage.edgeRecord.exists())
  .then(Storage.edgeRecord.requires(Contract.edgeId))
  .and(Storage.edgeRecord.requires(Contract.sourceNodeId))
  .and(Storage.edgeRecord.requires(Contract.targetNodeId))
  .and(Storage.edgeRecord.allows(Contract.edgeText));

when(Storage.handleRecord.exists())
  .then(Storage.handleRecord.requires(Contract.handleId))
  .and(Storage.handleRecord.requires(Contract.handleNodeId))
  .and(Storage.handleRecord.requires(Contract.handlePlacement))
  .and(Storage.handleRecord.allows(Contract.handleText));

when(Graph.textNode.isNamed("aTextNode"))
  .then(Language.textDefinition.mayBe("const aTextNode = define.text(`This is a text node description for aTextNode`);"));

when(Graph.textNode.isNamed("bTextNode"))
  .then(Language.textDefinition.mayBe("const bTextNode = define.text(`Another text node`);"));

when(Graph.textEdge.isNamed("Gives a High Five To"))
  .then(Language.fluentRelation.mayBe("aTextNode[`Gives a High Five To`](bTextNode)"));
