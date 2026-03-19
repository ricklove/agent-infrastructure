/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Operational behavior definition",
});

const Concept = define.entity("AgentishGraphConcept", { format: Agentish });
const Scenarios = define.entity("AgentishGraphScenarios", { format: Agentish });
const Contracts = define.entity("AgentishGraphContracts", { format: Agentish });
const CodeArchitecture = define.entity("AgentishGraphCodeArchitecture", {
  format: Agentish,
});

const OperationalBehavior = define.entity("AgentishGraphOperationalBehavior", {
  format: Agentish,
  implements: Concept,
  operationalizes: Scenarios,
  bindsTo: Contracts,
  realizedBy: CodeArchitecture,
  standard: "Resolve identity, transform, validation, and reconciliation behavior",
});

const Browser = define.actor("BrowserUser", { role: "Graph editor operator" });
const GraphSystem = define.system("AgentishGraphSystem", {
  role: "Projection, validation, and reconciliation authority",
});

const Source = {
  documentSet: define.entity("AgentishDocumentSet"),
  semanticModel: define.entity("SemanticModel"),
  mutation: define.entity("SourceMutation"),
  patchPlan: define.entity("SourcePatchPlan"),
};

const Projection = {
  workspace: define.entity("GraphWorkspace"),
  layoutHint: define.entity("LayoutHint"),
  stableIdentity: define.entity("StableIdentity"),
};

const Editing = {
  intent: define.entity("EditIntent"),
  validation: define.entity("ValidationResult"),
  conflict: define.entity("EditConflict"),
};

const Decision = {
  parsing: define.entity("ParsingDecision"),
  identity: define.entity("StableIdentityDecision"),
  projection: define.entity("ProjectionDecision"),
  layering: define.entity("LayeringDecision"),
  mutation: define.entity("MutationDecision"),
  conflicts: define.entity("ConflictDecision"),
  session: define.entity("SessionDecision"),
  rendering: define.entity("RenderingDecision"),
};

OperationalBehavior.contains(
  Decision.parsing,
  Decision.identity,
  Decision.projection,
  Decision.layering,
  Decision.mutation,
  Decision.conflicts,
  Decision.session,
  Decision.rendering,
);

Decision.parsing.defines(`- Use the TypeScript compiler API.
- Extract define declarations, relationship chains, and when chains.
- Treat named declarations as semantic nodes and fluent chains as semantic edges.`);
Decision.identity.defines(`- Stable IDs derive from relative path and local meaning.
- Equivalent meaning must yield the same stable ID after reprojection.
- Layout hints are keyed by stable ID rather than by transient render position.
- If a stable ID no longer resolves to a projected node, its layout hint is discarded.`);
Decision.projection.defines(`- Projection is built on the server.
- Projection recomputes from source and layout hints.
- Layout hints may influence geometry but may not change source meaning.
- A relation becomes a portal when its endpoints land in different document layers.`);
Decision.layering.defines(`- There is one layer per open document.
- Default layer order is lexicographic by relative path.
- Cross-document references appear as portals between layers.`);
Decision.mutation.defines(`- Graph mutation intent is the only client write primitive.
- Source patch plan is the only server write primitive.
- Validation precedes source writes.
- The client may be optimistic about selection and viewport only.
- Setting node position mutates layout hints only.
- Setting node label or attribute rewrites the corresponding source declaration.
- Connecting handles rewrites or creates a source relationship.
- Deleting elements removes the owning source declarations or relationships.`);
Decision.conflicts.defines(`- Conflicts pause the pending mutation queue.
- A mutation that loses its target becomes a surfaced conflict instead of a silent drop.
- Conflict resolution choices are reload, manual edit, or discard local intent.
- Reload replaces stale client state with a fresh snapshot.
- Discard local intent clears the blocked mutation without mutating source.
- Manual edit preserves the conflict until the source meaning changes or the user abandons the edit.`);
Decision.session.defines(`- There is one writable session per workspace root.
- A missing patch revision forces a full snapshot reload.
- The server remains authoritative for revision ordering and patch acceptance.`);
Decision.rendering.defines(`- React Flow is an adapter, not a source of truth.
- Portal edges represent cross-layer references only.
- Manual layout is preserved when stable identity persists.`);

OperationalBehavior.enforces(`- Only validated mutations may become source patch plans.
- Equivalent documents plus equivalent layout hints yield equivalent projection.
- Projection patches apply strictly in revision order.
- Conflicts and ambiguity are surfaced rather than hidden.
- Source meaning remains authoritative across reprojection.`);

GraphSystem.derives(Source.semanticModel).from(Source.documentSet);
GraphSystem.derives(Projection.workspace).from(
  Source.semanticModel,
  Projection.layoutHint,
);
GraphSystem.derives(Editing.validation).from(Editing.intent, Source.documentSet);
GraphSystem.derives(Source.patchPlan).from(Editing.validation, Editing.intent);
GraphSystem.derives(Source.mutation).from(Source.patchPlan);

when(Browser.edits(Projection.workspace))
  .then(GraphSystem.derives(Editing.intent))
  .and(GraphSystem.derives(Editing.validation));

when(GraphSystem.accepts(Editing.validation))
  .then(GraphSystem.derives(Source.patchPlan))
  .and(GraphSystem.applies(Source.mutation).to(Source.documentSet))
  .and(GraphSystem.projects(Projection.workspace));

when(GraphSystem.rejects(Editing.validation))
  .then(GraphSystem.surfaces(Editing.conflict).to(Browser))
  .and(GraphSystem.protects(Source.documentSet));

when(Browser.resolves(Editing.conflict).with("reload"))
  .then(GraphSystem.reloads("full snapshot"))
  .and(GraphSystem.replaces("stale client projection state"));

when(Browser.resolves(Editing.conflict).with("discard local intent"))
  .then(GraphSystem.discards("the blocked local mutation"))
  .and(GraphSystem.protects(Source.documentSet));

when(Browser.resolves(Editing.conflict).with("manual edit"))
  .then(GraphSystem.keeps(Editing.conflict).visibleTo(Browser))
  .and(GraphSystem.waitsFor("source meaning to change"));

when(GraphSystem.detects("external source change"))
  .then(GraphSystem.derives(Source.semanticModel))
  .and(GraphSystem.projects(Projection.workspace))
  .and(GraphSystem.preserves("selection and viewport when safe"));

when(GraphSystem.detects("missing patch revision"))
  .then(GraphSystem.reloads("full snapshot"))
  .and(GraphSystem.replaces("stale client projection state"));

when(GraphSystem.reprojects(Projection.workspace))
  .then(GraphSystem.reuses(Projection.stableIdentity))
  .and(GraphSystem.applies(Projection.layoutHint))
  .and(GraphSystem.discards("orphaned layout hints"));
