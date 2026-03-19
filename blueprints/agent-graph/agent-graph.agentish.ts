/// <reference path="../_agentish.d.ts" />

// Agent Graph

const Agentish = define.language("Agentish");

const AgentGraph = define.system("AgentGraph", {
  format: Agentish,
  role: "React Flow viewer and editor for Agentish document workspaces",
});

const User = define.actor("AgentishAuthorMaintainer", {
  role: "Primary user of the graph",
});

const Source = {
  workspace: define.documentSet("AgentishWorkspace"),
  document: define.document("AgentishDocument"),
  truth: define.truth("SourceAuthority"),
};

const Graph = {
  whole: define.workspace("WholeGraphWorkspace"),
  plane: define.concept("SharedWorkspacePlane"),
  layer: define.graphLayer("UserLayer"),
  layerGroup: define.concept("InvisibleLayerParentRegion"),
  node: define.graphNode("GraphNode"),
  edge: define.graphEdge("DirectEdge"),
  derivedEdge: define.graphEdge("DerivedEdge"),
  hiddenContext: define.portal("HiddenContextPortal"),
  diffLayer: define.graphLayer("DiffLayer"),
  completeness: define.truth("TrustworthyCompleteness"),
};

const Editing = {
  validation: define.validation("ValidationResult"),
  conflict: define.conflict("EditConflict"),
  mutation: define.mutation("SourceMutation"),
};

AgentGraph.enforces(`
- The graph is read-first and edit-capable.
- The graph is graph-only; there is no adjacent source editor in the primary workflow.
- The graph represents a complete multi-document workspace.
- User-created layers are slices of the same complete underlying graph.
- Edits may begin from any visible layer.
- External change and conflict handling are first-class.
- Source documents remain authoritative.
`);

Graph.whole.contains(
  Graph.plane,
  Graph.layer,
  Graph.node,
  Graph.edge,
  Graph.derivedEdge,
  Graph.hiddenContext,
  Graph.diffLayer,
);

Graph.layer.contains(Graph.layerGroup);

AgentGraph.defines(`
- One complete underlying semantic graph exists for the whole workspace.
- The user never works with separate truths; every visible layer is a slice of that same graph.
- All user layers are rendered together in one shared workspace plane.
- Each user layer is grouped under its own invisible parent region so whole layers can move independently.
- Direct edges represent relationships visible directly in the current visible graph.
- Derived edges represent meaningful visible-to-visible relationships that run through hidden intermediate context.
- Hidden-context portals indicate connected elements that are not currently visible but still exist in the same underlying graph.
- Diff layers are comparison slices over graph state, not a separate truth model.
- Trustworthy completeness means the graph must continuously communicate that hidden context is still part of the same complete workspace.
`);

Graph.completeness.means(`
- visible layers are partial views, not partial truth
- hidden context remains real and navigable
- derived edges must be visibly distinguishable from direct edges
- users must be able to inspect why a derived connection exists
`);

// Whole-System Comprehension

when(User.opens(Source.workspace))
  .then(AgentGraph.loads(Graph.whole))
  .and(AgentGraph.presents("a complete clustered overview"))
  .and(AgentGraph.answers("what exists and how the major parts connect"))
  .and(AgentGraph.mustPrevent("distrust of completeness"));

when(User.explores(Graph.whole))
  .then(User.pans("the overview"))
  .and(User.zooms("the overview"))
  .and(User.selects(Graph.node, Graph.edge, Graph.hiddenContext))
  .and(User.builds("a mental model of the whole workspace"));

when(Graph.whole.hides("connected context"))
  .then(AgentGraph.shows(Graph.hiddenContext))
  .and(AgentGraph.signals("hidden context is still part of the same complete graph"));

// View Composition And Navigation

when(User.clones("the current view"))
  .then(AgentGraph.creates(Graph.layer))
  .and(Graph.layer.remains("a slice of the whole graph"))
  .and(Graph.layer.persists("as workspace state"));

