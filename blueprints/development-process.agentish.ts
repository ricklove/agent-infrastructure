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
  releaseBranch: define.workspace("ReleaseBranch"),
  featureBranch: define.workspace("FeatureBranch"),
  implementationWorktree: define.workspace("ImplementationWorktree"),
  developmentWorker: define.workspace("DevelopmentWorkerHost"),
  runtimeCheckout: define.workspace("RuntimeCheckout"),
  temporaryState: define.workspace("TemporaryRuntimeState"),
  appData: define.workspace("DurableAppData"),
  blueprint: define.document("RelevantBlueprint"),
  agentishSections: define.document("AgentishSectionsBlueprint"),
  techStack: define.document("TechStackBlueprint"),
  codingStandards: define.document("CodingStandardsBlueprint"),
  renderDiagnostics: define.document("RenderDiagnosticsBlueprint"),
  agentDebugTools: define.document("AgentDebugToolsBlueprint"),
  processBlueprint: define.document("ProcessBlueprintJson"),
  blueprintState: define.document("RelevantBlueprintState"),
  releaseTag: define.document("ReleaseGitTag"),
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
  heavyWorkOnWorker: define.concept("HeavyDevelopmentWorkRunsOnWorker"),
  deployByCheckout: define.concept("DeployByRuntimeCheckout"),
  verifyVersions: define.concept("VersionMatchVerification"),
  verifyBehavior: define.concept("BehaviorVerification"),
  ticketPlanForActiveWork: define.concept("TicketSystemOwnsImplementationPlan"),
  standardRuntimeDeploy: define.concept("StandardRuntimeDeployBlueprint"),
};

DevelopmentProcess.enforces(`
- Relevant blueprints must be reviewed and updated before implementation changes.
- The repository Agentish sections blueprint should be read before defining or restructuring a subject blueprint.
- The repository tech-stack blueprint and coding-standards blueprint must be read before implementation begins.
- The repository render-diagnostics blueprint should be read before introducing repository-wide rerender instrumentation or broad UI render-count probes.
- The repository agent-debug-tools blueprint should be read before substantial browser-side UI debugging, rerender investigation, or agent-browser-based diagnosis workflows.
- Changes that alter canonical tooling, frameworks, styling systems, verification surfaces, or repository technology choices must update the tech-stack blueprint before implementation dependence continues.
- Changes that alter repository coding norms, allowed abstraction shape, styling exceptions, branching style, or dependency discipline must update the coding-standards blueprint before implementation dependence continues.
- Changes that alter repository-wide render instrumentation shape, naming, or diagnosis workflow must update the render-diagnostics blueprint before implementation dependence continues.
- Changes that alter the repository's canonical browser-debugging or agent-browser diagnosis workflow must update the agent-debug-tools blueprint before implementation dependence continues.
- Relevant process blueprints under blueprints/ must be reviewed and updated when a feature changes session process behavior, watchdog semantics, or expectation-selection behavior.
- Relevant blueprint-state documents must describe how current implementation compares to the ideal blueprint.
- Blueprint changes that alter architecture, workflow, or product requirements must be committed before dependent implementation work begins.
- Implementation must not continue past blueprint edits until those blueprint edits are committed.
- When operator feedback materially corrects intended product behavior during implementation, the relevant blueprints and blueprint-state must be updated to capture that correction before more implementation continues.
- Active implementation plans should live in the ticket system rather than as durable repository design documents.
- Before installing or reconfiguring local developer tools, check `/home/ec2-user/workspace/README.md` and the referenced notes under `/home/ec2-user/workspace/tools/` for machine-specific guidance and already-installed utilities.
- Source is the only editing surface for intended behavior changes.
- The shared repository checkout should remain on the current base branch used for ongoing integration work.
- Feature and fix implementation should begin from a feature branch rooted at the current base branch while leaving the shared checkout on that base branch.
- Active code-changing implementation should use an isolated git worktree for development and local verification when working from a feature branch.
- Heavy repo-wide check, build, lint-fix, or refactor work should run on a swarm worker rather than on the manager runtime host.
- A worker used as the active development surface should be prepared as a remote worktree-like environment with git installed and commit authorship config copied from the manager host.
- If the active development worker becomes unhealthy or unavailable, the expected recovery path is to repair that worker, reboot it, or create a replacement worker rather than silently continuing heavy development on the manager host.
- Unused or superseded worker instances should be disposed once a healthy replacement worker is ready so stale workers do not accumulate.
- Implementation worktrees should live under `~/workspace/projects-worktrees/<repo-name>/<branch-name>` rather than inside the shared repository tree or in ad hoc temp directories.
- The preferred setup sequence is to create the implementation worktree from the shared base-branch checkout with `git worktree add -b <feature-branch> <worktree-path> <base-branch>` so branch creation and worktree creation happen together.
- If a feature branch already exists, the implementation worktree should be created by attaching that branch with `git worktree add <worktree-path> <feature-branch>` rather than by checking the feature branch out in the shared base-branch checkout.
- If an active feature branch falls behind the current base branch or the release branch, it should be refreshed by merging those branches into the feature branch with normal merge commits as needed rather than relying on rebases.
- Normal merge commits are an acceptable and preferred way to refresh a feature branch during active work; rebasing is optional and never required by this process.
- Completed feature branch work should be committed and merged back into the base branch before release promotion proceeds.
- Once a feature branch is merged and no longer needed, the local feature branch should be deleted unless it is explicitly preserved for a recorded reason.
- Once a merged worktree is clean and no longer needed, that worktree should be removed.
- A merged worktree that still contains local changes must be reconciled deliberately or explicitly recorded as preserved unfinished work rather than being left behind silently.
- Release rollout should start only after the shared base-branch checkout is clean.
- Release rollout should promote the intended integrated commit onto `main`, create a release git tag from that exact commit, and deploy runtime from that tag.
- Runtime is a deployed checkout and not an editing surface.
- state/ is only for temporary runtime state and recoverable operational artifacts.
- Durable app data must live outside state/.
- Provider-backed agents used for implementation must inherit this same workflow.
- Runtime rollout should follow the deploy-manager-runtime blueprint as the standard deploy path.
- Runtime rollout should call `bun run deploy-manager-runtime` from the shared source repository unless a more specific documented operator entrypoint supersedes it.
- `bun run agent:connect-worker-ec2-ssh` is the canonical repository command for reusing or launching a development worker and connecting to it over private-IP SSH.
- UI-facing changes require real browser verification with `agent-browser`, visual verification on the rendered UI, saved screenshots, verification at small, medium, and wide viewport sizes, and deployed frontend-backend version matching.
- Responsive UI changes must be verified with `agent-browser` at small, medium, and wide viewport sizes.
- A rollout is not complete until post-deploy behavior has been verified on the live system.
`);

