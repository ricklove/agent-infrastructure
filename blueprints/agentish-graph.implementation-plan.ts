/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'DecisionCompleteImplementationPlanning'
});

const Concept = define.entity('AgentishGraphConcept', {
  format: Agentish
});
const Scenarios = define.entity('AgentishGraphScenarios', {
  format: Agentish
});
const Contracts = define.entity('AgentishGraphContracts', {
  format: Agentish
});

const AgentishGraphImplementationPlan = define.entity('AgentishGraphImplementationPlan', {
  format: Agentish,
  implements: Concept,
  operationalizes: Scenarios,
  bindsTo: Contracts,
  standard: 'ResolveAllNonMechanicalArchitectureDecisions'
});

const Browser = define.actor('BrowserUser', {
  role: 'GraphEditorOperator'
});
const Studio = define.system('AgentishStudio', {
  role: 'ThinViteCompositionShell'
});
const Server = define.system('AgentishGraphServer', {
  role: 'BunHttpAndWssAuthority'
});
const FileSystem = define.system('WorkspaceFileSystem', {
  role: 'SourceOfDocuments'
});

const Packages = {
  core: define.entity('PackageAgentishGraphCore', {
    path: 'packages/agentish-graph-core',
    owns: 'ParserSemanticModelStableIdentityProjectionMutationPlanning'
  }),
  protocol: define.entity('PackageAgentishGraphProtocol', {
    path: 'packages/agentish-graph-protocol',
    owns: 'SharedHttpAndWssContracts'
  }),
  store: define.entity('PackageAgentishGraphStore', {
    path: 'packages/agentish-graph-store',
    owns: 'LegendStateSessionWorkspaceAndGraphState'
  }),
  ui: define.entity('PackageAgentishGraphUi', {
    path: 'packages/agentish-graph-ui',
    owns: 'ReactFlowTailwindComponentsAndAdapters'
  }),
  server: define.entity('PackageAgentishGraphServer', {
    path: 'packages/agentish-graph-server',
    owns: 'BunRuntimeWorkspaceAccessAndMutationExecution'
  }),
  studio: define.entity('PackageAgentishStudio', {
    path: 'apps/agentish-studio',
    owns: 'EntryPointOnly'
  })
};

Packages.protocol.dependsOn(Packages.core);
Packages.store.dependsOn(Packages.core, Packages.protocol);
Packages.ui.dependsOn(Packages.core, Packages.protocol, Packages.store);
Packages.server.dependsOn(Packages.core, Packages.protocol);
Packages.studio.dependsOn(Packages.ui, Packages.store, Packages.protocol);

AgentishGraphImplementationPlan.prescribes('TheViteAppContainsNoBusinessLogic');
AgentishGraphImplementationPlan.prescribes('AllReusableCodeLivesUnderPackages');
AgentishGraphImplementationPlan.prescribes('BrowserNeverTouchesFilesystemApis');
AgentishGraphImplementationPlan.prescribes('OnlyServerWritesSourceFiles');
AgentishGraphImplementationPlan.prescribes('ServerIsAuthoritativeForProjectionAndMutationResults');
AgentishGraphImplementationPlan.prescribes('StoreIsClientSessionStateOnly');
AgentishGraphImplementationPlan.prescribes('UiNeverPlansSourceMutations');
AgentishGraphImplementationPlan.prescribes('ProtocolPackageContainsAllCrossBoundaryContracts');

