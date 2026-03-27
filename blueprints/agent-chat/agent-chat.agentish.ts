/// <reference path="../_agentish.d.ts" />

// Agent Chat

const Agentish = define.language("Agentish");

const AgentChat = define.system("AgentChat", {
  format: Agentish,
  role: "Workspace-native conversation system for humans, agents, providers, and retained context",
});

const User = define.actor("WorkspaceOperator", {
  role: "Primary operator of workspace chat sessions",
});

const Agent = define.actor("WorkspaceAgent", {
  role: "Non-human participant acting through provider bindings",
});

const Workspace = {
  shell: define.workspace("DashboardWorkspace"),
  entity: define.entity("WorkspaceEntity"),
  board: define.workspace("GraphBoard"),
  layer: define.entity("GraphLayer"),
  document: define.document("WorkspaceDocument"),
  artifact: define.document("WorkspaceArtifact"),
  project: define.entity("WorkspaceProject"),
};

const Session = {
  conversation: define.workspace("WorkspaceChatSession"),
  transcript: define.document("CanonicalTranscript"),
  message: define.entity("ChatMessage"),
  turn: define.entity("ChatTurn"),
  participant: define.entity("SessionParticipant"),
  folder: define.entity("SessionFolder"),
  archive: define.concept("ArchivedSessionState"),
  processBlueprint: define.document("AssignedProcessBlueprint"),
  expectation: define.entity("SessionExpectation"),
  title: define.concept("SessionTitle"),
  summary: define.concept("SessionSummary"),
  import: define.entity("ImportedConversation"),
  source: define.entity("ImportedSource"),
  reference: define.entity("WorkspaceReference"),
  timeline: define.entity("SessionTimeline"),
};

const Participant = {
  human: define.entity("HumanParticipant"),
  agent: define.entity("AgentParticipant"),
  system: define.entity("SystemParticipant"),
};

const Provider = {
  adapter: define.system("ProviderAdapter"),
  binding: define.entity("ProviderBinding"),
  run: define.entity("ProviderRun"),
  event: define.entity("ProviderEvent"),
  approval: define.entity("ProviderApproval"),
  thread: define.entity("ProviderThread"),
  codex: define.system("CodexAppServer"),
  openrouter: define.system("OpenRouterApi"),
  claudeAgentSdk: define.system("ClaudeAgentSdk"),
  gemini: define.system("GeminiApi"),
  future: define.system("FutureProvider"),
};

const Context = {
  packet: define.document("HydrationContextPacket"),
  active: define.document("ActiveContextArtifact"),
  revision: define.entity("ContextRevision"),
  window: define.entity("RetainedContextWindow"),
  policy: define.entity("ContextPolicy"),
};

const Compaction = {
  strategy: define.entity("CompactionStrategy"),
  threshold: define.entity("CompactionThreshold"),
  native: define.entity("NativeCompaction"),
  agentish: define.entity("AgentishCompaction"),
  artifact: define.document("CompactionArtifact"),
  living: define.document("AgentishLivingContext"),
  event: define.entity("CompactionEvent"),
};

const Observability = {
  usage: define.entity("TokenUsage"),
  connection: define.entity("ProviderConnectionState"),
  status: define.entity("SessionStatus"),
  workerState: define.entity("WorkerState"),
  watchdogState: define.entity("IdleWatchdogState"),
  inspection: define.entity("ContextInspection"),
};

const AgentChatImplementationPlan = define.section("AgentChatImplementationPlanSection");

