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
  claudeProcessModePolicy: define.concept("ClaudeProcessModePolicy"),
  currentChatProviderSettings: define.concept("CurrentChatProviderSettingsMenu"),
  clipboardImagePaste: define.concept("ClipboardImagePasteSupport"),
  archivedSessionOrganization: define.concept("ArchivedSessionOrganization"),
  sessionListSearch: define.concept("SessionListSearch"),
  sessionListQuickProcessSet: define.concept("SessionListQuickProcessSet"),
  processResolutionGuard: define.concept("ProcessResolutionGuard"),
  stalledTurnWatchdog: define.concept("StalledTurnWatchdog"),
  providerErrorRetry: define.concept("ProviderErrorRetry"),
  typingAwareIdleSuppression: define.concept("TypingAwareIdleSuppression"),
  canonicalActivityHistory: define.concept("CanonicalActivityHistory"),
  providerLimitActivity: define.concept("ProviderLimitActivity"),
  sessionListWorkflowPolishGap: define.concept("SessionListWorkflowPolishGap"),
  threadNavigationGap: define.concept("ThreadNavigationGap"),
  backendOwnedWatchdogContinuity: define.concept("BackendOwnedWatchdogContinuity"),
  settingsAndMessageStateGap: define.concept("SettingsAndMessageStateGap"),
  genericSessionActivity: define.concept("GenericSessionActivityOnly"),
  claudeSdkModelCatalog: define.concept("ClaudeSdkModelCatalog"),
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
- ImplementationEvidence includes the file-backed store under packages/agent-chat-server/src/store.ts, the HTTP and WebSocket session backend under packages/agent-chat-server/src/index.ts, the Codex execution path under packages/agent-chat-server/src/codex-provider.ts, the Claude execution path under packages/agent-chat-server/src/claude-provider.ts, the dashboard surface under packages/agent-chat-ui/src/AgentChatScreen.tsx, the dashboard shell constraint in packages/dashboard-ui/src/DashboardShell.tsx, and responsive live-browser screenshots captured under /home/ec2-user/state/screenshots/agent-chat-release-af79459/, /home/ec2-user/state/screenshots/agent-chat-mobile-audit-local-2/, and /home/ec2-user/state/screenshots/agent-chat-mobile-settings-submit/.
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
  CurrentReality.claudeProcessModePolicy,
  CurrentReality.currentChatProviderSettings,
  CurrentReality.clipboardImagePaste,
  CurrentReality.archivedSessionOrganization,
  CurrentReality.sessionListSearch,
  CurrentReality.sessionListQuickProcessSet,
  CurrentReality.processResolutionGuard,
  CurrentReality.stalledTurnWatchdog,
  CurrentReality.providerErrorRetry,
  CurrentReality.typingAwareIdleSuppression,
  CurrentReality.canonicalActivityHistory,
  CurrentReality.providerLimitActivity,
  CurrentReality.sessionListWorkflowPolishGap,
  CurrentReality.threadNavigationGap,
  CurrentReality.backendOwnedWatchdogContinuity,
  CurrentReality.settingsAndMessageStateGap,
  CurrentReality.genericSessionActivity,
  CurrentReality.claudeSdkModelCatalog,
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
- the dashboard shell main-menu rail is now hidden by default on mobile and opens as an overlay drawer instead of permanently stealing horizontal space from feature content
- mobile transcript cards that represent assistant stream checkpoints or thought checkpoints now use the full available thread width instead of collapsing into a narrow unreadable column
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

CurrentReality.claudeProcessModePolicy.means(`
- the current Claude adapter now maps Discuss sessions to Claude SDK plan mode instead of writable execution mode
- the current Claude adapter also maps sessions with no explicit process blueprint to Claude SDK plan mode so question-first chats do not silently gain edit capability
- blueprint-authoring and implementation-oriented process selections still use Claude writable execution mode
`);

