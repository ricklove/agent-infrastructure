/// <reference path="../_agentish.d.ts" />

// Agent Chat

const Agentish = define.language("Agentish");

const AgentChat = define.system("AgentChat", {
  format: Agentish,
  role: "Workspace-native chat system for agents, sessions, providers, and context compaction",
});

const User = define.actor("WorkspaceOperator", {
  role: "Primary user of workspace chat sessions",
});

const Workspace = {
  shell: define.workspace("DashboardWorkspace"),
  entity: define.entity("WorkspaceEntity"),
  artifact: define.document("WorkspaceArtifact"),
};

const Chat = {
  session: define.workspace("ChatSession"),
  message: define.entity("ChatMessage"),
  participant: define.entity("ChatParticipant"),
  agent: define.entity("AgentParticipant"),
  userParticipant: define.entity("UserParticipant"),
  systemParticipant: define.entity("SystemParticipant"),
  transcript: define.document("CanonicalTranscript"),
  title: define.concept("SessionTitle"),
  summary: define.concept("SessionSummary"),
  import: define.entity("ImportedConversation"),
  source: define.entity("ConversationSource"),
  reference: define.entity("WorkspaceEntityReference"),
};

const Provider = {
  adapter: define.system("ProviderAdapter"),
  binding: define.entity("ProviderBinding"),
  codex: define.system("CodexAppServer"),
  thread: define.entity("CodexThread"),
  run: define.entity("ProviderRun"),
  event: define.entity("ProviderEvent"),
  approval: define.entity("ProviderApproval"),
};

const Compaction = {
  mode: define.entity("CompactionMode"),
  threshold: define.entity("CompactionThreshold"),
  native: define.entity("NativeCompactionMode"),
  agentish: define.entity("AgentishCompactionMode"),
  artifact: define.document("CompactionArtifact"),
  livingContext: define.document("AgentishLivingContext"),
  event: define.entity("CompactionEvent"),
};

const Observability = {
  usage: define.entity("TokenUsage"),
  contextRevision: define.entity("ContextRevision"),
  activeContext: define.entity("ActiveContextArtifact"),
};

AgentChat.enforces(`
- Agent-chat owns canonical session history.
- Provider runtimes are black boxes behind bindings and adapters.
- A workspace chat session is the primary unit the user opens, names, resumes, and inspects.
- A provider binding is replaceable without changing session identity.
- Chat sessions may reference workspace entities.
- Workspace entities may reference chat sessions.
- Agents may explore referenced workspace entities when needed.
- Imported conversations become canonical chat history after import.
- Compaction is an explicit session policy.
- Native compaction and Agentish compaction are both supported modes.
- Decision retention matters more than transcript chronology when Agentish compaction is selected.
`);

Chat.session.contains(
  Chat.message,
  Chat.participant,
  Chat.transcript,
  Chat.title,
  Chat.summary,
  Chat.reference,
  Provider.binding,
  Compaction.mode,
  Compaction.threshold,
  Observability.usage,
  Observability.contextRevision,
);

Chat.participant.contains(Chat.agent, Chat.userParticipant, Chat.systemParticipant);
Provider.binding.contains(Provider.adapter, Provider.run, Provider.event, Provider.approval);
Compaction.agentish.contains(Compaction.artifact, Compaction.livingContext);
Workspace.shell.contains(Workspace.entity, Workspace.artifact, Chat.session);

AgentChat.defines(`
- A chat session is a workspace-owned conversation container rather than a provider-owned thread.
- A canonical transcript is the durable source of truth for session history.
- A provider binding connects one session or participant to one provider runtime without making the provider runtime authoritative.
- A workspace entity reference is a durable pointer between chat and another workspace object such as a board, layer, document, project, run, or artifact.
- An imported conversation is normalized into the canonical transcript instead of remaining provider-owned history.
- Native compaction delegates retained context to the provider.
- Agentish compaction rewrites retained context into a structured Agentish artifact that becomes the primary living context for subsequent turns.
- A context revision identifies which retained artifact a provider binding was last hydrated from.
- Token usage and compaction events are observable session data, not hidden implementation trivia.
`);

Compaction.native.means(`
- provider-managed compaction
- minimal product complexity
- lowest observability of retained context contents
`);

Compaction.agentish.means(`
- app-managed compaction into Agentish
- explicit retained context artifact
- stronger decision retention and context inspectability
- intended to reduce long-run context cost across many future turns
`);