AgentChat.enforces(`
- AgentChat owns canonical conversation history.
- Provider state is replaceable, provider-owned, and never canonical.
- A workspace chat session is the primary object the user opens, names, resumes, inspects, imports into, and references.
- Session identity survives provider switching.
- Provider bindings may change without rewriting canonical session history.
- Provider-backed chat sessions must inherit the shared development-process blueprint so implementation work inside a chat follows the same blueprint-first workflow.
- A session may optionally select a process blueprint that defines its expectation contract and idle-watchdog behavior.
- Chat input must preserve first-class pasted image content rather than flattening clipboard images into text-only prompts.
- Chat may reference workspace entities.
- Workspace entities may reference chat.
- Agents may explore referenced workspace entities when needed.
- Imported conversations become canonical history after import normalization.
- Compaction is explicit session policy rather than hidden provider trivia.
- Native and Agentish compaction are both first-class strategies.
- Agentish compaction optimizes for decision retention, rationale retention, and active-state clarity over chronology.
- Provider files, provider thread storage, and provider transcript internals are implementation detail.
- When more than one human message is queued behind an active run, AgentChat should deliver that queued human batch into the next provider turn together rather than silently serializing them into many one-message follow-up turns.
- Session process changes should remain queued provider-facing instructions until the next explicit human-send turn consumes them, and that consumption should also become a canonical transcript event so history survives refresh.
- Changing the session process selector must not submit or otherwise flush the current human draft; the process change remains only a queued next-turn instruction until the operator later sends a real message.
- A queued process change that is still waiting for that next explicit human send must not by itself arm or trigger idle-watchdog prompting.
- When a session process reaches its completion condition, the next human send should require an explicit fresh process selection rather than silently reusing the completed process contract.
- Once a session process is active, it remains unresolved until the agent emits that process blueprint's exact done token or exact blocked token.
- Once a terminal process state is resolved by a fresh process selection or by new active non-terminal work, the transient Done or Blocked selector state should clear immediately.
- Expectation-aware watchdog behavior must treat operator-visible stalled turns as unresolved inactivity even when the provider transport still considers the turn open.
- If the provider explicitly reports itself idle while the session process is still unresolved, AgentChat should make the watchdog immediately eligible rather than waiting another full idle timeout window.
- If the provider explicitly reports an error, AgentChat should enter provider-error handling and retry policy rather than misclassifying that state as ordinary idle.
- Active human typing should suppress idle-watchdog prompting until typing stops and the short grace period expires.
- Composer typing should remain locally responsive and should not force the entire thread surface to re-render on every keystroke.
- Transient websocket disconnects should be retried automatically with backoff, and disconnect warning chrome should wait through a short grace period so brief reconnects do not flash noisy error banners.
- Provider reasoning checkpoints may be redacted or collapsed, but they should not disappear from the reloaded transcript if the provider runtime exposed them during the session.
- Provider quota exhaustion, token-budget exhaustion, and context-window exhaustion should surface as canonical transcript activity when the provider exposes those states, even when no assistant text is produced.
- Transcript markdown should render common operator-facing structures, including links, inline code, fenced code blocks, and markdown image references, as visible content rather than raw markdown syntax.
- Each canonical chat message should have a stable direct-link address that the operator can copy and later reopen to the same session and message anchor.
- Opening a direct-linked chat message should restore the owning session, scroll that message into view, and make the target message visually discoverable instead of dropping the operator at an unrelated point in the thread.
- Agent-authored generated images should be referenced as markdown image URLs that point at the approved temporary image space under ~/temp until the operator explicitly keeps them.
- Temporary image paths under ~/temp are acceptable transient transcript media and should render inline with a clear temporary indicator.
- Any markdown image reference that is neither a canonical chat attachment nor an approved temporary image path should render with a clear external-source warning indicator.
- Ordinary markdown links whose targets resolve to image media should remain visible as links but should also render the target image inline with the same provenance and Keep image behavior as explicit markdown image syntax.
- Non-attached transcript images should expose one immediate Keep image action that imports or copies that image into canonical chat attachments without a confirmation dialog.
- Keeping an image should promote it into canonical attachment storage for the current chat and update the rendered image reference so the transcript resolves through the durable attachment URL afterward.
- Agents must not write images directly into chat attachment storage or guess session attachment paths; attachment promotion is a system-owned capability rather than an agent filesystem convention.
- All surfaced agent activity must become canonical transcript history, including tool calls, sub-agent work, retries, waiting states, approvals, provider limit status, and future surfaced activity classes.
- Canonical system-injected history, assistant prose, and agent execution activity should remain visually distinguishable presentation classes even when they share the same transcript.
- When many adjacent low-signal activity items accumulate in the transcript, AgentChat may collapse that activity cluster by default as long as the underlying canonical history and ordering remain intact.
- When collapsed activity is expanded, the transcript should foreground the actual task identity or work item rather than generic lifecycle wording such as started or completed without context.
- Composer warning and activity-state affordances may use compact border-attached or floating treatments to preserve mobile space, but they must remain readable, tappable when interactive, and must not occlude message text or send controls.
- When a mobile-only session rail, drawer, or menu overlay is open, floating composer chrome and footer-attached controls must yield to that overlay instead of remaining visually or interactively above it.
`);