DevelopmentProcess.defines(`
- BlueprintFirstChange means architecture and policy are corrected in blueprints before code is changed.
- TechStackBlueprint means the repository-wide blueprint that owns canonical technology choices and stack exceptions.
- AgentishSectionsBlueprint means the repository-wide blueprint that owns the canonical in-file section structure for a subject Agentish blueprint.
- CodingStandardsBlueprint means the repository-wide blueprint that owns code-shaping norms and repository implementation discipline.
- RenderDiagnosticsBlueprint means the repository-wide blueprint that owns the shared global render-counter model for UI rerender diagnosis.
- AgentDebugToolsBlueprint means the repository-wide blueprint that owns the canonical agent-browser and render-diagnosis workflow for browser-side investigation.
- ProcessBlueprintJson means a machine-readable process contract in blueprints/ that the system may assign to a chat session.
- BlueprintCommitBeforeImplementation means blueprint edits are turned into a committed source revision before dependent implementation work starts.
- BlueprintStateTracksCurrentReality means blueprint-state records current implementation status, confidence, evidence, gaps, and known issues relative to the ideal blueprint.
- WorkspaceToolingDiscovery means local machine tooling should be discovered from `/home/ec2-user/workspace/README.md` and `/home/ec2-user/workspace/tools/` guidance before installing replacements or parallel toolchains.
- For UI verification on this machine, `agent-browser` is the expected browser tool for both behavior verification and visual verification, including small, medium, and wide viewport checks, unless a more specific documented workspace replacement supersedes it.
- IsolatedGitWorktreeDevelopment means code-changing implementation work happens in a git worktree associated with a feature branch rather than in a shared checkout, and the normal setup path is to create the worktree and feature branch together from the base branch.
- DevelopmentWorkerHost means a swarm worker host used as the safe execution surface for heavy development and verification workloads.
- HeavyDevelopmentWorkRunsOnWorker means repo-wide TypeScript checks, broad build steps, lint-fix sweeps, and similar resource-heavy work should move to a worker host rather than compete with the manager runtime host.
- RemoteWorktreeLikeWorker means a worker-host repo checkout can act like a remote execution worktree when it has git, correct authorship identity, and branch-local commit capability even though GitHub push authority stays on the manager host.
- Worker recovery means restoring a usable worker development surface by repairing the current worker, rebooting it, or creating a replacement worker before resuming heavy development.
- Worker disposal means terminating or otherwise removing unused worker instances once they are no longer the active development surface.
- CanonicalWorktreeLocation means implementation worktrees should live under `~/workspace/projects-worktrees/<repo-name>/<branch-name>` so they stay separate from canonical shared repo checkouts and are easy to audit and remove.
- FeatureBranchMergesIntoBase means implementation commits land on a feature branch first and are merged back into the base branch before rollout.
- FeatureBranchRefreshByMerge means an active feature branch may be updated from development, main, or both with normal merge commits when it falls behind those branches, and the process does not require rebasing for that refresh.
- ReleaseBranch means `main` is the canonical release branch for runtime deployment.
- ReleaseGitTag means an immutable git tag created from the promoted release commit and used as the runtime deploy target.
- TemporaryStateOnly means logs, pids, sockets, caches, and controller metadata may live under state/, but durable user or app content may not.
- DeployByRuntimeCheckout means runtime is updated by checking out a release tag that points at a committed source revision.
- VersionMatchVerification means the served frontend version and running backend version must match exactly after rollout.
- TicketSystemOwnsImplementationPlan means active work sequencing, task breakdown, and unfinished implementation routing belong in tickets rather than in long-lived blueprint companion files.
- StandardRuntimeDeployBlueprint means runtime rollout uses the repository's canonical deploy-manager-runtime path and targets a release tag.
- `bun run deploy-manager-runtime` means the standard repository entrypoint for the canonical runtime rollout path after release promotion and tag creation.
`);

