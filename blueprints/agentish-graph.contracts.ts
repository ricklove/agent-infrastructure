/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'ExactContractDefinition'
});

const AgentishGraphContracts = define.entity('AgentishGraphContracts', {
  format: Agentish,
  describes: 'ExactSharedContractsForAgentishGraph'
});

const Files = {
  coreSource: define.entity('CoreSourceContractsFile', {
    path: 'packages/agentish-graph-core/src/contracts/source.ts'
  }),
  coreSemantic: define.entity('CoreSemanticContractsFile', {
    path: 'packages/agentish-graph-core/src/contracts/semantic.ts'
  }),
  coreProjection: define.entity('CoreProjectionContractsFile', {
    path: 'packages/agentish-graph-core/src/contracts/projection.ts'
  }),
  coreMutation: define.entity('CoreMutationContractsFile', {
    path: 'packages/agentish-graph-core/src/contracts/mutation.ts'
  }),
  protocolHttp: define.entity('ProtocolHttpContractsFile', {
    path: 'packages/agentish-graph-protocol/src/http.ts'
  }),
  protocolWs: define.entity('ProtocolWsContractsFile', {
    path: 'packages/agentish-graph-protocol/src/ws.ts'
  }),
  storeState: define.entity('StoreStateContractsFile', {
    path: 'packages/agentish-graph-store/src/contracts/state.ts'
  })
};

const Contracts = {
  workspaceRoot: define.entity('WorkspaceRootConfig'),
  workspaceEntry: define.entity('WorkspaceEntry'),
  documentRef: define.entity('AgentishDocumentRef'),
  documentText: define.entity('AgentishDocumentText'),
  parseResult: define.entity('AgentishParseResult'),
  semanticNode: define.entity('SemanticNodeRecord'),
  semanticEdge: define.entity('SemanticEdgeRecord'),
  semanticRule: define.entity('SemanticRuleRecord'),
  stableId: define.entity('StableId'),
  projectionSnapshot: define.entity('GraphProjectionSnapshot'),
  projectionNode: define.entity('GraphProjectionNode'),
  projectionEdge: define.entity('GraphProjectionEdge'),
  projectionPortal: define.entity('GraphProjectionPortal'),
  viewport: define.entity('GraphViewport'),
  selection: define.entity('GraphSelection'),
  layoutHint: define.entity('GraphLayoutHint'),
  graphIntent: define.entity('GraphMutationIntent'),
  sourcePatch: define.entity('SourcePatchPlan'),
  validationIssue: define.entity('ValidationIssue'),
  graphConflict: define.entity('GraphConflict'),
  httpConfig: define.entity('GraphServerConfigResponse'),
  httpSessionCreate: define.entity('CreateSessionRequest'),
  httpSessionCreated: define.entity('CreateSessionResponse'),
  httpSnapshot: define.entity('GetSessionSnapshotResponse'),
  wsClientEnvelope: define.entity('WsClientEnvelope'),
  wsServerEnvelope: define.entity('WsServerEnvelope'),
  storeState: define.entity('AgentishGraphStoreState')
};

Files.coreSource.exports(Contracts.workspaceRoot, Contracts.workspaceEntry, Contracts.documentRef, Contracts.documentText);
Files.coreSemantic.exports(Contracts.parseResult, Contracts.semanticNode, Contracts.semanticEdge, Contracts.semanticRule, Contracts.stableId);
Files.coreProjection.exports(
  Contracts.projectionSnapshot,
  Contracts.projectionNode,
  Contracts.projectionEdge,
  Contracts.projectionPortal,
  Contracts.viewport,
  Contracts.selection,
  Contracts.layoutHint
);
Files.coreMutation.exports(Contracts.graphIntent, Contracts.sourcePatch, Contracts.validationIssue, Contracts.graphConflict);
Files.protocolHttp.exports(Contracts.httpConfig, Contracts.httpSessionCreate, Contracts.httpSessionCreated, Contracts.httpSnapshot);
Files.protocolWs.exports(Contracts.wsClientEnvelope, Contracts.wsServerEnvelope);
Files.storeState.exports(Contracts.storeState);

