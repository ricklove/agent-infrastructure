/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Code architecture definition",
});

const Concept = define.blueprint("AgentishGraphConcept", { format: Agentish });
const Scenarios = define.blueprint("AgentishGraphScenarios", { format: Agentish });
const Contracts = define.blueprint("AgentishGraphContracts", { format: Agentish });

const CodeArchitecture = define.architecture("AgentishGraphCodeArchitecture", {
  format: Agentish,
  implements: Concept,
  operationalizes: Scenarios,
  bindsTo: Contracts,
  standard: "Resolve code structure, ownership, and boundary decisions",
});

const Browser = define.actor("BrowserUser", { role: "Graph editor operator" });
const Studio = define.system("AgentishStudio", {
  role: "Thin Vite composition shell",
});
const Server = define.system("AgentishGraphServer", {
  role: "Bun HTTP and WSS authority",
});
const FileSystem = define.system("WorkspaceFileSystem", {
  role: "Source of documents",
});

const Package = {
  core: define.package("PackageAgentishGraphCore", {
    path: "packages/agentish-graph-core",
  }),
  protocol: define.package("PackageAgentishGraphProtocol", {
    path: "packages/agentish-graph-protocol",
  }),
  store: define.package("PackageAgentishGraphStore", {
    path: "packages/agentish-graph-store",
  }),
  ui: define.package("PackageAgentishGraphUi", {
    path: "packages/agentish-graph-ui",
  }),
  server: define.package("PackageAgentishGraphServer", {
    path: "packages/agentish-graph-server",
  }),
  studio: define.package("PackageAgentishStudio", {
    path: "apps/agentish-studio",
  }),
};

Package.protocol.dependsOn(Package.core);
Package.store.dependsOn(Package.core, Package.protocol);
Package.ui.dependsOn(Package.core, Package.protocol, Package.store);
Package.server.dependsOn(Package.core, Package.protocol);
Package.studio.dependsOn(Package.ui, Package.store, Package.protocol);

Package.core.rejects(`- React
- Legend State
- Bun runtime APIs`);
Package.store.rejects(`- parsing source
- planning source mutations
- authoritative projection computation
- direct filesystem access`);
Package.ui.rejects(`- direct source writes
- direct filesystem access
- source mutation planning
- parser authority`);
Package.server.rejects(`- React rendering
- browser-only state ownership`);
Package.studio.rejects("Business logic outside composition and bootstrapping.");

Package.core.owns(`- Parser
- Semantic model
- Stable identity
- Projection builder
- Mutation planner`);
Package.protocol.owns(`- HTTP contracts
- WSS contracts`);
Package.store.owns(`- Legend State
- Client actions`);
Package.ui.owns(`- React components
- React Flow adapters
- Tailwind UI`);
Package.server.owns(`- Bun HTTP server
- Bun WSS server
- Workspace access
- File watching
- Mutation execution`);
Package.studio.owns("Entry point only");

CodeArchitecture.prescribes(`- The Vite app contains no business logic.
- Reusable code lives under packages.
- The browser never touches filesystem APIs.
- Only the server writes source files.
- The server is authoritative for projection and mutation results.
- The store contains client session state only.
- The UI never plans source mutations.
- Conflict resolution is orchestrated by store actions rather than by a dedicated transport message.
- The protocol owns all cross-boundary contracts.`);

