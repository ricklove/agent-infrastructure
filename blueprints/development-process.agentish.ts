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
  workerDevelopmentHost: define.workspace("WorkerDevelopmentHost"),
  workerCheckout: define.workspace("WorkerCheckout"),
  workerPreviewDashboard: define.workspace("WorkerPreviewDashboard"),
  workerPreviewTunnel: define.document("WorkerPreviewTunnelUrl"),
  runtimeCheckout: define.workspace("RuntimeCheckout"),
  temporaryState: define.workspace("TemporaryRuntimeState"),
  appData: define.workspace("DurableAppData"),
  blueprint: define.document("RelevantBlueprint"),
  agentishSections: define.document("AgentishSectionsBlueprint"),
  techStack: define.document("TechStackBlueprint"),
  codingStandards: define.document("CodingStandardsBlueprint"),
  renderDiagnostics: define.document("RenderDiagnosticsBlueprint"),
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
  workerBackedDevelopment: define.concept("WorkerBackedDevelopment"),
  persistentWorkerTerminals: define.concept("PersistentWorkerTerminalWorkflow"),
  workerPreviewMode: define.concept("WorkerDashboardPreviewMode"),
  livePeerDevelopment: define.concept("LivePeerDevelopment"),
  stableMilestoneCommits: define.concept("StableMilestoneCommits"),
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
- The repository Agentish sections blueprint should be read before defining or restructuring a subject blueprint.
- The repository tech-stack blueprint and coding-standards blueprint must be read before implementation begins.
- The repository render-diagnostics blueprint should be read before introducing repository-wide rerender instrumentation or broad UI render-count probes.
- Changes that alter canonical tooling, frameworks, styling systems, verification surfaces, or repository technology choices must update the tech-stack blueprint before implementation dependence continues.
- Changes that alter repository coding norms, allowed abstraction shape, styling exceptions, branching style, or dependency discipline must update the coding-standards blueprint before implementation dependence continues.
- Changes that alter repository-wide render instrumentation shape, naming, or diagnosis workflow must update the render-diagnostics blueprint before implementation dependence continues.
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
- Code-changing implementation work should use a swarm worker as the active development host rather than the manager runtime host.
- New features, broad refactors, dependency installation, workspace builds, workspace checks, and other substantial implementation loops are always worker-host work and must not run on the manager host.
- When a swarm worker is used for development, the worker checkout is the only active mutable implementation surface for that branch and should be treated as a remote worktree.
- When a swarm worker is used for development, that worker should have its own isolated workspace checkout and its own worker-local runtime surface rather than sharing the manager host runtime or canonical shared checkout.
- A worker-host implementation surface must not have direct write access to the manager host shared repository checkout or runtime checkout.
- A worker-host implementation surface must not inherit long-lived manager git credentials or ambient git authority for canonical manager repositories.
- When a swarm worker is used for development, the manager host remains the integration, GitHub push, release, deploy, and live-verification surface rather than a parallel editing surface.
- The manager host must not be used as the active mutable implementation surface for code-changing feature or fix work.
- Development on a swarm worker should happen through persistent worker terminals rather than one-off ssh command invocations for routine edit and verification loops.
- Implementation worktrees should live under `~/workspace/projects-worktrees/<repo-name>/<branch-name>` rather than inside the shared repository tree or in ad hoc temp directories.
- Supported dashboard preview on a worker should run as a worker-local dashboard replica whose public entrypoint is the Bun dashboard gateway rather than raw Vite.
- Supported dashboard preview on a worker should preserve the manager dashboard port topology unless a more specific runtime blueprint explicitly closes a different preview shape.
- Supported dashboard preview on a worker may proxy frontend development traffic from the Bun dashboard gateway to a worker-local Vite server so HMR remains available without exposing raw Vite as the public dashboard origin.
- Supported worker preview tunnels should target the worker Bun dashboard gateway rather than the raw Vite dev server.
- Worker-host exploratory or UI-directed agent-chat sessions should default to the Discuss process blueprint unless an operator explicitly requests an implementation-oriented process.
- A prompt-driven design or critique surface must not auto-create coding-capable sessions against the manager workspace by default.
- Live Peer Development is a sanctioned alternative to the full release workflow for iterative worker-host feature development with an actively shared worker preview dashboard.
- Live Peer Development should still follow blueprint-first worker-backed feature-branch development, local verification, and committed milestone updates.
- Live Peer Development should stop before merge into the base branch, release promotion, release tagging, runtime deploy, and manager-host live validation unless the operator explicitly switches back to the full development process.
- Live Peer Development should provide the worker preview URL to the operator and should expect continued operator feedback while the worker preview remains the active review surface.
- Live Peer Development should record stable milestones as feature-branch commits rather than leaving iterative preview work only in uncommitted worker state.
- Live Peer Development may include high-level dashboard UI iteration, mockups, or exploratory design outputs in addition to implementation changes, but any code-changing work still belongs on the worker feature branch.
- The preferred setup sequence is to create the implementation worktree from the shared base-branch checkout with `git worktree add -b <feature-branch> <worktree-path> <base-branch>` so branch creation and worktree creation happen together.
- After creating or attaching the feature-branch worktree, merge any relevant upstream from `origin/development` or `origin/main` into that feature branch before more implementation continues.
- If a feature branch already exists, the implementation worktree should be created by attaching that branch with `git worktree add <worktree-path> <feature-branch>` rather than by checking the feature branch out in the shared base-branch checkout.
- If an active feature branch falls behind the current base branch or the release branch, it should be refreshed by merging those branches into the feature branch with normal merge commits as needed rather than relying on rebases.
- Normal merge commits are an acceptable and preferred way to refresh a feature branch during active work; rebasing is optional and never required by this process.
- Completed feature branch work should be committed and merged back into the base branch before release promotion proceeds.
- Promotion from a feature branch into the base branch should use a normal merge commit rather than fast-forwarding away the branch-stage transition.
- Promotion from the base branch into the release branch should use a normal merge commit rather than fast-forwarding away the release-stage transition.
- Fast-forward-only promotion is not an acceptable substitute for the required merge-stage commits in this workflow.
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
- UI-facing changes require real browser verification with `agent-browser`, visual verification on the rendered UI, saved screenshots, verification at small, medium, and wide viewport sizes, and deployed frontend-backend version matching.
- Responsive UI changes must be verified with `agent-browser` at small, medium, and wide viewport sizes.
- Post-deploy verification should record runtime checkout revision match, frontend-backend version match, live health verification, issuance of a manager-dashboard session URL with `bun run issue:dashboard-session`, real browser verification at the public Cloudflare manager dashboard URL using the issued session URL, and a screenshot posted into the chat as a markdown image from the approved temporary image space under `~/temp` showing the changes on the manager dashboard at that URL.
- If the operator cannot post a manager-dashboard screenshot into the chat as a markdown image from the approved temporary image space under `~/temp` for the new release, the rollout should be treated as failed, rolled back to an earlier known-good release tag, and kept in screenshot verification until a stable working release is found; the failed release tag should then be deleted locally and on the remote after recovery.
- A rollout is not complete until post-deploy behavior has been verified on the live system.
`);

DevelopmentProcess.defines(`
- BlueprintFirstChange means architecture and policy are corrected in blueprints before code is changed.
- TechStackBlueprint means the repository-wide blueprint that owns canonical technology choices and stack exceptions.
- AgentishSectionsBlueprint means the repository-wide blueprint that owns the canonical in-file section structure for a subject Agentish blueprint.
- CodingStandardsBlueprint means the repository-wide blueprint that owns code-shaping norms and repository implementation discipline.
- RenderDiagnosticsBlueprint means the repository-wide blueprint that owns the shared global render-counter model for UI rerender diagnosis.
- ProcessBlueprintJson means a machine-readable process contract in blueprints/ that the system may assign to a chat session.
- BlueprintCommitBeforeImplementation means blueprint edits are turned into a committed source revision before dependent implementation work starts.
- BlueprintStateTracksCurrentReality means blueprint-state records current implementation status, confidence, evidence, gaps, and known issues relative to the ideal blueprint.
- WorkspaceToolingDiscovery means local machine tooling should be discovered from `/home/ec2-user/workspace/README.md` and `/home/ec2-user/workspace/tools/` guidance before installing replacements or parallel toolchains.
- For UI verification on this machine, `agent-browser` is the expected browser tool for both behavior verification and visual verification, including small, medium, and wide viewport checks, unless a more specific documented workspace replacement supersedes it.
- IsolatedGitWorktreeDevelopment means code-changing implementation work happens in a git worktree associated with a feature branch rather than in a shared checkout, and the normal setup path is to create the worktree and feature branch together from the base branch.
- WorkerBackedDevelopment means code-changing implementation work belongs on a swarm worker host whose checkout serves as the active remote worktree for that branch, with the manager host reserved for integration, deployment, and live verification.
- WorkerIsolatedWorkspace means a development worker keeps its own workspace checkout and worker-local runtime surface instead of sharing the manager runtime tree or shared integration checkout.
- ManagerGitAuthorityBoundary means manager-host git credentials and canonical repository authority stay on the manager integration surface and are not ambiently copied onto worker development surfaces.
- WorkerDashboardPreviewMode means a worker-host development session may expose a worker-local dashboard replica through the Bun dashboard gateway while forwarding frontend development traffic to Vite for HMR.
- LivePeerDevelopment means a worker-backed feature branch stays in active iterative development with a live worker preview shared to the operator, while merge, release promotion, deploy, and manager live validation remain deferred.
- StableMilestoneCommits means preview-driven feature work is checkpointed as deliberate feature-branch commits whenever the operator reaches a coherent testing milestone.
- DiscussByDefaultForExploration means agent-chat sessions created from exploratory prompt canvases, critique tools, or similar high-level interactive design surfaces start in the `Discuss` process unless the operator explicitly selects a code-changing process.
- PersistentWorkerTerminalWorkflow means worker-host development should use long-lived interactive worker terminals for normal editing and verification loops instead of repeated one-off ssh command execution.
- CanonicalWorktreeLocation means implementation worktrees should live under `~/workspace/projects-worktrees/<repo-name>/<branch-name>` so they stay separate from canonical shared repo checkouts and are easy to audit and remove.
- FeatureBranchMergesIntoBase means implementation commits land on a feature branch first and are merged back into the base branch before rollout.
- MergeCommitPromotion means branch-stage transitions stay visible as normal merge commits rather than being collapsed into fast-forward updates.
- FeatureBranchRefreshByMerge means an active feature branch should be updated from `origin/development`, `origin/main`, or both with normal merge commits when it falls behind those branches, and the process does not require rebasing for that refresh.
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
  Artifact.workerDevelopmentHost,
  Artifact.workerCheckout,
  Artifact.workerPreviewDashboard,
  Artifact.workerPreviewTunnel,
  Artifact.runtimeCheckout,
  Artifact.temporaryState,
  Artifact.appData,
  Artifact.blueprint,
  Artifact.agentishSections,
  Artifact.techStack,
  Artifact.codingStandards,
  Artifact.renderDiagnostics,
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
  Rule.workerBackedDevelopment,
  Rule.persistentWorkerTerminals,
  Rule.workerPreviewMode,
  Rule.livePeerDevelopment,
  Rule.stableMilestoneCommits,
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
  .and(DevelopmentProcess.requires(Artifact.agentishSections))
  .and(DevelopmentProcess.requires(Artifact.techStack))
  .and(DevelopmentProcess.requires(Artifact.codingStandards))
  .and(DevelopmentProcess.requires(Artifact.renderDiagnostics))
  .and(DevelopmentProcess.requires(Rule.sourceOnly))
  .and(DevelopmentProcess.requires(Rule.worktreeIsolation))
  .and(DevelopmentProcess.requires(Rule.workerBackedDevelopment))
  .and(DevelopmentProcess.requires(Rule.persistentWorkerTerminals))
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
  .and(DevelopmentProcess.requires(Rule.worktreeIsolation))
  .and(DevelopmentProcess.requires(Rule.workerBackedDevelopment))
  .and(DevelopmentProcess.requires(Rule.persistentWorkerTerminals))
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
  .and(DevelopmentProcess.requires(Artifact.workerDevelopmentHost))
  .and(DevelopmentProcess.requires(Artifact.workerCheckout))
  .and(DevelopmentProcess.expects("feature-branch creation to leave the shared checkout on the base branch"))
  .and(DevelopmentProcess.expects("the normal setup command to be `git worktree add -b <feature-branch> <worktree-path> <base-branch>`"))
  .and(DevelopmentProcess.expects("the active branch workspace to live on a worker checkout for implementation work"))
  .and(DevelopmentProcess.expects("the worker checkout to be isolated from the manager runtime checkout and shared integration checkout"))
  .and(DevelopmentProcess.expects("the worker runtime and workspace surfaces to be disposable or replaceable without mutating manager-host canonical surfaces"))
  .and(DevelopmentProcess.expects("manager-host git authority to remain outside the worker unless an explicit promotion or fetch path is invoked"))
  .and(DevelopmentProcess.expects("worker-host development to keep the manager host as the integration-only surface until fetch, push, deploy, or live verification is needed"))
  .and(DevelopmentProcess.expects("worker-host development to use persistent worker terminals for routine editing and verification"))
  .and(DevelopmentProcess.expects("feature-branch refresh to use normal merges from the relevant base or release branches when the feature branch falls behind"))
  .and(DevelopmentProcess.associates(Artifact.featureBranch).with(Artifact.baseBranch))
  .and(DevelopmentProcess.associates(Artifact.implementationWorktree).with(Artifact.featureBranch))
  .and(DevelopmentProcess.associates(Artifact.featureBranch).with(Artifact.sourceRepo));