const Files = {
  coreContracts: define.entity('CoreContractsFiles', {
    path: 'packages/agentish-graph-core/src/contracts/*'
  }),
  coreParser: define.entity('CoreParserFile', {
    path: 'packages/agentish-graph-core/src/parser/parse-agentish-document.ts'
  }),
  coreSemanticBuilder: define.entity('CoreSemanticBuilderFile', {
    path: 'packages/agentish-graph-core/src/semantic/build-semantic-model.ts'
  }),
  coreIdentity: define.entity('CoreStableIdentityFile', {
    path: 'packages/agentish-graph-core/src/identity/build-stable-id.ts'
  }),
  coreProjectionBuilder: define.entity('CoreProjectionBuilderFile', {
    path: 'packages/agentish-graph-core/src/projection/build-graph-projection.ts'
  }),
  coreMutationPlanner: define.entity('CoreMutationPlannerFile', {
    path: 'packages/agentish-graph-core/src/mutation/plan-source-mutation.ts'
  }),
  protocolHttp: define.entity('ProtocolHttpContractsFile', {
    path: 'packages/agentish-graph-protocol/src/http.ts'
  }),
  protocolWs: define.entity('ProtocolWsContractsFile', {
    path: 'packages/agentish-graph-protocol/src/ws.ts'
  }),
  storeState: define.entity('StoreStateFile', {
    path: 'packages/agentish-graph-store/src/agentish-graph-store.ts'
  }),
  storeActions: define.entity('StoreActionsFile', {
    path: 'packages/agentish-graph-store/src/actions.ts'
  }),
  uiScreen: define.entity('UiScreenFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphScreen.tsx'
  }),
  uiCanvas: define.entity('UiCanvasFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphCanvas.tsx'
  }),
  uiInspector: define.entity('UiInspectorFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphInspectorPane.tsx'
  }),
  uiNavigation: define.entity('UiNavigationFiles', {
    path: 'packages/agentish-graph-ui/src/components/{AgentishGraphFileTreePane,AgentishGraphLayerPane,AgentishGraphLegendPane,AgentishGraphToolbar,AgentishGraphStatusBar}.tsx'
  }),
  uiRenderers: define.entity('UiRendererFiles', {
    path: 'packages/agentish-graph-ui/src/{renderers,reactflow}/*'
  }),
  serverConfig: define.entity('ServerConfigFile', {
    path: 'packages/agentish-graph-server/src/config.ts'
  }),
  serverHttp: define.entity('ServerHttpFile', {
    path: 'packages/agentish-graph-server/src/http/create-http-server.ts'
  }),
  serverWs: define.entity('ServerWsFile', {
    path: 'packages/agentish-graph-server/src/ws/create-ws-server.ts'
  }),
  serverSessions: define.entity('ServerSessionRegistryFile', {
    path: 'packages/agentish-graph-server/src/session/session-registry.ts'
  }),
  serverWorkspace: define.entity('ServerWorkspaceServiceFile', {
    path: 'packages/agentish-graph-server/src/workspace/workspace-service.ts'
  }),
  serverWatch: define.entity('ServerWorkspaceWatcherFile', {
    path: 'packages/agentish-graph-server/src/workspace/workspace-watcher.ts'
  }),
  serverDocuments: define.entity('ServerDocumentRepositoryFile', {
    path: 'packages/agentish-graph-server/src/workspace/document-repository.ts'
  }),
  serverMutations: define.entity('ServerMutationExecutorFile', {
    path: 'packages/agentish-graph-server/src/mutation/apply-source-mutation.ts'
  }),
  studioApp: define.entity('StudioAppFile', {
    path: 'apps/agentish-studio/src/App.tsx'
  }),
  studioMain: define.entity('StudioMainFile', {
    path: 'apps/agentish-studio/src/main.tsx'
  })
};

Packages.core.contains(Files.coreContracts, Files.coreParser, Files.coreSemanticBuilder, Files.coreIdentity, Files.coreProjectionBuilder, Files.coreMutationPlanner);
Packages.protocol.contains(Files.protocolHttp, Files.protocolWs);
Packages.store.contains(Files.storeState, Files.storeActions);
Packages.ui.contains(Files.uiScreen, Files.uiCanvas, Files.uiInspector, Files.uiNavigation, Files.uiRenderers);
Packages.server.contains(Files.serverConfig, Files.serverHttp, Files.serverWs, Files.serverSessions, Files.serverWorkspace, Files.serverWatch, Files.serverDocuments, Files.serverMutations);
Packages.studio.contains(Files.studioApp, Files.studioMain);

const Store = {
  session: define.entity('SessionSlice'),
  workspace: define.entity('WorkspaceSlice'),
  graph: define.entity('GraphSlice'),
  inspector: define.entity('InspectorSlice'),
  ui: define.entity('UiSlice'),
  io: define.entity('IoSlice')
};

Files.storeState.defines(Store.session, Store.workspace, Store.graph, Store.inspector, Store.ui, Store.io);

const Actions = {
  bootstrapConfig: define.entity('BootstrapConfigAction'),
  createSession: define.entity('CreateSessionAction'),
  connectSocket: define.entity('ConnectSocketAction'),
  applyServerSnapshot: define.entity('ApplyServerSnapshotAction'),
  applyServerPatch: define.entity('ApplyServerPatchAction'),
  openDocument: define.entity('OpenDocumentAction'),
  setSelection: define.entity('SetSelectionAction'),
  setViewport: define.entity('SetViewportAction'),
  beginInspectorEdit: define.entity('BeginInspectorEditAction'),
  commitInspectorDraft: define.entity('CommitInspectorDraftAction'),
  createNode: define.entity('CreateNodeAction'),
  connectHandles: define.entity('ConnectHandlesAction'),
  deleteSelection: define.entity('DeleteSelectionAction'),
  queueGraphIntent: define.entity('QueueGraphIntentAction'),
  resolveConflict: define.entity('ResolveConflictAction'),
  persistLayoutHint: define.entity('PersistLayoutHintAction')
};

Files.storeActions.implements(
  Actions.bootstrapConfig,
  Actions.createSession,
  Actions.connectSocket,
  Actions.applyServerSnapshot,
  Actions.applyServerPatch,
  Actions.openDocument,
  Actions.setSelection,
  Actions.setViewport,
  Actions.beginInspectorEdit,
  Actions.commitInspectorDraft,
  Actions.createNode,
  Actions.connectHandles,
  Actions.deleteSelection,
  Actions.queueGraphIntent,
  Actions.resolveConflict,
  Actions.persistLayoutHint
);

