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
  clipboardImagePaste: define.concept("ClipboardImagePasteSupport"),
  archivedSessionOrganization: define.concept("ArchivedSessionOrganization"),
  sessionListSearch: define.concept("SessionListSearch"),
  sessionListQuickProcessSet: define.concept("SessionListQuickProcessSet"),
  genericSessionActivity: define.concept("GenericSessionActivityOnly"),
  fixedTurnDeadline: define.concept("FixedCodexTurnDeadline"),
  noFolderOrganization: define.concept("NoCanonicalFolderOrganization"),
  plannedProviders: define.concept("PlannedButUnimplementedProviders"),
  noWorkspaceRepoDurability: define.concept("NoManagerControlledWorkspaceRepoDurability"),
  deferredScope: define.concept("DeferredProductScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

AgentChatBlueprintState.defines(`
- CurrentImplementationStatus means Agent Chat currently exists as a real dashboard feature with a working backend, working UI, canonical file-backed session persistence, realtime updates, clipboard image paste support, and more than one implemented provider path.
- AssessmentConfidence is medium-high because the current state now has both direct source inspection and direct live-browser verification against the deployed dashboard at matching frontend and backend revisions.
- ImplementationEvidence includes the file-backed store under packages/agent-chat-server/src/store.ts, the HTTP and WebSocket session backend under packages/agent-chat-server/src/index.ts, the Codex execution path under packages/agent-chat-server/src/codex-provider.ts, the Claude execution path under packages/agent-chat-server/src/claude-provider.ts, the dashboard surface under packages/agent-chat-ui/src/AgentChatScreen.tsx, the dashboard shell constraint in packages/dashboard-ui/src/DashboardShell.tsx, and responsive live-browser screenshots captured under /home/ec2-user/state/screenshots/agent-chat-gap-fix/ including live-small-092de11.png, live-medium-092de11.png, and live-wide-092de11.png.
- This blueprint-state compares current implementation reality against the ideal Agent Chat product blueprint in agent-chat.agentish.ts, the implementation-resolved dashboard blueprint in agent-chat-dashboard-implementation.agentish.ts, and the shared workflow rules in development-process.agentish.ts.
- ImplementationGap means the current product does not yet satisfy the full ideal Agent Chat blueprint around provider breadth, multi-agent participation, workspace references, import flows, compaction management, and inspectable retained context artifacts.
- ImplementationGap also includes chat durability still stopping at canonical file persistence rather than extending into manager-controlled workspace git commit and push.
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
  CurrentReality.clipboardImagePaste,
  CurrentReality.archivedSessionOrganization,
  CurrentReality.sessionListSearch,
  CurrentReality.sessionListQuickProcessSet,
  CurrentReality.genericSessionActivity,
  CurrentReality.fixedTurnDeadline,
  CurrentReality.noFolderOrganization,
  CurrentReality.plannedProviders,
  CurrentReality.noWorkspaceRepoDurability,
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
- live browser verification confirms the current-chat provider, model, and auth-profile controls render as comboboxes on the deployed dashboard
`);

CurrentReality.clipboardImagePaste.means(`
- the composer accepts pasted clipboard image files and stages them as removable attachments before send
- sending a message with pasted images stores those images durably under canonical app data rather than leaving them in browser-only blob state
- transcript rendering now shows stored image blocks inline rather than reducing them to raw URL text
- the current Codex and Claude provider adapters now receive structured image input derived from the canonical image blocks
`);

CurrentReality.archivedSessionOrganization.means(`
- canonical session metadata now tracks whether a chat is archived
- archived chats are removed from the default main list without deleting transcript or provider metadata
- the session-list menu now reveals a hidden archived section where archived chats can be browsed and restored
- the current-chat menu also exposes archive or restore visibility controls for the active session
`);

CurrentReality.sessionListSearch.means(`
- the session list now exposes an inline search field
- search filters sessions by title, preview, provider, model, and cwd without leaving the session surface
- the same filter applies to both the main chat list and the archived section when that section is opened
`);

CurrentReality.sessionListQuickProcessSet.means(`
- the session-list header now exposes a compact process selector for the active chat near the list-level menu actions
- the operator can change the assigned process blueprint for the active session without opening the current-chat settings menu
- the quick-set control uses the same repository-backed process blueprint catalog as new-chat creation and current-chat settings
`);

CurrentReality.verticalSlice.means(`
- the deployed dashboard frontend and backend were verified at matching revision dashboard-092de11c11 during live browser validation
`);

CurrentReality.genericSessionActivity.means(`
- the session list currently receives a generic activity object with status, timing, background-process count, and waiting flags
- the browser now renders that activity into a clearer worker-status summary on each session item, including running, queued, elapsed, waiting, background, and error detail when available
- the current implementation still does not model worker state as a richer explicit backend contract beyond that generic activity object
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

CurrentReality.noWorkspaceRepoDurability.means(`
- Agent Chat currently writes canonical session files under durable app data
- the current implementation does not yet notify a manager-side workspace persistence controller after canonical mutations
- workspace git commit and push therefore remain an operator concern rather than a built-in part of chat durability
- manager-instance failure can still lose recent canonical chat history that has not yet been pushed from the workspace repository
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
- explicit worker-state summaries in the backend contract are not implemented beyond the generic activity payload
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

when(CurrentReality.clipboardImagePaste.exists())
  .then(AgentChatBlueprintState.treats("clipboard image paste as an implemented part of the current Agent Chat vertical slice"));

when(CurrentReality.fixedTurnDeadline.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.noFolderOrganization.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.noWorkspaceRepoDurability.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.codexAndClaudeExecution.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat as a useful but partial vertical slice rather than a blueprint-complete system"));

when(CurrentReality.workflowAlignment.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat blueprint-state as the current implementation comparison required by the shared development process"));
