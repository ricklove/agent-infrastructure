/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'ImplementationArchitectureDefinition'
});

const Blueprint = define.entity('AgentishGraphBlueprint', {
  format: Agentish,
  describes: 'HumanVisualizationAndEditingOfAgentishDocuments'
});

const Plan = define.entity('AgentishGraphImplementationPlan', {
  format: Agentish,
  implements: Blueprint,
  constrains: 'PackageStructureFileLayoutTypeContractsTransportAndStateModel'
});

const Browser = define.actor('BrowserUser', {
  role: 'HumanOperatorOfGraphStudio'
});
const StudioApp = define.system('AgentishStudioApp', {
  role: 'MinimalViteWrapper'
});
const GraphServer = define.system('AgentishGraphServer', {
  role: 'BunHttpAndWssRuntime'
});
const FileSystem = define.system('LocalFileSystem', {
  role: 'WorkspaceSource'
});

const Packages = {
  core: define.entity('PackageAgentishGraphCore', {
    path: 'packages/agentish-graph-core',
    exports: 'PureDomainParserProjectionAndMutationPlanning'
  }),
  protocol: define.entity('PackageAgentishGraphProtocol', {
    path: 'packages/agentish-graph-protocol',
    exports: 'SharedHttpAndWssContracts'
  }),
  store: define.entity('PackageAgentishGraphStore', {
    path: 'packages/agentish-graph-store',
    exports: 'LegendStateGraphSessionStore'
  }),
  ui: define.entity('PackageAgentishGraphUi', {
    path: 'packages/agentish-graph-ui',
    exports: 'ReactFlowTailwindUiComponents'
  }),
  server: define.entity('PackageAgentishGraphServer', {
    path: 'packages/agentish-graph-server',
    exports: 'BunWorkspaceServerAndSessionRuntime'
  }),
  studio: define.entity('PackageAgentishStudio', {
    path: 'apps/agentish-studio',
    exports: 'ViteEntryOnly'
  })
};

Packages.protocol.dependsOn(Packages.core);
Packages.store.dependsOn(Packages.core, Packages.protocol);
Packages.ui.dependsOn(Packages.core, Packages.protocol, Packages.store);
Packages.server.dependsOn(Packages.core, Packages.protocol);
Packages.studio.dependsOn(Packages.ui, Packages.store, Packages.protocol);

Packages.core.uses('typescript', 'zod');
Packages.protocol.uses('zod');
Packages.store.uses('@legendapp/state', '@legendapp/state/react');
Packages.ui.uses('react', '@xyflow/react', 'tailwindcss', 'clsx');
Packages.server.uses('bun', 'zod');
Packages.studio.uses('vite', 'react', 'tailwindcss');

const CoreFiles = {
  packageJson: define.entity('CorePackageJson', {
    path: 'packages/agentish-graph-core/package.json'
  }),
  index: define.entity('CoreIndexFile', {
    path: 'packages/agentish-graph-core/src/index.ts'
  }),
  sourceTypes: define.entity('CoreSourceTypesFile', {
    path: 'packages/agentish-graph-core/src/types/source.ts'
  }),
  semanticTypes: define.entity('CoreSemanticTypesFile', {
    path: 'packages/agentish-graph-core/src/types/semantic.ts'
  }),
  projectionTypes: define.entity('CoreProjectionTypesFile', {
    path: 'packages/agentish-graph-core/src/types/projection.ts'
  }),
  mutationTypes: define.entity('CoreMutationTypesFile', {
    path: 'packages/agentish-graph-core/src/types/mutation.ts'
  }),
  parser: define.entity('CoreParserFile', {
    path: 'packages/agentish-graph-core/src/parser/parse-agentish-document.ts'
  }),
  semanticModel: define.entity('CoreSemanticModelFile', {
    path: 'packages/agentish-graph-core/src/semantic/build-semantic-model.ts'
  }),
  stableIds: define.entity('CoreStableIdFile', {
    path: 'packages/agentish-graph-core/src/identity/build-stable-id.ts'
  }),
  projection: define.entity('CoreProjectionFile', {
    path: 'packages/agentish-graph-core/src/projection/build-graph-projection.ts'
  }),
  layoutHints: define.entity('CoreLayoutHintsFile', {
    path: 'packages/agentish-graph-core/src/layout/layout-hints.ts'
  }),
  intentPlanner: define.entity('CoreIntentPlannerFile', {
    path: 'packages/agentish-graph-core/src/mutation/plan-source-mutation.ts'
  }),
  validation: define.entity('CoreValidationFile', {
    path: 'packages/agentish-graph-core/src/validation/validate-graph-intent.ts'
  })
};

