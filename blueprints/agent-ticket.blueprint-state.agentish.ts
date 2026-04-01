/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentTicketBlueprintState = define.system("AgentTicketBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Agent Ticket blueprint",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  workspaceTicketStoreExists: define.concept("WorkspaceTicketStoreExists"),
  activeSessionBindingExists: define.concept("ActiveSessionBindingExists"),
  tokenDrivenProgressionExists: define.concept("TokenDrivenProgressionExists"),
  decisionLoopbackResetExists: define.concept("DecisionLoopbackResetExists"),
  currentSessionActivationExists: define.concept("CurrentSessionActivationExists"),
  ticketViewIsReadOnly: define.concept("TicketViewIsStillReadOnly"),
  missingTicketViewStepMutation: define.concept("MissingTicketViewStepMutation"),
  missingCrossSessionReassignment: define.concept("MissingCrossSessionReassignment"),
  currentModelBindingInvariantExists: define.concept("CurrentModelActiveBindingInvariantExists"),
};

AgentTicketBlueprintState.defines(`
- CurrentImplementationStatus means Agent Ticket already exists as a durable workspace-scoped runtime ticket store with authoritative checklist projection, active-session binding, token-driven step transitions, blocked-state recovery, and ticket activation within an existing owning chat session.
- AssessmentConfidence is medium-high because the comparison is grounded in direct source inspection of the ticket store, server routes, ticket-view UI surface, and the current regression tests, but some newly specified ticket-view mutation behavior is still blueprint-only rather than productized.
- ImplementationEvidence includes packages/agent-chat-server/src/agent-tickets.ts, packages/agent-chat-server/src/index.ts, packages/agent-chat-server/src/agent-tickets.test.ts, and packages/agent-chat-ui/src/TicketView.tsx.
- This blueprint-state compares current reality against the canonical Agent Ticket subject blueprint in blueprints/agent-ticket.agentish.ts.
- ImplementationGap means the current product surface does not yet expose direct ticket-view step check or uncheck mutations and does not yet expose moving an unfinished ticket to another existing or newly created chat session.
- KnownIssue means the blueprint now closes stronger ticket-view and cross-session mutation semantics than the current API and UI surface actually implement.
`);

AgentTicketBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.workspaceTicketStoreExists,
  CurrentReality.activeSessionBindingExists,
  CurrentReality.tokenDrivenProgressionExists,
  CurrentReality.decisionLoopbackResetExists,
  CurrentReality.currentSessionActivationExists,
  CurrentReality.ticketViewIsReadOnly,
  CurrentReality.missingTicketViewStepMutation,
  CurrentReality.missingCrossSessionReassignment,
  CurrentReality.currentModelBindingInvariantExists,
);

CurrentReality.workspaceTicketStoreExists.means(`
- AgentTicketStore already owns the durable ticket record, pinned process snapshot reference, checklist status tree, currentStepId, nextStepId, nextStepLabel, status, resolution, blocked bookkeeping, and same-step attempt counting
- ticket runtime state lives in the store and index rather than in chat transcript state or in the process blueprint
- current implementation already preserves the rule that changing active chat focus does not rewrite older tickets into a synthetic inactive lifecycle state
`);

CurrentReality.activeSessionBindingExists.means(`
- the store already tracks one active ticket lookup per chat session through activeTicketBySessionId
- unfinished tickets are activated within their existing owning session through activateTicketForSession
- the current implementation already distinguishes ticket ownership state from chat-facing focus state
`);

CurrentReality.tokenDrivenProgressionExists.means(`
- assistant done and blocked tokens already drive current-step completion, blockage, resume, and ticket completion against the pinned process snapshot
- completeCurrentStep and resolveDecisionOption already recompute currentStepId, nextStepId, and nextStepLabel from the checklist projection
`);

CurrentReality.decisionLoopbackResetExists.means(`
- decision goto loopback now resets downstream executable steps back to pending rather than only rewinding currentStepId
- nested option-child loopback targets are also covered in the store traversal and regression tests
`);

CurrentReality.currentSessionActivationExists.means(`
- POST /api/agent-chat/sessions/:sessionId/active-ticket already activates an unfinished ticket for that same existing session
- the server resets watchdog state and broadcasts the refreshed session snapshot after that activation
`);

CurrentReality.ticketViewIsReadOnly.means(`
- the current TicketView renders ticket metadata, currentStepId, resolution, and checklist status only
- the current UI surface does not yet expose direct controls for checking or unchecking steps or for reassigning a ticket to another session
`);

CurrentReality.missingTicketViewStepMutation.means(`
- the blueprint now requires manual check and uncheck from the ticket view, but there is no current API or store entrypoint dedicated to operator-driven step reselection from the UI
- current manual step-boundary reset behavior exists only indirectly through token-driven completion and decision goto logic
`);

CurrentReality.missingCrossSessionReassignment.means(`
- the blueprint now requires moving an unfinished ticket to another existing or newly created chat session and making it active there in one mutation
- current implementation does not expose a mutation that changes a ticket's authoritative sessionId to another session or provisions a new destination session for that move
`);

CurrentReality.currentModelBindingInvariantExists.means(`
- current implementation already enforces one active ticket per chat session through the activeTicketBySessionId map and the session-scoped activation route
- current implementation already enforces one owning session per unfinished ticket in the existing model because activation requires ticket.sessionId equality with the destination session
- the missing behavior is not the current-model invariant itself; the missing behavior is cross-session reassignment and UI-surfaced mutation for changing that owning-session binding
`);

when(CurrentReality.workspaceTicketStoreExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("AgentTicketStore as the authoritative runtime owner of ticket progress and binding state"));

when(CurrentReality.activeSessionBindingExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("current active-ticket binding as store-owned session focus state rather than as ticket lifecycle state"));

when(CurrentReality.tokenDrivenProgressionExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("token-driven step advancement and blockage as implemented behavior today"));

when(CurrentReality.decisionLoopbackResetExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("downstream executable-step reset after loopback as implemented store behavior rather than as blueprint intent only"));

when(CurrentReality.currentSessionActivationExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("same-session ticket activation as implemented API behavior"));

when(CurrentReality.ticketViewIsReadOnly.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(AgentTicketBlueprintState.treats("ticket-view step control and session reassignment as not yet surfaced in the UI"));

when(CurrentReality.missingTicketViewStepMutation.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(AgentTicketBlueprintState.treats("manual check and uncheck from the ticket view as still unimplemented product behavior"));

when(CurrentReality.missingCrossSessionReassignment.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(AgentTicketBlueprintState.treats("cross-session ticket move or new-session reassignment as still open against the blueprint"));

when(CurrentReality.currentModelBindingInvariantExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("the one-to-one active-binding invariant as implemented for the current session-owned model"));