const File = {
  coreContracts: define.file("CoreContracts", {
    path: "packages/agentish-graph-core/src/contracts/*",
  }),
  coreParser: define.file("CoreParser", {
    path: "packages/agentish-graph-core/src/parser/parse-agentish-document.ts",
  }),
  coreSemantic: define.file("CoreSemanticBuilder", {
    path: "packages/agentish-graph-core/src/semantic/build-semantic-model.ts",
  }),
  coreIdentity: define.file("CoreStableIdentity", {
    path: "packages/agentish-graph-core/src/identity/build-stable-id.ts",
  }),
  coreProjection: define.file("CoreProjectionBuilder", {
    path: "packages/agentish-graph-core/src/projection/build-graph-projection.ts",
  }),
  coreMutation: define.file("CoreMutationPlanner", {
    path: "packages/agentish-graph-core/src/mutation/plan-source-mutation.ts",
  }),
  protocolHttp: define.file("ProtocolHttp", {
    path: "packages/agentish-graph-protocol/src/http.ts",
  }),
  protocolWs: define.file("ProtocolWs", {
    path: "packages/agentish-graph-protocol/src/ws.ts",
  }),
  storeState: define.file("StoreState", {
    path: "packages/agentish-graph-store/src/agentish-graph-store.ts",
  }),
  storeActions: define.file("StoreActions", {
    path: "packages/agentish-graph-store/src/actions.ts",
  }),
  uiScreen: define.file("UiScreen", {
    path: "packages/agentish-graph-ui/src/components/AgentishGraphScreen.tsx",
  }),
  uiCanvas: define.file("UiCanvas", {
    path: "packages/agentish-graph-ui/src/components/AgentishGraphCanvas.tsx",
  }),
  uiInspector: define.file("UiInspector", {
    path: "packages/agentish-graph-ui/src/components/AgentishGraphInspectorPane.tsx",
  }),
  uiNavigation: define.file("UiNavigation", {
    path: "packages/agentish-graph-ui/src/components/*",
  }),
  uiRenderers: define.file("UiRenderers", {
    path: "packages/agentish-graph-ui/src/{renderers,reactflow}/*",
  }),
  serverConfig: define.file("ServerConfig", {
    path: "packages/agentish-graph-server/src/config.ts",
  }),
  serverHttp: define.file("ServerHttp", {
    path: "packages/agentish-graph-server/src/http/create-http-server.ts",
  }),
  serverWs: define.file("ServerWs", {
    path: "packages/agentish-graph-server/src/ws/create-ws-server.ts",
  }),
  serverSessions: define.file("ServerSessions", {
    path: "packages/agentish-graph-server/src/session/session-registry.ts",
  }),
  serverWorkspace: define.file("ServerWorkspace", {
    path: "packages/agentish-graph-server/src/workspace/workspace-service.ts",
  }),
  serverWatch: define.file("ServerWorkspaceWatcher", {
    path: "packages/agentish-graph-server/src/workspace/workspace-watcher.ts",
  }),
  serverDocuments: define.file("ServerDocumentRepository", {
    path: "packages/agentish-graph-server/src/workspace/document-repository.ts",
  }),
  serverMutations: define.file("ServerMutationExecutor", {
    path: "packages/agentish-graph-server/src/mutation/apply-source-mutation.ts",
  }),
  studioApp: define.file("StudioApp", {
    path: "apps/agentish-studio/src/App.tsx",
  }),
  studioMain: define.file("StudioMain", {
    path: "apps/agentish-studio/src/main.tsx",
  }),
};

Package.core.contains(
  File.coreContracts,
  File.coreParser,
  File.coreSemantic,
  File.coreIdentity,
  File.coreProjection,
  File.coreMutation,
);
Package.protocol.contains(File.protocolHttp, File.protocolWs);
Package.store.contains(File.storeState, File.storeActions);
Package.ui.contains(
  File.uiScreen,
  File.uiCanvas,
  File.uiInspector,
  File.uiNavigation,
  File.uiRenderers,
);
Package.server.contains(
  File.serverConfig,
  File.serverHttp,
  File.serverWs,
  File.serverSessions,
  File.serverWorkspace,
  File.serverWatch,
  File.serverDocuments,
  File.serverMutations,
);
Package.studio.contains(File.studioApp, File.studioMain);

File.serverWorkspace.uses(
  File.coreParser,
  File.coreSemantic,
  File.coreIdentity,
  File.coreProjection,
);
File.serverMutations.uses(File.coreMutation);

const State = {
  session: define.stateSlice("SessionSlice"),
  workspace: define.stateSlice("WorkspaceSlice"),
  graph: define.stateSlice("GraphSlice"),
  inspector: define.stateSlice("InspectorSlice"),
  ui: define.stateSlice("UiSlice"),
  io: define.stateSlice("IoSlice"),
};

File.storeState.defines(
  State.session,
  State.workspace,
  State.graph,
  State.inspector,
  State.ui,
  State.io,
);

const Action = {
  bootstrapConfig: define.action("BootstrapConfig"),
  createSession: define.action("CreateSession"),
  closeSession: define.action("CloseSession"),
  connectSocket: define.action("ConnectSocket"),
  applyServerReady: define.action("ApplyServerReady"),
  applyWorkspaceSnapshot: define.action("ApplyWorkspaceSnapshot"),
  applyProjectionSnapshot: define.action("ApplyProjectionSnapshot"),
  applyProjectionPatch: define.action("ApplyProjectionPatch"),
  applyValidationResult: define.action("ApplyValidationResult"),
  applyConflict: define.action("ApplyConflict"),
  handleFileChange: define.action("HandleFileChange"),
  acknowledgeDocumentPatched: define.action("AcknowledgeDocumentPatched"),
  applyServerError: define.action("ApplyServerError"),
  sendPing: define.action("SendPing"),
  receivePong: define.action("ReceivePong"),
  openRoot: define.action("OpenRoot"),
  openDocuments: define.action("OpenDocuments"),
  saveDocuments: define.action("SaveDocuments"),
  setSelection: define.action("SetSelection"),
  setViewport: define.action("SetViewport"),
  beginInspectorEdit: define.action("BeginInspectorEdit"),
  commitInspectorDraft: define.action("CommitInspectorDraft"),
  createNode: define.action("CreateNode"),
  connectHandles: define.action("ConnectHandles"),
  deleteSelection: define.action("DeleteSelection"),
  queueGraphIntent: define.action("QueueGraphIntent"),
  resolveConflict: define.action("ResolveConflict"),
  persistLayoutHint: define.action("PersistLayoutHint"),
};

