/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentTicket = define.system("AgentTicket", {
  format: Agentish,
  role: "Workspace-scoped runtime holder for one agent-process instance",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

AgentTicket.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

when(SubjectBlueprint.contains(Section.concept))
  .then(Section.concept.answers("why ticket runtime state exists, what is authoritative, why tickets are workspace-scoped, and why chat only surfaces ticket state instead of owning it"));

when(SubjectBlueprint.contains(Section.scenarios))
  .then(Section.scenarios.answers("how direct work, delegated work, orchestration, focused-ticket chat updates, manual ticket-view step reselection, session reassignment, and token-driven step or process transitions should behave"));

when(SubjectBlueprint.contains(Section.implementationPlan))
  .then(Section.implementationPlan.answers("where checklist state, next-step projection, manual step-reset mutation responsibility, session reassignment, references, and canonical system events live"));

when(SubjectBlueprint.contains(Section.contracts))
  .then(Section.contracts.answers("exact ticket record fields, process-state fields, active-session binding fields, reference fields, mutation fields, and system-event fields"));

const Artifact = {
  ticket: define.document("AgentTicketRecord"),
  title: define.document("AgentTicketTitle"),
  description: define.document("AgentTicketDescription"),
  processState: define.document("AgentTicketProcessState"),
  snapshot: define.document("AgentProcessSnapshot"),
  chatSession: define.document("AgentChatSessionBinding"),
  reference: define.entity("AgentTicketReference"),
  referenceRange: define.entity("AgentReferenceRange"),
  store: define.workspace("AgentTicketStore"),
  checklist: define.document("AgentTicketChecklistState"),
  systemEvent: define.document("AgentTicketSystemEvent"),
  mutation: define.entity("AgentTicketMutation"),
  ticketView: define.document("TicketViewSurface"),
  index: define.document("AgentTicketStoreIndex"),
};

const Actor = {
  operator: define.actor("WorkspaceOperator"),
  chatAgent: define.actor("ChatAgent"),
  orchestrator: define.actor("OrchestratorAgent"),
  worker: define.actor("WorkerAgent"),
};

const State = {
  ticketId: define.document("AgentTicketId"),
  status: define.document("AgentTicketStatus"),
  currentStepId: define.document("AgentTicketCurrentStepId"),
  nextStepId: define.document("AgentTicketNextStepId"),
  nextStepLabel: define.document("AgentTicketNextStepLabel"),
  activeSessionId: define.document("AgentTicketActiveSessionId"),
  completedSteps: define.document("AgentTicketCompletedSteps"),
  blockedSteps: define.document("AgentTicketBlockedSteps"),
  executionMode: define.document("AgentTicketExecutionMode"),
  resolution: define.document("AgentTicketResolution"),
};

const ReferenceContract = {
  targetType: define.document("AgentTicketReferenceTargetType"),
  targetId: define.document("AgentTicketReferenceTargetId"),
  relation: define.document("AgentTicketReferenceRelation"),
  rangeStart: define.document("AgentTicketReferenceRangeStart"),
  rangeEnd: define.document("AgentTicketReferenceRangeEnd"),
};

const EventContract = {
  eventType: define.document("AgentTicketSystemEventType"),
  eventStatus: define.document("AgentTicketSystemEventStatus"),
  eventStepId: define.document("AgentTicketSystemEventStepId"),
  eventStepLabel: define.document("AgentTicketSystemEventStepLabel"),
  matchedToken: define.document("AgentTicketSystemEventMatchedToken"),
  resolution: define.document("AgentTicketSystemEventResolution"),
  emissionCause: define.document("AgentTicketSystemEventEmissionCause"),
};

const MutationContract = {
  mutationType: define.document("AgentTicketMutationType"),
  mutationReason: define.document("AgentTicketMutationReason"),
  targetStepId: define.document("AgentTicketMutationTargetStepId"),
  targetCheckedState: define.document("AgentTicketMutationTargetCheckedState"),
  targetSessionId: define.document("AgentTicketMutationTargetSessionId"),
  createSession: define.document("AgentTicketMutationCreatesSession"),
};

const Policy = {
  workspaceScoped: define.concept("WorkspaceScopedTicket"),
  stateAuthoritative: define.concept("TicketOwnsProcessState"),
  minimalCore: define.concept("MinimalTicketCore"),
  generalReferenceGraph: define.concept("GeneralReferenceGraph"),
  directOrDelegated: define.concept("DirectOrDelegatedExecution"),
};

AgentTicket.enforces(`
- An agent ticket is the authoritative holder of live process state for one runtime process instance.
- An agent ticket is not a backlog card, kanban card, or Jira-style planning object by default.
- The minimal ticket core is title, unit-of-work description, pinned process snapshot, live process state, and references.
- A newly created ticket may begin with provisional process-derived title and description until the first provider turn specializes it.
- The first provider turn for a newly created ticket may specialize the active ticket with ticketTitle: and ticketSummary: metadata while preserving the pinned process title separately as processTitle.
- Ticket process state should be primarily representable as a nested checklist whose short status collapses to the next actionable item.
- The ticket description should summarize the current unit of work without duplicating full blueprint doctrine or raw transcript history.
- Ticket references should remain general rather than chat-only so the same ticket can anchor chats, files, blueprints, repos, branches, releases, deployments, or other tickets.
- Whenever the focused ticket changes state, the system should surface that change as a canonical chat system event.
- Step completion, step blockage, process completion, and process blockage may use exact tokens when the selected process definition requires them.
- The ticket system should allow the agent to complete only the single current next step derived from the pinned process snapshot.
- The ticket system should allow the workspace operator to manually check or uncheck one executable step from the ticket view when the pinned process snapshot exists.
- Checking an executable step from the ticket view should make that step satisfied and should make the next executable step after it the current active step when one exists.
- Unchecking an executable step from the ticket view should make that step the current active step.
- Manual ticket-view step selection should clear completed or blocked state for the selected step and for every executable step after it.
- Manual ticket-view step selection should not preserve stale downstream resolution, blocked markers, or next-step projection after the selected boundary changes.
- The ticket should record whether the current step is blocked and whether that blocked state was produced by the agent or by the system runtime.
- The ticket should track a consecutive same-step attempt counter for the current actionable step when the runtime is automatically resuming or nudging that same step.
- A system-owned blocked state should be entered when the current step fails to advance after three consecutive same-step attempts.
- A user comment that resumes the still-active blocked ticket should clear that blocked marker and reset the current step's consecutive same-step attempt counter to zero.
- Making a different ticket active in the chat should not rewrite the older ticket into a synthetic inactive lifecycle state; it should only change which ticket the chat currently points at.
- The operator should be able to make any unfinished ticket the active ticket for its current chat session from the ticket view.
- The operator should be able to move an unfinished ticket from its current chat session to another existing chat session or to a newly created chat session and make it active there in one mutation.
- A ticket may be active for only one chat session at a time.
- A chat session may have only one active ticket at a time.
- Moving a ticket to a different chat session should update the ticket's authoritative session binding and the active-ticket mapping together so the ticket is active in exactly one owning session after the move.
- A chat-facing agent may execute a ticket directly from the active chat context or may delegate bounded work while keeping the same ticket as the authoritative process record.
- A complex ticket may be orchestrated by one supervising agent coordinating several workers against the same authoritative ticket state.
- Tickets live in workspace state rather than inside one project repository because ticket state may span several repositories, branches, deployments, and workspace artifacts.
`);

AgentTicket.defines(`
- AgentTicketRecord means the durable workspace record for one process instance.
- AgentTicketStoreIndex means the store-owned lookup and addressing layer for ticket records.
- AgentTicketProcessState means the mutable runtime state including current status, current step, next step, completed steps, blocked steps, execution mode, and terminal resolution.
- AgentTicketBlockedSource means whether the current blocked state came from an explicit agent block or from a system-owned repeated-non-progress rule.
- SameStepAttemptCounter means the consecutive runtime-owned attempt count for the current actionable step while that step remains unchanged.
- AgentTicketChecklistState means the stateful nested checklist projection of the pinned process outline for one ticket.
- AgentChatSessionBinding means the owning chat-session identity and active-ticket binding for one ticket at the current moment.
- ActiveTicketSessionBinding means the one-to-one active relationship between one unfinished ticket and one chat session at a time.
- AgentTicketSystemEvent means the canonical transcript-visible system event emitted when the focused ticket changes state.
- AgentTicketReference means one typed durable pointer from a ticket to another relevant workspace object.
- AgentReferenceRange means a bounded span inside a referenced object such as a chat-message range.
- TicketViewSurface means the operator-facing UI surface that may request ticket mutations but does not own ticket process state.
- ManualStepSelection means an operator mutation that chooses one executable checklist step boundary and recomputes current step and downstream pending state from that boundary.
- TicketSessionReassignment means a mutation that moves one unfinished ticket to a selected existing or newly created chat session and makes it active there.
- WorkspaceScopedTicket means the ticket belongs to the shared workspace rather than to a single repository checkout.
- TicketOwnsProcessState means live runtime progress belongs to the ticket rather than to the process definition or transcript.
- MinimalTicketCore means the ticket stays minimal instead of accreting generic issue-tracker metadata.
- GeneralReferenceGraph means a ticket may reference several workspace object kinds through one common reference contract.
- DirectOrDelegatedExecution means the same ticket may be worked inline by the chat agent or through delegated workers.
`);

Artifact.store.contains(Artifact.ticket);
Artifact.store.contains(Artifact.index);
Artifact.ticket.contains(
  Artifact.title,
  Artifact.description,
  Artifact.snapshot,
  Artifact.chatSession,
  Artifact.processState,
  Artifact.checklist,
  Artifact.reference,
  Artifact.systemEvent,
  Artifact.mutation,
  Policy.workspaceScoped,
  Policy.stateAuthoritative,
  Policy.minimalCore,
  Policy.generalReferenceGraph,
  Policy.directOrDelegated,
);

Artifact.processState.contains(
  State.ticketId,
  State.status,
  State.currentStepId,
  State.nextStepId,
  State.nextStepLabel,
  State.activeSessionId,
  State.completedSteps,
  State.blockedSteps,
  State.executionMode,
  State.resolution,
);

Artifact.reference.contains(
  ReferenceContract.targetType,
  ReferenceContract.targetId,
  ReferenceContract.relation,
  Artifact.referenceRange,
);

Artifact.referenceRange.contains(
  ReferenceContract.rangeStart,
  ReferenceContract.rangeEnd,
);

Artifact.systemEvent.contains(
  EventContract.eventType,
  EventContract.eventStatus,
  EventContract.eventStepId,
  EventContract.eventStepLabel,
  EventContract.matchedToken,
  EventContract.resolution,
  EventContract.emissionCause,
);

Artifact.mutation.contains(
  MutationContract.mutationType,
  MutationContract.mutationReason,
  MutationContract.targetStepId,
  MutationContract.targetCheckedState,
  MutationContract.targetSessionId,
  MutationContract.createSession,
);

when(Artifact.ticket.exists())
  .then(AgentTicket.requires(Policy.workspaceScoped))
  .and(AgentTicket.requires(Policy.stateAuthoritative))
  .and(AgentTicket.requires(Policy.minimalCore))
  .and(AgentTicket.requires(Policy.generalReferenceGraph));

when(Artifact.store.exists())
  .then(Artifact.store.expects(Artifact.index))
  .and(Artifact.store.expects("one durable ticket record per ticket id"))
  .and(Artifact.store.expects("addressable lookup by ticket id"))
  .and(Artifact.store.expects("active-ticket lookup by chat-session id"))
  .and(Artifact.store.preserves("at most one active ticket id per chat session id"))
  .and(Artifact.store.preserves("at most one active chat session id per unfinished ticket id"))
  .and(Artifact.store.expects("separate durable storage for pinned process snapshot, mutable process state, and emitted system-event history"));

when(Artifact.ticket.exists())
  .then(Artifact.ticket.expects(Artifact.chatSession))
  .and(Artifact.chatSession.expects(State.activeSessionId))
  .and(Artifact.chatSession.preserves("one active session binding for the ticket at a time"));

when(Artifact.ticket.references("a chat message target"))
  .then(Artifact.reference.allows(Artifact.referenceRange))
  .and(Artifact.reference.expects(ReferenceContract.relation));

when(Actor.operator.uses(Artifact.ticketView))
  .then(Artifact.ticketView.reads(Artifact.ticket))
  .and(Artifact.ticketView.requests(Artifact.mutation))
  .and(Artifact.ticketView.forbids("direct ownership of ticket process state"));

when(Actor.chatAgent.worksOn(Artifact.ticket))
  .then(Artifact.processState.expects(State.executionMode))
  .and(Artifact.processState.preserves("one active authoritative current step"))
  .and(Artifact.processState.expects(State.nextStepId))
  .and(Artifact.processState.expects(State.nextStepLabel))
  .and(AgentTicket.requires(Policy.directOrDelegated));

when(Actor.orchestrator.manages(Artifact.ticket))
  .then(Actor.worker.follows(Artifact.ticket))
  .and(Artifact.processState.preserves("one authoritative current process state despite several active workers"));

when(Artifact.ticket.uses(Artifact.snapshot))
  .then(Artifact.processState.expects(State.ticketId))
  .and(Artifact.processState.expects(State.currentStepId))
  .and(Artifact.processState.expects(State.nextStepId))
  .and(Artifact.processState.expects(State.status))
  .and(Artifact.ticket.expects(Artifact.checklist));

when(Artifact.mutation.changes(Artifact.processState))
  .then(Artifact.mutation.requires(MutationContract.mutationType))
  .and(Artifact.mutation.requires(MutationContract.mutationReason))
  .and(Artifact.ticket.emits(Artifact.systemEvent))
  .and(Artifact.systemEvent.describes(EventContract.emissionCause));

when(Artifact.mutation.uses("manual step selection from the ticket view"))
  .then(Artifact.mutation.requires(MutationContract.targetStepId))
  .and(Artifact.mutation.requires(MutationContract.targetCheckedState))
  .and(Artifact.mutation.requires("recomputation of currentStepId, nextStepId, nextStepLabel, completedSteps, blockedSteps, and same-step attempt state from the selected boundary"))
  .and(Artifact.mutation.forbids("preserving stale downstream completed or blocked state after the selected step"));

when(Artifact.mutation.uses("ticket session reassignment"))
  .then(Artifact.mutation.allows(MutationContract.targetSessionId))
  .and(Artifact.mutation.allows(MutationContract.createSession))
  .and(Artifact.mutation.requires("atomic update of the ticket session binding and the active-ticket mapping"))
  .and(Artifact.mutation.requires("removal of any older active-session binding for the same ticket before the new binding is committed"))
  .and(Artifact.mutation.requires("replacement of any older active-ticket binding in the destination session"))
  .and(Artifact.mutation.forbids("leaving the moved ticket active in the old and new sessions at the same time"));

when(Artifact.ticket.uses(Artifact.snapshot))
  .then(Artifact.processState.treats(State.nextStepId).as("derived from the pinned snapshot step graph"))
  .and(Artifact.processState.treats(State.currentStepId).as("one active step chosen from the pinned snapshot"))
  .and(Artifact.processState.treats(EventContract.matchedToken).as("valid only when it matches the pinned snapshot token contract"));

when(Artifact.mutation.changes(Artifact.processState))
  .then(Artifact.mutation.requires("validation against the pinned snapshot step ids, transitions, and terminal-token contract"))
  .and(Artifact.mutation.forbids("completing a step other than the current next step"))
  .and(Artifact.mutation.forbids("skipping required intermediate steps"));

when(Artifact.mutation.uses("manual step selection from the ticket view"))
  .then(Artifact.mutation.allows("operator-directed step reselection that overrides the current next step"))
  .and(Artifact.mutation.requires("validation that the selected step is an executable step in the pinned snapshot"))
  .and(Artifact.mutation.requires("clearing downstream executable steps back to pending state"));

when(Artifact.ticket.emits(Artifact.systemEvent))
  .then(Artifact.systemEvent.describes(State.status))
  .and(Artifact.systemEvent.describes(State.activeSessionId))
  .and(Artifact.systemEvent.describes(State.nextStepId))
  .and(Artifact.systemEvent.describes(State.nextStepLabel))
  .and(Artifact.systemEvent.describes(EventContract.matchedToken))
  .and(Artifact.systemEvent.describes(State.resolution))
  .and(Artifact.systemEvent.treats(EventContract.emissionCause).as("the canonical reason this one event was emitted for the validated ticket mutation"));
