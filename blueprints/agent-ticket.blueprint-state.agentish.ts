/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentTicketBlueprintState = define.system("AgentTicketBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Agent Ticket blueprint",
});

const BlueprintStateSectionMap = define.document("BlueprintStateSectionMap");

const BlueprintStateSection = {
  currentReality: define.section("CurrentRealitySection"),
  currentFiles: define.section("CurrentFilesSection"),
  plannedFiles: define.section("PlannedFilesSection"),
};

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
  currentModelBindingInvariantExists: define.concept("CurrentModelActiveBindingInvariantExists"),
  ticketViewIsReadOnly: define.concept("TicketViewIsStillReadOnly"),
  missingTicketViewStepMutation: define.concept("MissingTicketViewStepMutation"),
  missingCrossSessionReassignment: define.concept("MissingCrossSessionReassignment"),
};

const CurrentFile = {
  subjectBlueprint: define.document("CurrentSubjectBlueprintFile"),
  subjectBlueprintState: define.document("CurrentSubjectBlueprintStateFile"),
  serverStore: define.document("CurrentTicketStoreFile"),
  serverRouteSurface: define.document("CurrentTicketRouteSurfaceFile"),
  serverBlueprintSupport: define.document("CurrentTicketBlueprintSupportFile"),
  serverSignalSupport: define.document("CurrentTicketSignalSupportFile"),
  serverTests: define.document("CurrentTicketStoreTestFile"),
  uiScreen: define.document("CurrentAgentChatScreenFile"),
  uiView: define.document("CurrentTicketViewFile"),
  uiTypes: define.document("CurrentTicketUiTypesFile"),
  uiRendering: define.document("CurrentTicketUiRenderingFile"),
  uiExports: define.document("CurrentTicketUiExportsFile"),
};

const PlannedFile = {
  serverRoutes: define.document("PlannedTicketRoutesFile"),
  serverMutations: define.document("PlannedTicketMutationsFile"),
  uiActions: define.document("PlannedTicketViewActionsFile"),
};

AgentTicketBlueprintState.contains(
  BlueprintStateSectionMap,
  BlueprintStateSection.currentReality,
  BlueprintStateSection.currentFiles,
  BlueprintStateSection.plannedFiles,
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
  CurrentReality.currentModelBindingInvariantExists,
  CurrentReality.ticketViewIsReadOnly,
  CurrentReality.missingTicketViewStepMutation,
  CurrentReality.missingCrossSessionReassignment,
  CurrentFile.subjectBlueprint,
  CurrentFile.subjectBlueprintState,
  CurrentFile.serverStore,
  CurrentFile.serverRouteSurface,
  CurrentFile.serverBlueprintSupport,
  CurrentFile.serverSignalSupport,
  CurrentFile.serverTests,
  CurrentFile.uiScreen,
  CurrentFile.uiView,
  CurrentFile.uiTypes,
  CurrentFile.uiRendering,
  CurrentFile.uiExports,
  PlannedFile.serverRoutes,
  PlannedFile.serverMutations,
  PlannedFile.uiActions,
);

BlueprintStateSectionMap.defines(`- CurrentReality
- CurrentFiles
- PlannedFiles`);

BlueprintStateSection.currentReality.precedes(BlueprintStateSection.currentFiles);
BlueprintStateSection.currentFiles.precedes(BlueprintStateSection.plannedFiles);

AgentTicketBlueprintState.defines(`
- CurrentImplementationStatus means Agent Ticket already exists as a durable workspace-scoped runtime ticket store with authoritative checklist projection, active-session binding, token-driven step transitions, blocked-state recovery, loopback reset, and ticket activation within an existing owning chat session.
- AssessmentConfidence is high for current store behavior and medium for ideal file-organization comparison because the comparison is grounded in direct source inspection of the ticket store, server routes, ticket-view UI surface, and regression tests, while some newly required file-split surfaces remain blueprint-only.
- ImplementationEvidence includes the concrete current files that implement or prove Agent Ticket behavior today.
- This blueprint-state compares current reality against the canonical Agent Ticket subject blueprint in blueprints/agent-ticket.agentish.ts.
- ImplementationGap means the current product surface does not yet expose direct ticket-view step check or uncheck mutations and does not yet expose moving an unfinished ticket to another existing or newly created chat session.
- KnownIssue means the current implementation still concentrates route handling in index.ts and keeps the ticket view read-only even though the ideal blueprint now requires dedicated mutation and action surfaces.
`);

BlueprintStateSection.currentReality.answers(
  "What is implemented today?",
  "How confident is that comparison?",
  "What evidence supports it?",
  "What gaps and known issues remain?",
);

CurrentReality.workspaceTicketStoreExists.means(`
- packages/agent-chat-server/src/agent-tickets.ts already owns the durable ticket record, pinned process snapshot reference, checklist status tree, currentStepId, nextStepId, nextStepLabel, status, resolution, blocked bookkeeping, and same-step attempt counting
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
- nested option-child loopback targets are covered in the store traversal and regression tests
`);

