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
- CurrentImplementationStatus means the current Agent Chat implementation still centers on durable non-human agent identity through agentId plus replaceable provider attachment through providerBinding, exposes a canonical reusable embedded session surface for the Workbench node, and now includes an initial read-only Agent Chat v2 dashboard tab for staging the bounded-loading and Legend State replacement path.
- AssessmentConfidence is high for the read-only Chat v2 preview and dashboard-registration slice because this state is grounded in direct source inspection, targeted package verification, Agentish parse verification, manager-worktree runtime verification, and manager-worktree browser verification.
- ImplementationEvidence includes packages/agent-chat-server/src/schema.ts, packages/agent-chat-server/src/store.ts, packages/agent-chat-server/src/store.test.ts, packages/agent-chat-server/src/index.ts, packages/agent-chat-server/src/dashboard-plugin.ts, packages/agent-chat-ui/src/AgentChatScreen.tsx, packages/agent-chat-ui/src/workbench-node.tsx, packages/agent-chat-ui/src/AgentChatV2Screen.tsx, packages/agent-chat-ui/src/dashboard-ui-plugin.ts, packages/dashboard-plugin/src/index.ts, packages/dashboard-plugin/src/preferences.ts, packages/dashboard-ui/src/feature-plugins.ts, and the manager-worktree verification artifact /home/ec2-user/temp/chat-v2-manager-worktree-verification.png.
- This blueprint-state compares current implementation reality against the intended Agent Chat blueprint in agent-chat.agentish.ts, especially its durable ChatAgent identity, replaceable ChatAgentProviderBinding, compatibility-preserving participant vocabulary, and the canonical reusable Workbench node surface.
- ImplementationGap means the current code has not yet completed the full blueprint direction around detached bindings, worker-host execution targets, persisted reload verification for selected Workbench node session ids after save/load, the feature-owned Legend State store, bounded v2 read APIs, or websocket-delta merge and version-gap recovery.
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
- packages/agent-chat-ui/src/AgentChatV2Screen.tsx exists as a read-only dashboard preview surface
- packages/agent-chat-ui/src/dashboard-ui-plugin.ts registers Agent Chat v2 as a second dashboard feature that reuses the existing Agent Chat backend props
- packages/dashboard-plugin/src/index.ts and packages/dashboard-plugin/src/preferences.ts include chat-v2 as a first-class dashboard feature id and menu ordering entry
- packages/dashboard-ui/src/feature-plugins.ts exposes Agent Chat v2 beside Agent Chat in the manager and admin dashboard feature lists
- the current v2 surface intentionally reads existing Agent Chat health and session-list data while leaving mutations disabled until bounded loading and the Legend State store are implemented
`);

CurrentReality.targetedVerification.means(`
- targeted checks passed for the changed manager-worktree packages: packages/dashboard-plugin, packages/agent-chat-ui, packages/dashboard-ui, and apps/dashboard-app
- targeted Agentish parse checks passed for blueprints/agent-chat/agent-chat.agentish.ts and blueprints/agent-chat/agent-chat.blueprint-state.agentish.ts
- repo-root bun lint currently fails on pre-existing workspace-wide Biome diagnostics outside the Chat v2 preview change
- the exact process command \`bun build\` invokes Bun's entrypoint bundler and failed with Missing entrypoints; the repository build script is \`bun run build\`
- historical worker-local package verification passed for packages/agent-chat-ui and packages/agent-workbench-ui
- historical worker-local agent-browser verification passed for route load, add-node menu open, and searchable agent-chat node creation
- historical worker-local screenshot proof covered the canonical Agent Chat surface embedded inside the Workbench node, but that older artifact is not used as current proof for this Chat v2 preview revision
- manager-worktree package verification passed for packages/dashboard-plugin, packages/agent-chat-ui, packages/dashboard-ui, and apps/dashboard-app after adding the Agent Chat v2 preview tab
- manager-worktree dev dashboard preview exposed /chat-v2 through a quick Cloudflare tunnel while still pointing at the existing Agent Chat backend data
- manager-worktree browser verification captured /home/ec2-user/temp/chat-v2-manager-worktree-verification.png showing Agent Chat v2 with backend Healthy, 148 sessions, a 783.2 KB current list payload, and the existing Agent Chat websocket root
`);

CurrentReality.deferredScope.means(`
- detached binding runtime behavior is modeled in the blueprint but is not yet implemented in the current runtime slice
- worker-host execution targets and richer provider rebinding flows remain future work
- persisted reload verification for selected Workbench node session ids still needs a dedicated save/load proof pass
- Agent Chat v2 still needs the feature-owned Legend State store, bounded session-list and transcript-window APIs, websocket delta contracts, and version-gap recovery before it can replace v1
- the intended Legend State client placement is a future feature-owned Agent Chat store package or module rather than the current read-only AgentChatV2Screen component
- the intended bounded read and websocket delta placement is the existing packages/agent-chat-server/src/index.ts API surface or a future Agent Chat protocol/server split, replacing the current unbounded /sessions preview read and snapshot-oriented websocket behavior
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
