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
  targetedVerification: define.concept("TargetedVerificationEvidence"),
  deferredScope: define.concept("DeferredProductScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

AgentChatBlueprintState.defines(`
- CurrentImplementationStatus means the current Agent Chat implementation has landed a bounded server-side refactor toward the refined blueprint direction: durable non-human agent identity through agentId plus replaceable provider attachment through providerBinding.
- AssessmentConfidence is medium-high because this state is grounded in direct source inspection, targeted worker-local tests, successful build and lint verification, clean server startup on the worker surface, and live API verification against a running local server.
- ImplementationEvidence includes packages/agent-chat-server/src/schema.ts, packages/agent-chat-server/src/store.ts, packages/agent-chat-server/src/store.test.ts, worker-local runtime verification on http://127.0.0.1:8891, and the worker-local verification artifact at /home/ec2-user/temp/provider-binding-verification-8891.svg.
- This blueprint-state compares current implementation reality against the intended Agent Chat blueprint in agent-chat.agentish.ts, especially its durable ChatAgent identity, replaceable ChatAgentProviderBinding, compatibility-preserving participant vocabulary, and manager-hosted bounded-slice language.
- ImplementationGap means the current code has not yet completed the full blueprint direction around detached bindings, binding replacement, context-policy-driven catch-up after rebinding, worker-host execution targets, and broader multi-endpoint runtime behavior.
- KnownIssue means current runtime behavior is still manager-hosted only even though execution-target vocabulary is now modeled more cleanly under provider binding.
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
  CurrentReality.targetedVerification,
  CurrentReality.deferredScope,
  CurrentReality.workflowAlignment,
);

CurrentReality.durableAgentBindingFoundation.means(`
- packages/agent-chat-server/src/schema.ts now defines and normalizes durable non-human identity through agentId together with explicit providerBinding data for provider-backed agent participants
- providerBinding now carries bindingId, providerKind, executionTarget, providerSessionId, and attachment status instead of relying on provider thread metadata as the primary participant identity surface
- default provider-backed manager participants now materialize with explicit providerBinding records and stable agent identity
- providerKind remains present as a compatibility-facing field, but the intended internal direction is durable agent identity plus provider binding rather than provider kind or provider thread as identity
`);

CurrentReality.managerHostedBindingSlice.means(`
- the currently landed runtime slice is manager-hosted only
- manager-hosted Codex and Claude participants are persisted with stable agentId values and attached providerBinding records
- providerBinding.executionTarget currently resolves to manager for the landed slice
- current session creation and store reads now expose those manager-hosted binding fields in returned session participant data
- runtime behavior, visibility, and delivery semantics remain aligned to the existing manager-hosted chat flow while using the newer binding-aware participant normalization underneath
`);

CurrentReality.compatibilityNormalization.means(`
- packages/agent-chat-server/src/store.ts now normalizes older stored participant data into the newer durable-agent-plus-binding shape during reads
- older manager-hosted sessions that only carried legacy participant or provider fields continue to load through inferred manager-hosted binding state
- the current bounded slice intentionally allows legacy-facing fields and newer binding-aware fields to coexist so the internal source of truth can move without breaking stored sessions
`);

CurrentReality.canonicalTranscriptAuthority.means(`
- canonical session and transcript ownership still belongs to Agent Chat rather than to provider-local session state
- providerBinding is treated as replaceable execution attachment metadata, not as canonical history ownership
- delivery and visibility continue to resolve at the canonical session layer even though provider-backed agent participants now carry richer binding metadata
- this pass improves the identity and attachment model under the existing manager-hosted runtime without changing transcript authority
`);

CurrentReality.targetedVerification.means(`
- bun lint passes for the bounded provider-binding slice
- bun build passes for the bounded provider-binding slice
- bun test packages/agent-chat-server/src/store.test.ts passes, including regression coverage for providerBinding persistence and manager-hosted execution-target shape
- timeout 15s bun packages/agent-chat-server/src/index.ts starts cleanly on the worker surface with no startup or import failure before timeout stops it
- live worker-local verification against http://127.0.0.1:8891/api/agent-chat/providers returns ok true
- live worker-local verification against POST /api/agent-chat/sessions returns manager-hosted Codex and Claude participant records with stable agentId, providerBinding.bindingId, providerBinding.providerKind, providerBinding.executionTarget.targetKind manager, and providerBinding.status attached
- the worker-local verification artifact at /home/ec2-user/temp/provider-binding-verification-8891.svg captures the live session payload used for that verification
`);

CurrentReality.deferredScope.means(`
- detached binding runtime behavior is modeled in the blueprint but is not yet implemented in the current runtime slice
- binding replacement and rebinding catch-up are not yet implemented beyond the foundational identity and binding schema direction
- worker-host execution targets are not yet implemented in the runtime even though executionTarget is now part of the providerBinding contract
- broader multi-endpoint execution, worker-host replay, and richer provider rebinding flows remain future work
- this blueprint-state intentionally treats those items as deferred scope for the current slice rather than as evidence that the landed manager-hosted foundation is absent
`);

CurrentReality.workflowAlignment.means(`
- this blueprint-state is intentionally narrower than the older broad Agent Chat product snapshot
- its job in the current development loop is to describe the actual bounded implementation slice that just landed against the refined durable-agent and provider-binding blueprint direction
- future implementation passes should revise this file when detached bindings, rebinding, worker-host execution targets, or catch-up behavior become real implementation evidence instead of leaving those changes implicit
`);

when(CurrentReality.durableAgentBindingFoundation.exists())
  .then(AgentChatBlueprintState.treats("durable agent identity plus replaceable provider binding as the current canonical implementation direction"));

when(CurrentReality.managerHostedBindingSlice.exists())
  .then(AgentChatBlueprintState.treats("the current shipped slice as manager-hosted only even though the blueprint models broader execution-target diversity"));

when(CurrentReality.compatibilityNormalization.exists())
  .then(AgentChatBlueprintState.treats("legacy participant data as compatibility input that is normalized into newer binding-aware state"));

when(CurrentReality.targetedVerification.exists())
  .then(AgentChatBlueprintState.records(Assessment.evidence));

when(CurrentReality.deferredScope.exists())
  .then(AgentChatBlueprintState.records(Assessment.gap))
  .and(AgentChatBlueprintState.records(Assessment.issue));

when(CurrentReality.workflowAlignment.exists())
  .then(AgentChatBlueprintState.treats("Agent Chat blueprint-state as a bounded current-reality artifact that should evolve alongside implementation slices"));
