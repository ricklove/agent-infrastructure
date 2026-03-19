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
  layer: define.graphLayer("UserLayer"),
  node: define.graphNode("GraphNode"),
  edge: define.graphEdge("DirectEdge"),
  derivedEdge: define.graphEdge("DerivedEdge"),
  hiddenContext: define.portal("HiddenContextPortal"),
  diffLayer: define.graphLayer("DiffLayer"),
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
  .then(AgentGraph.groups("each layer under an invisible parent region"))
  .and(User.moves("whole layers independently"))
  .and(AgentGraph.keeps("all layers in one shared React Flow workspace"));

when(Graph.layer.connectsTo(Graph.layer))
  .then(AgentGraph.shows(Graph.edge))
  .and(AgentGraph.mayShow(Graph.derivedEdge))
  .and(AgentGraph.mustPreserve("the relationship between slices and the whole graph"));

when(Graph.derivedEdge.existsBetween("visible nodes"))
  .then(AgentGraph.means("the visible relationship runs through hidden intermediate context"))
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
