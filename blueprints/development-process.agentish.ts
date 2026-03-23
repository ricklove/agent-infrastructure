/// <reference path="./_agentish.d.ts" />

// Development Process

const Agentish = define.language("Agentish");

const DevelopmentProcess = define.system("DevelopmentProcess", {
  format: Agentish,
  role: "Shared implementation workflow for blueprint-first source changes, verification, rollout, and post-deploy validation",
});

const Actor = {
  operator: define.actor("DevelopmentOperator"),
  providerAgent: define.actor("ProviderBackedAgent"),
};

const Artifact = {
  sourceRepo: define.workspace("SourceRepository"),
  baseBranch: define.workspace("BaseBranch"),
  featureBranch: define.workspace("FeatureBranch"),
  implementationWorktree: define.workspace("ImplementationWorktree"),
  runtimeCheckout: define.workspace("RuntimeCheckout"),
  temporaryState: define.workspace("TemporaryRuntimeState"),
  appData: define.workspace("DurableAppData"),
  blueprint: define.document("RelevantBlueprint"),
  blueprintState: define.document("RelevantBlueprintState"),
  screenshot: define.document("VerificationScreenshot"),
  ticketPlan: define.document("ImplementationTicketPlan"),
};

const Rule = {
  blueprintFirst: define.concept("BlueprintFirstChange"),
  blueprintCommitFirst: define.concept("BlueprintCommitBeforeImplementation"),
  blueprintStateRequired: define.concept("BlueprintStateTracksCurrentReality"),
  sourceOnly: define.concept("SourceOnlyEdits"),
  worktreeIsolation: define.concept("IsolatedGitWorktreeDevelopment"),
  mergeIntoBase: define.concept("FeatureBranchMergesIntoBase"),
  runtimeReadonly: define.concept("RuntimeReadonlyCheckout"),
  stateTemporaryOnly: define.concept("TemporaryStateOnly"),
  verifyLocally: define.concept("LocalVerification"),
  deployByCheckout: define.concept("DeployByRuntimeCheckout"),
  verifyVersions: define.concept("VersionMatchVerification"),
  verifyBehavior: define.concept("BehaviorVerification"),
  ticketPlanForActiveWork: define.concept("TicketSystemOwnsImplementationPlan"),
  standardRuntimeDeploy: define.concept("StandardRuntimeDeployBlueprint"),
};

DevelopmentProcess.enforces(`
- Relevant blueprints must be reviewed and updated before implementation changes.
- Relevant blueprint-state documents must describe how current implementation compares to the ideal blueprint.
- Blueprint changes that alter architecture, workflow, or product requirements must be committed before dependent implementation work begins.
- Implementation must not continue past blueprint edits until those blueprint edits are committed.
- Active implementation plans should live in the ticket system rather than as durable repository design documents.
- Before installing or reconfiguring local developer tools, check the workspace README and referenced tools/ notes for machine-specific guidance and already-installed utilities.
- Source is the only editing surface for intended behavior changes.
- The shared repository checkout should remain on the current base branch used for ongoing integration work.
- Feature and fix implementation should begin from a feature branch created from the current base branch.
- Active code-changing implementation should use an isolated git worktree for development and local verification when working from a feature branch.
- Completed feature branch work should be committed and merged back into the base branch before rollout proceeds.
- Runtime is a deployed checkout and not an editing surface.
- state/ is only for temporary runtime state and recoverable operational artifacts.
- Durable app data must live outside state/.
- Provider-backed agents used for implementation must inherit this same workflow.
- Runtime rollout should follow the deploy-manager-runtime blueprint as the standard deploy path.
- Runtime rollout should call `bun run deploy-manager-runtime` from the shared source repository unless a more specific documented operator entrypoint supersedes it.
- UI-facing changes require real browser verification, screenshots, and deployed frontend-backend version matching.
- Responsive UI changes must be verified at small, medium, and wide viewport sizes.
- A rollout is not complete until post-deploy behavior has been verified on the live system.
`);

DevelopmentProcess.defines(`
- BlueprintFirstChange means architecture and policy are corrected in blueprints before code is changed.
- BlueprintCommitBeforeImplementation means blueprint edits are turned into a committed source revision before dependent implementation work starts.
- BlueprintStateTracksCurrentReality means blueprint-state records current implementation status, confidence, evidence, gaps, and known issues relative to the ideal blueprint.
- WorkspaceToolingDiscovery means local machine tooling should be discovered from workspace README guidance and tools/ notes before installing replacements or parallel toolchains.
- IsolatedGitWorktreeDevelopment means code-changing implementation work happens in a git worktree associated with a feature branch rather than in a shared checkout.
- FeatureBranchMergesIntoBase means implementation commits land on a feature branch first and are merged back into the base branch before rollout.
- TemporaryStateOnly means logs, pids, sockets, caches, and controller metadata may live under state/, but durable user or app content may not.
- DeployByRuntimeCheckout means runtime is updated by checking out a committed source revision rather than editing deployed files directly.
- VersionMatchVerification means the served frontend version and running backend version must match exactly after rollout.
- TicketSystemOwnsImplementationPlan means active work sequencing, task breakdown, and unfinished implementation routing belong in tickets rather than in long-lived blueprint companion files.
- StandardRuntimeDeployBlueprint means runtime rollout should use the repository's canonical deploy-manager-runtime path rather than improvised runtime or tunnel-control actions.
- `bun run deploy-manager-runtime` means the standard repository entrypoint for the canonical runtime rollout path.
`);