Workspace.shell.contains(
  Workspace.project,
  Workspace.entity,
  Workspace.board,
  Workspace.layer,
  Workspace.document,
  Workspace.artifact,
  Session.conversation,
);

Session.conversation.contains(
  Session.transcript,
  Session.message,
  Session.turn,
  Session.participant,
  Session.folder,
  Session.archive,
  Session.processBlueprint,
  Session.expectation,
  Session.title,
  Session.summary,
  Session.reference,
  Session.timeline,
  Provider.binding,
  Context.active,
  Context.revision,
  Context.policy,
  Compaction.strategy,
  Compaction.threshold,
  Compaction.event,
  Observability.usage,
  Observability.status,
  Observability.workerState,
  Observability.watchdogState,
);

Session.participant.contains(Participant.human, Participant.agent, Participant.system);
Participant.agent.contains(Provider.binding);
Provider.binding.contains(
  Provider.adapter,
  Provider.thread,
  Provider.run,
  Provider.event,
  Provider.approval,
);
Compaction.agentish.contains(Compaction.artifact, Compaction.living);
Context.active.contains(Context.packet, Context.window);
Observability.inspection.contains(Context.active, Context.revision, Compaction.event);

AgentChat.defines(`
- A workspace chat session is a workspace-owned conversational artifact, not a provider-owned thread.
- A canonical transcript is the durable event record for the session.
- A provider binding is an execution attachment between one participant and one provider runtime.
- A workspace reference is a durable pointer between a session and any workspace entity such as a board, layer, document, project, artifact, or run.
- A session folder is a workspace-owned grouping container used to organize sessions without changing their identity.
- Archived session state is a workspace-owned visibility flag that removes a session from the default list without deleting its identity or transcript.
- An assigned process blueprint is the optional machine-readable expectation contract selected for a session.
- Session expectation means the user-chosen workflow contract that defines what the agent is expected to complete for that session.
- A hydration context packet is the explicit context AgentChat chooses to provide to a provider binding at run time.
- An active context artifact is the retained context currently shaping future runs.
- A context revision identifies which retained artifact a provider binding was last hydrated from.
- Native compaction means provider-managed retention.
- Agentish compaction means app-managed retention into a structured Agentish artifact.
- Worker state is the inspectable provider-backed execution state that explains what the active agent workers are doing for a session.
- Idle watchdog state is the inspectable record of whether expectation-aware idle prompting has been armed, triggered, or resolved for the session.
- Token usage, compaction events, active context, provider binding state, worker state, idle watchdog state, and approvals are inspectable session data.
`);

Session.conversation.means(`
- one stable user-facing conversation
- one canonical transcript
- many future provider runs
- optional folder membership for session-list organization
- default workspace root /home/ec2-user/workspace unless the session explicitly chooses a narrower root
- zero obligation to mirror provider thread storage as source of truth
`);

Session.folder.means(`
- optional session-list grouping chosen by the workspace operator
- stable folder identity that may contain many sessions
- organization metadata owned by AgentChat rather than inferred from cwd, title, or provider
- intended for browsing, collapsing, and moving sessions without rewriting transcript history
`);

Session.archive.means(`
- workspace-owned archive status for a session
- archived sessions are removed from the default main session list
- archived sessions remain canonical, resumable, and searchable
- archive state does not delete transcript history, provider metadata, or session identity
`);

Session.processBlueprint.means(`
- optional session-scoped process blueprint assignment
- selected from the repository blueprint catalog rather than invented per run
- machine-readable expectation contract for the session
- may have an optional Agentish companion guide for agent reference
- when the previous process has completed, the process selector should enter a required unresolved state before the next send
- that unresolved state should be shown as Done styling or placeholder treatment rather than as a stored process value
- that unresolved state should remain distinct from the underlying real process choices so the operator can explicitly re-select the prior process as the next contract
`);