when(User.creates(Chat.session))
  .then(AgentChat.creates(Chat.transcript))
  .and(AgentChat.assigns(Compaction.mode))
  .and(AgentChat.assigns(Compaction.threshold))
  .and(AgentChat.prepares("a provider binding when the first agent run begins"));

when(User.opens(Chat.session))
  .then(AgentChat.loads(Chat.transcript))
  .and(AgentChat.shows(Chat.participant))
  .and(AgentChat.shows(Chat.reference))
  .and(AgentChat.shows(Observability.activeContext));

when(User.renames(Chat.session))
  .then(AgentChat.updates(Chat.title))
  .and(AgentChat.persists("session identity without changing provider bindings"));

when(User.imports(Chat.import))
  .then(AgentChat.normalizes(Chat.import).into(Chat.message))
  .and(AgentChat.records(Chat.source))
  .and(AgentChat.extends(Chat.transcript));

when(Chat.session.references(Workspace.entity))
  .then(AgentChat.records(Chat.reference))
  .and(AgentChat.allows(Chat.agent).toExplore(Workspace.entity))
  .and(AgentChat.doesNotRequire("chat to own the referenced entity"));

when(Workspace.entity.references(Chat.session))
  .then(AgentChat.records("a reverse durable reference"))
  .and(AgentChat.makes("related chats discoverable from the entity"));

when(User.adds(Chat.agent).to(Chat.session))
  .then(AgentChat.creates(Provider.binding))
  .and(Provider.binding.belongsTo(Chat.agent))
  .and(AgentChat.makes("multi-agent participation part of one canonical session"));

when(User.switches("provider").for(Chat.agent))
  .then(AgentChat.retains(Chat.session))
  .and(AgentChat.rebinds(Provider.binding))
  .and(AgentChat.neverTreats("the old provider thread as canonical session history"));

when(Provider.binding.targets(Provider.codex))
  .then(Provider.binding.mayReuse(Provider.thread))
  .and(AgentChat.treats(Provider.thread).as("provider-owned black-box state"))
  .and(AgentChat.tracks(Observability.contextRevision));

when(Provider.run.emits(Provider.event))
  .then(AgentChat.records(Provider.event))
  .and(AgentChat.projects("tool activity, approvals, streaming output, and run status into the session timeline"));

when(Provider.run.requires(Provider.approval))
  .then(AgentChat.surfaces(Provider.approval).to(User))
  .and(User.approves(Provider.approval).orRejects(Provider.approval));

when(Chat.session.uses(Compaction.native))
  .then(AgentChat.records(Compaction.event))
  .and(AgentChat.mayObserve(Observability.usage))
  .and(AgentChat.accepts("that retained provider context remains partly opaque"));

when(Chat.session.uses(Compaction.agentish))
  .then(AgentChat.generates(Compaction.livingContext))
  .and(AgentChat.writes(Compaction.artifact))
  .and(AgentChat.promotes(Compaction.artifact).to(Observability.activeContext))
  .and(AgentChat.optimizes("decision retention over chronology"));

when(Observability.usage.approaches(Compaction.threshold))
  .then(AgentChat.triggers(Compaction.event))
  .and(AgentChat.chooses(Compaction.mode))
  .and(AgentChat.records("which retained artifact became active next"));

when(AgentChat.hydrates(Provider.binding))
  .then(AgentChat.includes(Observability.activeContext))
  .and(AgentChat.includes("recent turns and relevant workspace references"))
  .and(AgentChat.records(Observability.contextRevision));

when(User.inspects(Chat.session))
  .then(AgentChat.shows(Observability.usage))
  .and(AgentChat.shows(Compaction.event))
  .and(AgentChat.shows(Observability.activeContext))
  .and(User.understands("what retained context is currently shaping the next run"));

AgentChat.prescribes(`
- Treat provider storage and provider thread files as implementation detail.
- Keep canonical session history in app-owned data.
- Prefer explicit workspace-entity references over hardwired board-only or layer-only coupling.
- Let sessions remain stable while provider bindings change.
- Make compaction mode and threshold visible session policy.
- Optimize Agentish compaction for decision retention, rationale retention, and active-state clarity.
`);

AgentChat.usesFiles(`
- blueprints/agent-chat/agent-chat.agentish.ts
- packages/agent-chat-ui/*
- packages/agent-chat-server/*
- packages/dashboard-app/*
- packages/agent-graph-ui/*
- packages/dashboard/*
`);