File.storeActions.implements(
  Action.bootstrapConfig,
  Action.createSession,
  Action.closeSession,
  Action.connectSocket,
  Action.applyServerReady,
  Action.applyWorkspaceSnapshot,
  Action.applyProjectionSnapshot,
  Action.applyProjectionPatch,
  Action.applyValidationResult,
  Action.applyConflict,
  Action.handleFileChange,
  Action.acknowledgeDocumentPatched,
  Action.applyServerError,
  Action.sendPing,
  Action.receivePong,
  Action.openRoot,
  Action.openDocuments,
  Action.saveDocuments,
  Action.setSelection,
  Action.setViewport,
  Action.beginInspectorEdit,
  Action.commitInspectorDraft,
  Action.createNode,
  Action.connectHandles,
  Action.deleteSelection,
  Action.queueGraphIntent,
  Action.resolveConflict,
  Action.persistLayoutHint,
);

State.session.updatedBy(
  Action.bootstrapConfig,
  Action.createSession,
  Action.closeSession,
  Action.connectSocket,
  Action.applyServerReady,
  Action.applyServerError,
);
State.workspace.updatedBy(
  Action.openRoot,
  Action.openDocuments,
  Action.applyWorkspaceSnapshot,
  Action.applyProjectionPatch,
  Action.handleFileChange,
);
State.graph.updatedBy(
  Action.applyProjectionSnapshot,
  Action.applyProjectionPatch,
  Action.handleFileChange,
  Action.setSelection,
  Action.setViewport,
  Action.persistLayoutHint,
  Action.deleteSelection,
);
State.inspector.updatedBy(
  Action.setSelection,
  Action.beginInspectorEdit,
  Action.commitInspectorDraft,
  Action.applyValidationResult,
  Action.applyConflict,
  Action.resolveConflict,
);
State.ui.updatedBy(Action.bootstrapConfig);
State.io.updatedBy(
  Action.connectSocket,
  Action.acknowledgeDocumentPatched,
  Action.applyServerReady,
  Action.applyServerError,
  Action.sendPing,
  Action.receivePong,
  Action.queueGraphIntent,
  Action.applyProjectionPatch,
  Action.resolveConflict,
  Action.saveDocuments,
);

const Transport = {
  http: define.transport("HttpSurface"),
  ws: define.transport("WssSurface"),
};

const Route = {
  config: define.route("GetGraphConfigRoute", {
    path: "GET /api/agentish-graph/config",
  }),
  roots: define.route("ListWorkspaceRootsRoute", {
    path: "GET /api/agentish-graph/roots",
  }),
  createSession: define.route("CreateGraphSessionRoute", {
    path: "POST /api/agentish-graph/sessions",
  }),
  sessionSnapshot: define.route("GetGraphSessionSnapshotRoute", {
    path: "GET /api/agentish-graph/sessions/:sessionId/snapshot",
  }),
  closeSession: define.route("DeleteGraphSessionRoute", {
    path: "DELETE /api/agentish-graph/sessions/:sessionId",
  }),
};

const Message = {
  clientHello: define.message("ClientHelloMessage"),
  clientOpenRoot: define.message("ClientOpenRootMessage"),
  clientOpenDocuments: define.message("ClientOpenDocumentsMessage"),
  clientApplyIntent: define.message("ClientApplyIntentMessage"),
  clientPersistLayout: define.message("ClientPersistLayoutMessage"),
  clientSaveDocuments: define.message("ClientSaveDocumentsMessage"),
  clientPing: define.message("ClientPingMessage"),
  serverReady: define.message("ServerReadyMessage"),
  serverWorkspaceSnapshot: define.message("ServerWorkspaceSnapshotMessage"),
  serverProjectionSnapshot: define.message("ServerProjectionSnapshotMessage"),
  serverProjectionPatch: define.message("ServerProjectionPatchMessage"),
  serverDocumentPatched: define.message("ServerDocumentPatchedMessage"),
  serverValidation: define.message("ServerValidationMessage"),
  serverConflict: define.message("ServerConflictMessage"),
  serverFileChanged: define.message("ServerFileChangedMessage"),
  serverError: define.message("ServerErrorMessage"),
  serverPong: define.message("ServerPongMessage"),
};