DevelopmentProcess.contains(
  Artifact.sourceRepo,
  Artifact.baseBranch,
  Artifact.featureBranch,
  Artifact.implementationWorktree,
  Artifact.runtimeCheckout,
  Artifact.temporaryState,
  Artifact.appData,
  Artifact.blueprint,
  Artifact.blueprintState,
  Artifact.screenshot,
  Artifact.ticketPlan,
  Rule.blueprintFirst,
  Rule.blueprintCommitFirst,
  Rule.blueprintStateRequired,
  Rule.sourceOnly,
  Rule.worktreeIsolation,
  Rule.mergeIntoBase,
  Rule.runtimeReadonly,
  Rule.stateTemporaryOnly,
  Rule.verifyLocally,
  Rule.deployByCheckout,
  Rule.verifyVersions,
  Rule.verifyBehavior,
  Rule.ticketPlanForActiveWork,
  Rule.standardRuntimeDeploy,
);

when(Actor.operator.implements("a feature or fix"))
  .then(DevelopmentProcess.requires(Rule.blueprintFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintCommitFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintStateRequired))
  .and(DevelopmentProcess.requires(Rule.sourceOnly))
  .and(DevelopmentProcess.requires(Rule.worktreeIsolation))
  .and(DevelopmentProcess.requires(Rule.mergeIntoBase))
  .and(DevelopmentProcess.requires(Rule.verifyLocally))
  .and(DevelopmentProcess.requires(Rule.deployByCheckout))
  .and(DevelopmentProcess.requires(Rule.standardRuntimeDeploy))
  .and(DevelopmentProcess.requires(Rule.verifyBehavior))
  .and(DevelopmentProcess.requires(Rule.ticketPlanForActiveWork));

when(Actor.providerAgent.implements("a feature or fix inside agent-chat"))
  .then(DevelopmentProcess.requires(Rule.blueprintFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintCommitFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintStateRequired))
  .and(DevelopmentProcess.requires(Rule.worktreeIsolation))
  .and(DevelopmentProcess.requires(Rule.mergeIntoBase))
  .and(DevelopmentProcess.requires("the same relevant blueprints the operator would check"))
  .and(DevelopmentProcess.requires("the Agent Chat blueprint-state document to be updated as the current implementation comparison for Agent Chat work"))
  .and(DevelopmentProcess.requires("the same rollout and verification rules the operator would follow"))
  .and(DevelopmentProcess.requires("the same blueprint-state updates the operator would make"))
  .and(DevelopmentProcess.requires("the same ticket-plan discipline the operator would follow"));

when(Actor.operator.starts("code-changing implementation on a feature or fix"))
  .then(DevelopmentProcess.expects(Artifact.baseBranch))
  .and(DevelopmentProcess.treats("the shared repository checkout as the base-branch integration surface"))
  .and(DevelopmentProcess.prefers(Artifact.featureBranch))
  .and(DevelopmentProcess.prefers(Artifact.implementationWorktree))
  .and(DevelopmentProcess.associates(Artifact.featureBranch).with(Artifact.baseBranch))
  .and(DevelopmentProcess.associates(Artifact.implementationWorktree).with(Artifact.featureBranch))
  .and(DevelopmentProcess.associates(Artifact.featureBranch).with(Artifact.sourceRepo));

when(Actor.operator.finishes("code-changing implementation on a feature branch"))
  .then(DevelopmentProcess.prefers(Artifact.featureBranch))
  .and(DevelopmentProcess.expects("committed implementation changes on the feature branch"))
  .and(DevelopmentProcess.expects("a normal merge of the feature branch back into the base branch"))
  .and(DevelopmentProcess.requires(Rule.mergeIntoBase));

when(Actor.operator.runs("development or local verification for a feature branch"))
  .then(DevelopmentProcess.expects(Artifact.implementationWorktree))
  .and(DevelopmentProcess.treats("the implementation worktree as the editable development surface"));

when(Artifact.blueprint.exists())
  .then(DevelopmentProcess.expects(Artifact.blueprintState))
  .and(DevelopmentProcess.treats("blueprint as ideal and blueprint-state as current comparison"));

when(Actor.operator.starts("substantial unfinished implementation work"))
  .then(DevelopmentProcess.prefers(Artifact.ticketPlan))
  .and(DevelopmentProcess.keeps("implementation sequencing and active work tracking in the ticket system"));

when(Actor.operator.rollsOut("a committed revision to runtime"))
  .then(DevelopmentProcess.requires(Rule.standardRuntimeDeploy))
  .and(DevelopmentProcess.requires(Rule.deployByCheckout))
  .and(DevelopmentProcess.treats("deploy-manager-runtime as the canonical rollout blueprint"))
  .and(DevelopmentProcess.expects("bun run deploy-manager-runtime to be the normal rollout command"));

when(Artifact.temporaryState.contains("durable app content"))
  .then(DevelopmentProcess.violates(Rule.stateTemporaryOnly));

when(Artifact.runtimeCheckout.receives("manual code edits"))
  .then(DevelopmentProcess.violates(Rule.runtimeReadonly));
