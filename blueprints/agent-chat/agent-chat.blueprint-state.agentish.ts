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
  durableAgentBindingFoundation: define.concept("DurableAgentBindingFoundation"),
  managerHostedBindingSlice: define.concept("ManagerHostedBindingSlice"),
  compatibilityNormalization: define.concept("CompatibilityNormalization"),
  canonicalTranscriptAuthority: define.concept("CanonicalTranscriptAuthority"),
  workbenchNodeSurface: define.concept("WorkbenchNodeSurface"),
  chatV2PreviewSurface: define.concept("ChatV2PreviewSurface"),
  targetedVerification: define.concept("TargetedVerificationEvidence"),
  deferredScope: define.concept("DeferredProductScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

AgentChatBlueprintState.defines(`
- CurrentImplementationStatus means the current Agent Chat implementation still centers on durable non-human agent identity through agentId plus replaceable provider attachment through providerBinding, exposes a canonical reusable embedded session surface for the Workbench node, and now includes a functional Agent Chat v2 dashboard tab backed by bounded read APIs, a feature-owned Legend State store, v2 websocket window hydration, and canonical mutation routes.
- AssessmentConfidence is high for the Chat v2 manager-worktree slice because this state is grounded in direct source inspection, targeted package verification, Agentish parse verification, manager-worktree runtime verification, and manager-worktree browser verification against real Agent Chat data.
- ImplementationEvidence includes packages/agent-chat-server/src/schema.ts, packages/agent-chat-server/src/store.ts, packages/agent-chat-server/src/store.test.ts, packages/agent-chat-server/src/index.ts, packages/agent-chat-server/src/dashboard-plugin.ts, packages/agent-chat-ui/src/AgentChatScreen.tsx, packages/agent-chat-ui/src/workbench-node.tsx, packages/agent-chat-ui/src/AgentChatV2Store.ts, packages/agent-chat-ui/src/AgentChatV2Screen.tsx, packages/agent-chat-ui/src/dashboard-ui-plugin.ts, packages/dashboard-plugin/src/index.ts, packages/dashboard-plugin/src/preferences.ts, packages/dashboard-ui/src/feature-plugins.ts, and the manager-worktree verification artifact /home/ec2-user/temp/chat-v2-full-manager-worktree-verification.png.
- This blueprint-state compares current implementation reality against the intended Agent Chat blueprint in agent-chat.agentish.ts, especially its durable ChatAgent identity, replaceable ChatAgentProviderBinding, compatibility-preserving participant vocabulary, and the canonical reusable Workbench node surface.
- ImplementationGap means the current code has not yet completed the full blueprint direction around detached bindings, worker-host execution targets, persisted reload verification for selected Workbench node session ids after save/load, full websocket-delta merge semantics, version-gap recovery, process-selection editing, provider-settings editing, or attachment-rich v2 rendering.
- KnownIssue means current runtime behavior is still manager-hosted only even though execution-target vocabulary is modeled under provider binding.
`);

AgentChatBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.durableAgentBindingFoundation,
  CurrentReality.managerHostedBindingSlice,
  CurrentReality.compatibilityNormalization,
  CurrentReality.canonicalTranscriptAuthority,
  CurrentReality.workbenchNodeSurface,
  CurrentReality.chatV2PreviewSurface,
  CurrentReality.targetedVerification,
  CurrentReality.deferredScope,
  CurrentReality.workflowAlignment,
);

CurrentReality.durableAgentBindingFoundation.means(`
- packages/agent-chat-server/src/schema.ts defines durable non-human identity through agentId plus explicit providerBinding data
- providerBinding remains replaceable execution attachment metadata rather than canonical transcript ownership
`);

CurrentReality.managerHostedBindingSlice.means(`
- the currently landed runtime slice is manager-hosted only
- manager-hosted Codex and Claude participants are persisted with stable agentId values and attached providerBinding records
- runtime behavior remains aligned to the existing manager-hosted chat flow while using binding-aware participant normalization underneath
`);

CurrentReality.compatibilityNormalization.means(`
- packages/agent-chat-server/src/store.ts normalizes older stored participant data into the newer durable-agent-plus-binding shape during reads
- older manager-hosted sessions continue to load through inferred manager-hosted binding state
`);

CurrentReality.canonicalTranscriptAuthority.means(`
- canonical session and transcript ownership still belongs to Agent Chat rather than to provider-local session state
- delivery and visibility resolve at the canonical session layer even though provider-backed agent participants carry richer binding metadata
`);

