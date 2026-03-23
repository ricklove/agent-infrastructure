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
  codexAndClaudeExecution: define.concept("CodexAndClaudeProviderExecution"),
  currentChatProviderSettings: define.concept("CurrentChatProviderSettingsMenu"),
  genericSessionActivity: define.concept("GenericSessionActivityOnly"),
  fixedTurnDeadline: define.concept("FixedCodexTurnDeadline"),
  noFolderOrganization: define.concept("NoCanonicalFolderOrganization"),
  plannedProviders: define.concept("PlannedButUnimplementedProviders"),
  deferredScope: define.concept("DeferredProductScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

AgentChatBlueprintState.defines(`
- CurrentImplementationStatus means Agent Chat currently exists as a real dashboard feature with a working backend, working UI, canonical file-backed session persistence, realtime updates, and more than one implemented provider path.
- AssessmentConfidence is medium because overall Agent Chat state is still based mostly on direct source inspection, but the thread/composer layout path now also has direct browser verification at small, medium, and wide viewport sizes.
- ImplementationEvidence includes the file-backed store under packages/agent-chat-server/src/store.ts, the HTTP and WebSocket session backend under packages/agent-chat-server/src/index.ts, the Codex execution path under packages/agent-chat-server/src/codex-provider.ts, the Claude execution path under packages/agent-chat-server/src/claude-provider.ts, the dashboard surface under packages/agent-chat-ui/src/AgentChatScreen.tsx, the dashboard shell constraint in packages/dashboard-ui/src/DashboardShell.tsx, and responsive browser screenshots captured under /home/ec2-user/state/screenshots/agent-chat-gap-fix/.
- This blueprint-state compares current implementation reality against the ideal Agent Chat product blueprint in agent-chat.agentish.ts, the implementation-resolved dashboard blueprint in agent-chat-dashboard-implementation.agentish.ts, and the shared workflow rules in development-process.agentish.ts.
- ImplementationGap means the current product does not yet satisfy the full ideal Agent Chat blueprint around provider breadth, multi-agent participation, workspace references, import flows, compaction management, and inspectable retained context artifacts.
- KnownIssue means the provider catalog and UI still include planned providers that do not yet execute in the backend today.
- KnownIssue also includes the current Agent Chat provider layer still being uneven, with Codex and Claude implemented while OpenRouter and Gemini remain planned.
- KnownIssue also includes the current Codex adapter retaining an adapter-level timeout policy that remains separate from the newer Claude path.
- KnownIssue also includes the current implementation now supporting in-session provider switching ahead of the older V1 cut language in the dashboard implementation blueprint, so that blueprint should no longer be read as excluding the shipped behavior.
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
  CurrentReality.codexAndClaudeExecution,
  CurrentReality.currentChatProviderSettings,
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

CurrentReality.codexAndClaudeExecution.means(`
- Codex app-server and Claude Agent SDK both have working execution adapters in the current backend
- active Codex and Claude turns may be interrupted while a run is active
- provider thread ids remain metadata attached to the workspace-owned session rather than replacing canonical chat history
`);

CurrentReality.currentChatProviderSettings.means(`
- the composer-area current-chat menu now exposes provider, model, auth-profile, directory, and image-model controls for an existing session
- existing sessions may switch between currently ready providers without creating a new canonical chat session
- changing provider settings clears provider-owned thread metadata and preserves canonical transcript history
- provider switching is blocked while a run is active, but otherwise works as a normal session patch
`);

CurrentReality.genericSessionActivity.means(`
- the session list currently receives a generic activity object with status, timing, background-process count, and waiting flags
- the current implementation does not model worker state as an explicit first-class session-list concept
- worker details therefore remain thinner and less legible in the session list than the blueprint should require
`);

CurrentReality.fixedTurnDeadline.means(`
- the current Codex adapter still applies its own turn timeout policy in packages/agent-chat-server/src/codex-provider.ts
- the Claude adapter does not share that exact transport or timeout path
- provider runtime behavior therefore still differs across the implemented adapters
`);

CurrentReality.noFolderOrganization.means(`
- sessions are currently listed as one flat collection sorted by last activity
- sessions do not currently belong to canonical folders
- the current implementation therefore lacks workspace-owned session organization beyond title, provider, and cwd metadata
`);

CurrentReality.plannedProviders.means(`
- OpenRouter and Gemini still appear in the provider catalog as planned entries
- new sessions cannot be created with those planned providers because the backend rejects non-ready provider selections
- the multi-provider blueprint direction is established, but the implementation is still partial rather than blueprint-complete
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

when(CurrentReality.currentChatProviderSettings.exists())
  .then(AgentChatBlueprintState.records("current implementation now exceeds the older V1 cut by supporting in-session provider switching"));

when(CurrentReality.fixedTurnDeadline.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.noFolderOrganization.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.codexAndClaudeExecution.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat as a useful but partial vertical slice rather than a blueprint-complete system"));

when(CurrentReality.workflowAlignment.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat blueprint-state as the current implementation comparison required by the shared development process"));