CurrentReality.currentChatProviderSettings.means(`
- the composer-area current-chat menu now exposes provider, model, auth-profile, directory, and image-model controls for an existing session
- existing sessions may switch between currently ready providers without creating a new canonical chat session
- changing provider settings clears provider-owned thread metadata and preserves canonical transcript history
- provider switching is blocked while a run is active, but otherwise works as a normal session patch
- live browser verification confirms the current-chat provider, model, and auth-profile controls render as comboboxes on the deployed dashboard
- the current-chat settings panel now keeps its primary save action pinned inside the menu on constrained mobile viewports instead of letting the action fall below the visible sheet
- local iPhone-sized browser verification confirmed that pressing the focused text field's keyboard confirmation key submits the current-chat settings form and persists the session patch
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
- the active-thread header now exposes a compact process selector for the current chat near the thread menu button
- the operator can change the assigned process blueprint for the active session without opening the current-chat settings menu
- the quick-set control uses the same repository-backed process blueprint catalog as new-chat creation and current-chat settings
- the unassigned quick-set state is shown explicitly rather than as an imperative placeholder action label
- creating a new chat with a selected process blueprint now emits the waiting expectation entry immediately instead of leaving the fresh transcript blank about the assigned contract
- changing the process assignment updates the queued next-turn system instruction so the agent sees the updated expectation on the next provider turn
`);

CurrentReality.processResolutionGuard.means(`
- when the active session process reaches its completion token, the quick-set control enters a required unresolved state instead of silently reusing the completed process contract
- when the active session process reaches its blocked token, the same guard enters a Blocked unresolved state instead of silently reusing the blocked process contract
- that unresolved state is shown as red Done warning text in the quick-set selector rather than as a stored process value or selectable option
- the current-chat settings surface also highlights that completed-process state and keeps normal process options available for resolution
- the composer send path is blocked until the operator chooses the next normal process selection
- the unresolved Done state is now backed by a distinct selector sentinel value, so the operator can explicitly choose the same previous process again and have that count as a fresh re-application of the contract
- reapplying the same completed process now resets the completed watchdog state and queues the next-turn process instruction again instead of being ignored as a no-op
`);

CurrentReality.stalledTurnWatchdog.means(`
- watchdog scheduling now tracks the last meaningful visible progress time even while a provider turn remains in running state
- a stalled running turn can now flip watchdog state to nudged and append a watchdog prompt before the provider emits turn completion
- local verification confirmed that a long-running shell command session stayed provider-running, then received its Full Development Process watchdog prompt after the configured inactivity budget expired
- when the provider finishes a turn and reports itself idle before the process is done or blocked, the watchdog becomes immediately eligible instead of waiting a second idle timeout
`);

CurrentReality.providerErrorRetry.means(`
- provider failures now record canonical activity history instead of silently vanishing into transient runtime state
- retryable provider errors enter bounded retry with backoff rather than immediately collapsing the process into dead stop
- non-retryable or exhausted failures still surface as explicit run failure state instead of idle-watchdog wording
`);

CurrentReality.typingAwareIdleSuppression.means(`
- active human typing now sends ephemeral typing presence to the backend
- while that typing grace window is active, idle-watchdog prompting is deferred
- once typing stops and the grace window expires, normal watchdog scheduling resumes
`);

CurrentReality.canonicalActivityHistory.means(`
- surfaced provider activity such as tool execution and background-task transitions now enters canonical transcript history as activity messages
- those activity records survive refresh and backend restart instead of existing only as transient browser state
- canonical activity coverage is still incomplete across every possible surfaced event class, so this area remains partial rather than finished
`);

CurrentReality.providerLimitActivity.means(`
- the Codex adapter now opts into supported app-server raw status events through the experimental API capability
- when Codex exposes token-budget, quota, or context-window exhaustion without assistant text, Agent Chat now converts that provider status into canonical transcript activity instead of falling back to an empty assistant response
- local verification with an isolated fake Codex app-server confirmed that an exhausted-provider completion now records a concrete provider-limit activity message in canonical history
`);