Contracts.workspaceRoot.defines('Interface', {
  rootId: 'string',
  label: 'string',
  absolutePath: 'string',
  writable: 'boolean',
  includeGlobs: 'string[]',
  excludeGlobs: 'string[]',
  defaultEntryDocumentPath: 'string | null'
});
Contracts.workspaceEntry.defines('Interface', {
  path: 'string',
  name: 'string',
  kind: "'file' | 'directory'",
  extension: 'string | null',
  children: 'WorkspaceEntry[] | null',
  documentKind: "'agentish' | 'typescript' | 'unknown'",
  isOpenable: 'boolean'
});
Contracts.documentRef.defines('Interface', {
  documentId: 'StableId',
  rootId: 'string',
  relativePath: 'string',
  absolutePath: 'string',
  language: "'agentish-ts'",
  revision: 'number'
});
Contracts.documentText.defines('Interface', {
  documentId: 'StableId',
  text: 'string',
  savedRevision: 'number',
  unsavedRevision: 'number',
  lineCount: 'number'
});
Contracts.parseResult.defines('Interface', {
  document: 'AgentishDocumentRef',
  imports: 'string[]',
  declarations: 'unknown[]',
  rules: 'SemanticRuleRecord[]',
  diagnostics: 'ValidationIssue[]'
});
Contracts.semanticNode.defines('Interface', {
  id: 'StableId',
  documentId: 'StableId',
  kind: 'string',
  name: 'string',
  attributes: 'Record<string, unknown>',
  sourceRange: 'unknown'
});
Contracts.semanticEdge.defines('Interface', {
  id: 'StableId',
  documentId: 'StableId',
  kind: 'string',
  fromId: 'StableId',
  toId: 'StableId',
  attributes: 'Record<string, unknown>',
  sourceRuleId: 'StableId | null'
});
Contracts.semanticRule.defines('Interface', {
  id: 'StableId',
  documentId: 'StableId',
  trigger: 'unknown',
  effects: 'unknown[]',
  sourceRange: 'unknown'
});
Contracts.projectionNode.defines('Interface', {
  id: 'StableId',
  semanticId: 'StableId',
  documentId: 'StableId',
  layerId: 'StableId',
  nodeKind: 'string',
  label: 'string',
  position: 'unknown',
  size: 'unknown',
  handles: 'unknown[]',
  badges: 'string[]',
  collapsed: 'boolean'
});
Contracts.projectionEdge.defines('Interface', {
  id: 'StableId',
  semanticId: 'StableId',
  sourceNodeId: 'StableId',
  targetNodeId: 'StableId',
  sourceHandleId: 'StableId | null',
  targetHandleId: 'StableId | null',
  edgeKind: 'string',
  label: 'string | null',
  hidden: 'boolean'
});
Contracts.projectionPortal.defines('Interface', {
  id: 'StableId',
  semanticId: 'StableId',
  sourceLayerId: 'StableId',
  targetLayerId: 'StableId',
  sourceNodeId: 'StableId',
  targetNodeId: 'StableId',
  label: 'string | null'
});
Contracts.viewport.defines('Interface', {
  x: 'number',
  y: 'number',
  zoom: 'number'
});
Contracts.selection.defines('Interface', {
  nodeIds: 'StableId[]',
  edgeIds: 'StableId[]',
  portalIds: 'StableId[]',
  primaryId: 'StableId | null'
});
Contracts.layoutHint.defines('Interface', {
  nodeId: 'StableId',
  x: 'number',
  y: 'number',
  pinned: 'boolean',
  updatedAt: 'number'
});
Contracts.projectionSnapshot.defines('Interface', {
  revision: 'number',
  rootId: 'string',
  documentIds: 'StableId[]',
  layers: 'unknown[]',
  nodes: 'GraphProjectionNode[]',
  edges: 'GraphProjectionEdge[]',
  portals: 'GraphProjectionPortal[]',
  viewport: 'GraphViewport',
  selection: 'GraphSelection',
  layoutHints: 'Record<StableId, GraphLayoutHint>'
});
Contracts.graphIntent.defines('Union', [
  "{ kind: 'set-node-position'; mutationId: string }",
  "{ kind: 'set-node-label'; mutationId: string }",
  "{ kind: 'set-node-attribute'; mutationId: string }",
  "{ kind: 'create-node'; mutationId: string }",
  "{ kind: 'connect-handles'; mutationId: string }",
  "{ kind: 'delete-elements'; mutationId: string }",
  "{ kind: 'toggle-layer-visibility'; mutationId: string }"
]);
Contracts.sourcePatch.defines('Interface', {
  mutationId: 'string',
  documentChanges: 'unknown[]',
  derivedProjectionDelta: 'unknown[]'
});
Contracts.validationIssue.defines('Interface', {
  issueId: 'string',
  severity: "'info' | 'warning' | 'error'",
  code: 'string',
  message: 'string',
  documentId: 'StableId | null',
  entityId: 'StableId | null',
  sourceRange: 'unknown'
});
Contracts.graphConflict.defines('Interface', {
  conflictId: 'string',
  mutationId: 'string',
  code: 'string',
  message: 'string',
  entityIds: 'StableId[]',
  documentIds: 'StableId[]',
  suggestedResolution: 'string'
});
Contracts.httpConfig.defines('Interface', {
  serverOrigin: 'string',
  wsOrigin: 'string',
  heartbeatIntervalMs: 'number',
  reconnectBackoffMs: 'number[]',
  sessionTtlMs: 'number',
  supportsLayoutPersistence: 'boolean'
});
Contracts.httpSessionCreate.defines('Interface', {
  rootId: 'string | null',
  initialDocumentPaths: 'string[]',
  readonly: 'boolean'
});
Contracts.httpSessionCreated.defines('Interface', {
  sessionId: 'string',
  sessionToken: 'string',
  wsUrl: 'string',
  snapshotUrl: 'string'
});
Contracts.httpSnapshot.defines('Interface', {
  workspace: 'unknown',
  projection: 'GraphProjectionSnapshot',
  validationIssues: 'ValidationIssue[]'
});
Contracts.wsClientEnvelope.defines('Union', [
  "{ type: 'client/hello' }",
  "{ type: 'client/open-root' }",
  "{ type: 'client/open-documents' }",
  "{ type: 'client/apply-intent' }",
  "{ type: 'client/persist-layout' }",
  "{ type: 'client/save-documents' }",
  "{ type: 'client/ping' }"
]);
Contracts.wsServerEnvelope.defines('Union', [
  "{ type: 'server/ready' }",
  "{ type: 'server/workspace-snapshot' }",
  "{ type: 'server/projection-snapshot' }",
  "{ type: 'server/projection-patch' }",
  "{ type: 'server/document-patched' }",
  "{ type: 'server/validation' }",
  "{ type: 'server/conflict' }",
  "{ type: 'server/file-changed' }",
  "{ type: 'server/error' }",
  "{ type: 'server/pong' }"
]);
Contracts.storeState.defines('Shape', {
  session: 'SessionSlice',
  workspace: 'WorkspaceSlice',
  graph: 'GraphSlice',
  inspector: 'InspectorSlice',
  ui: 'UiSlice',
  io: 'IoSlice'
});
