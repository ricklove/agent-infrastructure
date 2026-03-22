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
  inspection: define.entity("ContextInspection"),
};

AgentChat.enforces(`
- AgentChat owns canonical conversation history.
- Provider state is replaceable, provider-owned, and never canonical.
- A workspace chat session is the primary object the user opens, names, resumes, inspects, imports into, and references.
- Session identity survives provider switching.
- Provider bindings may change without rewriting canonical session history.
- Chat may reference workspace entities.
- Workspace entities may reference chat.
- Agents may explore referenced workspace entities when needed.
- Imported conversations become canonical history after import normalization.
- Compaction is explicit session policy rather than hidden provider trivia.
- Native and Agentish compaction are both first-class strategies.
- Agentish compaction optimizes for decision retention, rationale retention, and active-state clarity over chronology.
- Provider files, provider thread storage, and provider transcript internals are implementation detail.
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
- A hydration context packet is the explicit context AgentChat chooses to provide to a provider binding at run time.
- An active context artifact is the retained context currently shaping future runs.
- A context revision identifies which retained artifact a provider binding was last hydrated from.
- Native compaction means provider-managed retention.
- Agentish compaction means app-managed retention into a structured Agentish artifact.
- Token usage, compaction events, active context, provider binding state, and approvals are inspectable session data.
`);

Session.conversation.means(`
- one stable user-facing conversation
- one canonical transcript
- many future provider runs
- zero obligation to mirror provider thread storage as source of truth
`);

Provider.binding.means(`
- provider-specific execution attachment
- resumable when useful
- disposable when stale
- subordinate to the workspace session
`);

Context.packet.means(`
- recent turns
- active retained context
- relevant workspace references
- current task framing
- explicit hydration chosen by AgentChat rather than guessed from provider storage
`);

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
  .and(AgentChat.loads(Session.reference))
  .and(AgentChat.loads(Context.active))
  .and(AgentChat.shows(Observability.inspection));

when(User.renames(Session.conversation))
  .then(AgentChat.updates(Session.title))
  .and(AgentChat.preserves(Provider.binding))
  .and(AgentChat.preserves(Session.transcript));

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

AgentChat.usesFiles(`
- blueprints/agent-chat/agent-chat.agentish.ts
- packages/agent-chat-ui/*
- packages/agent-chat-server/*
- packages/dashboard-ui/*
- packages/dashboard/*
- packages/agent-graph-ui/*
`);
