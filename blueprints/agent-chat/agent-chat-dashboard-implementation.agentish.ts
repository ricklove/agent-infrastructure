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
  persistenceSignal: define.entity("WorkspacePersistenceSignal"),
  session: define.entity("AgentChatSession"),
  message: define.entity("AgentChatMessage"),
  contentBlock: define.entity("AgentChatContentBlock"),
  attachment: define.entity("AgentChatAttachment"),
  run: define.entity("AgentChatRun"),
  approval: define.entity("AgentChatApproval"),
  participant: define.entity("AgentChatParticipant"),
  providerBinding: define.entity("AgentChatProviderBinding"),
  workerState: define.entity("AgentChatWorkerState"),
  folder: define.entity("AgentChatSessionFolder"),
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
  workspaceRootDefault: define.concept("WorkspaceRootDefault"),
  sessionWorkspaceSelection: define.concept("SessionWorkspaceSelection"),
  lazyBackend: define.concept("LazyChatBackend"),
  browserOwnsUi: define.concept("BrowserOwnedChatUi"),
  dashboardAuth: define.concept("DashboardSessionAuthBoundary"),
  deferImports: define.concept("DeferImportsAndCompactionEditing"),
};

const Storage = {
  fileCanonical: define.concept("FileCanonicalPersistence"),
  workspaceRepoDurability: define.concept("WorkspaceRepoDurability"),
  inMemoryCache: define.concept("InMemoryDerivedCache"),
  appData: define.concept("AppDataPersistence"),
  runtimeState: define.concept("TemporaryRuntimeStateOnly"),
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

const Manager = {
  controller: define.system("ManagerController"),
  workspacePersistence: define.entity("WorkspacePersistenceController"),
};

const Api = {
  listSessions: define.entity("ListSessionsEndpoint"),
  listFolders: define.entity("ListFoldersEndpoint"),
  createSession: define.entity("CreateSessionEndpoint"),
  createFolder: define.entity("CreateFolderEndpoint"),
  getSession: define.entity("GetSessionEndpoint"),
  appendMessage: define.entity("AppendMessageEndpoint"),
  renameSession: define.entity("RenameSessionEndpoint"),
  moveSession: define.entity("MoveSessionEndpoint"),
  listMessages: define.entity("ListMessagesEndpoint"),
  subscribeSession: define.entity("SubscribeSessionEndpoint"),
};

const Ui = {
  sessionList: define.entity("SessionListPanel"),
  sessionFolderTree: define.entity("SessionFolderTree"),
  transcript: define.entity("TranscriptPanel"),
  composer: define.entity("ComposerPanel"),
  composerSettingsMenu: define.entity("ComposerSettingsMenu"),
  activityStatus: define.entity("AgentActivityStatus"),
  workerStatusSummary: define.entity("WorkerStatusSummary"),
  queuedMessageList: define.entity("QueuedMessageList"),
  replyTargetReminder: define.entity("ReplyTargetReminder"),
  providerPicker: define.entity("ProviderPicker"),
  workspacePicker: define.entity("WorkspacePicker"),
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
- Canonical chat history must be workspace-owned durable app data and must not live under state/.
- Canonical chat content must stay structured enough to preserve text, images, and cache boundaries across providers.
- The composer must accept image paste from the browser clipboard and preserve those pasted images as first-class canonical content blocks.
- Each provider adapter must be re-researched against current provider docs and relevant open-source reference implementations immediately before implementing that adapter.
- Agent Chat sessions must inherit the development-process blueprint so provider-backed agents use the same blueprint-first workflow rules.
- The session model should support assignment of a repository process blueprint that defines expectation text and idle-watchdog behavior.
- The browser should own session list, transcript rendering, composer state, reconnect logic, and streaming UI.
- Session-list organization must be canonical app data rather than browser-only preference state.
- The main chat surface should prioritize the active thread and keep secondary controls behind menus or drawers.
- Session/provider/model/directory controls should live with the composer area rather than occupying the main thread surface.
- The composer-area menu is scoped to the current chat only; new-chat creation belongs to the session-list area rather than the active-thread controls.
- Directory changes must enqueue a system instruction that the provider sees before the next user turn.
- Agent activity should be shown near the composer with explicit working state, elapsed time, and provider-backed background activity count when available.
- Session list rows should show worker state when the backend can report it, not just a generic session status pill.
- Session list rows should show the selected process expectation when one is assigned and should surface watchdog attention state when a session goes idle unresolved.
- The active-thread controls should expose a compact quick-set process selector for the current chat adjacent to the thread menu button.
- The quick-set control should present an explicit unassigned state such as none rather than an imperative placeholder label.
- Changing a session's assigned process blueprint should update the queued next-turn system instruction so the agent sees the new expectation contract on the next provider turn without creating an immediate standalone transcript event.
- Queued messages that the provider has not seen yet should be shown below the activity status and above the composer.
- A queued next-turn system instruction should render as a distinct waiting item rather than visually merging with queued user messages.
- The composer should support a lightweight reply-target reminder so the operator can indicate that the in-progress human message responds to a specific earlier agent message.
- The browser should preserve unsent per-session message drafts in local storage so transient reloads do not discard typed input.
- Keyboard interrupt should be exposed as Esc when the selected provider supports a real interrupt action.
- Provider adapters must not fail an otherwise active turn on a short fixed wall-clock deadline while the provider is still streaming output or reporting honest activity.
- Provider timeout policy should be configurable and should treat lost activity or broken transport as failure conditions more strongly than ordinary long-running work.
- The gateway should proxy Agent Chat traffic and lazy-start the chat backend on first use.
- Canonical Agent Chat mutations should signal workspace durability work to the manager controller rather than performing git commit or push inline on the request path.
- Workspace git commit and push policy should be owned by a manager-side workspace-persistence controller because push is part of persistence for manager-host chat history.
- V1 should ship only the behaviors needed for real day-to-day chat use and defer broader ambitions that are not required yet.
`);

AgentChatDashboardImplementation.defines(`
- AgentChatBackend means the Bun server that owns chat API, realtime events, persistence, and provider integration for the dashboard feature.
- CanonicalSessionOwnership means Agent Chat sessions and messages are the source of truth even if the provider also has thread state.
- GatewayProxiedTransport means the browser talks only to dashboard-relative /api/agent-chat and /ws/agent-chat paths.
- FileCanonicalPersistence means canonical sessions, messages, and provider metadata are stored as structured files under durable app data, not under temporary runtime state.
- WorkspaceRepoDurability means canonical Agent Chat file persistence is extended into committed and pushed workspace-repo history by a manager-side controller.
- InMemoryDerivedCache means the backend may keep a rebuildable in-memory index for fast list and session reads, but that cache is not canonical.
- TemporaryRuntimeStateOnly means state/ is reserved for recoverable runtime artifacts such as logs, sockets, pid files, and controller metadata.
- SessionProviderSelection means each session records one concrete provider choice and its provider-specific metadata.
- AgentChatContentBlock means a canonical block such as text or image that is preserved before adapter mapping.
- ProviderQualifiedModelRef means model identity is stored as a provider-qualified reference rather than an ambiguous bare model name.
- Provider timeout policy means adapter-side failure thresholds are explicit, configurable, and aligned with long-running interactive agent work rather than a short hard stop.
- WorkspacePersistenceSignal means the backend emits a post-write durability signal after canonical session mutations and lets the manager controller decide batching, commit, push, retry, and escalation behavior.
- ProcessBlueprintCatalog means the backend can enumerate machine-readable process blueprints from the repository blueprints tree and expose them to the browser.
- SessionProcessAssignment means canonical session metadata stores the selected process blueprint id for a session.
- ExpectationIdleWatchdog means the backend observes unresolved idle sessions and emits process-blueprint-specific follow-up prompts when the selected watchdog policy says to do so.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Chat.backend);
Chat.backend.contains(Chat.api, Chat.ws, Chat.session, Chat.message, Chat.contentBlock, Chat.attachment, Chat.run, Chat.approval, Chat.providerBinding, Chat.workerState, Chat.folder);
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
Chat.stateStore.contains(
  Storage.transcript,
  Storage.sessionIndex,
  Storage.runEvent,
  Storage.providerConfig,
  Storage.cacheHint,
  Storage.fileCanonical,
  Storage.workspaceRepoDurability,
  Storage.inMemoryCache,
);
Manager.controller.contains(Manager.workspacePersistence);
Chat.api.contains(
  Api.listSessions,
  Api.listProcessBlueprints,
  Api.listFolders,
  Api.createSession,
  Api.createFolder,
  Api.getSession,
  Api.appendMessage,
  Api.renameSession,
  Api.moveSession,
  Api.listMessages,
);
Chat.ws.contains(Api.subscribeSession);
Dashboard.screen.contains(
  Ui.sessionList,
  Ui.sessionFolderTree,
  Ui.transcript,
  Ui.composer,
  Ui.composerSettingsMenu,
  Ui.activityStatus,
  Ui.workerStatusSummary,
  Ui.queuedMessageList,
  Ui.replyTargetReminder,
  Ui.providerPicker,
  Ui.workspacePicker,
  Ui.runStatus,
  Ui.statusItems,
);

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

Scope.workspaceRootDefault.means(`
- the default workspace root for a new chat session is /home/ec2-user/workspace
- provider adapters should use that workspace root unless the session chooses an explicit override
- the default must not silently collapse to one specific project checkout
`);

Scope.sessionWorkspaceSelection.means(`
- each session records an explicit workspace root selection
- the chat UI lets the operator inspect and change that workspace root during a chat
- provider runs use the session-selected workspace root rather than a backend-global hard-coded cwd
- when the workspace root changes, Agent Chat queues a system instruction so the next provider turn is explicitly aware of the new working directory
`);

Ui.replyTargetReminder.means(`
- the operator may mark an in-progress human message as a reply to a specific earlier agent message
- this reminder is for UI and operator context first, not a strong provider-side thread edit primitive
- the reminder should be lightweight, easy to clear, and visible near the composer while typing
- the selected reply target does not need to be the latest agent message
`);

Ui.activityStatus.means(`
- the activity surface should sit directly above the composer rather than in a distant header
- it should show idle, queued, running, interrupted, or failed state
- when a run is active, it should show elapsed time and any honest provider-backed activity details the backend can supply
- provider-backed activity details must not be fabricated; absent data should stay absent rather than guessed
`);

Ui.queuedMessageList.means(`
- queued user messages are messages already accepted into canonical history but not yet seen by the provider
- queued messages render below activity status and above the composer
- directory-change system instructions should appear in the queued region until the provider consumes them
`);

Ui.composer.means(`
- unsent drafts are browser-local convenience state, not canonical chat history
- drafts should be keyed by session id in browser local storage and restored when the operator returns to that session
- drafts should survive local page reloads and temporary dashboard or chat-server restarts while the operator is still typing
- sending a message should clear that session's saved draft
- local draft persistence must not write durable app data to the server or to state/
- pasted clipboard images should appear as removable composer attachments before send
- sending should preserve pasted images as canonical image blocks alongside any typed text blocks
- composer paste support should handle normal text pastes without regressing textarea editing behavior
`);

Ui.sessionList.means(`
- the session list should show a condensed worker-state summary such as running, queued, waiting, interrupted, or background worker count when available
- the session list should show the selected process blueprint title or expectation title when a session has one
- unresolved watchdog attention should be visible in the list without overwhelming the primary worker-state summary
- the active-thread header should offer a compact current-session process blueprint quick-set control adjacent to the thread-scoped menu actions
- changing the assigned process blueprint should enqueue or append a system-visible expectation update for the active agent
- the main session list should stay visually compact so the active thread remains the primary focus
- the session list should group sessions by optional folders before falling back to an ungrouped collection
- the main list should exclude archived sessions by default
- a compact session-list search field should filter sessions by title, preview, provider, model, and cwd without leaving the session surface
- archived sessions should remain reachable through a hidden archived section opened from a menu instead of occupying the main list by default
- archive and restore actions should be available from session-list controls rather than requiring transcript edits
- the operator should be able to create folders and move sessions between folders from the session-list surface
- folders are for organization only and must not change session identity, ordering rules within a folder, or canonical history
- session-list controls may create a new chat because they operate on the chat collection rather than the active thread
- session-list controls should allow renaming the selected chat without routing that action through the active-thread composer menu
- renaming a chat should enqueue a lightweight agent-visible system note so the provider sees the new chat title before the next turn
`);

Ui.sessionFolderTree.means(`
- folders appear as compact session-list groupings rather than as a separate management screen
- empty folders may still render so the operator can organize before moving sessions
- unfiled sessions remain visible in a default top-level collection
- collapse and expand state may be browser-local convenience state while folder membership itself is canonical
`);

Ui.workerStatusSummary.means(`
- a session-list row should surface the most relevant worker state in one compact line
- examples include queued, running, waiting on approval, waiting on background workers, interrupted, or failed
- when richer worker details exist, the active session may show them more fully than the list row
- the backend should expose worker-state fields explicitly rather than forcing the UI to infer them from transcript text
`);

when(Chat.backend.enumerates("repository process blueprints"))
  .then(Chat.api.serves(Api.listProcessBlueprints))
  .and(Dashboard.screen.shows("a session-scoped process blueprint picker"));

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

Storage.workspaceRepoDurability.means(`
- canonical Agent Chat session files are not the last durability boundary
- the manager-host workspace repository is the disaster-recovery boundary for chat history
- the backend should hand off workspace durability work after canonical writes rather than executing git directly in the mutation handler
`);

when(Chat.backend.persists(Chat.session).or(Chat.backend.persists(Chat.message)))
  .then(Chat.backend.emits(Chat.persistenceSignal))
  .and(Manager.workspacePersistence.receives(Chat.persistenceSignal))
  .and(Manager.workspacePersistence.serializes("workspace git operations"))
  .and(Manager.workspacePersistence.batches("automatic persistence work"))
  .and(Manager.workspacePersistence.allows("operator-triggered immediate flush"));

Scope.lazyBackend.means(`
- the chat backend is not a permanent systemd service
- the dashboard gateway starts it on first chat API or WebSocket traffic
- the chat backend may be restarted by the gateway when unhealthy
`);

Scope.browserOwnsUi.means(`
- session list, transcript rendering, composer state, pending message state, reconnect state, and optimistic UI live in the browser feature
- the browser should not scrape terminal output
- the browser should consume structured chat events from the backend
- the active transcript is the visual priority on mobile, tablet, and desktop layouts
- create-session and session-settings controls should be collapsed behind bottom-of-composer menus when not actively being edited
- activity and queued-message state should stay anchored immediately above the composer so the operator can understand what the agent is doing before sending the next message
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

Storage.fileCanonical.means(`
- use durable structured files at a path such as /home/ec2-user/workspace/data/agent-chat
- store one session directory per chat session
- store folder metadata as canonical app data alongside session metadata rather than as browser-only local state
- store session metadata in JSON
- store canonical messages and run events in append-friendly JSONL files
- store provider kind, provider model, provider thread handle, and provider configuration references in canonical session metadata
- store provider auth-profile choice and optional image-model override in canonical session metadata
- store archived session status in canonical session metadata
- store session folder membership in canonical session metadata
- store structured worker-state summary fields when they are durable enough to help session-list recovery after reconnect or restart
- store canonical content blocks and cache hints instead of only flattened prompt strings
- treat the files as the source of truth
`);

Storage.inMemoryCache.means(`
- keep a rebuildable in-memory session index inside the backend process
- startup may rebuild that cache by scanning canonical session files
- cache invalidation complexity should stay minimal in V1
- no SQLite cache is required in V1
`);

Storage.runtimeState.means(`
- temporary runtime state for chat lives under /home/ec2-user/state/agent-chat
- backend logs live under /home/ec2-user/state/logs/agent-chat-server.log
- durable transcripts, sessions, and user content do not live under /home/ec2-user/state
- runtime source stays in the readonly runtime checkout
`);

Transport.http.means(`
- HTTP handles session list, create session, load session, rename session, archive or restore session state, and append user message
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
- the session may optionally belong to a folder used for session-list organization
- the session may also be marked archived while keeping its canonical identity
- the new-session form should allow an explicit optional title at creation time
- if the operator does not provide a title, the title is generated from the first user prompt
- the title can be renamed later
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
- V1 supports pasted clipboard images by storing them durably and serving them back to the transcript UI
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
  .and(Chat.backend.requires(Storage.fileCanonical))
  .and(Chat.backend.requires(Storage.inMemoryCache))
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

when(Ui.sessionList.organizes(Chat.session))
  .then(Chat.api.uses(Api.listFolders))
  .and(Chat.api.uses(Api.createFolder))
  .and(Chat.api.uses(Api.moveSession))
  .and(Chat.backend.preserves(Chat.folder));

when(Ui.composer.opens(Ui.composerSettingsMenu))
  .then(Ui.composerSettingsMenu.contains(Ui.providerPicker))
  .and(Ui.composerSettingsMenu.contains(Ui.workspacePicker))
  .and(Ui.composerSettingsMenu.contains("model and auth-profile controls"))
  .and(Dashboard.screen.keeps("the transcript as the dominant visual surface"));

when(Chat.run.is("active"))
  .then(Ui.activityStatus.shows("working state"))
  .and(Ui.activityStatus.shows("elapsed time"))
  .and(Ui.activityStatus.shows("background process count when the provider can report it"))
  .and(Ui.sessionList.shows("a condensed worker-state summary for each active session"))
  .and(Chat.backend.projects(Chat.workerState).into(Ui.workerStatusSummary));

when(Chat.session.has("queued messages not yet seen by the provider"))
  .then(Ui.queuedMessageList.shows("those queued messages"))
  .and(Ui.queuedMessageList.renders("between the activity status and the composer"));

when(Provider.codexAdapter.supports("real interrupt"))
  .then(Ui.composer.supports("Esc to interrupt the active run"));

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