const ProtocolFiles = {
  packageJson: define.entity('ProtocolPackageJson', {
    path: 'packages/agentish-graph-protocol/package.json'
  }),
  index: define.entity('ProtocolIndexFile', {
    path: 'packages/agentish-graph-protocol/src/index.ts'
  }),
  http: define.entity('ProtocolHttpFile', {
    path: 'packages/agentish-graph-protocol/src/http.ts'
  }),
  ws: define.entity('ProtocolWsFile', {
    path: 'packages/agentish-graph-protocol/src/ws.ts'
  }),
  schemas: define.entity('ProtocolSchemasFile', {
    path: 'packages/agentish-graph-protocol/src/schemas.ts'
  })
};

const StoreFiles = {
  packageJson: define.entity('StorePackageJson', {
    path: 'packages/agentish-graph-store/package.json'
  }),
  index: define.entity('StoreIndexFile', {
    path: 'packages/agentish-graph-store/src/index.ts'
  }),
  store: define.entity('LegendStoreFile', {
    path: 'packages/agentish-graph-store/src/agentish-graph-store.ts'
  }),
  selectors: define.entity('LegendSelectorsFile', {
    path: 'packages/agentish-graph-store/src/selectors.ts'
  }),
  actions: define.entity('LegendActionsFile', {
    path: 'packages/agentish-graph-store/src/actions.ts'
  })
};

const UiFiles = {
  packageJson: define.entity('UiPackageJson', {
    path: 'packages/agentish-graph-ui/package.json'
  }),
  index: define.entity('UiIndexFile', {
    path: 'packages/agentish-graph-ui/src/index.ts'
  }),
  screen: define.entity('GraphScreenFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphScreen.tsx'
  }),
  shell: define.entity('GraphShellFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphShell.tsx'
  }),
  toolbar: define.entity('GraphToolbarFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphToolbar.tsx'
  }),
  fileTreePane: define.entity('GraphFileTreePaneFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphFileTreePane.tsx'
  }),
  layerPane: define.entity('GraphLayerPaneFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphLayerPane.tsx'
  }),
  legendPane: define.entity('GraphLegendPaneFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphLegendPane.tsx'
  }),
  inspectorPane: define.entity('GraphInspectorPaneFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphInspectorPane.tsx'
  }),
  canvas: define.entity('GraphCanvasFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphCanvas.tsx'
  }),
  statusBar: define.entity('GraphStatusBarFile', {
    path: 'packages/agentish-graph-ui/src/components/AgentishGraphStatusBar.tsx'
  }),
  nodeRenderer: define.entity('NodeRendererFile', {
    path: 'packages/agentish-graph-ui/src/renderers/AgentishNodeCard.tsx'
  }),
  groupRenderer: define.entity('GroupRendererFile', {
    path: 'packages/agentish-graph-ui/src/renderers/AgentishGroupNode.tsx'
  }),
  portalRenderer: define.entity('PortalRendererFile', {
    path: 'packages/agentish-graph-ui/src/renderers/AgentishPortalEdge.tsx'
  }),
  adapters: define.entity('ReactFlowAdapterFile', {
    path: 'packages/agentish-graph-ui/src/reactflow/to-react-flow-elements.ts'
  }),
  hooks: define.entity('GraphHooksFile', {
    path: 'packages/agentish-graph-ui/src/hooks/use-agentish-graph-session.ts'
  }),
  styles: define.entity('GraphStylesFile', {
    path: 'packages/agentish-graph-ui/src/styles/tokens.css'
  })
};

