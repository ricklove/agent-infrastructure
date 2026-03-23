/// <reference path="../_agentish.d.ts" />

// Agent Chat Blueprint State

const Agentish = define.language("Agentish");

const AgentChatBlueprintState = define.system("AgentChatBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Agent Chat blueprints",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  verticalSlice: define.concept("WorkingDashboardVerticalSlice"),
  viewportBoundLayout: define.concept("ViewportBoundThreadLayout"),
  filePersistence: define.concept("FileBackedCanonicalSessions"),
  realtime: define.concept("RealtimeSessionUpdates"),
  directoryAndTitleQueueing: define.concept("QueuedDirectoryAndTitleInstructions"),
  codexOnlyExecution: define.concept("CodexOnlyProviderExecution"),
  genericSessionActivity: define.concept("GenericSessionActivityOnly"),
  fixedTurnDeadline: define.concept("FixedCodexTurnDeadline"),
  noFolderOrganization: define.concept("NoCanonicalFolderOrganization"),
  plannedProviders: define.concept("PlannedButUnimplementedProviders"),
  deferredScope: define.concept("DeferredProductScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

AgentChatBlueprintState.defines(`
- CurrentImplementationStatus means Agent Chat currently exists as a real dashboard feature with a working backend, working UI, canonical file-backed session persistence, realtime updates, and one implemented provider path.
- AssessmentConfidence is medium because overall Agent Chat state is still based mostly on direct source inspection, but the thread/composer layout path now also has direct browser verification at small, medium, and wide viewport sizes.
- ImplementationEvidence includes the file-backed store under packages/agent-chat-server/src/store.ts, the HTTP and WebSocket session backend under packages/agent-chat-server/src/index.ts, the Codex execution path under packages/agent-chat-server/src/codex-provider.ts, the dashboard surface under packages/agent-chat-ui/src/AgentChatScreen.tsx, the dashboard shell constraint in packages/dashboard-ui/src/DashboardShell.tsx, and responsive browser screenshots captured under /home/ec2-user/state/screenshots/agent-chat-gap-fix/.
- This blueprint-state compares current implementation reality against the ideal Agent Chat product blueprint in agent-chat.agentish.ts, the implementation-resolved dashboard blueprint in agent-chat-dashboard-implementation.agentish.ts, and the shared workflow rules in development-process.agentish.ts.
- ImplementationGap means the current product does not yet satisfy the full ideal Agent Chat blueprint around provider breadth, multi-agent participation, workspace references, import flows, compaction management, and inspectable retained context artifacts.
- KnownIssue means the provider catalog and UI present several provider options that are still planned while the backend only executes Codex app-server turns today.
- KnownIssue also includes the current Codex adapter using a short fixed turn deadline that can fail long-running but otherwise active turns before the provider completes.
`);

AgentChatBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.verticalSlice,
  CurrentReality.viewportBoundLayout,
  CurrentReality.filePersistence,
  CurrentReality.realtime,
  CurrentReality.directoryAndTitleQueueing,
  CurrentReality.codexOnlyExecution,
  CurrentReality.genericSessionActivity,
  CurrentReality.fixedTurnDeadline,
  CurrentReality.noFolderOrganization,
  CurrentReality.plannedProviders,
  CurrentReality.deferredScope,
  CurrentReality.workflowAlignment,
);

CurrentReality.verticalSlice.means(`
- the dashboard loads a real Agent Chat screen instead of a placeholder
- the backend serves provider catalog, session list, session creation, session read, session patch, interrupt, and websocket subscription routes
- the UI can create chats, open chats, send messages, stream assistant deltas, rename chats, and show run activity
`);

CurrentReality.viewportBoundLayout.means(`
- the dashboard shell now constrains feature rendering to the browser viewport instead of letting the page grow with sidebar content
- the Agent Chat sessions list scrolls independently from the active thread and composer
- short transcripts remain visible with the composer in the same viewport rather than creating a tall dead zone between the first message and the input
- this specific behavior was verified in-browser at small, medium, and wide viewport sizes
`);

CurrentReality.filePersistence.means(`
- canonical session metadata is stored as session.json per session under durable app data
- canonical transcript history is stored as messages.jsonl per session under durable app data
- runtime logs and legacy sqlite migration inputs remain separate from canonical app data
`);

CurrentReality.realtime.means(`
- the backend tracks per-session runtime activity in memory
- websocket subscribers receive session snapshots, incremental updates, run activity, run deltas, run completion, run interruption, and run failure events
- the browser uses those events to keep transcript, queued-message, and activity state live
`);

CurrentReality.directoryAndTitleQueueing.means(`
- changing session cwd writes canonical session state immediately
- changing session cwd also queues a provider-visible system instruction for the next turn
- changing session title writes canonical session state immediately
- changing session title also queues a provider-visible system instruction for the next turn
`);

CurrentReality.codexOnlyExecution.means(`
- Codex app-server is the only provider with a working execution adapter in the current backend
- active Codex turns may be interrupted when thread and turn ids are available
- provider thread ids remain metadata attached to the workspace-owned session rather than replacing canonical chat history
`);

CurrentReality.genericSessionActivity.means(`
- the session list currently receives a generic activity object with status, timing, background-process count, and waiting flags
- the current implementation does not model worker state as an explicit first-class session-list concept
- worker details therefore remain thinner and less legible in the session list than the blueprint should require
`);

CurrentReality.fixedTurnDeadline.means(`
- the current Codex adapter fails a turn after a fixed 120 second wall-clock timeout
- that deadline is enforced in packages/agent-chat-server/src/codex-provider.ts rather than being derived from provider idleness or transport failure
- long-running active turns can therefore fail in Agent Chat even when equivalent Codex CLI usage would normally continue
`);

CurrentReality.noFolderOrganization.means(`
- sessions are currently listed as one flat collection sorted by last activity
- sessions do not currently belong to canonical folders
- the current implementation therefore lacks workspace-owned session organization beyond title, provider, and cwd metadata
`);

CurrentReality.plannedProviders.means(`
- OpenRouter, Claude Agent SDK, and Gemini appear in the provider catalog as planned entries
- new sessions cannot be created with those planned providers because the backend rejects non-ready provider selections
- the multi-provider blueprint direction is established, but the implementation is still effectively single-provider today
`);

CurrentReality.deferredScope.means(`
- multi-agent sessions are not implemented
- workspace entity references are not yet modeled as durable first-class chat references
- import normalization is not implemented
- native versus Agentish compaction is specified in blueprints but not yet exposed as a real editable session policy
- session folders are not implemented
- explicit worker-state summaries in the session list are not implemented
- retained context inspection is still much thinner than the ideal blueprint describes
`);

CurrentReality.workflowAlignment.means(`
- Agent Chat now has a dedicated blueprint-state document rather than relying only on ideal-state blueprints
- this document is intended to be the durable current-reality comparison for Agent Chat implementation work
- provider-backed implementation work inside Agent Chat is expected to inherit the shared development-process workflow and keep this comparison current
`);

when(CurrentReality.plannedProviders.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.genericSessionActivity.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.fixedTurnDeadline.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.noFolderOrganization.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.codexOnlyExecution.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat as a useful but partial vertical slice rather than a blueprint-complete system"));

when(CurrentReality.workflowAlignment.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat blueprint-state as the current implementation comparison required by the shared development process"));
