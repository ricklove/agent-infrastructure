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
- Edits begin from visible layers.
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
  .then(AgentGraph.shows(Graph.edge).when("the relationship is directly visible"))
  .and(
    AgentGraph.shows(Graph.derivedEdge).when(
      "the relationship is visible only through hidden intermediate context",
    ),
  )
  .and(AgentGraph.mustPreserve("the relationship between slices and the whole graph"));

when(Graph.derivedEdge.existsBetween("visible nodes"))
  .then(AgentGraph.means("the visible relationship runs through hidden intermediate context"))
  .and(AgentGraph.distinguishes(Graph.derivedEdge).from(Graph.edge))
  .and(User.inspects("the supporting hidden path"));

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
  .and(User.reveals("that hidden context"));

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
  .then(AgentGraph.shows(Graph.diffLayer, {
    kind: "old",
  }))
  .and(AgentGraph.shows(Graph.diffLayer, {
    kind: "new",
  }))
  .and(AgentGraph.shows(Graph.diffLayer, {
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

AgentGraph.usesFiles(`
- apps/agentish-studio/src/main.tsx
- apps/agentish-studio/src/App.tsx
- packages/agent-graph-ui/src/components/AgentGraphScreen.tsx
- packages/agent-graph-ui/src/components/AgentGraphCanvas.tsx
- packages/agent-graph-ui/src/components/LayerWorkspacePanel.tsx
- packages/agent-graph-ui/src/components/InspectorPanel.tsx
- packages/agent-graph-ui/src/components/DiffPanel.tsx
- packages/agent-graph-ui/src/renderers/HiddenContextPortalNode.tsx
- packages/agent-graph-ui/src/renderers/DerivedEdgeRenderer.tsx
- packages/agent-graph-ui/src/renderers/DirectEdgeRenderer.tsx
- packages/agent-graph-store/src/agent-graph-store.ts
- packages/agent-graph-store/src/actions.ts
- packages/agent-graph-core/src/build-complete-graph.ts
- packages/agent-graph-core/src/build-derived-edges.ts
- packages/agent-graph-core/src/build-hidden-context-portals.ts
- packages/agent-graph-core/src/plan-source-mutation.ts
- packages/agent-graph-core/src/build-diff-layers.ts
- packages/agent-graph-server/src/create-http-server.ts
- packages/agent-graph-server/src/create-ws-server.ts
- packages/agent-graph-server/src/workspace-state-repository.ts
- packages/agent-graph-server/src/document-repository.ts
- packages/agent-graph-server/src/apply-source-mutation.ts
- packages/agent-graph-protocol/src/http.ts
- packages/agent-graph-protocol/src/ws.ts
`);

AgentGraph.definesUiComponents(`
- AgentGraphScreen composes the overall workspace shell.
- AgentGraphCanvas owns the React Flow plane and renderer registration.
- LayerWorkspacePanel manages persistent user layers and their arrangement controls.
- InspectorPanel owns graph-native inspection and edit affordances for the current primary selection.
- DiffPanel owns graph-native diff explanation and conflict-entry flows.
- HiddenContextPortalNode renders hidden-context portal interaction.
- DerivedEdgeRenderer renders derived-edge visual semantics and multiplicity badges.
- DirectEdgeRenderer renders direct relationship edges.
`);

AgentGraph.definesStoreSlices(`
- session slice for workspace identity, revision, and connection state
- graph slice for complete projection, visible layers, and workspace-plane layout
- inspection slice for selection, hidden-context reveal, and derived-edge path inspection
- diff slice for old, new, and changed-only comparison layers
- conflict slice for blocked edits and trust interruption state
- command slice for pending source-affecting edits and workspace operations
`);

AgentGraph.definesStoreActions(`
- openWorkspace
- cloneLayer
- refineLayer
- arrangeLayer
- revealHiddenContext
- inspectDerivedEdge
- editNodeMeaning
- connectVisibleNodes
- applyValidationResult
- applyConflict
- applyGraphSnapshot
- applyGraphPatch
- applyDiffSnapshot
- acknowledgeExternalChange
- reloadCurrentTruth
- discardPendingLocalEdit
`);

AgentGraph.definesCoreModules(`
- complete graph derivation
- layer materialization and persistence logic
- derived-edge derivation and path ranking
- hidden-context portal derivation
- graph-native diff derivation
- source mutation planning
- conflict and validation explanation
`);

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

// Layer Semantics

AgentGraph.definesLayerSemantics(`
- The whole workspace always contains the complete projected graph for the current source revision.
- A user layer is a persistent visible slice of that complete graph, not a separate graph.
- A layer stores its own visible membership, local layout, visibility state, and derivation history from prior views.
- A layer is a materialized persistent slice, not a live query that automatically changes as the whole graph changes.
- Cloning a layer copies the current visible slice and layout into a new persistent layer.
- Filtering removes items from visible membership without deleting them from the underlying graph.
- Hiding suppresses visibility temporarily without removing membership from the layer definition.
- Isolating creates a tighter visible slice from an existing visible context.
- Refining a layer changes only the layer definition, never the underlying source graph by itself.
- Layers render together in one workspace plane and move independently through their parent regions.
`);

// Derived Edge Semantics

AgentGraph.definesDerivedEdgeSemantics(`
- A derived edge appears only between currently visible nodes.
- A derived edge exists when a meaningful relationship between visible nodes runs through hidden intermediate graph context.
- Derived edges never replace direct edges; they supplement visible understanding when the direct path is hidden.
- If a direct edge is visible, the direct edge wins and the equivalent derived edge is suppressed.
- Multiple hidden supporting paths collapse into one derived edge when they communicate the same visible semantic relationship.
- When several hidden paths exist, the displayed derived edge uses the shortest path that preserves semantic relationship kind and reports multiplicity separately.
- Derived edges must remain visually distinct from direct edges.
- Inspecting a derived edge must reveal the supporting hidden path or paths.
`);

// Hidden Context Portal Semantics

AgentGraph.definesHiddenContextPortalSemantics(`
- A hidden-context portal appears when visible graph elements connect to context that is currently outside the visible slice.
- The portal signals that hidden context still exists in the same complete graph.
- The portal summarizes what kind of hidden context lies beyond the visible boundary.
- The portal supports navigation or reveal into the hidden context.
- Revealed hidden context first appears as temporary workspace state unless the user promotes it into a persistent layer.
- A portal never implies missing data; it implies intentionally non-visible data.
- Portals preserve trust in completeness across user layers.
`);

// Edit Operation Matrix

AgentGraph.allowsEdits(`
- Edit visible node meaning.
- Connect visible nodes.
- Rearrange node layout.
- Rearrange layer layout.
- Refine layer visibility and membership.
`);

AgentGraph.validatesEdits(`
- Visible edits must be checked against the complete hidden graph and source context.
- Layer refinement edits affect workspace state only unless they explicitly target source meaning.
- Layout edits affect workspace or layer layout state only unless explicitly modeled as source-backed layout hints.
- Meaning edits and connection edits produce source mutations only after validation acceptance.
- The system must never silently apply an ambiguous source mutation from a partial view.
`);

AgentGraph.blocksEdits(`
- Any edit whose target source meaning is ambiguous in the complete graph context.
- Any edit whose hidden context would make multiple source mutations plausible.
- Any edit whose required supporting context is stale after external change or revision drift.
`);

AgentGraph.mapsEditsToSource(`
- Editing visible node meaning targets the owning semantic declaration of that visible node.
- Connecting visible nodes targets a relationship between the owning semantic declarations of those visible nodes.
- Layer refinement never mutates source meaning.
- Layout movement never mutates source meaning.
- Source-affecting edits always target semantic ownership, never transient visible graph artifacts.
`);

AgentGraph.executesEditsThrough(`
- Source-affecting edits are submitted immediately to the authoritative server for validation and mutation planning.
- Accepted source-affecting edits persist immediately to authoritative source and return projection updates.
- Workspace-only edits persist to workspace state and do not require source mutation planning.
`);

// Interaction And History Semantics

AgentGraph.definesInteractionSemantics(`
- Selection supports one primary selected element and optional multi-selection of peer elements.
- Inspection always anchors on the primary selection.
- Revealing hidden context expands around the currently inspected selection rather than resetting the workspace.
- Layer clone, filter, hide, isolate, arrange, reveal, and diff toggles are workspace operations.
- Meaning edits and relationship edits are source-affecting operations.
`);

AgentGraph.definesHistorySemantics(`
- Workspace operations are undoable locally.
- Source-affecting edits are undoable only through inverse validated mutations against the current revision.
- If the revision changed and inverse mutation is no longer safe, undo becomes a conflict flow rather than a silent rollback.
- Undo and redo must preserve trust rather than force stale state back into the graph.
`);

// Client State Model

AgentGraph.organizesClientStateAs(`
- session state for connection, revision, and workspace identity
- graph state for complete projection, layer definitions, layout, and selection
- inspection state for current focus, revealed hidden context, and derived-edge path inspection
- diff and conflict state for change explanation and blocked edits
- command state for pending source-affecting edits and local workspace operations
`);

// Workspace Persistence Model

AgentGraph.persists(`
- user-created layers
- layer membership
- layer-local layout
- workspace-plane arrangement
- visibility state
- diff layers
`);

AgentGraph.doesNotPersist(`
- transient hover state
- temporary reveal state unless promoted into a persistent layer
`);

AgentGraph.persistsWorkspaceStateAs(`
- a server-managed workspace sidecar separate from Agentish source documents
- one canonical persisted workspace state per workspace root
- persisted state includes layer definitions, layout, diff composition, and workspace-plane arrangement
`);

// Session And Revision Model

AgentGraph.definesSessionSemantics(`
- The server is authoritative for revision order.
- The client always edits against a specific known workspace revision.
- External change produces a new authoritative revision and stales current visible context when it touches the current visible graph or pending edit.
- Projection patches apply in revision order only.
- If a patch or undo targets an outdated revision, the system enters diff or conflict flow rather than guessing.
`);

// Diff And Conflict Model

AgentGraph.definesDiffSemantics(`
- A diff view compares graph state across source revisions.
- Diff is shown through old, new, and changed-only layers in the same workspace.
- Diff layers are explanatory first and exist to restore trust in changed graph state.
- Diff layers do not become new source truth by themselves.
- Diff composition aligns old, new, and changed-only layers by stable identity when possible.
- Changed-only focuses on added, removed, and semantically changed visible elements.
`);

AgentGraph.definesConflictSemantics(`
- A conflict interrupts trust in the current graph state or pending edit.
- The system explains why trust was interrupted before asking for resolution.
- Conflict resolution follows change explanation rather than preceding it.
- A conflict arises from stale revision, hidden-context ambiguity, or incompatible external change.
- Conflict resolution choices are reload current truth, inspect diff, discard pending local edit, or retry after context reveal.
`);

// Visual Semantics

AgentGraph.requiresVisualDistinctions(`
- direct edges and derived edges must be visibly different
- hidden-context portals must be visibly different from normal nodes and edges
- diff layers must be visibly different from normal semantic layers
- layer parent regions must support whole-layer orientation without dominating the visible graph
`);

AgentGraph.definesVisualSemantics(`
- Hidden-context portals render at the edge of the current visible boundary rather than as ordinary semantic nodes.
- Hidden-context portals summarize missing context by relationship kind and hidden-element count.
- Derived edges render as secondary explanatory relationships rather than primary structural edges.
- Derived edges show path multiplicity with a badge when several hidden supporting paths collapse into one visible derived edge.
- Diff layers render as sibling grouped regions with stable spatial alignment against normal semantic layers.
`);

// Performance And Scale Constraints

AgentGraph.optimizesFor(`
- multi-document workspace scale as the default case
- incremental graph updates after accepted edits when possible
- fast layer refinement without full source mutation planning
- graph-native diff and hidden-context inspection that remain usable without dropping to source text
- workspace operations that feel immediate relative to source-affecting reprojection
`);

// Cross-Family Truths

AgentGraph.preserves(`
- completeness of the underlying graph
- visibility of hidden-but-present context
- distinction between direct and derived edges
- inspectability of derived connections
- trust in the graph as a primary surface rather than a secondary visualization
`);