when(User.refines(Graph.layer))
  .then(User.selects("what belongs in the layer"))
  .and(User.hides("irrelevant nodes and relationships"))
  .and(User.isolates("the semantic slice they care about"));

when(User.arranges(Graph.layer))
  .then(AgentGraph.groups(Graph.layer).under(Graph.layerGroup))
  .and(User.moves("whole layers independently"))
  .and(AgentGraph.keeps("all layers in one shared React Flow workspace plane"));

when(Graph.layer.connectsTo(Graph.layer))
  .then(AgentGraph.shows(Graph.edge))
  .and(AgentGraph.mayShow(Graph.derivedEdge))
  .and(AgentGraph.mustPreserve("the relationship between slices and the whole graph"));

when(Graph.derivedEdge.existsBetween("visible nodes"))
  .then(AgentGraph.means("the visible relationship runs through hidden intermediate context"))
  .and(AgentGraph.distinguishes(Graph.derivedEdge).from(Graph.edge))
  .and(User.mayInspect("the supporting hidden path"));

// Graph-Native Inspection

when(User.selects(Graph.node))
  .then(AgentGraph.reveals("the immediate neighborhood"))
  .and(AgentGraph.prioritizes("local connected context before transitive structure"))
  .and(User.understands("how the selected thing connects"));

when(User.selects(Graph.edge))
  .then(AgentGraph.reveals("the local relationship context"))
  .and(User.understands("what the relationship connects directly"));

when(User.selects(Graph.hiddenContext))
  .then(AgentGraph.summarizes("what kind of hidden context lies beyond the visible boundary"))
  .and(User.mayReveal("that hidden context"));

when(User.selects(Graph.derivedEdge))
  .then(AgentGraph.reveals("the hidden supporting path"))
  .and(User.mayExplain("why the derived connection exists"));

// Safe Graph-Native Editing

when(User.edits(Graph.node))
  .then(AgentGraph.derives(Editing.validation))
  .and(AgentGraph.checks("the edit against the complete hidden graph and source context"))
  .and(AgentGraph.mustPrevent("ambiguous silent writes"));

when(AgentGraph.accepts(Editing.validation))
  .then(AgentGraph.applies(Editing.mutation).to(Source.document))
  .and(AgentGraph.reprojects(Graph.whole))
  .and(User.trusts("that the visible edit round-tripped safely"));

when(AgentGraph.rejects(Editing.validation))
  .then(AgentGraph.surfaces(Editing.conflict).to(User))
  .and(AgentGraph.explains("the ambiguity in graph terms"))
  .and(AgentGraph.neverApplies("a silent ambiguous source write"));

when(User.connects(Graph.node).to(Graph.node))
  .then(AgentGraph.derives(Editing.validation))
  .and(AgentGraph.checks("the relationship against hidden context"))
  .and(AgentGraph.applies(Editing.mutation).whenAccepted(Editing.validation));

// Trust Under Change

when(Source.document.changes("outside the current graph session"))
  .then(AgentGraph.surfaces("external change"))
  .and(AgentGraph.interrupts("trust in the current stale graph state"))
  .and(AgentGraph.mustPrevent("silent drift from source"));

when(User.inspects("graph diff"))
  .then(AgentGraph.mayShow(Graph.diffLayer, {
    kind: "old",
  }))
  .and(AgentGraph.mayShow(Graph.diffLayer, {
    kind: "new",
  }))
  .and(AgentGraph.mayShow(Graph.diffLayer, {
    kind: "changed-only",
  }))
  .and(User.understands("what changed in graph terms"));

when(AgentGraph.detects(Editing.conflict))
  .then(AgentGraph.explains("why trust was interrupted"))
  .and(AgentGraph.prioritizes("change explanation before conflict resolution"));

// Code Structure

const Package = {
  studio: define.package("AgentishStudioApp"),
  ui: define.package("AgentGraphUi"),
  store: define.package("AgentGraphStore"),
  core: define.package("AgentGraphCore"),
  protocol: define.package("AgentGraphProtocol"),
  server: define.package("AgentGraphServer"),
};

