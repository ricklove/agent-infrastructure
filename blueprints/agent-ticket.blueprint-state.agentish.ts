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
  crossSessionReassignmentExists: define.concept("CrossSessionReassignmentExists"),
  operatorStepSelectionExists: define.concept("OperatorStepSelectionExists"),
  ticketViewActionSurfaceExists: define.concept("TicketViewActionSurfaceExists"),
  currentModelBindingInvariantExists: define.concept("CurrentModelActiveBindingInvariantExists"),
};

const CurrentFile = {
  subjectBlueprint: define.document("CurrentSubjectBlueprintFile"),
  subjectBlueprintState: define.document("CurrentSubjectBlueprintStateFile"),
  serverStore: define.document("CurrentTicketStoreFile"),
  serverRouteSurface: define.document("CurrentTicketRouteSurfaceFile"),
  serverRoutes: define.document("CurrentTicketRoutesFile"),
  serverMutations: define.document("CurrentTicketMutationsFile"),
  serverBlueprintSupport: define.document("CurrentTicketBlueprintSupportFile"),
  serverSignalSupport: define.document("CurrentTicketSignalSupportFile"),
  serverTests: define.document("CurrentTicketStoreTestFile"),
  uiScreen: define.document("CurrentAgentChatScreenFile"),
  uiView: define.document("CurrentTicketViewFile"),
  uiActions: define.document("CurrentTicketViewActionsFile"),
  uiTypes: define.document("CurrentTicketUiTypesFile"),
  uiRendering: define.document("CurrentTicketUiRenderingFile"),
  uiWindowHost: define.document("CurrentFloatingTicketWindowHostFile"),
};

const PlannedFile = {
  serverRouteCleanup: define.document("PlannedTicketRouteCleanupFile"),
  uiStateSyncHardening: define.document("PlannedTicketUiStateSyncHardeningFile"),
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
  CurrentReality.crossSessionReassignmentExists,
  CurrentReality.operatorStepSelectionExists,
  CurrentReality.ticketViewActionSurfaceExists,
  CurrentReality.currentModelBindingInvariantExists,
  CurrentFile.subjectBlueprint,
  CurrentFile.subjectBlueprintState,
  CurrentFile.serverStore,
  CurrentFile.serverRouteSurface,
  CurrentFile.serverRoutes,
  CurrentFile.serverMutations,
  CurrentFile.serverBlueprintSupport,
  CurrentFile.serverSignalSupport,
  CurrentFile.serverTests,
  CurrentFile.uiScreen,
  CurrentFile.uiView,
  CurrentFile.uiActions,
  CurrentFile.uiTypes,
  CurrentFile.uiRendering,
  CurrentFile.uiWindowHost,
  PlannedFile.serverRouteCleanup,
  PlannedFile.uiStateSyncHardening,
);

BlueprintStateSectionMap.defines(`- CurrentReality
- CurrentFiles
- PlannedFiles`);

BlueprintStateSection.currentReality.precedes(BlueprintStateSection.currentFiles);
BlueprintStateSection.currentFiles.precedes(BlueprintStateSection.plannedFiles);

AgentTicketBlueprintState.defines(`
- CurrentImplementationStatus means Agent Ticket now implements direct ticket-view step selection, downstream reset from the selected executable step, same-session activation, and moving an unfinished ticket to another existing or newly created chat session while preserving a single active-ticket binding per session.
- AssessmentConfidence is high because the comparison is grounded in direct source inspection of the store, server route and mutation modules, browser verification of the ticket window, and regression tests.
- ImplementationEvidence includes the concrete current files that implement or prove Agent Ticket behavior today.
- This blueprint-state compares current reality against the canonical Agent Ticket subject blueprint in blueprints/agent-ticket.agentish.ts.
- ImplementationGap means only the remaining cleanup work needed to match the ideal file organization for this subject; the requested ticket-view behavior is implemented.
- KnownIssue means route orchestration still terminates in index.ts even though the feature-level behavior is complete for the current scope.
`);

BlueprintStateSection.currentReality.answers(
  "What is implemented today?",
  "How confident is that comparison?",
  "What evidence supports it?",
  "What gaps and known issues remain?",
);

CurrentReality.workspaceTicketStoreExists.means(`
- packages/agent-chat-server/src/agent-tickets.ts owns the durable ticket record, pinned process snapshot reference, checklist status tree, currentStepId, nextStepId, nextStepLabel, status, resolution, blocked bookkeeping, and same-step attempt counting
- ticket runtime state lives in the store and server layer rather than in chat transcript state or in the process blueprint
- the implementation preserves the rule that changing active chat focus does not rewrite older tickets into a synthetic inactive lifecycle state
`);

CurrentReality.activeSessionBindingExists.means(`
- the store tracks one active ticket lookup per chat session through activeTicketBySessionId
- unfinished tickets can be activated within their owning session and can be detached from a prior session when reassigned
- the implementation distinguishes authoritative ticket ownership from chat-facing focus state
`);

CurrentReality.tokenDrivenProgressionExists.means(`
- assistant done and blocked tokens still drive current-step completion, blockage, resume, and ticket completion against the pinned process snapshot
- completeCurrentStep and resolveDecisionOption recompute currentStepId, nextStepId, and nextStepLabel from the checklist projection
`);