when(Actor.operator.creates("an exploratory prompt-driven agent session on a worker-host board or critique surface"))
  .then(DevelopmentProcess.requires(Artifact.processBlueprint))
  .and(DevelopmentProcess.expects("the selected process blueprint to default to `Discuss`"))
  .and(DevelopmentProcess.expects("an implementation-oriented process to require explicit operator intent"))
  .and(DevelopmentProcess.expects("the default working directory for that exploratory session to stay on the worker surface rather than the manager workspace"));

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
  .and(DevelopmentProcess.expects(Artifact.workerCheckout))
  .and(DevelopmentProcess.treats("the implementation worktree or worker checkout as the editable development surface depending on where the active branch is hosted"))
  .and(DevelopmentProcess.treats("a worker checkout as the required editable development surface for code-changing work"))
  .and(DevelopmentProcess.treats("persistent worker terminals as the preferred control loop when the active branch is hosted on a worker"));

when(Actor.operator.runs("supported dashboard preview mode on a worker"))
  .then(DevelopmentProcess.requires(Rule.workerBackedDevelopment))
  .and(DevelopmentProcess.requires(Rule.workerPreviewMode))
  .and(DevelopmentProcess.expects(Artifact.workerCheckout))
  .and(DevelopmentProcess.expects(Artifact.workerPreviewDashboard))
  .and(DevelopmentProcess.expects(Artifact.workerPreviewTunnel))
  .and(DevelopmentProcess.expects("the worker Bun dashboard gateway to be the public preview entrypoint"))
  .and(DevelopmentProcess.expects("frontend HMR to arrive through a Bun-to-Vite dev proxy rather than by exposing raw Vite directly"))
  .and(DevelopmentProcess.expects("the preview surface to stay isolated on the worker host rather than the manager runtime host"));

