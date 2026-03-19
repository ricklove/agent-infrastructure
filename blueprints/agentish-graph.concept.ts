/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Conceptual system definition",
});

const AgentishGraphConcept = define.entity("AgentishGraphConcept", {
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
  document: define.entity("AgentishDocument", { format: Agentish }),
  documentSet: define.entity("AgentishDocumentSet", { actsAs: "workspace source" }),
  semanticModel: define.entity("SemanticModel", { actsAs: "normalized meaning" }),
  stableIdentity: define.entity("StableIdentity"),
};

const Projection = {
  workspace: define.entity("GraphWorkspace", {
    actsAs: "human-editable projection",
  }),
  layer: define.entity("GraphLayer"),
  node: define.entity("GraphNode"),
  edge: define.entity("GraphEdge"),
  portal: define.entity("PortalEdge"),
  selection: define.entity("SelectionState"),
  layoutHint: define.entity("LayoutHint"),
};

const Editing = {
  intent: define.entity("EditIntent"),
  mutation: define.entity("SourceMutation"),
  validation: define.entity("ValidationResult"),
  conflict: define.entity("EditConflict"),
};

const Truth = {
  sourceAuthority: define.concept("SourceAuthority"),
  derivedProjection: define.concept("DerivedProjection"),
  roundTripEditing: define.concept("RoundTripEditing"),
  stableIdentity: define.concept("StableIdentityAcrossRefresh"),
  surfacedConflicts: define.concept("SurfacedConflicts"),
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

AgentishGraphConcept.enforces(
  Truth.sourceAuthority,
  Truth.derivedProjection,
  Truth.roundTripEditing,
  Truth.stableIdentity,
  Truth.surfacedConflicts,
);

Truth.sourceAuthority.means("Documents remain authoritative.");
Truth.derivedProjection.means("The graph workspace is derived rather than primary truth.");
Truth.roundTripEditing.means("Graph edits return to source as mutations.");
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
  .and(GraphSystem.applies(Editing.mutation).to(Source.documentSet));

when(GraphSystem.encounters(Editing.conflict))
  .then(GraphSystem.surfaces(Editing.conflict).to(Human))
  .and(GraphSystem.protects(Source.documentSet).through(Truth.sourceAuthority));
