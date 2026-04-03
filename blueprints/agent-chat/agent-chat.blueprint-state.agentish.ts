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
  targetedVerification: define.concept("TargetedVerificationEvidence"),
  deferredScope: define.concept("DeferredProductScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

AgentChatBlueprintState.defines(`
- CurrentImplementationStatus means the current Agent Chat implementation still centers on durable non-human agent identity through agentId plus replaceable provider attachment through providerBinding, and now exposes a canonical reusable embedded session surface for the Workbench node rather than a separate bounded viewer.
- AssessmentConfidence is high because this state is grounded in direct source inspection, build/lint verification, worker-local runtime verification, and worker-local browser verification of the canonical Workbench node surface.
- ImplementationEvidence includes packages/agent-chat-server/src/schema.ts, packages/agent-chat-server/src/store.ts, packages/agent-chat-server/src/store.test.ts, packages/agent-chat-ui/src/AgentChatScreen.tsx, packages/agent-chat-ui/src/workbench-node.tsx, and the worker-local verification artifact /home/ec2-user/temp/worker-agent-chat-canonical-workbench-node.png.
- This blueprint-state compares current implementation reality against the intended Agent Chat blueprint in agent-chat.agentish.ts, especially its durable ChatAgent identity, replaceable ChatAgentProviderBinding, compatibility-preserving participant vocabulary, and the canonical reusable Workbench node surface.
- ImplementationGap means the current code has not yet completed the full blueprint direction around detached bindings, worker-host execution targets, or persisted reload verification for selected Workbench node session ids after save/load.
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

CurrentReality.targetedVerification.means(`
- build and lint passed for the current branch
- worker-local package verification passed for packages/agent-chat-ui and packages/agent-workbench-ui
- worker-local agent-browser verification passed for route load, add-node menu open, and searchable agent-chat node creation
- worker-local screenshot proof shows the canonical Agent Chat surface embedded inside the Workbench node
`);

CurrentReality.deferredScope.means(`
- detached binding runtime behavior is modeled in the blueprint but is not yet implemented in the current runtime slice
- worker-host execution targets and richer provider rebinding flows remain future work
- persisted reload verification for selected Workbench node session ids still needs a dedicated save/load proof pass
`);

CurrentReality.workflowAlignment.means(`
- this blueprint-state is intentionally narrower than the broader Agent Chat product snapshot
- its job in the current development loop is to describe the actual bounded implementation slice and the remaining gap to persisted canonical node reload verification inside Workbench
`);

when(CurrentReality.durableAgentBindingFoundation.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.workbenchNodeSurface.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.targetedVerification.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.deferredScope.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));