const ServerFiles = {
  packageJson: define.entity('ServerPackageJson', {
    path: 'packages/agentish-graph-server/package.json'
  }),
  index: define.entity('ServerIndexFile', {
    path: 'packages/agentish-graph-server/src/index.ts'
  }),
  config: define.entity('ServerConfigFile', {
    path: 'packages/agentish-graph-server/src/config.ts'
  }),
  httpServer: define.entity('ServerHttpFile', {
    path: 'packages/agentish-graph-server/src/http/create-http-server.ts'
  }),
  wsServer: define.entity('ServerWsFile', {
    path: 'packages/agentish-graph-server/src/ws/create-ws-server.ts'
  }),
  sessionRegistry: define.entity('ServerSessionRegistryFile', {
    path: 'packages/agentish-graph-server/src/session/session-registry.ts'
  }),
  workspaceService: define.entity('ServerWorkspaceServiceFile', {
    path: 'packages/agentish-graph-server/src/workspace/workspace-service.ts'
  }),
  workspaceWatcher: define.entity('ServerWorkspaceWatcherFile', {
    path: 'packages/agentish-graph-server/src/workspace/workspace-watcher.ts'
  }),
  documentRepo: define.entity('ServerDocumentRepositoryFile', {
    path: 'packages/agentish-graph-server/src/workspace/document-repository.ts'
  }),
  graphSession: define.entity('ServerGraphSessionFile', {
    path: 'packages/agentish-graph-server/src/session/graph-session.ts'
  }),
  mutationService: define.entity('ServerMutationServiceFile', {
    path: 'packages/agentish-graph-server/src/mutation/apply-source-mutation.ts'
  })
};

const StudioFiles = {
  packageJson: define.entity('StudioPackageJson', {
    path: 'apps/agentish-studio/package.json'
  }),
  viteConfig: define.entity('StudioViteConfig', {
    path: 'apps/agentish-studio/vite.config.ts'
  }),
  main: define.entity('StudioMainFile', {
    path: 'apps/agentish-studio/src/main.tsx'
  }),
  app: define.entity('StudioAppFile', {
    path: 'apps/agentish-studio/src/App.tsx'
  }),
  css: define.entity('StudioCssFile', {
    path: 'apps/agentish-studio/src/index.css'
  })
};

Packages.core.contains(
  CoreFiles.packageJson,
  CoreFiles.index,
  CoreFiles.sourceTypes,
  CoreFiles.semanticTypes,
  CoreFiles.projectionTypes,
  CoreFiles.mutationTypes,
  CoreFiles.parser,
  CoreFiles.semanticModel,
  CoreFiles.stableIds,
  CoreFiles.projection,
  CoreFiles.layoutHints,
  CoreFiles.intentPlanner,
  CoreFiles.validation
);
Packages.protocol.contains(
  ProtocolFiles.packageJson,
  ProtocolFiles.index,
  ProtocolFiles.http,
  ProtocolFiles.ws,
  ProtocolFiles.schemas
);
Packages.store.contains(
  StoreFiles.packageJson,
  StoreFiles.index,
  StoreFiles.store,
  StoreFiles.selectors,
  StoreFiles.actions
);
Packages.ui.contains(
  UiFiles.packageJson,
  UiFiles.index,
  UiFiles.screen,
  UiFiles.shell,
  UiFiles.toolbar,
  UiFiles.fileTreePane,
  UiFiles.layerPane,
  UiFiles.legendPane,
  UiFiles.inspectorPane,
  UiFiles.canvas,
  UiFiles.statusBar,
  UiFiles.nodeRenderer,
  UiFiles.groupRenderer,
  UiFiles.portalRenderer,
  UiFiles.adapters,
  UiFiles.hooks,
  UiFiles.styles
);
Packages.server.contains(
  ServerFiles.packageJson,
  ServerFiles.index,
  ServerFiles.config,
  ServerFiles.httpServer,
  ServerFiles.wsServer,
  ServerFiles.sessionRegistry,
  ServerFiles.workspaceService,
  ServerFiles.workspaceWatcher,
  ServerFiles.documentRepo,
  ServerFiles.graphSession,
  ServerFiles.mutationService
);
Packages.studio.contains(
  StudioFiles.packageJson,
  StudioFiles.viteConfig,
  StudioFiles.main,
  StudioFiles.app,
  StudioFiles.css
);