Session.expectation.means(`
- user-selected statement of what the agent should accomplish in the session
- derived from the assigned process blueprint rather than guessed from raw transcript text
- intended to drive idle watchdog prompts and session-list context
- when a new session is created with a process blueprint already selected, the initial expectation should be emitted immediately as a canonical waiting system entry so the operator can see the contract before the first user turn
- when expectation changes are queued for the next turn, the transcript should later show that consumed change as a real history event at the point it took effect
- when a completed expectation requires operator resolution, the next outgoing message should stay blocked until the operator chooses the next normal process selection
- expectation-aware watchdog handling belongs to the backend session runtime rather than to the browser connection and must continue even when no dashboard client is attached
`);

Observability.workerState.means(`
- active or recent worker status visible from the session list and active session view
- provider-backed state such as queued work, running work, waiting state, background worker count, and interruption state
- structured state that must not be reduced to an ambiguous generic status label when richer worker details exist
- compact enough for session-list display while still preserving a deeper inspectable form in the active session
- queued work should represent the full pending human batch for the next provider turn rather than implying one-message-at-a-time replay when many user messages are waiting
`);

Observability.watchdogState.means(`
- expectation-aware idle watchdog status visible from the session list and active session view when useful
- records whether the session is unresolved, nudged, completed by completion token, or still waiting
- should complement worker state rather than replace provider-backed activity details
- should treat a long-running turn with no meaningful visible progress as stalled enough to require watchdog attention instead of waiting forever for a provider-level turn completion event
- should survive backend restarts by re-arming unresolved idle sessions from canonical session state instead of forgetting the pending watchdog episode until a fresh chat request arrives
`);

Observability.usage.means(`
- latest provider-reported token-usage and context-window state for the active session when that provider exposes such telemetry
- should include enough structure to distinguish last-turn usage, accumulated usage, cached-input usage, reasoning-output usage when available, and the model context-window limit
- should be surfaced through session runtime state and UI rather than existing only as provider-internal adapter data
- should be presented as latest reported usage rather than as a false claim of timeless exactness when no active provider turn is running
- Codex-local session artifacts such as ~/.codex session logs may be used as an implementation source when they are the canonical place the provider runtime already emits token-count events
- provider usage telemetry belongs to inspectable session observability and should remain distinct from canonical transcript content unless the provider reaches an exhaustion or limit state significant enough to become transcript history
`);

AgentChatImplementationPlan.prescribes(`
- Provider adapters that already receive token-usage updates should preserve the latest structured usage payload on session runtime state instead of discarding it after completion handling.
- Session snapshot and websocket update surfaces should carry the latest provider-usage telemetry needed by the browser UI.
- The UI should expose current or latest-reported token usage in an inspectable session surface, such as the active-session header, settings menu, or another deliberate observability panel.
- Usage presentation should favor context used, context window, remaining window, and last-turn usage over raw unlabelled counters.
- When the active provider does not expose usage telemetry, the UI should make that absence explicit instead of showing misleading zero values.
`);

Provider.binding.means(`
- provider-specific execution attachment
- resumable when useful
- disposable when stale
- subordinate to the workspace session
- backend-owned enough that session watchdogs and process handling continue without a live dashboard websocket or browser tab
`);

Context.packet.means(`
- recent turns
- active retained context
- relevant workspace references
- current task framing
- pasted image inputs preserved as canonical image content when present
- explicit hydration chosen by AgentChat rather than guessed from provider storage
`);

when(User.sends("a pasted clipboard image").to(Session.conversation))
  .then(AgentChat.records(Session.message))
  .and(AgentChat.preserves("the image as canonical message content rather than a browser-only draft artifact"))
  .and(AgentChat.provides("structured image input to the selected provider binding when that binding supports image input"));

Compaction.native.means(`
- provider-managed retention
- lowest product complexity
- weakest inspectability of retained context
- acceptable when provider behavior is sufficient and opaque context is tolerated
`);

Compaction.agentish.means(`
- app-managed retained context
- structured Agentish living document
- inspectable decision state
- intended to keep long-lived sessions cheaper and more legible
`);