Package.ui.dependsOn(Package.store, Package.core, Package.protocol);
Package.store.dependsOn(Package.core, Package.protocol);
Package.server.dependsOn(Package.core, Package.protocol);
Package.studio.dependsOn(Package.ui, Package.store, Package.protocol);

AgentGraph.implementsThrough(`
- apps/agentish-studio is a thin composition shell.
- packages/agent-graph-ui owns React Flow rendering, interaction, and view composition.
- packages/agent-graph-store owns client session, layer, selection, diff, and conflict state.
- packages/agent-graph-core owns semantic graph derivation, layer logic, hidden-context analysis, derived-edge analysis, validation, and mutation planning.
- packages/agent-graph-protocol owns shared HTTP, WSS, snapshot, diff, validation, and conflict contracts.
- packages/agent-graph-server owns Bun HTTP and WSS transport, filesystem access, persistence, reprojection, and external-change detection.
`);

Package.studio.rejects("business logic outside composition and bootstrapping");
Package.ui.rejects("direct filesystem access and direct source writes");
Package.store.rejects("authoritative graph derivation and source mutation planning");
Package.server.rejects("browser-only state ownership");

// Runtime Architecture

const Runtime = {
  browser: define.system("BrowserClient"),
  reactFlow: define.system("ReactFlowCanvas"),
  legendState: define.system("LegendStateStore"),
  bun: define.system("BunGraphServer"),
  filesystem: define.system("WorkspaceFilesystem"),
};

AgentGraph.runsOn(`
- React and React Flow in the browser.
- Legend State for client graph workspace state.
- Bun HTTP and WSS on the server.
- Workspace filesystem as the authoritative persistence layer.
`);

Runtime.browser.uses(Runtime.reactFlow, Runtime.legendState);
Runtime.bun.accesses(Runtime.filesystem);

when(Runtime.browser.connectsTo(Runtime.bun))
  .then(Runtime.browser.requests("workspace and graph snapshots"))
  .and(Runtime.browser.subscribes("to projection, diff, validation, conflict, and external-change events"))
  .and(Runtime.bun.remains("authoritative for persistence, reprojection, and revision order"));

// Boundary Contracts

const Contract = {
  workspaceSnapshot: define.concept("WorkspaceSnapshot"),
  graphSnapshot: define.concept("GraphSnapshot"),
  graphPatch: define.concept("GraphPatch"),
  diffSnapshot: define.concept("GraphDiffSnapshot"),
  validationResult: define.concept("ValidationPayload"),
  conflictPayload: define.concept("ConflictPayload"),
  externalChange: define.concept("ExternalChangeEvent"),
};

AgentGraph.crossesBoundariesThrough(
  Contract.workspaceSnapshot,
  Contract.graphSnapshot,
  Contract.graphPatch,
  Contract.diffSnapshot,
  Contract.validationResult,
  Contract.conflictPayload,
  Contract.externalChange,
);

Contract.workspaceSnapshot.means("the open documents, workspace state, and layer persistence context");
Contract.graphSnapshot.means("the complete projected graph state for the current revision");
Contract.graphPatch.means("incremental graph-state updates after accepted mutation or reprojection");
Contract.diffSnapshot.means("old, new, and changed-only graph comparison state");
Contract.validationResult.means("accepted or rejected edit state with graph-native explanation");
Contract.conflictPayload.means("graph-native explanation of stale, ambiguous, or incompatible edits");
Contract.externalChange.means("notification that authoritative source changed outside the current session");

// Cross-Family Truths

AgentGraph.preserves(`
- completeness of the underlying graph
- visibility of hidden-but-present context
- distinction between direct and derived edges
- inspectability of derived connections
- trust in the graph as a primary surface rather than a secondary visualization
`);

// Open Questions

AgentGraph.keepsOpen(`
- What is the best visible form for a hidden-context portal to the underlying plane?
- How should derived edges summarize path strength or multiplicity when several hidden paths exist?
- Which layer manipulations should be reversible as simple workspace operations versus source-affecting edits?
- What is the most legible graph-native diff composition for old, new, and changed-only layers in one workspace?
`);