const Types = {
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
  wsClientEnvelope: define.entity('WsClientEnvelope'),
  wsServerEnvelope: define.entity('WsServerEnvelope')
};

CoreFiles.sourceTypes.exports(Types.workspaceRoot, Types.workspaceEntry, Types.documentRef, Types.documentText);
CoreFiles.semanticTypes.exports(Types.parseResult, Types.semanticNode, Types.semanticEdge, Types.semanticRule, Types.stableId);
CoreFiles.projectionTypes.exports(Types.projectionSnapshot, Types.projectionNode, Types.projectionEdge, Types.projectionPortal, Types.viewport, Types.selection, Types.layoutHint);
CoreFiles.mutationTypes.exports(Types.graphIntent, Types.sourcePatch, Types.validationIssue, Types.graphConflict);
ProtocolFiles.http.exports(Types.httpConfig, Types.httpSessionCreate, Types.httpSessionCreated);
ProtocolFiles.ws.exports(Types.wsClientEnvelope, Types.wsServerEnvelope);

CoreFiles.stableIds.defines('StableIdFormat', {
  document: 'doc::<normalizedRelativePath>',
  semanticNode: 'node::<normalizedRelativePath>::<symbolName>',
  semanticEdge: 'edge::<normalizedRelativePath>::<relationshipKind>::<ordinal>',
  rule: 'rule::<normalizedRelativePath>::<whenOrdinal>',
  projectionNode: 'graph-node::<stableId>',
  projectionEdge: 'graph-edge::<stableId>'
});

const Components = {
  screen: define.entity('AgentishGraphScreen'),
  shell: define.entity('AgentishGraphShell'),
  toolbar: define.entity('AgentishGraphToolbar'),
  fileTreePane: define.entity('AgentishGraphFileTreePane'),
  layerPane: define.entity('AgentishGraphLayerPane'),
  legendPane: define.entity('AgentishGraphLegendPane'),
  inspectorPane: define.entity('AgentishGraphInspectorPane'),
  canvas: define.entity('AgentishGraphCanvas'),
  statusBar: define.entity('AgentishGraphStatusBar'),
  nodeCard: define.entity('AgentishNodeCard'),
  groupNode: define.entity('AgentishGroupNode'),
  portalEdge: define.entity('AgentishPortalEdge')
};

UiFiles.screen.exports(Components.screen);
UiFiles.shell.exports(Components.shell);
UiFiles.toolbar.exports(Components.toolbar);
UiFiles.fileTreePane.exports(Components.fileTreePane);
UiFiles.layerPane.exports(Components.layerPane);
UiFiles.legendPane.exports(Components.legendPane);
UiFiles.inspectorPane.exports(Components.inspectorPane);
UiFiles.canvas.exports(Components.canvas);
UiFiles.statusBar.exports(Components.statusBar);
UiFiles.nodeRenderer.exports(Components.nodeCard);
UiFiles.groupRenderer.exports(Components.groupNode);
UiFiles.portalRenderer.exports(Components.portalEdge);

const Store = {
  contract: define.entity('AgentishGraphStore', { library: 'LegendState' }),
  sessionSlice: define.entity('SessionSlice'),
  workspaceSlice: define.entity('WorkspaceSlice'),
  graphSlice: define.entity('GraphSlice'),
  inspectorSlice: define.entity('InspectorSlice'),
  uiSlice: define.entity('UiSlice'),
  ioSlice: define.entity('IoSlice'),
  actions: define.entity('AgentishGraphActions')
};