DevelopmentProcess.contains(
  Artifact.sourceRepo,
  Artifact.baseBranch,
  Artifact.releaseBranch,
  Artifact.featureBranch,
  Artifact.implementationWorktree,
  Artifact.developmentWorker,
  Artifact.runtimeCheckout,
  Artifact.temporaryState,
  Artifact.appData,
  Artifact.blueprint,
  Artifact.agentishSections,
  Artifact.techStack,
  Artifact.codingStandards,
  Artifact.renderDiagnostics,
  Artifact.agentDebugTools,
  Artifact.processBlueprint,
  Artifact.blueprintState,
  Artifact.releaseTag,
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
  Rule.heavyWorkOnWorker,
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
  .and(DevelopmentProcess.requires(Artifact.agentishSections))
  .and(DevelopmentProcess.requires(Artifact.techStack))
  .and(DevelopmentProcess.requires(Artifact.codingStandards))
  .and(DevelopmentProcess.requires(Artifact.renderDiagnostics))
  .and(DevelopmentProcess.requires(Artifact.agentDebugTools))
  .and(DevelopmentProcess.requires(Rule.sourceOnly))
  .and(DevelopmentProcess.requires(Rule.worktreeIsolation))
  .and(DevelopmentProcess.requires(Rule.heavyWorkOnWorker))
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
  .and(DevelopmentProcess.requires(Artifact.agentishSections))
  .and(DevelopmentProcess.requires(Artifact.techStack))
  .and(DevelopmentProcess.requires(Artifact.codingStandards))
  .and(DevelopmentProcess.requires(Artifact.renderDiagnostics))
  .and(DevelopmentProcess.requires(Artifact.agentDebugTools))
  .and(DevelopmentProcess.requires(Rule.worktreeIsolation))
  .and(DevelopmentProcess.requires(Rule.heavyWorkOnWorker))
  .and(DevelopmentProcess.requires(Rule.mergeIntoBase))
  .and(DevelopmentProcess.requires("the same relevant blueprints the operator would check"))
  .and(DevelopmentProcess.requires("the Agent Chat blueprint-state document to be updated as the current implementation comparison for Agent Chat work"))
  .and(DevelopmentProcess.requires("the same rollout and verification rules the operator would follow"))
  .and(DevelopmentProcess.requires("the same blueprint-state updates the operator would make"))
  .and(DevelopmentProcess.requires("user corrections about intended Agent Chat behavior to be reflected in the relevant blueprints before more code changes continue"))
  .and(DevelopmentProcess.requires("the same ticket-plan discipline the operator would follow"));

when(Actor.operator.starts("code-changing implementation on a feature or fix"))
  .then(DevelopmentProcess.expects(Artifact.baseBranch))
  .and(DevelopmentProcess.treats("the shared repository checkout as the base-branch integration surface"))
  .and(DevelopmentProcess.prefers(Artifact.featureBranch))
  .and(DevelopmentProcess.prefers(Artifact.implementationWorktree))
  .and(DevelopmentProcess.expects("feature-branch creation to leave the shared checkout on the base branch"))
  .and(DevelopmentProcess.expects("the normal setup command to be `git worktree add -b <feature-branch> <worktree-path> <base-branch>`"))
  .and(DevelopmentProcess.expects("feature-branch refresh to use normal merges from the relevant base or release branches when the feature branch falls behind"))
  .and(DevelopmentProcess.associates(Artifact.featureBranch).with(Artifact.baseBranch))
  .and(DevelopmentProcess.associates(Artifact.implementationWorktree).with(Artifact.featureBranch))
  .and(DevelopmentProcess.associates(Artifact.featureBranch).with(Artifact.sourceRepo));

when(Actor.operator.finishes("code-changing implementation on a feature branch"))
  .then(DevelopmentProcess.prefers(Artifact.featureBranch))
  .and(DevelopmentProcess.expects("committed implementation changes on the feature branch"))
  .and(DevelopmentProcess.expects("a normal merge of the feature branch back into the base branch"))
  .and(DevelopmentProcess.expects("deletion of the merged local feature branch unless it is explicitly preserved for a recorded reason"))
  .and(DevelopmentProcess.expects("removal of the merged clean implementation worktree once it is no longer needed"))
  .and(DevelopmentProcess.expects("release promotion to main and release-tag creation before runtime deploy"))
  .and(DevelopmentProcess.requires(Rule.mergeIntoBase));

when(Actor.operator.runs("development or local verification for a feature branch"))
  .then(DevelopmentProcess.expects(Artifact.implementationWorktree))
  .and(DevelopmentProcess.treats("the implementation worktree as the editable development surface"))
  .and(DevelopmentProcess.treats("the manager runtime host as the control-plane and deploy surface rather than the preferred target for heavy verification load"))
  .and(DevelopmentProcess.prefers(Artifact.developmentWorker).for("resource-heavy checks, builds, lint-fix passes, and broad refactors"))
  .and(DevelopmentProcess.expects("bun run agent:connect-worker-ec2-ssh to be the normal command for reaching a reusable or newly launched development worker"))
  .and(DevelopmentProcess.expects("a worker used for active branch work to have git installed and commit authorship copied from the manager host"))
  .and(DevelopmentProcess.expects("worker failure during active development to be answered by worker repair, reboot, or replacement before resuming heavy work"))
  .and(DevelopmentProcess.expects("unused worker instances to be disposed once an active replacement worker is ready"))
  .and(DevelopmentProcess.expects("manager-host git to fetch or pull committed worker branch state before GitHub push, release promotion, and deploy"));

when(Artifact.blueprint.exists())
  .then(DevelopmentProcess.expects(Artifact.blueprintState))
  .and(DevelopmentProcess.treats("blueprint as ideal and blueprint-state as current comparison"));

when(Actor.operator.starts("implementation"))
  .then(DevelopmentProcess.expects(Artifact.agentishSections))
  .and(DevelopmentProcess.expects(Artifact.techStack))
  .and(DevelopmentProcess.expects(Artifact.codingStandards))
  .and(DevelopmentProcess.expects(Artifact.renderDiagnostics))
  .and(DevelopmentProcess.expects(Artifact.agentDebugTools))
  .and(DevelopmentProcess.treats("agentish-sections, tech-stack, coding-standards, render-diagnostics, and agent-debug-tools as repository-wide prerequisite reading when they are relevant"));

when(Actor.operator.defines("a subject blueprint"))
  .then(DevelopmentProcess.expects(Artifact.agentishSections))
  .and(DevelopmentProcess.treats("agentish-sections as the canonical in-file subject blueprint structure"));

when(Artifact.processBlueprint.exists())
  .then(DevelopmentProcess.treats("process blueprint JSON as a first-class blueprint artifact"))
  .and(DevelopmentProcess.requires("process-blueprint changes to be committed before dependent implementation"));

when(Actor.operator.starts("substantial unfinished implementation work"))
  .then(DevelopmentProcess.prefers(Artifact.ticketPlan))
  .and(DevelopmentProcess.keeps("implementation sequencing and active work tracking in the ticket system"));

when(Actor.operator.rollsOut("a committed revision to runtime"))
  .then(DevelopmentProcess.requires(Rule.standardRuntimeDeploy))
  .and(DevelopmentProcess.requires(Rule.deployByCheckout))
  .and(DevelopmentProcess.treats("deploy-manager-runtime as the canonical rollout blueprint"))
  .and(DevelopmentProcess.expects("a clean shared base-branch checkout before release promotion"))
  .and(DevelopmentProcess.expects("promotion of the intended integrated commit to main"))
  .and(DevelopmentProcess.expects("creation and push of a release git tag before runtime deploy"))
  .and(DevelopmentProcess.expects("bun run deploy-manager-runtime <release-tag> to be the normal rollout command"))
  .and(DevelopmentProcess.expects("post-deploy UI verification on this machine to use agent-browser for behavior and visual verification with saved screenshots at small, medium, and wide viewport sizes"));

when(Artifact.temporaryState.contains("durable app content"))
  .then(DevelopmentProcess.violates(Rule.stateTemporaryOnly));

when(Artifact.runtimeCheckout.receives("manual code edits"))
  .then(DevelopmentProcess.violates(Rule.runtimeReadonly));