File.protocolHttp.defines(
  Route.config,
  Route.roots,
  Route.createSession,
  Route.sessionSnapshot,
  Route.closeSession,
);
File.protocolWs.defines(
  Message.clientHello,
  Message.clientOpenRoot,
  Message.clientOpenDocuments,
  Message.clientApplyIntent,
  Message.clientPersistLayout,
  Message.clientSaveDocuments,
  Message.clientPing,
  Message.serverReady,
  Message.serverWorkspaceSnapshot,
  Message.serverProjectionSnapshot,
  Message.serverProjectionPatch,
  Message.serverDocumentPatched,
  Message.serverValidation,
  Message.serverConflict,
  Message.serverFileChanged,
  Message.serverError,
  Message.serverPong,
);

Transport.http.serves(
  Route.config,
  Route.roots,
  Route.createSession,
  Route.sessionSnapshot,
  Route.closeSession,
);
Transport.ws.serves("WSS /api/agentish-graph/ws");
Transport.ws.accepts(
  Message.clientHello,
  Message.clientOpenRoot,
  Message.clientOpenDocuments,
  Message.clientApplyIntent,
  Message.clientPersistLayout,
  Message.clientSaveDocuments,
  Message.clientPing,
);
Transport.ws.emits(
  Message.serverReady,
  Message.serverWorkspaceSnapshot,
  Message.serverProjectionSnapshot,
  Message.serverProjectionPatch,
  Message.serverDocumentPatched,
  Message.serverValidation,
  Message.serverConflict,
  Message.serverFileChanged,
  Message.serverError,
  Message.serverPong,
);

Action.bootstrapConfig.calls(Route.config, Route.roots);
Action.createSession.calls(Route.createSession, Route.sessionSnapshot);
Action.closeSession.calls(Route.closeSession);
Action.connectSocket.sends(Message.clientHello);
Action.openRoot.sends(Message.clientOpenRoot);
Action.openDocuments.sends(Message.clientOpenDocuments);
Action.saveDocuments.sends(Message.clientSaveDocuments);
Action.sendPing.sends(Message.clientPing);
Action.queueGraphIntent.sends(Message.clientApplyIntent);
Action.persistLayoutHint.sends(Message.clientPersistLayout);
Action.resolveConflict.calls(Route.sessionSnapshot).when("the choice is reload");
Action.createNode.feeds(Action.queueGraphIntent);
Action.connectHandles.feeds(Action.queueGraphIntent);
Action.deleteSelection.feeds(Action.queueGraphIntent);
Action.commitInspectorDraft.feeds(Action.queueGraphIntent);
Action.connectSocket.receives(
  Message.serverReady,
  Message.serverWorkspaceSnapshot,
  Message.serverProjectionSnapshot,
  Message.serverProjectionPatch,
  Message.serverDocumentPatched,
  Message.serverValidation,
  Message.serverConflict,
  Message.serverFileChanged,
  Message.serverError,
  Message.serverPong,
);
Message.serverWorkspaceSnapshot.drives(Action.applyWorkspaceSnapshot);
Message.serverReady.drives(Action.applyServerReady);
Message.serverProjectionSnapshot.drives(Action.applyProjectionSnapshot);
Message.serverProjectionPatch.drives(Action.applyProjectionPatch);
Message.serverValidation.drives(Action.applyValidationResult);
Message.serverConflict.drives(Action.applyConflict);
Message.serverFileChanged.drives(Action.handleFileChange);
Message.serverDocumentPatched.drives(Action.acknowledgeDocumentPatched);
Message.serverError.drives(Action.applyServerError);
Message.serverPong.drives(Action.receivePong);

Server.serves(Transport.http, Transport.ws);
Server.authenticates("bearer session token");
Server.uses("Bun.serve").through(File.serverHttp, File.serverWs);
Server.uses("fs.watch").through(File.serverWatch);
File.serverDocuments.accesses(FileSystem).through("normalized real paths");
File.serverDocuments.rejects(`- path traversal
- writes outside allowed roots`);

when(Browser.opens(Studio))
  .then(Action.bootstrapConfig)
  .and(Action.createSession)
  .and(Action.connectSocket)
  .and(Route.config)
  .and(Route.roots)
  .and(Route.createSession)
  .and(Message.clientHello)
  .and(Message.serverReady);