when(Actor.operator.assigns("the Live Peer Development process"))
  .then(DevelopmentProcess.requires(Rule.livePeerDevelopment))
  .and(DevelopmentProcess.requires(Rule.workerBackedDevelopment))
  .and(DevelopmentProcess.requires(Rule.stableMilestoneCommits))
  .and(DevelopmentProcess.expects(Artifact.featureBranch))
  .and(DevelopmentProcess.expects(Artifact.workerCheckout))
  .and(DevelopmentProcess.expects(Artifact.workerPreviewDashboard))
  .and(DevelopmentProcess.expects(Artifact.workerPreviewTunnel))
  .and(DevelopmentProcess.expects("stable milestone commits on the feature branch during iterative user testing"))
  .and(DevelopmentProcess.expects("continued operator feedback against the worker preview as part of normal process flow"))
  .and(DevelopmentProcess.avoids("merge into the base branch before the operator explicitly leaves live peer development"))
  .and(DevelopmentProcess.avoids("release promotion, deploy, or manager live validation before the operator explicitly leaves live peer development"));

when(Artifact.blueprint.exists())
  .then(DevelopmentProcess.expects(Artifact.blueprintState))
  .and(DevelopmentProcess.treats("blueprint as ideal and blueprint-state as current comparison"));

when(Actor.operator.starts("implementation"))
  .then(DevelopmentProcess.expects(Artifact.agentishSections))
  .and(DevelopmentProcess.expects(Artifact.techStack))
  .and(DevelopmentProcess.expects(Artifact.codingStandards))
  .and(DevelopmentProcess.expects(Artifact.renderDiagnostics))
  .and(DevelopmentProcess.treats("agentish-sections, tech-stack, coding-standards, and render-diagnostics as repository-wide prerequisite reading when they are relevant"));

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

when(Actor.operator.runs("dependency installation, workspace checks, or workspace builds for code-changing implementation"))
  .then(DevelopmentProcess.requires(Artifact.workerCheckout))
  .and(DevelopmentProcess.expects("those commands to run on the worker host rather than on the manager host"));

when(Actor.operator.uses("the manager host as the active mutable implementation surface for code-changing work"))
  .then(DevelopmentProcess.violates(Rule.workerBackedDevelopment))
  .and(DevelopmentProcess.violates("manager-host isolation for implementation"));
