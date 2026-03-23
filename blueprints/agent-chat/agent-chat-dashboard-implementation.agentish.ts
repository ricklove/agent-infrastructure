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
  contentBlock: define.entity("AgentChatContentBlock"),
  attachment: define.entity("AgentChatAttachment"),
  run: define.entity("AgentChatRun"),
  approval: define.entity("AgentChatApproval"),
  participant: define.entity("AgentChatParticipant"),
  providerBinding: define.entity("AgentChatProviderBinding"),
};

const Provider = {
  codex: define.system("CodexAppServer"),
  openrouter: define.system("OpenRouterApi"),
  claudeAgentSdk: define.system("ClaudeAgentSdk"),
  gemini: define.system("GeminiApi"),
  codexAdapter: define.entity("CodexProviderAdapter"),
  openrouterAdapter: define.entity("OpenRouterProviderAdapter"),
  claudeAgentSdkAdapter: define.entity("ClaudeAgentSdkProviderAdapter"),
  geminiAdapter: define.entity("GeminiProviderAdapter"),
  thread: define.entity("ProviderThreadHandle"),
  capability: define.entity("ProviderCapability"),
  selection: define.entity("SessionProviderSelection"),
  authProfile: define.entity("ProviderAuthProfile"),
  modelRef: define.entity("ProviderQualifiedModelRef"),
  imageModelRef: define.entity("ProviderImageModelRef"),
};

const Scope = {
  singleUser: define.concept("SingleUserManagerScope"),
  multiProvider: define.concept("MultiProviderV1"),
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
  providerConfig: define.entity("ProviderConfigRecord"),
  cacheHint: define.entity("CacheHintRecord"),
};

const Transport = {
  http: define.concept("HttpMutationAndQuery"),
  websocket: define.concept("WebSocketStreaming"),
  gatewayProxy: define.concept("GatewayProxiedTransport"),
};

const Capability = {
  multimodal: define.concept("MultimodalInputSupport"),
  imageInput: define.concept("ImageInputSupport"),
  cachedContext: define.concept("ProviderNativeContextCaching"),
  threadReuse: define.concept("ProviderNativeThreadReuse"),
  modelCatalog: define.concept("ProviderQualifiedModelCatalog"),
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
  providerPicker: define.entity("ProviderPicker"),
  runStatus: define.entity("RunStatusRail"),
  statusItems: define.entity("ChatFeatureStatusItems"),
};

const Decision = {
  backendPackage: define.entity("BackendPackageDecision"),
  port: define.entity("BackendPortDecision"),
  sessionIdentity: define.entity("SessionIdentityDecision"),
  providerScope: define.entity("ProviderScopeDecision"),
  providerTransport: define.entity("ProviderTransportDecision"),
  providerRuntime: define.entity("ProviderRuntimeDecision"),
  sessionStickiness: define.entity("ProviderSessionStickinessDecision"),
  contentModel: define.entity("ContentModelDecision"),
  cacheStrategy: define.entity("ProviderCacheStrategyDecision"),
  v1Cut: define.entity("FirstImplementationCut"),
};

AgentChatDashboardImplementation.enforces(`
- The first working Agent Chat in the dashboard should be a complete vertical slice, not another placeholder.
- The dashboard chat tab should be backed by a real feature-owned backend declared through the dashboard plugin model.
- The first implementation should minimize architectural risk by choosing one backend, one canonical persistence model, and one provider-agnostic adapter boundary.
- Canonical chat history must be workspace-owned and persisted under state/, not hidden inside provider-owned thread state.
- Canonical chat content must stay structured enough to preserve text, images, and cache boundaries across providers.
- Each provider adapter must be re-researched against current provider docs and relevant open-source reference implementations immediately before implementing that adapter.
- The browser should own session list, transcript rendering, composer state, reconnect logic, and streaming UI.
- The gateway should proxy Agent Chat traffic and lazy-start the chat backend on first use.
- V1 should ship only the behaviors needed for real day-to-day chat use and defer broader ambitions that are not required yet.
`);

