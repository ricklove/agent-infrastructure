/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'ConceptualSystemDefinition'
});

const AgentishGraphConcept = define.entity('AgentishGraphConcept', {
  format: Agentish,
  describes: 'PurposeMeaningAndCoreInvariantsOfAgentishGraph'
});

const Human = define.actor('Human', {
  role: 'ReaderAndEditorOfAgentishSystems'
});
const GraphSystem = define.system('AgentishGraphSystem', {
  role: 'VisualProjectionAndEditingSystem'
});

const Source = {
  document: define.entity('AgentishDocument', { format: Agentish }),
  documentSet: define.entity('AgentishDocumentSet', { actsAs: 'WorkspaceSource' }),
  semanticModel: define.entity('SemanticModel', { actsAs: 'NormalizedMeaningLayer' }),
  stableIdentity: define.entity('StableIdentity')
};

const Projection = {
  workspace: define.entity('GraphWorkspace', { actsAs: 'HumanEditableProjection' }),
  layer: define.entity('GraphLayer'),
  node: define.entity('GraphNode'),
  edge: define.entity('GraphEdge'),
  portal: define.entity('PortalEdge'),
  selection: define.entity('SelectionState'),
  layoutHint: define.entity('LayoutHint')
};

const Editing = {
  intent: define.entity('EditIntent'),
  mutation: define.entity('SourceMutation'),
  conflict: define.entity('EditConflict'),
  validation: define.entity('ValidationResult')
};

const Principles = {
  sourceAuthority: define.concept('SourceAuthority'),
  derivedProjection: define.concept('DerivedProjection'),
  roundTripEditing: define.concept('RoundTripEditing'),
  stableIdentity: define.concept('StableIdentityAcrossRefresh'),
  surfacedConflicts: define.concept('SurfacedConflicts')
};

AgentishGraphConcept.contains(Source.documentSet, Source.semanticModel, Projection.workspace, Editing.intent);

GraphSystem.reads(Source.documentSet);
GraphSystem.derives(Source.semanticModel).from(Source.documentSet);
GraphSystem.derives(Projection.workspace).from(Source.semanticModel, Projection.layoutHint);
GraphSystem.derives(Editing.mutation).from(Editing.intent, Source.documentSet);

Projection.workspace.contains(
  Projection.layer,
  Projection.node,
  Projection.edge,
  Projection.portal,
  Projection.selection
);

AgentishGraphConcept.enforces(
  Principles.sourceAuthority,
  Principles.derivedProjection,
  Principles.roundTripEditing,
  Principles.stableIdentity,
  Principles.surfacedConflicts
);

Principles.sourceAuthority.means('AgentishDocumentsRemainTheSourceOfTruth');
Principles.derivedProjection.means('GraphWorkspaceIsDerivedFromSourceMeaningRatherThanBeingIndependentTruth');
Principles.roundTripEditing.means('HumanEditsInTheGraphMustResolveBackIntoSourceMutations');
Principles.stableIdentity.means('TheSameMeaningShouldReappearAsTheSameVisualIdentityAcrossRefresh');
Principles.surfacedConflicts.means('AmbiguityAndExternalChangeMustBeShownToTheHumanRatherThanHidden');

when(Human.opens(Source.documentSet))
  .then(GraphSystem.understands(Source.documentSet))
  .and(GraphSystem.projects(Projection.workspace));

when(Human.edits(Projection.workspace))
  .then(GraphSystem.derives(Editing.intent))
  .and(GraphSystem.returnsTo(Source.documentSet).through(Editing.mutation));

when(GraphSystem.detects(Editing.conflict))
  .then(GraphSystem.exposes(Editing.conflict).to(Human))
  .and(GraphSystem.protects(Source.documentSet).through(Principles.sourceAuthority));