when(User.creates(Session.conversation))
  .then(AgentChat.creates(Session.transcript))
  .and(AgentChat.creates(Session.timeline))
  .and(AgentChat.assigns(Session.title))
  .and(AgentChat.assigns(Compaction.strategy))
  .and(AgentChat.assigns(Compaction.threshold))
  .and(AgentChat.prepares(Context.policy));

when(User.opens(Session.conversation))
  .then(AgentChat.loads(Session.transcript))
  .and(AgentChat.loads(Session.folder))
  .and(AgentChat.loads(Session.reference))
  .and(AgentChat.loads(Context.active))
  .and(AgentChat.shows(Observability.inspection));

when(User.renames(Session.conversation))
  .then(AgentChat.updates(Session.title))
  .and(AgentChat.preserves(Provider.binding))
  .and(AgentChat.preserves(Session.transcript));

when(User.archives(Session.conversation))
  .then(AgentChat.updates(Session.archive))
  .and(AgentChat.hides(Session.conversation).from("the default main session list"))
  .and(AgentChat.preserves(Session.transcript))
  .and(AgentChat.preserves(Provider.binding));

when(User.imports(Session.import))
  .then(AgentChat.normalizes(Session.import).into(Session.message))
  .and(AgentChat.records(Session.source))
  .and(AgentChat.extends(Session.transcript))
  .and(AgentChat.keeps("provider-specific import metadata as source annotation rather than canonical ownership"));

when(Session.conversation.references(Workspace.entity))
  .then(AgentChat.records(Session.reference))
  .and(AgentChat.allows(Agent).toExplore(Workspace.entity))
  .and(AgentChat.doesNotRequire("chat to own the referenced entity"));

when(Workspace.entity.references(Session.conversation))
  .then(AgentChat.records("a durable reverse reference"))
  .and(AgentChat.makes("related chats discoverable from the entity surface"));

when(User.adds(Participant.agent).to(Session.conversation))
  .then(AgentChat.creates(Provider.binding))
  .and(Provider.binding.belongsTo(Participant.agent))
  .and(AgentChat.makes("multi-agent participation part of one canonical session rather than many disconnected chats"));

when(User.switches("provider").for(Participant.agent))
  .then(AgentChat.retains(Session.conversation))
  .and(AgentChat.rebinds(Provider.binding))
  .and(AgentChat.neverTreats("the old provider thread as canonical history"));

when(Provider.binding.targets(Provider.codex))
  .then(Provider.binding.mayReuse(Provider.thread))
  .and(AgentChat.treats(Provider.thread).as("provider-owned black-box state"))
  .and(AgentChat.tracks(Context.revision));

when(Provider.binding.targets(Provider.openrouter))
  .then(AgentChat.treats(Provider.thread).as("optional provider-side metadata rather than canonical session ownership"))
  .and(AgentChat.dependsOn("canonical app-owned history for hydration and resume"))
  .and(AgentChat.tracks(Context.revision));

when(Provider.binding.targets(Provider.claudeAgentSdk))
  .then(Provider.binding.mayReuse(Provider.thread))
  .and(AgentChat.treats(Provider.thread).as("provider-owned execution state"))
  .and(AgentChat.tracks(Context.revision))
  .and(AgentChat.uses("Claude plan mode when the session process is Discuss or when no explicit process blueprint is selected"))
  .and(AgentChat.uses("Claude writable execution mode for blueprint-authoring or implementation-oriented processes"));

when(Provider.binding.targets(Provider.gemini))
  .then(AgentChat.treats(Provider.thread).as("optional provider-side metadata rather than canonical session ownership"))
  .and(AgentChat.dependsOn("canonical app-owned history for hydration and resume"))
  .and(AgentChat.tracks(Context.revision));

when(Provider.binding.targets(Provider.future))
  .then(AgentChat.reuses("the same canonical transcript and reference model"))
  .and(AgentChat.requires("only a new adapter and binding contract"));

when(AgentChat.hydrates(Provider.binding))
  .then(AgentChat.composes(Context.packet))
  .and(AgentChat.includes(Context.active))
  .and(AgentChat.includes("recent turns and relevant workspace references"))
  .and(AgentChat.records(Context.revision));