AgentChatDashboardImplementation.defines(`
- AgentChatBackend means the Bun server that owns chat API, realtime events, persistence, and provider integration for the dashboard feature.
- CanonicalSessionOwnership means Agent Chat sessions and messages are the source of truth even if the provider also has thread state.
- GatewayProxiedTransport means the browser talks only to dashboard-relative /api/agent-chat and /ws/agent-chat paths.
- SqlitePersistence means sessions, messages, run events, and provider metadata are stored in one SQLite database under state/.
- SessionProviderSelection means each session records one concrete provider choice and its provider-specific metadata.
- AgentChatContentBlock means a canonical block such as text or image that is preserved before adapter mapping.
- ProviderQualifiedModelRef means model identity is stored as a provider-qualified reference rather than an ambiguous bare model name.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Chat.backend);
Chat.backend.contains(Chat.api, Chat.ws, Chat.session, Chat.message, Chat.contentBlock, Chat.attachment, Chat.run, Chat.approval, Chat.providerBinding);
Chat.providerBinding.contains(
  Provider.codexAdapter,
  Provider.openrouterAdapter,
  Provider.claudeAgentSdkAdapter,
  Provider.geminiAdapter,
  Provider.thread,
  Provider.selection,
  Provider.authProfile,
  Provider.modelRef,
  Provider.imageModelRef,
  Provider.capability,
);
Chat.stateStore.contains(Storage.transcript, Storage.sessionIndex, Storage.runEvent, Storage.providerConfig, Storage.cacheHint);
Chat.api.contains(
  Api.listSessions,
  Api.createSession,
  Api.getSession,
  Api.appendMessage,
  Api.renameSession,
  Api.listMessages,
);
Chat.ws.contains(Api.subscribeSession);
Dashboard.screen.contains(Ui.sessionList, Ui.transcript, Ui.composer, Ui.providerPicker, Ui.runStatus, Ui.statusItems);

Scope.singleUser.means(`
- V1 is for one operator on the manager-host dashboard
- no multi-user coordination model is required in the first cut
- session sharing and per-user permissions are out of scope for V1
`);

Scope.multiProvider.means(`
- V1 supports four concrete providers: Codex app-server, OpenRouter, Claude Agent SDK, and Gemini
- each session chooses exactly one provider
- the session model stays provider-agnostic even though adapters are provider-specific
- provider switching UI may be deferred even while multiple provider choices are supported for new sessions
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

Capability.multimodal.means(`
- provider adapters should accept canonical structured content rather than flattened strings
- text and image inputs should survive provider translation without lossy ad hoc rewriting
`);

Capability.imageInput.means(`
- image attachments should be first-class canonical content
- adapters should map them to the provider-native image input format instead of preprocessing them into text summaries
`);

Capability.cachedContext.means(`
- retained context should use provider-native caching or reuse features when available
- fallback hydration should still work from canonical app-owned history when provider-native caching is absent
`);

Capability.modelCatalog.means(`
- provider and model identity should be resolved from a capability-aware catalog
- model refs should stay provider-qualified like provider/model rather than bare names
- modality, tool, cache, and context-window metadata should come from cataloged model capabilities rather than hand-waved assumptions
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
- store provider kind, provider model, provider thread handle, and provider configuration references there
- store provider auth-profile choice and optional image-model override there
- store canonical content blocks and cache hints instead of only flattened prompt strings
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
- each session has exactly one provider binding in V1
- the supported provider kinds are codex-app-server, openrouter, claude-agent-sdk, and gemini
- provider selection happens at session creation time
- provider thread or run-state reuse is allowed when resuming the same session for providers that support it
- provider failures do not delete canonical session state
`);

Decision.providerTransport.means(`
- Codex app-server should be integrated through its app-server JSON-RPC transport, not by scraping the TUI
- Claude Agent SDK should be integrated through the official SDK client/query surfaces, not by parsing ad hoc terminal output
- Gemini should use the official @google/genai SDK, including its streaming, files, and caches surfaces when useful
- OpenRouter should use an OpenRouter-native SDK/provider surface so provider metadata and cache hints are preserved instead of flattened away
`);

Decision.providerRuntime.means(`
- local provider runtimes such as Codex app-server are backend-managed support processes rather than browser-managed processes
- the chat backend may health-check and lazy-start a local provider runtime when the selected provider requires one
- provider runtime liveness is operational state, not canonical session state
- provider thread handles and similar provider-owned resume identifiers should be persisted as provider metadata on the canonical session
`);

Decision.sessionStickiness.means(`
- each session should persist provider kind, qualified model ref, auth profile, and optional image-model override
- session stickiness should preserve provider-native cache hits and reduce needless provider churn
- image-capable fallback should be explicit when a chosen text model cannot accept images
`);

Decision.contentModel.means(`
- canonical messages are stored as ordered content blocks
- V1 supports text and image input blocks
- the browser and backend must not reduce image-capable providers to plain text-only prompts
`);

Decision.cacheStrategy.means(`
- Codex app-server should prefer provider-native thread reuse as its primary retained-context strategy
- Claude Agent SDK should preserve canonical context as structured blocks and use Anthropic-native prompt caching for retained prefixes when beneficial
- Gemini should preserve multimodal parts and use Gemini context caching for large retained context when beneficial
- OpenRouter should preserve multimodal content and pass through provider-compatible cache hints or caching parameters when the selected model supports them
- Agent Chat still owns canonical context and must continue to work when provider-native caching is unavailable
`);

Decision.v1Cut.means(`
- V1 includes session list
- V1 includes create, rename, resume, and continue session
- V1 includes provider selection when creating a session
- V1 includes canonical message history
- V1 includes user prompt submission
- V1 includes assistant streaming output
- V1 includes run status and approval surfacing when the provider asks for approval
- V1 excludes imports, multi-agent, in-session provider switching UI, and advanced context inspection panels
`);

when(Dashboard.plugin.belongsTo(Dashboard.shell))
  .then(Dashboard.plugin.uses(Decision.backendPackage))
  .and(Dashboard.plugin.uses(Decision.port))
  .and(Dashboard.plugin.requires(Scope.lazyBackend))
  .and(Dashboard.plugin.requires(Transport.gatewayProxy));

when(Chat.backend.starts())
  .then(Chat.backend.requires(Scope.singleUser))
  .and(Chat.backend.requires(Scope.multiProvider))
  .and(Chat.backend.requires(Scope.singleAgent))
  .and(Chat.backend.requires(Scope.canonicalSessions))
  .and(Chat.backend.requires(Storage.sqlite))
  .and(Chat.backend.requires(Storage.runtimeState))
  .and(Chat.backend.requires(Capability.multimodal))
  .and(Chat.backend.requires(Capability.imageInput))
  .and(Chat.backend.requires(Capability.cachedContext))
  .and(Chat.backend.requires(Capability.modelCatalog))
  .and(Chat.backend.bindsTo(Provider.codex))
  .and(Chat.backend.bindsTo(Provider.openrouter))
  .and(Chat.backend.bindsTo(Provider.claudeAgentSdk))
  .and(Chat.backend.bindsTo(Provider.gemini))
  .and(Chat.backend.listensOn("127.0.0.1:8789"));

when(Ui.sessionList.opens(Chat.session))
  .then(Dashboard.screen.requires(Scope.browserOwnsUi))
  .and(Dashboard.screen.requires(Decision.sessionIdentity))
  .and(Dashboard.screen.requires(Decision.v1Cut));

when(Ui.composer.submits(Chat.message))
  .then(Chat.api.uses(Api.appendMessage))
  .and(Chat.run.starts("the provider selected for the session"))
  .and(Chat.ws.uses(Api.subscribeSession))
  .and(Chat.backend.records(Storage.transcript))
  .and(Chat.backend.records(Storage.runEvent))
  .and(Chat.backend.preserves(Chat.contentBlock));

when(Chat.backend.records(Storage.transcript))
  .then(Chat.backend.preserves(Chat.session))
  .and(Chat.backend.preserves(Chat.message))
  .and(Chat.backend.treats(Provider.thread).as("replaceable provider state"));

when(Provider.codex.emits(Chat.approval))
  .then(Chat.backend.records(Chat.approval))
  .and(Ui.runStatus.surfaces(Chat.approval));

when(Provider.claudeAgentSdk.emits(Chat.approval))
  .then(Chat.backend.records(Chat.approval))
  .and(Ui.runStatus.surfaces(Chat.approval));

when(Provider.openrouter.emits("provider streaming output"))
  .then(Chat.backend.records(Storage.runEvent))
  .and(Chat.backend.projects("assistant deltas and completion state into canonical chat events"));

when(Provider.gemini.emits("provider streaming output"))
  .then(Chat.backend.records(Storage.runEvent))
  .and(Chat.backend.projects("assistant deltas and completion state into canonical chat events"));

when(Decision.cacheStrategy.guides(AgentChatDashboardImplementation))
  .then(Chat.backend.prefers(Capability.threadReuse).for(Provider.codex))
  .and(Chat.backend.prefers(Capability.cachedContext).for(Provider.claudeAgentSdk))
  .and(Chat.backend.prefers(Capability.cachedContext).for(Provider.gemini))
  .and(Chat.backend.prefers(Capability.multimodal).for(Provider.openrouter));

when(Decision.providerTransport.guides(AgentChatDashboardImplementation))
  .then(Chat.backend.integrates(Provider.codex).through("app-server JSON-RPC over a local transport"))
  .and(Chat.backend.integrates(Provider.claudeAgentSdk).through("the official Claude Agent SDK client"))
  .and(Chat.backend.integrates(Provider.gemini).through("the official @google/genai SDK"))
  .and(Chat.backend.integrates(Provider.openrouter).through("an OpenRouter-native provider SDK"));

when(Decision.sessionStickiness.guides(AgentChatDashboardImplementation))
  .then(Chat.backend.persists(Provider.modelRef))
  .and(Chat.backend.persists(Provider.authProfile))
  .and(Chat.backend.mayPersist(Provider.imageModelRef))
  .and(Chat.backend.avoids("switching providers or models implicitly mid-session"));

when(Decision.v1Cut.guides(AgentChatDashboardImplementation))
  .then(AgentChatDashboardImplementation.defers(Scope.deferImports))
  .and(AgentChatDashboardImplementation.forbids("a placeholder-only dashboard chat tab after implementation starts"));

AgentChatDashboardImplementation.prescribes(`
- Step 1: create packages/agent-chat-server with SQLite-backed session and message persistence, dashboard-relative API and WebSocket endpoints, and one provider adapter interface implemented by Codex app-server, OpenRouter, Claude Agent SDK, and Gemini.
- Step 2: before implementing any specific provider adapter, re-research that provider's current docs, transport model, multimodal path, caching path, and one or more relevant open-source reference implementations.
- Step 3: build a provider-qualified model catalog with modality, context-window, tool, and cache metadata.
- Step 4: implement a canonical multimodal content model with text and image blocks plus provider-specific cache-hint mapping.
- Step 5: persist per-session provider stickiness including provider kind, qualified model ref, auth profile, and optional image-model override.
- Step 6: extend the chat dashboard plugin so the feature declares backend health, startup, API path, and WebSocket path.
- Step 7: replace the placeholder AgentChatScreen with a real session list, provider picker, transcript, composer, image-aware input flow, and streaming run state.
- Step 8: verify lazy backend start through the gateway, browser reconnect behavior, provider-specific streaming behavior, multimodal input behavior, cache strategy behavior, and real message persistence across refresh and backend restart.
- Step 9: defer imports, multi-agent participation, in-session provider switching UI, and advanced context tooling until the vertical slice is working end to end.
`);
