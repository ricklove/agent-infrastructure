/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'CanonicalBehaviorDefinition'
});

const AgentishGraphScenarios = define.entity('AgentishGraphScenarios', {
  format: Agentish,
  describes: 'AcceptanceFlowsForAgentishGraph'
});

const Human = define.actor('Human', {
  role: 'GraphUser'
});
const GraphSystem = define.system('AgentishGraphSystem');
const ExternalEditor = define.actor('ExternalEditor', {
  role: 'OutOfBandSourceMutator'
});

const Source = {
  documentSet: define.entity('AgentishDocumentSet'),
  document: define.entity('AgentishDocument'),
  mutation: define.entity('SourceMutation'),
  conflict: define.entity('EditConflict')
};

const Graph = {
  workspace: define.entity('GraphWorkspace'),
  node: define.entity('GraphNode'),
  edge: define.entity('GraphEdge'),
  portal: define.entity('PortalEdge'),
  selection: define.entity('SelectionState'),
  layoutHint: define.entity('LayoutHint')
};

const Scenarios = {
  openWorkspace: define.entity('OpenWorkspaceScenario'),
  inspectNode: define.entity('InspectNodeScenario'),
  editNode: define.entity('EditNodeScenario'),
  connectNodes: define.entity('ConnectNodesScenario'),
  moveNode: define.entity('MoveNodeScenario'),
  externalChange: define.entity('ExternalChangeScenario'),
  resolveConflict: define.entity('ResolveConflictScenario')
};

AgentishGraphScenarios.contains(
  Scenarios.openWorkspace,
  Scenarios.inspectNode,
  Scenarios.editNode,
  Scenarios.connectNodes,
  Scenarios.moveNode,
  Scenarios.externalChange,
  Scenarios.resolveConflict
);

when(Human.opens(Source.documentSet))
  .then(GraphSystem.loads(Graph.workspace))
  .and(GraphSystem.projects(Graph.node, Graph.edge, Graph.portal))
  .and(Scenarios.openWorkspace.succeeds('HumanCanSeeTheGraphForTheOpenedDocuments'));

when(Human.selects(Graph.node))
  .then(GraphSystem.updates(Graph.selection))
  .and(GraphSystem.reveals('SemanticDetails'))
  .and(Scenarios.inspectNode.succeeds('HumanCanInspectMeaningWithoutReadingRawSource'));

when(Human.edits(Graph.node))
  .then(GraphSystem.derives('EditIntent'))
  .and(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.workspace))
  .and(Scenarios.editNode.succeeds('VisualEditRoundTripsIntoSource'));

when(Human.connects(Graph.node).to(Graph.node))
  .then(GraphSystem.derives('RelationCreationIntent'))
  .and(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Graph.edge, Graph.portal))
  .and(Scenarios.connectNodes.succeeds('GraphConnectionsBecomeSourceRelationships'));

when(Human.drags(Graph.node))
  .then(GraphSystem.records(Graph.layoutHint))
  .and(GraphSystem.reprojects(Graph.workspace))
  .and(Scenarios.moveNode.succeeds('ManualLayoutIntentPersistsAcrossRefresh'));

when(ExternalEditor.mutates(Source.document))
  .then(GraphSystem.detects('ExternalSourceChange'))
  .and(GraphSystem.reprojects(Graph.workspace))
  .and(Scenarios.externalChange.succeeds('GraphReflectsOutOfBandEdits'));

when(GraphSystem.detects(Source.conflict))
  .then(GraphSystem.surfaces(Source.conflict).to(Human))
  .and(GraphSystem.requests('ResolutionChoice'))
  .and(Scenarios.resolveConflict.succeeds('ConflictsAreVisibleAndRequireExplicitResolution'));