CurrentReality.workbenchNodeSurface.means(`
- packages/agent-chat-ui/src/workbench-node.tsx exports a feature-owned agent-chat Workbench node definition
- the node keeps a compact session selector in the header while the body now renders AgentChatWorkbenchSessionView from packages/agent-chat-ui/src/AgentChatScreen.tsx
- AgentChatWorkbenchSessionView reuses the canonical transcript and composer logic from Agent Chat rather than maintaining a second Workbench-only renderer
- per-node composer draft state is namespaced through draftNamespace so multiple Workbench nodes can hold independent local draft state while sharing the canonical session store
`);

CurrentReality.chatV2PreviewSurface.means(`
- packages/agent-chat-ui/src/AgentChatV2Screen.tsx exists as a functional dashboard v2 surface over the existing canonical Agent Chat data
- packages/agent-chat-ui/src/AgentChatV2Store.ts owns v2 browser state through Legend State, including session summaries, active session id, bounded transcript windows, pagination cursors, queued messages, streaming text, websocket state, composer text, sending state, and v2 actions
- packages/agent-chat-server/src/index.ts exposes bounded v2 read APIs for session summaries and transcript windows, plus v2 websocket initial hydration through session.window instead of the legacy full session.snapshot
- packages/agent-chat-server/src/dashboard-plugin.ts allows AGENT_CHAT_BASE_URL override so manager-worktree preview can verify against a worktree chat backend rather than the deployed runtime backend
- packages/agent-chat-ui/src/dashboard-ui-plugin.ts registers Agent Chat v2 as a second dashboard feature that reuses the existing Agent Chat backend props
- packages/dashboard-plugin/src/index.ts and packages/dashboard-plugin/src/preferences.ts include chat-v2 as a first-class dashboard feature id and menu ordering entry
- packages/dashboard-ui/src/feature-plugins.ts exposes Agent Chat v2 beside Agent Chat in the manager and admin dashboard feature lists
- v2 currently supports bounded session loading, active-session transcript hydration, older-message pagination, queued-message display, streaming assistant display, new-session creation, canonical send, and canonical interrupt while leaving v1 available as the fallback control surface
`);

CurrentReality.targetedVerification.means(`
- targeted checks passed for the changed manager-worktree packages: packages/agent-chat-server, packages/dashboard-plugin, packages/agent-chat-ui, packages/dashboard-ui, and apps/dashboard-app
- targeted Agentish parse checks passed for blueprints/agent-chat/agent-chat.agentish.ts and blueprints/agent-chat/agent-chat.blueprint-state.agentish.ts
- repo-root bun lint currently fails on pre-existing workspace-wide Biome diagnostics outside the Chat v2 preview change
- the exact process command \`bun build\` invokes Bun's entrypoint bundler and failed with Missing entrypoints; the repository build script is \`bun run build\`
- historical worker-local package verification passed for packages/agent-chat-ui and packages/agent-workbench-ui
- historical worker-local agent-browser verification passed for route load, add-node menu open, and searchable agent-chat node creation
- historical worker-local screenshot proof covered the canonical Agent Chat surface embedded inside the Workbench node, but that older artifact is not used as current proof for this Chat v2 revision
- manager-worktree browser verification captured /home/ec2-user/temp/chat-v2-full-manager-worktree-verification.png showing Agent Chat v2 with 40 of 149 sessions, the selected Dashboard: Performance session, an 80-message transcript window out of 1,523 messages, queued-message display, older-message pagination, and the send composer
- manager-worktree runtime verification used AGENT_CHAT_BASE_URL to route the dashboard preview to the worktree Agent Chat server rather than the deployed runtime Agent Chat server
`);

CurrentReality.deferredScope.means(`
- detached binding runtime behavior is modeled in the blueprint but is not yet implemented in the current runtime slice
- worker-host execution targets and richer provider rebinding flows remain future work
- persisted reload verification for selected Workbench node session ids still needs a dedicated save/load proof pass
- Agent Chat v2 still needs full websocket delta contracts, version-gap recovery, process-selection editing, provider-settings editing, attachment-rich rendering, and broader mutation/reload tests before it can replace v1
- the current Legend State client placement is packages/agent-chat-ui/src/AgentChatV2Store.ts; a future package split may move this into a dedicated Agent Chat store module if reuse pressure justifies it
- the current bounded read placement is packages/agent-chat-server/src/index.ts; a future protocol/server split may extract shared cursor, bounded snapshot, delta, and version-gap contracts
`);

CurrentReality.workflowAlignment.means(`
- this blueprint-state is intentionally narrower than the broader Agent Chat product snapshot
- its job in the current development loop is to describe the actual Chat v2 preview and dashboard-registration slice, plus the remaining gap to persisted canonical node reload verification inside Workbench
`);

when(CurrentReality.durableAgentBindingFoundation.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.workbenchNodeSurface.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.chatV2PreviewSurface.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence))
  .and(AgentChatBlueprintState.records(Assessment.gap));

when(CurrentReality.targetedVerification.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.deferredScope.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));