when(Provider.run.emits(Provider.event))
  .then(AgentChat.records(Provider.event))
  .and(AgentChat.projects("streaming output, tool activity, approvals, and run state into the session timeline"));

when(Provider.run.requires(Provider.approval))
  .then(AgentChat.surfaces(Provider.approval).to(User))
  .and(User.approves(Provider.approval).orRejects(Provider.approval));

when(Session.conversation.uses(Compaction.native))
  .then(AgentChat.records(Compaction.event))
  .and(AgentChat.observes(Observability.usage))
  .and(AgentChat.accepts("that retained provider context remains partly opaque"));

when(Session.conversation.uses(Compaction.agentish))
  .then(AgentChat.generates(Compaction.living))
  .and(AgentChat.writes(Compaction.artifact))
  .and(AgentChat.promotes(Compaction.artifact).to(Context.active))
  .and(AgentChat.optimizes("decision retention, rationale retention, and active-state clarity"));

when(Observability.usage.approaches(Compaction.threshold))
  .then(AgentChat.triggers(Compaction.event))
  .and(AgentChat.selects(Compaction.strategy))
  .and(AgentChat.records("which artifact became active next"));

when(User.inspects(Session.conversation))
  .then(AgentChat.shows(Observability.usage))
  .and(AgentChat.shows(Compaction.event))
  .and(AgentChat.shows(Context.active))
  .and(AgentChat.shows(Context.revision))
  .and(User.understands("what retained context is shaping the next run"));

when(User.copies("session status"))
  .then(AgentChat.includes("current dashboard version, provider readiness, and feature connection state"))
  .and(User.canShare("one compact diagnostic string"));

AgentChat.prescribes(`
- Keep provider state black-box and disposable.
- Keep canonical history, references, and compaction artifacts app-owned.
- Prefer generic workspace-reference semantics over board-specific special cases.
- Let one session host many participants and many provider runs.
- Treat hydration as explicit session orchestration instead of hidden provider reconstruction.
- Make compaction strategy visible policy and make active retained context inspectable.
- Optimize Agentish compaction for durable decisions, rationale, unresolved questions, and active next steps.
- Design imports as normalization into canonical history, not as long-term dependency on provider storage.
`);

AgentChat.contains(AgentChatImplementationPlan);

AgentChatImplementationPlan.defines(`
- Agent Chat ships as a real dashboard feature with a feature-owned backend, browser-owned UI state, gateway-proxied transport, and canonical app-owned persistence.
- The browser owns session list rendering, transcript rendering, composer state, reconnect behavior, queued-message visibility, waiting-state chrome, and provider-setting forms.
- The backend owns canonical transcript history, provider adapter orchestration, websocket fanout, retry policy, process-blueprint expectation handling, watchdog eligibility, and provider-state normalization into canonical activity.
- Canonical storage is file-backed durable app data outside state/, with in-memory caches treated as derived and disposable.
- Provider adapters are explicit runtime bindings for Codex, OpenRouter, Claude Agent SDK, Gemini, and future providers through one provider-agnostic boundary.
- Provider capability tracking includes multimodal input, image input, native context caching, native thread reuse, and qualified model catalogs.
- Session configuration owns provider selection, model selection, process-blueprint selection, and workspace-root selection without rewriting canonical session identity.
- Claude Agent SDK sessions use plan mode for Discuss or no explicit process blueprint, and writable execution mode for blueprint-authoring or implementation-oriented processes.
- Transport uses HTTP for mutation and query surfaces, websocket streaming for live session updates, and gateway proxying as the browser-facing boundary.
- The transcript surface keeps assistant prose, canonical system history, and execution activity visually distinct while preserving one canonical ordered history.
- Image paste is first-class canonical content, unsent drafts are preserved per session, and queued user messages batch into the next provider turn together.
`);

AgentChat.usesFiles(`
- blueprints/agent-chat/agent-chat.agentish.ts
- packages/agent-chat-ui/*
- packages/agent-chat-server/*
- packages/dashboard-ui/*
- packages/dashboard/*
- packages/agent-graph-ui/*
`);