CurrentReality.decisionLoopbackResetExists.means(`
- decision goto loopback resets downstream executable steps back to pending rather than only rewinding currentStepId
- nested option-child loopback targets are covered in store traversal and regression tests
`);

CurrentReality.currentSessionActivationExists.means(`
- POST /api/agent-chat/sessions/:sessionId/active-ticket activates an unfinished ticket for a specific existing session
- the server resets watchdog state and broadcasts the refreshed session snapshot after activation
`);

CurrentReality.crossSessionReassignmentExists.means(`
- POST /api/agent-chat/tickets/:ticketId/reassign moves an unfinished ticket to another existing session or creates a new destination session when requested
- reassignment updates the ticket.sessionId owner, clears the previous session's active binding, and makes the ticket active in the destination session
- browser verification confirmed a real ticket moved into a new chat session and the previous session no longer held the active ticket
`);

CurrentReality.operatorStepSelectionExists.means(`
- POST /api/agent-chat/tickets/:ticketId/step-selection supports operator-driven selection of an executable step from the ticket view
- selecting a later executable step marks all prerequisite executable steps complete and advances currentStepId to the next step after the selected boundary
- clearing a previously completed executable step resets downstream executable steps and removes stale blocked state derived from later progress
`);

CurrentReality.ticketViewActionSurfaceExists.means(`
- packages/agent-chat-ui/src/TicketView.tsx renders the current ticket summary and delegates mutations to TicketViewActions
- packages/agent-chat-ui/src/TicketViewActions.tsx exposes Make Active In Owning Session, Move To Session, and Move To New Session controls
- packages/agent-chat-ui/src/ticket-ui.tsx renders executable step toggles as clickable controls in the ticket window
- browser verification confirmed the new action controls render and that step selection visibly updates the checklist state
`);

CurrentReality.currentModelBindingInvariantExists.means(`
- the implementation enforces that one ticket can be active for only one chat session at a time
- the implementation enforces that one chat session can have only one active ticket at a time
- reassignment preserves those invariants by clearing the prior session binding before activating the ticket in the destination session
`);

when(CurrentReality.workspaceTicketStoreExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(AgentTicketBlueprintState.treats("AgentTicketStore as the authoritative runtime owner of ticket progress and binding state"));

when(CurrentReality.activeSessionBindingExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.tokenDrivenProgressionExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence));

when(CurrentReality.decisionLoopbackResetExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence));

when(CurrentReality.currentSessionActivationExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence));

when(CurrentReality.crossSessionReassignmentExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.operatorStepSelectionExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.ticketViewActionSurfaceExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence));

when(CurrentReality.currentModelBindingInvariantExists.exists())
  .then(AgentTicketBlueprintState.records(Assessment.status, Assessment.evidence));

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
- this file still wires the ticket routes into the main server surface and broadcasts refreshed session snapshots after ticket mutations
`);

CurrentFile.serverRoutes.means(`
- packages/agent-chat-server/src/ticket-routes.ts
`);

CurrentFile.serverMutations.means(`
- packages/agent-chat-server/src/ticket-mutations.ts
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

CurrentFile.uiActions.means(`
- packages/agent-chat-ui/src/TicketViewActions.tsx
`);

CurrentFile.uiTypes.means(`
- packages/agent-chat-ui/src/ticket-types.ts
`);

CurrentFile.uiRendering.means(`
- packages/agent-chat-ui/src/ticket-ui.tsx
`);

CurrentFile.uiWindowHost.means(`
- packages/dashboard-ui/src/FloatingTicketWindows.tsx
`);

when(BlueprintStateSection.currentFiles.exists())
  .then(AgentTicketBlueprintState.records(Assessment.evidence))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.subjectBlueprint))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.subjectBlueprintState))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverStore))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverRouteSurface))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverRoutes))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverMutations))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverBlueprintSupport))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverSignalSupport))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.serverTests))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiScreen))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiView))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiActions))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiTypes))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiRendering))
  .and(BlueprintStateSection.currentFiles.expects(CurrentFile.uiWindowHost));

BlueprintStateSection.plannedFiles.answers(
  "What new files should exist in the ideal implementation but do not exist yet?",
  "What directories should exist in the ideal implementation but do not exist yet?",
  "Which existing files still need modification to match the ideal file hierarchy?",
);

PlannedFile.serverRouteCleanup.means(`
- no additional new server route file is required for this scope because packages/agent-chat-server/src/ticket-routes.ts already exists
- existing file cleanup may still move more ticket-specific request handling out of packages/agent-chat-server/src/index.ts over time so the index surface becomes thinner
`);

PlannedFile.uiStateSyncHardening.means(`
- no additional new UI action file is required for this scope because packages/agent-chat-ui/src/TicketViewActions.tsx already exists
- current session activation now follows ticket reassignment immediately in the chat UI, so no remaining implementation work is required for the requested ticket-view behavior; only optional future refactoring remains if shared session-navigation plumbing should be centralized
`);

when(BlueprintStateSection.plannedFiles.exists())
  .then(AgentTicketBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(BlueprintStateSection.plannedFiles.expects(PlannedFile.serverRouteCleanup))
  .and(BlueprintStateSection.plannedFiles.expects(PlannedFile.uiStateSyncHardening));
