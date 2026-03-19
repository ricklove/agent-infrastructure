/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Conceptual system definition",
});

const AgentishGraphConcept = define.blueprint("AgentishGraphConcept", {
  format: Agentish,
  describes: "Human visualization and editing of Agentish documents",
});

const Human = define.actor("Human", {
  role: "Reader and editor of Agentish systems",
});
const GraphSystem = define.system("AgentishGraphSystem", {
  role: "Projection and round-trip editor",
});

const Source = {
  document: define.document("AgentishDocument", { format: Agentish }),
  documentSet: define.documentSet("AgentishDocumentSet", {
    actsAs: "workspace source",
  }),
  semanticModel: define.semanticModel("SemanticModel", {
    actsAs: "normalized meaning",
  }),
  stableIdentity: define.identity("StableIdentity"),
};

const Projection = {
  workspace: define.workspace("GraphWorkspace", {
    actsAs: "human-editable projection",
  }),
  layer: define.graphLayer("GraphLayer"),
  node: define.graphNode("GraphNode"),
  edge: define.graphEdge("GraphEdge"),
  portal: define.portal("PortalEdge"),
  selection: define.selection("SelectionState"),
  layoutHint: define.layoutHint("LayoutHint"),
};

const Editing = {
  intent: define.intent("EditIntent"),
  mutation: define.mutation("SourceMutation"),
  validation: define.validation("ValidationResult"),
  conflict: define.conflict("EditConflict"),
};

const Truth = {
  sourceAuthority: define.truth("SourceAuthority"),
  derivedProjection: define.truth("DerivedProjection"),
  roundTripEditing: define.truth("RoundTripEditing"),
  layoutHintsAdvisory: define.truth("LayoutHintsAreAdvisory"),
  multiDocumentWorkspace: define.truth("WorkspaceMaySpanManyDocuments"),
  stableIdentity: define.truth("StableIdentityAcrossRefresh"),
  surfacedConflicts: define.truth("SurfacedConflicts"),
};

Source.documentSet.contains(Source.document);
Source.semanticModel.contains(Source.stableIdentity);
Projection.workspace.contains(
  Projection.layer,
  Projection.node,
  Projection.edge,
  Projection.portal,
  Projection.selection,
  Projection.layoutHint,
);

GraphSystem.reads(Source.documentSet);
GraphSystem.derives(Source.semanticModel).from(Source.documentSet);
GraphSystem.derives(Projection.workspace).from(
  Source.semanticModel,
  Projection.layoutHint,
);
GraphSystem.derives(Editing.mutation).from(Editing.intent, Source.documentSet);
GraphSystem.derives(Editing.validation).from(Editing.mutation, Source.documentSet);
GraphSystem.derives(Editing.conflict).from(Editing.validation);

AgentishGraphConcept.enforces(
  Truth.sourceAuthority,
  Truth.derivedProjection,
  Truth.roundTripEditing,
  Truth.layoutHintsAdvisory,
  Truth.multiDocumentWorkspace,
  Truth.stableIdentity,
  Truth.surfacedConflicts,
);

Truth.sourceAuthority.means("Documents remain authoritative.");
Truth.derivedProjection.means("The graph workspace is derived rather than primary truth.");
Truth.roundTripEditing.means("Graph edits return to source as mutations.");
Truth.layoutHintsAdvisory.means(
  "Layout hints shape the projection without changing source meaning.",
);
Truth.multiDocumentWorkspace.means(
  "A workspace may project one document or many documents together.",
);
Truth.stableIdentity.means(
  "Equivalent meaning reappears as equivalent visual identity.",
);
Truth.surfacedConflicts.means(
  "Ambiguity and revision drift must be shown rather than hidden.",
);

when(Human.opens(Source.documentSet))
  .then(GraphSystem.normalizes(Source.documentSet).into(Source.semanticModel))
  .and(GraphSystem.projects(Projection.workspace));

when(Human.edits(Projection.workspace))
  .then(GraphSystem.derives(Editing.intent))
  .and(GraphSystem.derives(Editing.mutation))
  .and(GraphSystem.derives(Editing.validation));

when(GraphSystem.accepts(Editing.validation))
  .then(GraphSystem.applies(Editing.mutation).to(Source.documentSet))
  .and(GraphSystem.projects(Projection.workspace));

when(GraphSystem.encounters(Editing.conflict))
  .then(GraphSystem.surfaces(Editing.conflict).to(Human))
  .and(GraphSystem.protects(Source.documentSet).through(Truth.sourceAuthority));
