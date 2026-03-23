/// <reference path="../_agentish.d.ts" />

// Agent Chat Dashboard Implementation

const Agentish = define.language("Agentish");

const AgentChatDashboardImplementation = define.system("AgentChatDashboardImplementation", {
  format: Agentish,
  role: "Implementation-resolved plan for making Agent Chat a working dashboard feature",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("AgentChatDashboardPlugin"),
  route: define.entity("AgentChatRoute"),
  screen: define.entity("AgentChatScreen"),
};

const Chat = {
  backend: define.system("AgentChatBackend"),
  api: define.entity("AgentChatApi"),
  ws: define.entity("AgentChatRealtimeChannel"),
  stateStore: define.document("AgentChatStateStore"),
  log: define.document("AgentChatServerLog"),
  session: define.entity("AgentChatSession"),
  message: define.entity("AgentChatMessage"),
  run: define.entity("AgentChatRun"),
  approval: define.entity("AgentChatApproval"),
  participant: define.entity("AgentChatParticipant"),
  providerBinding: define.entity("AgentChatProviderBinding"),
};

const Provider = {
  codex: define.system("CodexAppServer"),
  adapter: define.entity("CodexProviderAdapter"),
  thread: define.entity("CodexProviderThread"),
};

const Scope = {
  singleUser: define.concept("SingleUserManagerScope"),
  singleProvider: define.concept("SingleProviderV1"),
  singleAgent: define.concept("SingleAgentV1"),
  canonicalSessions: define.concept("CanonicalSessionOwnership"),
  lazyBackend: define.concept("LazyChatBackend"),
  browserOwnsUi: define.concept("BrowserOwnedChatUi"),
  dashboardAuth: define.concept("DashboardSessionAuthBoundary"),
  deferImports: define.concept("DeferImportsAndCompactionEditing"),
};

const Storage = {
  sqlite: define.concept("SqlitePersistence"),
  runtimeState: define.concept("StateDirectoryPersistence"),
  transcript: define.entity("TranscriptRecord"),
  sessionIndex: define.entity("SessionIndexRecord"),
  runEvent: define.entity("RunEventRecord"),
};

const Transport = {
  http: define.concept("HttpMutationAndQuery"),
  websocket: define.concept("WebSocketStreaming"),
  gatewayProxy: define.concept("GatewayProxiedTransport"),
};

const Api = {
  listSessions: define.entity("ListSessionsEndpoint"),
  createSession: define.entity("CreateSessionEndpoint"),
  getSession: define.entity("GetSessionEndpoint"),
  appendMessage: define.entity("AppendMessageEndpoint"),
  renameSession: define.entity("RenameSessionEndpoint"),
  listMessages: define.entity("ListMessagesEndpoint"),
  subscribeSession: define.entity("SubscribeSessionEndpoint"),
};

const Ui = {
  sessionList: define.entity("SessionListPanel"),
  transcript: define.entity("TranscriptPanel"),
  composer: define.entity("ComposerPanel"),
  runStatus: define.entity("RunStatusRail"),
  statusItems: define.entity("ChatFeatureStatusItems"),
};

const Decision = {
  backendPackage: define.entity("BackendPackageDecision"),
  port: define.entity("BackendPortDecision"),
  sessionIdentity: define.entity("SessionIdentityDecision"),
  providerScope: define.entity("ProviderScopeDecision"),
  v1Cut: define.entity("FirstImplementationCut"),
};

AgentChatDashboardImplementation.enforces(`
- The first working Agent Chat in the dashboard should be a complete vertical slice, not another placeholder.
- The dashboard chat tab should be backed by a real feature-owned backend declared through the dashboard plugin model.
- The first implementation should minimize architectural risk by choosing one provider, one backend, and one canonical persistence model.
- Canonical chat history must be workspace-owned and persisted under state/, not hidden inside provider-owned thread state.
- The browser should own session list, transcript rendering, composer state, reconnect logic, and streaming UI.
- The gateway should proxy Agent Chat traffic and lazy-start the chat backend on first use.
- V1 should ship only the behaviors needed for real day-to-day chat use and defer broader ambitions that are not required yet.
`);

AgentChatDashboardImplementation.defines(`
- AgentChatBackend means the Bun server that owns chat API, realtime events, persistence, and provider integration for the dashboard feature.
- CanonicalSessionOwnership means Agent Chat sessions and messages are the source of truth even if the provider also has thread state.
- GatewayProxiedTransport means the browser talks only to dashboard-relative /api/agent-chat and /ws/agent-chat paths.
- SqlitePersistence means sessions, messages, run events, and provider metadata are stored in one SQLite database under state/.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Chat.backend);
Chat.backend.contains(Chat.api, Chat.ws, Chat.session, Chat.message, Chat.run, Chat.approval, Chat.providerBinding);
Chat.providerBinding.contains(Provider.adapter, Provider.thread);
Chat.stateStore.contains(Storage.transcript, Storage.sessionIndex, Storage.runEvent);
Chat.api.contains(
  Api.listSessions,
  Api.createSession,
  Api.getSession,
  Api.appendMessage,
  Api.renameSession,
  Api.listMessages,
);
Chat.ws.contains(Api.subscribeSession);
Dashboard.screen.contains(Ui.sessionList, Ui.transcript, Ui.composer, Ui.runStatus, Ui.statusItems);

Scope.singleUser.means(`
- V1 is for one operator on the manager-host dashboard
- no multi-user coordination model is required in the first cut
- session sharing and per-user permissions are out of scope for V1
`);

Scope.singleProvider.means(`
- V1 uses Codex app-server as the only provider
- the provider abstraction remains in the model, but implementation should not branch across multiple providers yet
- a future provider can be added later behind the same canonical session model
`);

Scope.singleAgent.means(`
- V1 supports one agent participant per session
- multi-agent participation remains a later extension, not part of the first cut
`);

Scope.canonicalSessions.means(`
- one stable session id per chat
- canonical messages are stored by Agent Chat
- provider thread ids are metadata on the binding, not the source of truth
`);

Scope.lazyBackend.means(`
- the chat backend is not a permanent systemd service
- the dashboard gateway starts it on first chat API or WebSocket traffic
- the chat backend may be restarted by the gateway when unhealthy
`);

Scope.browserOwnsUi.means(`
- session list, transcript rendering, composer state, pending message state, reconnect state, and optimistic UI live in the browser feature
- the browser should not scrape terminal output
- the browser should consume structured chat events from the backend
`);

Scope.dashboardAuth.means(`
- dashboard session auth is the only browser auth boundary for V1
- the chat backend trusts the forwarded dashboard session header through the dashboard gateway
- no separate chat-specific login flow is introduced
`);

Scope.deferImports.means(`
- imported conversations are not required in the first cut
- Agentish compaction authoring is not required in the first cut
- deep workspace reference authoring is not required in the first cut
- a minimal real chat experience is more important than completing every high-level concept immediately
`);

Storage.sqlite.means(`
- use one SQLite database at /home/ec2-user/state/agent-chat/agent-chat.sqlite
- store sessions, messages, provider bindings, run events, and approval records there
- avoid JSON-file transcript storage for the first implementation
`);

Storage.runtimeState.means(`
- mutable chat state lives under /home/ec2-user/state/agent-chat
- backend logs live under /home/ec2-user/state/logs/agent-chat-server.log
- runtime source stays in the readonly runtime checkout
`);

Transport.http.means(`
- HTTP handles session list, create session, load session, rename session, and append user message
- appending a user message may also start a provider run
`);

Transport.websocket.means(`
- one session-scoped WebSocket channel streams assistant tokens, run status, tool events, and approvals
- reconnect should resubscribe and then recover missing events from canonical persisted history
`);

Transport.gatewayProxy.means(`
- browser talks to /api/agent-chat and /ws/agent-chat only
- the dashboard gateway proxies to a chat backend at a fixed local upstream
- the feature plugin owns the backend definition and startup command
`);

Decision.backendPackage.means(`
- create a new package named packages/agent-chat-server
- keep UI in packages/agent-chat-ui
- keep the plugin feature-owned across those packages
`);

Decision.port.means(`
- Agent Chat backend listens on http://127.0.0.1:8789
- dashboard gateway proxies /api/agent-chat/* to that upstream
- dashboard gateway proxies /ws/agent-chat to that upstream
`);

Decision.sessionIdentity.means(`
- a new session is created explicitly from the UI
- the session list is sorted by last activity
- the title is generated from the first user prompt and can be renamed later
`);

Decision.providerScope.means(`
- each session has exactly one Codex provider binding in V1
- provider thread reuse is allowed when resuming the same session
- provider failures do not delete canonical session state
`);

Decision.v1Cut.means(`
- V1 includes session list
- V1 includes create, rename, resume, and continue session
- V1 includes canonical message history
- V1 includes user prompt submission
- V1 includes assistant streaming output
- V1 includes run status and approval surfacing when the provider asks for approval
- V1 excludes imports, multi-agent, provider switching UI, and advanced context inspection panels
`);

when(Dashboard.plugin.belongsTo(Dashboard.shell))
  .then(Dashboard.plugin.uses(Decision.backendPackage))
  .and(Dashboard.plugin.uses(Decision.port))
  .and(Dashboard.plugin.requires(Scope.lazyBackend))
  .and(Dashboard.plugin.requires(Transport.gatewayProxy));

when(Chat.backend.starts())
  .then(Chat.backend.requires(Scope.singleUser))
  .and(Chat.backend.requires(Scope.singleProvider))
  .and(Chat.backend.requires(Scope.singleAgent))
  .and(Chat.backend.requires(Scope.canonicalSessions))
  .and(Chat.backend.requires(Storage.sqlite))
  .and(Chat.backend.requires(Storage.runtimeState))
  .and(Chat.backend.bindsTo(Provider.codex))
  .and(Chat.backend.listensOn("127.0.0.1:8789"));

when(Ui.sessionList.opens(Chat.session))
  .then(Dashboard.screen.requires(Scope.browserOwnsUi))
  .and(Dashboard.screen.requires(Decision.sessionIdentity))
  .and(Dashboard.screen.requires(Decision.v1Cut));

when(Ui.composer.submits(Chat.message))
  .then(Chat.api.uses(Api.appendMessage))
  .and(Chat.run.starts(Provider.codex))
  .and(Chat.ws.uses(Api.subscribeSession))
  .and(Chat.backend.records(Storage.transcript))
  .and(Chat.backend.records(Storage.runEvent));

when(Chat.backend.records(Storage.transcript))
  .then(Chat.backend.preserves(Chat.session))
  .and(Chat.backend.preserves(Chat.message))
  .and(Chat.backend.treats(Provider.thread).as("replaceable provider state"));

when(Provider.codex.emits(Chat.approval))
  .then(Chat.backend.records(Chat.approval))
  .and(Ui.runStatus.surfaces(Chat.approval));

when(Decision.v1Cut.guides(AgentChatDashboardImplementation))
  .then(AgentChatDashboardImplementation.defers(Scope.deferImports))
  .and(AgentChatDashboardImplementation.forbids("a placeholder-only dashboard chat tab after implementation starts"));

AgentChatDashboardImplementation.prescribes(`
- Step 1: create packages/agent-chat-server with SQLite-backed session and message persistence, Codex provider adapter, and dashboard-relative API and WebSocket endpoints.
- Step 2: extend the chat dashboard plugin so the feature declares backend health, startup, API path, and WebSocket path.
- Step 3: replace the placeholder AgentChatScreen with a real session list, transcript, composer, and streaming run state.
- Step 4: verify lazy backend start through the gateway, browser reconnect behavior, and real message persistence across refresh and backend restart.
- Step 5: defer imports, multi-agent participation, provider switching UI, and advanced context tooling until the vertical slice is working end to end.
`);
