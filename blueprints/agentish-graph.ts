/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'HumanVisualizationAndEditingOfAnyAgentishDocument'
});

const AgentishGraphBlueprint = define.entity('AgentishGraphBlueprint', {
  format: Agentish,
  describes: 'ProjectionEditingAndSynchronizationOfAgentishDocuments'
});

const Human = define.actor('Human', {
  role: 'ReaderEditorOfSemanticBlueprints'
});

const GraphSystem = define.system('AgentishGraphSystem', {
  role: 'ProjectionAndEditingRuntime'
});
const Parser = define.system('AgentishParser', {
  role: 'NormalizerOfAgentishSource'
});
const Indexer = define.system('SemanticIndexer', {
  role: 'CrossDocumentResolver'
});
const Solver = define.system('ConstraintSolver', {
  role: 'GeometricLayoutEngine'
});
const Synchronizer = define.system('RoundTripSynchronizer', {
  role: 'ProjectionToSourceCoordinator'
});

const Source = {
  document: define.entity('AgentishDocument', { format: Agentish }),
  documentSet: define.entity('AgentishDocumentSet', { actsAs: 'WorkspaceSource' }),
  semanticModel: define.entity('SemanticModel', { actsAs: 'NormalizedMeaningLayer' }),
  symbol: define.entity('SemanticSymbol'),
  relation: define.entity('SemanticRelation'),
  attribute: define.entity('SemanticAttribute'),
  namespace: define.entity('DocumentNamespace'),
  provenance: define.entity('SourceProvenance'),
  identity: define.entity('StableIdentity')
};

const Projection = {
  workspace: define.entity('GraphWorkspace', { actsAs: 'EditableProjectionSurface' }),
  viewport: define.entity('ViewportState'),
  layer: define.entity('GraphLayer', { actsAs: 'IndependentCoordinateSpace' }),
  node: define.entity('GraphNode', { actsAs: 'ProjectedSymbol' }),
  edge: define.entity('GraphEdge', { actsAs: 'ProjectedRelation' }),
  handle: define.entity('GraphHandle', { actsAs: 'ConnectionPort' }),
  label: define.entity('GraphLabel', { actsAs: 'ReadableAnnotation' }),
  widget: define.entity('GraphWidget', { actsAs: 'InlineInspectorOrEditor' }),
  portal: define.entity('PortalEdge', { actsAs: 'CrossLayerReference' }),
  selection: define.entity('SelectionState'),
  geometry: define.entity('GeometryState'),
  layoutHint: define.entity('LayoutHint')
};

const Editing = {
  intent: define.entity('EditIntent'),
  transaction: define.entity('EditTransaction'),
  mutation: define.entity('SourceMutation'),
  validation: define.entity('ValidationResult'),
  conflict: define.entity('EditConflict'),
  checkpoint: define.entity('UndoCheckpoint')
};

const Rules = {
  merge: define.entity('MergeRule', { transforms: 'DocumentSetToSemanticModel' }),
  mapping: define.entity('MappingRule', { transforms: 'SemanticModelToProjection' }),
  layout: define.entity('LayoutRule', { transforms: 'ProjectionToGeometry' }),
  portal: define.entity('PortalRule', { transforms: 'CrossLayerReferenceToPortalEdge' }),
  mutation: define.entity('MutationRule', { transforms: 'ProjectionEditToSourceMutation' }),
  identity: define.entity('IdentityRule', { preserves: 'ProjectionContinuityAcrossRefresh' })
};

const Controls = {
  workspace: define.entity('WorkspaceControl', { actsAs: 'DocumentAndViewManager' }),
  layer: define.entity('LayerControl', { actsAs: 'LayerVisibilityAndStackManager' }),
  inspector: define.entity('InspectorControl', { actsAs: 'PropertyEditor' })
};

Source.documentSet.contains(Source.document);
Source.document.contains(Source.symbol, Source.relation, Source.attribute);
Source.document.belongsTo(Source.namespace);
Source.document.records(Source.provenance);
Source.semanticModel.contains(Source.symbol, Source.relation, Source.attribute, Source.identity);

Projection.workspace.contains(
  Projection.viewport,
  Projection.layer,
  Projection.selection,
  Projection.geometry
);
Projection.layer.contains(
  Projection.node,
  Projection.edge,
  Projection.portal
);
Projection.node.contains(
  Projection.handle,
  Projection.label,
  Projection.widget
);
Projection.edge.contains(Projection.label);

GraphSystem.owns(Projection.workspace);
GraphSystem.owns(Controls.workspace, Controls.layer, Controls.inspector);
GraphSystem.reads(Source.documentSet, Source.semanticModel);
GraphSystem.reads(
  Rules.merge,
  Rules.mapping,
  Rules.layout,
  Rules.portal,
  Rules.mutation,
  Rules.identity
);
Parser.reads(Source.documentSet);
Indexer.reads(Source.documentSet, Source.semanticModel);
Synchronizer.reads(Projection.workspace, Source.documentSet);

when(Human.opens(Controls.workspace).with(Source.documentSet))
  .then(GraphSystem.ingests(Source.documentSet))
  .and(Parser.normalizes(Source.documentSet).into(Source.semanticModel))
  .and(Indexer.resolves('CrossDocumentReferences').inside(Source.documentSet))
  .and(GraphSystem.evaluates(Rules.merge))
  .and(GraphSystem.evaluates(Rules.identity))
  .and(GraphSystem.evaluates(Rules.mapping))
  .and(GraphSystem.evaluates(Rules.layout))
  .and(GraphSystem.evaluates(Rules.portal));