Store.contract.contains(
  Store.sessionSlice,
  Store.workspaceSlice,
  Store.graphSlice,
  Store.inspectorSlice,
  Store.uiSlice,
  Store.ioSlice,
  Store.actions
);
Store.sessionSlice.contains(
  'sessionId',
  'sessionToken',
  'serverOrigin',
  'wsUrl',
  'connectionState',
  'lastHeartbeatAt',
  'reconnectAttempt',
  'fatalError'
);
Store.workspaceSlice.contains(
  'allowedRoots',
  'activeRoot',
  'fileTree',
  'openDocuments',
  'activeDocumentPath',
  'documentBuffers',
  'dirtyDocumentPaths',
  'sourceRevision'
);
Store.graphSlice.contains(
  'snapshot',
  'nodes',
  'edges',
  'portals',
  'layers',
  'layerOrder',
  'hiddenLayerIds',
  'selection',
  'viewport',
  'layoutHints',
  'legendVisibility',
  'filters'
);
Store.inspectorSlice.contains(
  'selectedEntityId',
  'selectedEntityKind',
  'draftAttributes',
  'draftLabel',
  'draftConnection',
  'validationIssues',
  'activeConflict'
);
Store.uiSlice.contains(
  'leftPaneMode',
  'rightPaneMode',
  'showMiniMap',
  'showPortals',
  'showLabels',
  'autoLayoutEnabled',
  'isInspectorPinned',
  'theme'
);
Store.ioSlice.contains(
  'pendingClientCommands',
  'pendingMutationIds',
  'lastServerRevision',
  'lastAppliedPatchId',
  'lastSavedAt',
  'syncStatus'
);
Store.actions.contains(
  'bootstrapConfig',
  'createSession',
  'connectSocket',
  'disconnectSocket',
  'applyServerSnapshot',
  'applyServerPatch',
  'setActiveRoot',
  'openDocument',
  'closeDocument',
  'setActiveDocument',
  'setSelection',
  'clearSelection',
  'setViewport',
  'toggleLayerVisibility',
  'reorderLayers',
  'toggleLegendGroup',
  'setFilter',
  'beginInspectorEdit',
  'updateInspectorDraft',
  'cancelInspectorDraft',
  'commitInspectorDraft',
  'createNode',
  'connectHandles',
  'deleteSelection',
  'queueGraphIntent',
  'ackMutation',
  'markConflict',
  'resolveConflict',
  'persistLayoutHint'
);

StoreFiles.store.defines(Store.contract);
StoreFiles.actions.implements(Store.actions);

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
  clientHello: define.entity('ClientHelloMessage'),
  clientOpenRoot: define.entity('ClientOpenRootMessage'),
  clientOpenDocuments: define.entity('ClientOpenDocumentsMessage'),
  clientApplyIntent: define.entity('ClientApplyIntentMessage'),
  clientPersistLayout: define.entity('ClientPersistLayoutMessage'),
  clientSaveDocuments: define.entity('ClientSaveDocumentsMessage'),
  clientPing: define.entity('ClientPingMessage'),
  serverReady: define.entity('ServerReadyMessage'),
  serverWorkspaceSnapshot: define.entity('ServerWorkspaceSnapshotMessage'),
  serverProjectionSnapshot: define.entity('ServerProjectionSnapshotMessage'),
  serverProjectionPatch: define.entity('ServerProjectionPatchMessage'),
  serverDocumentPatched: define.entity('ServerDocumentPatchedMessage'),
  serverValidation: define.entity('ServerValidationMessage'),
  serverConflict: define.entity('ServerConflictMessage'),
  serverFileChanged: define.entity('ServerFileChangedMessage'),
  serverError: define.entity('ServerErrorMessage'),
  serverPong: define.entity('ServerPongMessage')
};

GraphServer.serves(Http.config, Http.roots, Http.sessions, Http.snapshot, Http.close, Ws.endpoint);
GraphServer.authenticates('BearerSessionToken').for(Http.sessions, Http.snapshot, Http.close, Ws.endpoint);
GraphServer.limits(FileSystem).to('AllowedWorkspaceRoots');
GraphServer.uses('fs.watch').through(ServerFiles.workspaceWatcher);
GraphServer.uses('Bun.serve').through(ServerFiles.httpServer, ServerFiles.wsServer);

Ws.endpoint.accepts(
  Ws.clientHello,
  Ws.clientOpenRoot,
  Ws.clientOpenDocuments,
  Ws.clientApplyIntent,
  Ws.clientPersistLayout,
  Ws.clientSaveDocuments,
  Ws.clientPing
);
Ws.endpoint.emits(
  Ws.serverReady,
  Ws.serverWorkspaceSnapshot,
  Ws.serverProjectionSnapshot,
  Ws.serverProjectionPatch,
  Ws.serverDocumentPatched,
  Ws.serverValidation,
  Ws.serverConflict,
  Ws.serverFileChanged,
  Ws.serverError,
  Ws.serverPong
);

