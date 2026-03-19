/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Code architecture definition",
});

const Concept = define.entity("AgentishGraphConcept", { format: Agentish });
const Scenarios = define.entity("AgentishGraphScenarios", { format: Agentish });
const Contracts = define.entity("AgentishGraphContracts", { format: Agentish });

const CodeArchitecture = define.entity("AgentishGraphCodeArchitecture", {
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
  core: define.entity("PackageAgentishGraphCore", {
    path: "packages/agentish-graph-core",
  }),
  protocol: define.entity("PackageAgentishGraphProtocol", {
    path: "packages/agentish-graph-protocol",
  }),
  store: define.entity("PackageAgentishGraphStore", {
    path: "packages/agentish-graph-store",
  }),
  ui: define.entity("PackageAgentishGraphUi", {
    path: "packages/agentish-graph-ui",
  }),
  server: define.entity("PackageAgentishGraphServer", {
    path: "packages/agentish-graph-server",
  }),
  studio: define.entity("PackageAgentishStudio", {
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
- The protocol owns all cross-boundary contracts.`);

const File = {
  coreContracts: define.entity("CoreContracts", {
    path: "packages/agentish-graph-core/src/contracts/*",
  }),
  coreParser: define.entity("CoreParser", {
    path: "packages/agentish-graph-core/src/parser/parse-agentish-document.ts",
  }),
  coreSemantic: define.entity("CoreSemanticBuilder", {
    path: "packages/agentish-graph-core/src/semantic/build-semantic-model.ts",
  }),
  coreIdentity: define.entity("CoreStableIdentity", {
    path: "packages/agentish-graph-core/src/identity/build-stable-id.ts",
  }),
  coreProjection: define.entity("CoreProjectionBuilder", {
    path: "packages/agentish-graph-core/src/projection/build-graph-projection.ts",
  }),
  coreMutation: define.entity("CoreMutationPlanner", {
    path: "packages/agentish-graph-core/src/mutation/plan-source-mutation.ts",
  }),
  protocolHttp: define.entity("ProtocolHttp", {
    path: "packages/agentish-graph-protocol/src/http.ts",
  }),
  protocolWs: define.entity("ProtocolWs", {
    path: "packages/agentish-graph-protocol/src/ws.ts",
  }),
  storeState: define.entity("StoreState", {
    path: "packages/agentish-graph-store/src/agentish-graph-store.ts",
  }),
  storeActions: define.entity("StoreActions", {
    path: "packages/agentish-graph-store/src/actions.ts",
  }),
  uiScreen: define.entity("UiScreen", {
    path: "packages/agentish-graph-ui/src/components/AgentishGraphScreen.tsx",
  }),
  uiCanvas: define.entity("UiCanvas", {
    path: "packages/agentish-graph-ui/src/components/AgentishGraphCanvas.tsx",
  }),
  uiInspector: define.entity("UiInspector", {
    path: "packages/agentish-graph-ui/src/components/AgentishGraphInspectorPane.tsx",
  }),
  uiNavigation: define.entity("UiNavigation", {
    path: "packages/agentish-graph-ui/src/components/*",
  }),
  uiRenderers: define.entity("UiRenderers", {
    path: "packages/agentish-graph-ui/src/{renderers,reactflow}/*",
  }),
  serverConfig: define.entity("ServerConfig", {
    path: "packages/agentish-graph-server/src/config.ts",
  }),
  serverHttp: define.entity("ServerHttp", {
    path: "packages/agentish-graph-server/src/http/create-http-server.ts",
  }),
  serverWs: define.entity("ServerWs", {
    path: "packages/agentish-graph-server/src/ws/create-ws-server.ts",
  }),
  serverSessions: define.entity("ServerSessions", {
    path: "packages/agentish-graph-server/src/session/session-registry.ts",
  }),
  serverWorkspace: define.entity("ServerWorkspace", {
    path: "packages/agentish-graph-server/src/workspace/workspace-service.ts",
  }),
  serverWatch: define.entity("ServerWorkspaceWatcher", {
    path: "packages/agentish-graph-server/src/workspace/workspace-watcher.ts",
  }),
  serverDocuments: define.entity("ServerDocumentRepository", {
    path: "packages/agentish-graph-server/src/workspace/document-repository.ts",
  }),
  serverMutations: define.entity("ServerMutationExecutor", {
    path: "packages/agentish-graph-server/src/mutation/apply-source-mutation.ts",
  }),
  studioApp: define.entity("StudioApp", {
    path: "apps/agentish-studio/src/App.tsx",
  }),
  studioMain: define.entity("StudioMain", {
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
  session: define.entity("SessionSlice"),
  workspace: define.entity("WorkspaceSlice"),
  graph: define.entity("GraphSlice"),
  inspector: define.entity("InspectorSlice"),
  ui: define.entity("UiSlice"),
  io: define.entity("IoSlice"),
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
  bootstrapConfig: define.entity("BootstrapConfig"),
  createSession: define.entity("CreateSession"),
  closeSession: define.entity("CloseSession"),
  connectSocket: define.entity("ConnectSocket"),
  applyServerSnapshot: define.entity("ApplyServerSnapshot"),
  applyServerPatch: define.entity("ApplyServerPatch"),
  openRoot: define.entity("OpenRoot"),
  openDocument: define.entity("OpenDocument"),
  saveDocuments: define.entity("SaveDocuments"),
  setSelection: define.entity("SetSelection"),
  setViewport: define.entity("SetViewport"),
  beginInspectorEdit: define.entity("BeginInspectorEdit"),
  commitInspectorDraft: define.entity("CommitInspectorDraft"),
  createNode: define.entity("CreateNode"),
  connectHandles: define.entity("ConnectHandles"),
  deleteSelection: define.entity("DeleteSelection"),
  queueGraphIntent: define.entity("QueueGraphIntent"),
  resolveConflict: define.entity("ResolveConflict"),
  persistLayoutHint: define.entity("PersistLayoutHint"),
};

File.storeActions.implements(
  Action.bootstrapConfig,
  Action.createSession,
  Action.closeSession,
  Action.connectSocket,
  Action.applyServerSnapshot,
  Action.applyServerPatch,
  Action.openRoot,
  Action.openDocument,
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
);
State.workspace.updatedBy(
  Action.openRoot,
  Action.openDocument,
  Action.applyServerSnapshot,
  Action.applyServerPatch,
);
State.graph.updatedBy(
  Action.applyServerSnapshot,
  Action.applyServerPatch,
  Action.setSelection,
  Action.setViewport,
  Action.persistLayoutHint,
  Action.deleteSelection,
);
State.inspector.updatedBy(
  Action.setSelection,
  Action.beginInspectorEdit,
  Action.commitInspectorDraft,
  Action.resolveConflict,
);
State.ui.updatedBy(Action.bootstrapConfig);
State.io.updatedBy(
  Action.connectSocket,
  Action.queueGraphIntent,
  Action.applyServerPatch,
  Action.resolveConflict,
  Action.saveDocuments,
);

const Transport = {
  http: define.entity("HttpSurface"),
  ws: define.entity("WssSurface"),
};

const Route = {
  config: define.entity("GetGraphConfigRoute", {
    path: "GET /api/agentish-graph/config",
  }),
  roots: define.entity("ListWorkspaceRootsRoute", {
    path: "GET /api/agentish-graph/roots",
  }),
  createSession: define.entity("CreateGraphSessionRoute", {
    path: "POST /api/agentish-graph/sessions",
  }),
  sessionSnapshot: define.entity("GetGraphSessionSnapshotRoute", {
    path: "GET /api/agentish-graph/sessions/:sessionId/snapshot",
  }),
  closeSession: define.entity("DeleteGraphSessionRoute", {
    path: "DELETE /api/agentish-graph/sessions/:sessionId",
  }),
};

const Message = {
  clientHello: define.entity("ClientHelloMessage"),
  clientOpenRoot: define.entity("ClientOpenRootMessage"),
  clientOpenDocuments: define.entity("ClientOpenDocumentsMessage"),
  clientApplyIntent: define.entity("ClientApplyIntentMessage"),
  clientPersistLayout: define.entity("ClientPersistLayoutMessage"),
  clientSaveDocuments: define.entity("ClientSaveDocumentsMessage"),
  clientPing: define.entity("ClientPingMessage"),
  serverReady: define.entity("ServerReadyMessage"),
  serverWorkspaceSnapshot: define.entity("ServerWorkspaceSnapshotMessage"),
  serverProjectionSnapshot: define.entity("ServerProjectionSnapshotMessage"),
  serverProjectionPatch: define.entity("ServerProjectionPatchMessage"),
  serverDocumentPatched: define.entity("ServerDocumentPatchedMessage"),
  serverValidation: define.entity("ServerValidationMessage"),
  serverConflict: define.entity("ServerConflictMessage"),
  serverFileChanged: define.entity("ServerFileChangedMessage"),
  serverError: define.entity("ServerErrorMessage"),
  serverPong: define.entity("ServerPongMessage"),
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
Action.openDocument.sends(Message.clientOpenDocuments);
Action.saveDocuments.sends(Message.clientSaveDocuments);
Action.queueGraphIntent.sends(Message.clientApplyIntent);
Action.persistLayoutHint.sends(Message.clientPersistLayout);
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