const Http = {
  config: define.entity('GetConfigRoute', {
    method: 'GET',
    path: '/api/agentish-graph/config'
  }),
  roots: define.entity('ListRootsRoute', {
    method: 'GET',
    path: '/api/agentish-graph/roots'
  }),
  sessions: define.entity('CreateSessionRoute', {
    method: 'POST',
    path: '/api/agentish-graph/sessions'
  }),
  snapshot: define.entity('GetSessionSnapshotRoute', {
    method: 'GET',
    path: '/api/agentish-graph/sessions/:sessionId/snapshot'
  }),
  close: define.entity('DeleteSessionRoute', {
    method: 'DELETE',
    path: '/api/agentish-graph/sessions/:sessionId'
  })
};

const Ws = {
  endpoint: define.entity('GraphWsEndpoint', {
    protocol: 'wss',
    path: '/api/agentish-graph/ws'
  }),
  client: define.entity('WsClientEnvelope'),
  server: define.entity('WsServerEnvelope')
};

Server.serves(Http.config, Http.roots, Http.sessions, Http.snapshot, Http.close, Ws.endpoint);
Server.authenticates('BearerSessionToken').for(Http.sessions, Http.snapshot, Http.close, Ws.endpoint);
Server.uses('Bun.serve').through(Files.serverHttp, Files.serverWs);
Server.uses('fs.watch').through(Files.serverWatch);
Files.serverDocuments.accesses(FileSystem).through('NormalizedRealPaths');
Files.serverDocuments.rejects('PathTraversal', 'WritesOutsideAllowedRoots');
Files.serverWorkspace.reads('*.ts', '*.agentish.ts');
Files.serverWorkspace.returns('RelativePathsOnly').to(Browser);

const Decisions = {
  parser: define.entity('ParserDecision'),
  identity: define.entity('StableIdentityDecision'),
  projection: define.entity('ProjectionDecision'),
  layering: define.entity('LayeringDecision'),
  mutation: define.entity('MutationDecision'),
  conflict: define.entity('ConflictDecision'),
  session: define.entity('SessionDecision'),
  rendering: define.entity('RenderingDecision')
};

Decisions.parser.defines('UseTypeScriptCompilerApiForParsingAgentishTs');
Decisions.parser.defines('ExtractDefineDeclarationsRelationshipCallsAndWhenChains');
Decisions.identity.defines('StableIdsDeriveFromDocumentRelativePathSemanticKindAndLocalMeaning');
Decisions.identity.defines('LayoutHintsKeyedByStableId');
Decisions.projection.defines('ProjectionBuildsOnServerNotInBrowser');
Decisions.projection.defines('ProjectionIsRecomputedFromSourceAndLayoutHints');
Decisions.layering.defines('OneLayerPerOpenDocument');
Decisions.layering.defines('DefaultLayerOrderIsLexicographicByRelativePath');
Decisions.mutation.defines('GraphIntentIsTheOnlyClientWritePrimitive');
Decisions.mutation.defines('SourcePatchPlanIsTheOnlyServerWritePrimitive');
Decisions.conflict.defines('ConflictsPausePendingMutationQueue');
Decisions.conflict.defines('ConflictResolutionChoicesAreReloadOrDiscardLocalIntent');
Decisions.session.defines('SingleWritableSessionPerWorkspaceRoot');
Decisions.session.defines('MissingPatchRevisionForcesFullSnapshotReload');
Decisions.rendering.defines('ReactFlowIsAnAdapterOverProjectionSnapshotNotTheSourceOfTruth');
Decisions.rendering.defines('PortalEdgesRepresentCrossLayerReferencesOnly');

const Invariants = {
  noUiFilesystem: define.entity('NoUiFilesystemInvariant'),
  serverWriter: define.entity('ServerWriterInvariant'),
  stableIdentity: define.entity('StableIdentityInvariant'),
  deterministicProjection: define.entity('DeterministicProjectionInvariant'),
  orderedPatches: define.entity('OrderedPatchesInvariant')
};

AgentishGraphImplementationPlan.enforces(
  Invariants.noUiFilesystem,
  Invariants.serverWriter,
  Invariants.stableIdentity,
  Invariants.deterministicProjection,
  Invariants.orderedPatches
);

when(Browser.opens(Studio))
  .then(Files.studioApp.mounts('AgentishGraphScreen'))
  .and(Actions.bootstrapConfig)
  .and(Http.config)
  .and(Http.roots)
  .and(Actions.createSession)
  .and(Http.sessions)
  .and(Actions.connectSocket)
  .and(Ws.client)
  .and(Ws.server);

when(Browser.edits('GraphWorkspace'))
  .then(Actions.queueGraphIntent)
  .and(Files.coreMutationPlanner.generates('SourcePatchPlan'))
  .and(Files.serverMutations.applies('SourcePatchPlan'))
  .and(Ws.server);