ServerFiles.documentRepo.accesses(FileSystem).through('NormalizedRealPaths');
ServerFiles.documentRepo.rejects('PathTraversal', 'WritesOutsideAllowedRoots');
ServerFiles.workspaceService.reads('*.ts', '*.agentish.ts');
ServerFiles.workspaceService.returns('RelativePathsOnly').to(Browser);

StudioApp.mounts(Components.screen).through(StudioFiles.app);
StudioFiles.app.contains('AppReturnsAgentishGraphScreenOnly');
StudioFiles.main.bootstraps(StudioApp);

when(Browser.opens(StudioApp))
  .then(Store.actions.bootstrapConfig)
  .and(Http.config.returns(Types.httpConfig))
  .and(Http.roots.returns(Types.workspaceRoot))
  .and(Store.actions.createSession)
  .and(Http.sessions.accepts(Types.httpSessionCreate))
  .and(Http.sessions.returns(Types.httpSessionCreated))
  .and(Store.actions.connectSocket)
  .and(Ws.clientHello.authenticates('GraphSession'))
  .and(Ws.serverReady.initializes(Store.contract));

when(Browser.selects('WorkspaceRoot'))
  .then(Ws.clientOpenRoot.requests('WorkspaceSnapshot'))
  .and(Ws.serverWorkspaceSnapshot.populates(Store.workspaceSlice))
  .and(Ws.serverProjectionSnapshot.populates(Store.graphSlice));

when(Browser.opens('AgentishDocuments'))
  .then(Ws.clientOpenDocuments.requests('DocumentBuffersAndProjection'))
  .and(Ws.serverProjectionSnapshot.reconciles(Store.graphSlice))
  .and(Store.actions.setActiveDocument);

when(Browser.drags('GraphNodes').or(Browser.connects('GraphHandles')).or(Browser.edits(Components.inspectorPane)))
  .then(Store.actions.queueGraphIntent)
  .and(Ws.clientApplyIntent.transmits(Types.graphIntent))
  .and(CoreFiles.intentPlanner.generates(Types.sourcePatch))
  .and(ServerFiles.mutationService.applies(Types.sourcePatch))
  .and(Ws.serverDocumentPatched.confirms('AcceptedMutation'))
  .and(Ws.serverProjectionPatch.updates(Store.graphSlice))
  .and(Ws.serverValidation.updates(Store.inspectorSlice));

when(FileSystem.changes('OpenWorkspaceFiles'))
  .then(ServerFiles.workspaceWatcher.detects('ExternalChange'))
  .and(Ws.serverFileChanged.notifies(Browser))
  .and(CoreFiles.semanticModel.rebuilds('AffectedSemanticSubgraph'))
  .and(Ws.serverProjectionPatch.updates(Store.graphSlice));

when(ServerFiles.mutationService.detects('NonRoundTrippableIntent'))
  .then(Ws.serverConflict.emits(Types.graphConflict))
  .and(Store.actions.markConflict)
  .and(Store.uiSlice.focuses(Components.inspectorPane));

CoreFiles.parser.uses('TypeScriptCompilerApi');
CoreFiles.parser.extracts('define.*Declarations', 'whenThenAndChains', 'AttributeObjects');
CoreFiles.semanticModel.normalizes('Entities', 'Actors', 'Systems', 'Events', 'States', 'Rules', 'Relationships');
CoreFiles.projection.derives('LayersFromDocumentPaths');
CoreFiles.projection.derives('NodesFromSemanticEntities');
CoreFiles.projection.derives('EdgesFromRelationshipsAndRules');
CoreFiles.projection.derives('PortalsFromCrossLayerReferences');
CoreFiles.layoutHints.preserves('ManualPositionsAcrossReprojection');

Plan.prescribes('NoBusinessLogicInViteApp');
Plan.prescribes('NoDirectBrowserFilesystemAccess');
Plan.prescribes('NoParserLogicInReactComponents');
Plan.prescribes('NoMutationPlanningInUiPackage');
Plan.prescribes('SingleWriterSessionSemantics');
Plan.prescribes('OptimisticUiWithServerAuthority');
Plan.prescribes('AllCrossPackageContractsNamedAndExported');