CurrentReality.currentSessionActivationExists.means(`
- POST /api/agent-chat/sessions/:sessionId/active-ticket already activates an unfinished ticket for that same existing session
- the server resets watchdog state and broadcasts the refreshed session snapshot after that activation
`);

CurrentReality.currentModelBindingInvariantExists.means(`
- current implementation already enforces one active ticket per chat session through the activeTicketBySessionId map and the session-scoped activation route
- current implementation already enforces one owning session per unfinished ticket in the existing model because activation requires ticket.sessionId equality with the destination session
- the missing behavior is not the current-model invariant itself; the missing behavior is cross-session reassignment and UI-surfaced mutation for changing that owning-session binding
`);

CurrentReality.ticketViewIsReadOnly.means(`
- packages/agent-chat-ui/src/TicketView.tsx currently renders ticket metadata, currentStepId, resolution, and checklist status only
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

when(CurrentReality.workspaceTicketStoreExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("AgentTicketStore as the authoritative runtime owner of ticket progress and binding state"));

when(CurrentReality.activeSessionBindingExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("current active-ticket binding as store-owned session focus state rather than as ticket lifecycle state"));

when(CurrentReality.tokenDrivenProgressionExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence));

when(CurrentReality.decisionLoopbackResetExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("downstream executable-step reset after loopback as implemented store behavior rather than blueprint intent only"));

when(CurrentReality.currentSessionActivationExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence));

when(CurrentReality.currentModelBindingInvariantExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("the one-to-one active-binding invariant as implemented for the current session-owned model"));

when(CurrentReality.ticketViewIsReadOnly.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue));

when(CurrentReality.missingTicketViewStepMutation.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue));

when(CurrentReality.missingCrossSessionReassignment.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue));

BlueprintStateSection.currentFiles.answers(
  "What current files are related to this subject?",
  "Which current files implement behavior directly?",
  "Which current files provide supporting evidence, tests, UI surfaces, API surfaces, or wiring?",
  "What current file hierarchy exists today?",
);

CurrentFile.subjectBlueprint.means(`
- blueprints/agent-ticket.agentish.ts
`);

CurrentFile.subjectBlueprintState.means(`
- blueprints/agent-ticket.blueprint-state.agentish.ts
`);

CurrentFile.serverStore.means(`
- packages/agent-chat-server/src/agent-tickets.ts
`);

CurrentFile.serverRouteSurface.means(`
- packages/agent-chat-server/src/index.ts
`);

CurrentFile.serverBlueprintSupport.means(`
- packages/agent-chat-server/src/process-blueprints.ts
`);

CurrentFile.serverSignalSupport.means(`
- packages/agent-chat-server/src/process-signals.ts
`);

CurrentFile.serverTests.means(`
- packages/agent-chat-server/src/agent-tickets.test.ts
`);

CurrentFile.uiScreen.means(`
- packages/agent-chat-ui/src/AgentChatScreen.tsx
`);

CurrentFile.uiView.means(`
- packages/agent-chat-ui/src/TicketView.tsx
`);

CurrentFile.uiTypes.means(`
- packages/agent-chat-ui/src/ticket-types.ts
`);

CurrentFile.uiRendering.means(`
- packages/agent-chat-ui/src/ticket-ui.tsx
`);

CurrentFile.uiExports.means(`
- packages/agent-chat-ui/src/index.ts
`);

when(BlueprintStateSection.currentFiles.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.subjectBlueprint))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.subjectBlueprintState))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverStore))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverRouteSurface))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverBlueprintSupport))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverSignalSupport))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverTests))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiScreen))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiView))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiTypes))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiRendering))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiExports));

BlueprintStateSection.plannedFiles.answers(
  "What new files should exist in the ideal implementation but do not exist yet?",
  "What directories should exist in the ideal implementation but do not exist yet?",
  "Which existing files still need modification to match the ideal file hierarchy?",
);

PlannedFile.serverRoutes.means(`
- packages/agent-chat-server/src/ticket-routes.ts should exist as the dedicated route surface for ticket-specific HTTP handlers that are currently concentrated in index.ts
`);

PlannedFile.serverMutations.means(`
- packages/agent-chat-server/src/ticket-mutations.ts should exist as the dedicated mutation surface for manual step reselection, downstream reset, same-session activation helpers, and future cross-session reassignment
`);

PlannedFile.uiActions.means(`
- packages/agent-chat-ui/src/TicketViewActions.tsx should exist as the dedicated ticket-view action surface for step check or uncheck controls and session-activation or reassignment controls
- existing files that still require modification to reach the ideal hierarchy include packages/agent-chat-server/src/index.ts, packages/agent-chat-server/src/agent-tickets.test.ts, packages/agent-chat-ui/src/AgentChatScreen.tsx, packages/agent-chat-ui/src/TicketView.tsx, and packages/agent-chat-ui/src/index.ts
`);

when(BlueprintStateSection.plannedFiles.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap))
  .and(BlueprintStateSection.plannedFiles.expects(PlannedFile.serverRoutes))
  .and(BlueprintStateSection.plannedFiles.expects(PlannedFile.serverMutations))
  .and(BlueprintStateSection.plannedFiles.expects(PlannedFile.uiActions));