when(Rules.merge.matches(Source.documentSet))
  .then(Parser.extracts(Source.symbol).from(Source.document))
  .and(Parser.extracts(Source.relation).from(Source.document))
  .and(Parser.extracts(Source.attribute).from(Source.document))
  .and(Indexer.resolves(Source.namespace).across(Source.documentSet))
  .and(GraphSystem.assembles(Source.semanticModel).from(Source.documentSet))
  .and(GraphSystem.binds(Source.provenance).to(Source.symbol, Source.relation, Source.attribute));

when(Rules.identity.matches(Source.semanticModel))
  .then(GraphSystem.assigns(Source.identity).to(Source.symbol, Source.relation, Source.attribute))
  .and(GraphSystem.preserves(Source.identity).across(Projection.workspace))
  .and(GraphSystem.reuses(Projection.layoutHint).when('MeaningRemainsStable'));

when(Rules.mapping.matches(Source.semanticModel))
  .then(GraphSystem.projects(Projection.layer).from(Source.document))
  .and(GraphSystem.projects(Projection.node).from(Source.symbol))
  .and(GraphSystem.projects(Projection.edge).from(Source.relation))
  .and(GraphSystem.projects(Projection.handle).onto(Projection.node))
  .and(GraphSystem.projects(Projection.label).onto(Projection.node))
  .and(GraphSystem.projects(Projection.label).onto(Projection.edge))
  .and(GraphSystem.projects(Projection.widget).inside(Projection.node))
  .and(GraphSystem.binds(Source.identity).to(Projection.node, Projection.edge, Projection.handle));

when(Rules.layout.matches(Projection.workspace))
  .then(Solver.enforces('SpatialConstraint').on(Projection.node, { inside: Projection.layer }))
  .and(Solver.enforces('ContainmentLayout').on(Projection.node, { from: Source.relation }))
  .and(Solver.enforces('PortAlignment').on(Projection.handle, { relativeTo: Projection.node }))
  .and(Solver.enforces('EdgeRouting').on(Projection.edge, { between: Projection.handle }))
  .and(Solver.generates(Projection.geometry).for(Projection.workspace))
  .and(GraphSystem.applies(Projection.geometry).to(Projection.workspace));

when(Rules.portal.detects('CrossLayerReference', { in: Source.relation }))
  .then(GraphSystem.draws(Projection.portal).between(Projection.handle, Projection.handle))
  .and(GraphSystem.binds(Source.provenance).to(Projection.portal))
  .and(GraphSystem.routes(Projection.portal).through('VisibleLayers'));

when(Human.configures(Controls.layer).for(Projection.layer))
  .then(GraphSystem.adjusts('ZIndex').for(Projection.layer))
  .and(GraphSystem.toggles('Visibility').for(Projection.layer))
  .and(GraphSystem.reevaluates(Rules.portal).for('VisibleLayers'));

when(Human.selects(Projection.node, Projection.edge, Projection.portal).inside(Projection.workspace))
  .then(GraphSystem.updates(Projection.selection))
  .and(GraphSystem.opens(Controls.inspector))
  .and(GraphSystem.focuses(Projection.widget).for(Projection.selection));

when(Human.drags(Projection.node).inside(Projection.layer))
  .then(GraphSystem.records(Projection.layoutHint).for(Projection.node))
  .and(GraphSystem.repositions(Projection.node))
  .and(GraphSystem.preserves('ManualLayoutIntent').across('ProjectionRefresh'));

when(Human.edits(Projection.widget).for(Projection.selection))
  .then(GraphSystem.derives(Editing.intent).from(Projection.selection))
  .and(GraphSystem.opens(Editing.transaction))
  .and(GraphSystem.evaluates(Rules.mutation));

when(Human.connects(Projection.handle).to(Projection.handle))
  .then(GraphSystem.derives(Editing.intent).from('HandleConnectionChange'))
  .and(GraphSystem.classifies(Editing.intent).as('CreateOrRetargetRelation'))
  .and(GraphSystem.opens(Editing.transaction))
  .and(GraphSystem.evaluates(Rules.mutation));

when(Human.creates(Projection.node).through(Controls.inspector))
  .then(GraphSystem.derives(Editing.intent).from('NodeCreation'))
  .and(GraphSystem.classifies(Editing.intent).as('CreateSymbol'))
  .and(GraphSystem.opens(Editing.transaction))
  .and(GraphSystem.evaluates(Rules.mutation));

when(Human.deletes(Projection.node, Projection.edge, Projection.portal).from(Projection.workspace))
  .then(GraphSystem.derives(Editing.intent).from(Projection.selection))
  .and(GraphSystem.classifies(Editing.intent).as('Removal'))
  .and(GraphSystem.opens(Editing.transaction))
  .and(GraphSystem.evaluates(Rules.mutation));

when(Rules.mutation.matches(Editing.intent))
  .then(Synchronizer.generates(Editing.mutation))
  .and(Synchronizer.applies(Editing.mutation).to(Source.documentSet))
  .and(Synchronizer.validates(Source.documentSet))
  .and(Synchronizer.records(Editing.checkpoint))
  .and(GraphSystem.records(Editing.transaction));

when(Synchronizer.validates(Source.documentSet))
  .then(Synchronizer.produces(Editing.validation))
  .and(GraphSystem.reconciles(Projection.workspace).with(Source.documentSet))
  .and(GraphSystem.reuses(Source.identity))
  .and(GraphSystem.reapplies(Projection.layoutHint))
  .and(GraphSystem.reevaluates(Rules.mapping, Rules.layout, Rules.portal));

when(Synchronizer.detects(Editing.conflict))
  .then(GraphSystem.highlights(Projection.selection))
  .and(GraphSystem.explains(Editing.conflict).through(Controls.inspector))
  .and(Synchronizer.requests(Human, { toResolve: Editing.conflict }));