CurrentReality.backendOwnedWatchdogContinuity.means(`
- the Agent Chat backend runs as a detached server process separate from the dashboard web process
- disconnected dashboard clients do not pause process handling or watchdog timers once the Agent Chat backend is already running
- direct verification confirmed that after the dashboard process on :3000 was stopped, agent-chat-server on :8789 remained alive and still emitted a Full Development Process watchdog prompt for a stalled running turn
- the dashboard plugin definition now declares Agent Chat as an explicit `always` backend so dashboard startup proactively restores the backend instead of waiting for a new chat request
- unresolved idle watchdog episodes are now re-armed from persisted session timestamps on backend restart, so overdue sessions can nudge promptly after boot instead of waiting for a later interaction
`);

CurrentReality.sessionListWorkflowPolishGap.means(`
- session-list card hierarchy and spacing are still looser than the intended compact workflow surface
- titles, status color, and model metadata do not yet reflect the intended stronger visual hierarchy
- button and icon chrome still costs too much row space in the session list
- the top-of-rail text and new-chat surface still consume space that should be easier to reclaim
- the archived reveal control still has a known broken path and needs reliability work
- the new-chat surface still needs explicit scrollability under constrained rail heights
`);

CurrentReality.threadNavigationGap.means(`
- loading a session now retries scroll-to-latest so the active thread lands near the latest visible content more reliably after the transcript mounts
- the current custom transcript rail is still not reliable enough to justify its space and should be removed or deferred until a clearly stable design exists
- the latest mobile audit recorded zero document-level and body-level horizontal overflow on the verified chat viewport, but horizontal containment should still be watched as transcript chrome evolves
- richer local zoom or lens treatment is still deferred until there is a version that preserves the stability of the thin rail
`);

CurrentReality.settingsAndMessageStateGap.means(`
- chat settings are still more constrained than intended during active work
- provider selection in an active session can still reset unexpectedly before save
- duplicate message rendering still appears after send until refresh in some flows
- queued and transcript rendering still blur pending versus delivered state instead of showing one clear message-state model
- queued user messages are now consumed into the next provider turn as one batch instead of one-at-a-time follow-up turns
- when queued system instructions such as process changes are consumed at run start, they now become canonical transcript history at that moment and survive refresh
- Codex reasoning checkpoints are not yet recorded canonically at receipt time, so the current thought-entry behavior is not aligned with the intended canonical-only transcript model
- live assistant streaming text is still only an in-memory UI buffer and is not yet recorded canonically as transcript checkpoint history
- expanded activity rows still use overly generic wording like command execution started or completed instead of foregrounding the actual task identity
- adjacent low-signal activity items still render as many full-height transcript cards instead of collapsing into a compact default summary when they accumulate
- provider-originated run events are still not consistently persisted into canonical Agent Chat history, so the transcript cannot yet be replayed solely from app-owned records for every surfaced provider event
- the current stream-history presentation still mislabels observed provider text as draft semantics and needs cleaner stream-specific wording
- internal stream checkpoint storage still leaks too directly into operator-facing transcript concepts and needs cleaner presentation boundaries
- replaced-stream history still needs to move into the main assistant header row; the current collapsed expander still costs a separate row above the message body
- the current inline replaced-stream expander still needs one more correction so expanded replaced history appears above the final assistant text instead of after it
- transcript spacing around secondary history affordances is still looser than intended and wastes vertical space ahead of visible message content
- the browser now receives the provider-seen transition for queued user messages at run start so stale queued badges clear without waiting for a later refresh
`);

CurrentReality.claudeSdkModelCatalog.means(`
- the current backend now refreshes Claude model options through the Claude Agent SDK initialization handshake rather than a generic vendor model listing
- the current implementation now normalizes Claude SDK alias values into explicit operator-facing refs such as anthropic/claude-opus-4-6-1m and anthropic/claude-sonnet-4-6 while preserving the SDK alias mapping internally for execution
- Claude model discovery is cached server-side and falls back to a curated compatible alias set when the SDK probe fails or times out
- the current discovery path is still global to the server process rather than explicitly varying by the session's selected Claude auth profile
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

when(CurrentReality.claudeSdkModelCatalog.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.sessionListWorkflowPolishGap.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.threadNavigationGap.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.settingsAndMessageStateGap.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

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
