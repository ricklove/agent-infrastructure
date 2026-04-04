/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const VerifyWorkerSurface = define.system(
  "VerifyWorkerSurface",
  {
    format: Agentish,
    role: "Standalone worker-readiness verification contract for a prepared worker surface",
  },
);

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const Artifact = {
  scriptConfig: define.document("WorkerSetupScriptConfig"),
  dashboardBoundary: define.document("CurrentWorkerSurfaceBoundary"),
  repoTarget: define.document("RepoTarget"),
  repoSyncFailure: define.document("RepoSyncFailureDetail"),
  promptSpec: define.document("WorkerPromptSpec"),
  phaseResult: define.document("WorkerSetupPhaseResult"),
  repoSyncResult: define.document("RepoSyncResult"),
  dashboardLaunchResult: define.document("DashboardLaunchResult"),
  browserVerificationResult: define.document("BrowserVerificationResult"),
  providerVerificationInvocation: define.document("ProviderVerificationInvocation"),
  providerVerificationResult: define.document("ProviderVerificationResult"),
  screenshotArtifact: define.document("ScreenshotArtifact"),
  successSummary: define.document("WorkerSetupSummary"),
  failureSummary: define.document("WorkerSetupFailureSummary"),
};

VerifyWorkerSurface.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
  Artifact.scriptConfig,
  Artifact.dashboardBoundary,
  Artifact.repoTarget,
  Artifact.repoSyncFailure,
  Artifact.promptSpec,
  Artifact.phaseResult,
  Artifact.repoSyncResult,
  Artifact.dashboardLaunchResult,
  Artifact.browserVerificationResult,
  Artifact.providerVerificationInvocation,
  Artifact.providerVerificationResult,
  Artifact.screenshotArtifact,
  Artifact.successSummary,
  Artifact.failureSummary,
);

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

VerifyWorkerSurface.enforces(`
- This subject is a standalone worker-readiness verification contract and must remain separate from the current \`prepare-worker-surface\` behavior.
- The script owns the orchestration flow for prerequisite validation, repo synchronization, dashboard startup, direct browser verification, Codex CLI verification, and Claude CLI verification.
- Durable worker-local credential surfaces remain authoritative for auth material, including GitHub App credentials needed for repo access.
- The script must not depend on SSH-mediated agent execution, public dashboard session URLs, manager-issued dashboard access links, or dashboard-access flow.
- The script must not redefine manager-worker architecture, worker lifecycle management, manager-side feature-branch preparation, release or deploy behavior, or broader development-process architecture.
- \`dashboardPort\` is the canonical dashboard-address input for this subject, and \`dashboardUrl\` must be derived from it as a localhost URL.
- The script must treat provider-driven browser runs as verification-only work; Codex and Claude may drive \`agent-browser\`, but they must not mutate repo state, dashboard configuration, or prompt source.
- Repo synchronization must treat \`origin/development\` as the required end state for every target repo.
- Dirty working trees must be handled through explicit failure reporting rather than by embedding dirty-state policy inside the target repo success definition.
- The script must emit machine-readable phase results, artifact results, success summary, and failure summary so downstream automation can validate the run without re-executing it.
`);

VerifyWorkerSurface.defines(`
- WorkerSetupScriptConfig means the complete CLI-derived or programmatic input object for the worker-surface verification script.
- CurrentWorkerSurfaceBoundary means a structured boundary record with excludedSurfaces, excludedResponsibilities, and nonGoals for this subject.
- RepoTarget means one repo-specific contract item with name, originUrl, localPath, desiredRemoteRef, and requiredEndState.
- RepoSyncFailureDetail means the structured failure record for a repo that does not reach the required end state.
- WorkerPromptSpec means one fixed-prompt contract item with promptId, sourceKind, sourceRef, and resolvedText.
- WorkerSetupPhaseResult means one phase-scoped status payload for a major step in the worker-readiness verification flow.
- RepoSyncResult means the per-repo synchronization result payload.
- DashboardLaunchResult means the dashboard startup result payload for the localhost runtime.
- BrowserVerificationResult means the direct local browser validation payload.
- ProviderVerificationInvocation means the reproducible execution record for a Codex or Claude CLI verification run.
- ProviderVerificationResult means the provider-specific verification payload produced after a Codex or Claude browser verification run.
- ScreenshotArtifact means one saved screenshot file produced by \`agent-browser\`.
- WorkerSetupSummary means the final success summary for a complete run.
- WorkerSetupFailureSummary means the failure summary returned as soon as a required phase fails.
`);

Section.concept.answers(
  "Why does this subject exist? To provide one direct, repeatable worker-readiness verification flow for a prepared worker surface so full development can prove that tools, auth, repo sync, dashboard startup, and browser-driven provider verification are usable before implementation begins.",
  "What is authoritative? This subject is authoritative for the readiness-verification flow only. It owns the sequence from prerequisite verification through repo sync, dashboard startup, and the three browser verification passes. Durable worker-local credential surfaces remain the authoritative source for auth material, while `prepare-worker-surface` remains authoritative for creating the worker capability but not for proving readiness.",
  "What must remain true? This subject stays separate from `prepare-worker-surface`, does not redefine manager-worker architecture, and does not become a generic worker lifecycle blueprint. Its scope is narrow and non-negotiable: verify the required auth and tool prerequisites, sync the repos to `origin/development`, start the dashboard on localhost, and validate the flow with direct `agent-browser`, Codex CLI, and Claude CLI runs that each save a screenshot.",
  "What are the core invariants? One script owns one worker-surface verification flow. Repo state, dashboard startup, and browser verification are part of that one flow and should not be split across competing orchestrators. Any SSH-mediated agent execution, temporary bootstrap credential ownership, broad lifecycle management, manager-side workflow expansion, or source-control promotion is out of scope for this blueprint.",
);

Section.scenarios.answers(
  "What must work end to end? A worker starts from the prepared environment and the script verifies the required local tools and auth prerequisites before doing any repository work. If GitHub App credentials are missing, a required binary is absent, or the worker cannot authenticate to origin, the run stops at setup with a clear stage-specific failure. If the script requires clean repos for the run, it checks that each target repo is clean before sync begins and fails at repo-preflight when a repo is dirty. The script clones any missing target repos from `origin`, or refreshes existing checkouts, then puts each target repo on `origin/development` as the observable end state for that repo. After the repos are in place, the script starts exactly one dashboard instance on the canonical localhost address and waits for it to become reachable before attempting any browser validation. A direct local `agent-browser` session opens that same localhost dashboard instance and saves a screenshot. A Codex CLI step runs with a fixed prompt that instructs the Codex worker provider to use `agent-browser` against that same localhost dashboard instance and save a screenshot. A Claude CLI step runs with a fixed prompt that instructs the Claude worker provider to use `agent-browser` against that same localhost dashboard instance and save a screenshot.",
  "What do humans observe? The run is readable as named phases: prerequisite setup, repo preflight, repo synchronization, dashboard startup, direct browser verification, Codex verification, and Claude verification. Each phase either reports a machine-readable success result or fails with a stage-specific error, repo name, or readiness timeout rather than collapsing into a generic worker verification error.",
  "What counts as success? The worker surface is proven ready: each target repo is synchronized to the expected `origin/development` state, the canonical localhost dashboard is live, and the direct browser, Codex, and Claude verification paths have each produced screenshots from that same dashboard instance.",
  "What do conflicts look like? Missing repo auth, dirty repos when clean repos are required, sync mismatches, dashboard readiness timeout, or any verification failure block the run at the relevant phase. Codex and Claude verification remain verification-only and must not mutate repo state, dashboard configuration, or prepared worker artifacts.",
);

Section.implementationPlan.answers(
  "What code structure exists? The subject should be implemented as one standalone Bun entrypoint, `scripts/verify-worker-surface.ts`. The script owns one worker-local verification workflow: validate prerequisites and credentials, synchronize the requested repos, start the dashboard on localhost, verify the dashboard directly with `agent-browser`, then run fixed-prompt Codex and Claude CLI verification steps against the same localhost surface and save their screenshots to deterministic paths.",
  "Where do responsibilities live? `dashboardPort` is the canonical dashboard-address source of truth for this subject. The script derives `dashboardUrl` as `http://127.0.0.1:<dashboardPort>` for readiness checks, browser navigation, logging, and artifact metadata. Setup owns worker-local tool checks and auth material validation, including GitHub App credentials present on the worker in the configured GitHub credential root, plus Codex and Claude auth surfaces already solved for worker-local execution. Repo synchronization owns git state preparation only. Dashboard startup owns only the localhost dashboard process and its readiness check. Verification owns only browser interaction and artifact capture.",
  "How does the implemented system behave? The workflow should be divided into explicit phases with hard failure boundaries: prerequisite validation, repo synchronization, dashboard startup, direct browser verification, Codex CLI verification, and Claude CLI verification. Repo synchronization should clone any missing repo from `origin`, require a clean working tree before mutating existing checkouts, run `git fetch origin --prune`, switch or create the `development` branch to track `origin/development`, reset the branch to `origin/development`, clean untracked files only if that is part of the explicit sync policy, and verify that each repo ends at `origin/development`. If a checkout is dirty, the script should fail with the repo name and stage instead of guessing a recovery path. The direct browser phase should use `agent-browser` against `http://127.0.0.1:<dashboardPort>` and should not consume or generate any public session URL. The Codex and Claude verification phases should each invoke their CLI with fixed, named prompts that instruct the provider to use `agent-browser` against the same localhost dashboard and save a screenshot to a stable path. Those prompts should be stored as canonical immutable prompt constants in the entrypoint, with names stable enough for contracts and tests to reference.",
  "What implementation choices remain closed? The script remains additive and isolated. It does not encode worker lifecycle management, manager-side feature-branch preparation, release or deploy behavior, or broader development-process architecture. The helper directory under `scripts/verify-worker-surface/` is optional and should be introduced only if the single entrypoint becomes too dense.",
  "What is the ideal file hierarchy? `scripts/verify-worker-surface.ts`; `scripts/verify-worker-surface.test.ts` if command parsing, prompt wiring, or artifact naming needs direct regression coverage; `scripts/verify-worker-surface/` only if the single entrypoint becomes too dense to keep readable.",
);

Section.contracts.answers(
  "What exact types exist? `WorkerSetupScriptConfig` includes workspaceRoot, repoTargets, developmentBranch, dashboardPort, screenshotDir, codexPrompt, claudePrompt, agentBrowserPath, and requireCleanRepos. `dashboardPort` is the canonical dashboard input, and `dashboardUrl` is derived from it as `http://127.0.0.1:<dashboardPort>`. `RepoTarget` includes name, originUrl, localPath, desiredRemoteRef, and requiredEndState, where desiredRemoteRef must resolve to `origin/development` and requiredEndState describes only the expected success state for that repo. `RepoSyncFailureDetail` includes repoName, localPath, stage, failureKind, expectedRemoteRef, actualRemoteRef, cleanBeforeSync, cleanAfterSync, recoverable, and notes. `WorkerPromptSpec` includes promptId, sourceKind, sourceRef, and resolvedText. `WorkerSetupPhaseResult` includes stepId, phase, status, startedAtMs, finishedAtMs, durationMs, inputs, outputs, repoResults, and error. `RepoSyncResult` includes repoName, originUrl, localPath, cloneMode, desiredRemoteRef, actualRemoteRef, cleanBeforeSync, cleanAfterSync, endedOnRequiredRef, failureDetail, and notes. `DashboardLaunchResult` includes dashboardPort, dashboardUrl, pid, ready, readyAtMs, logPath, and notes. `BrowserVerificationResult` includes toolName, url, viewport, screenshotPath, screenshotTaken, title, success, and notes. `ProviderVerificationInvocation` includes providerKind, command, cwd, promptId, promptSource, resolvedPromptText, and agentBrowserPath. `ProviderVerificationResult` includes providerKind, invocation, browserVerification, success, notes, mutatesRepoState, and mutatesDashboardConfig. `ScreenshotArtifact` includes path, ownerStep, label, viewport, capturedAtMs, and sourceUrl. `WorkerSetupSummary` includes success, workspaceRoot, repos, dashboard, browserChecks, providerChecks, artifacts, warnings, and errors. `WorkerSetupFailureSummary` includes failedStepId, failedPhase, failedAtMs, reason, recoverable, resumeStepId, rerunCommand, rerunCwd, partialArtifacts, partialRepos, and nextAction. `CurrentWorkerSurfaceBoundary` is a structured boundary record with excludedSurfaces, excludedResponsibilities, and nonGoals.",
  "What exact messages or boundaries exist? `CurrentWorkerSurfaceBoundary.excludedSurfaces` must list `prepare-worker-surface`, SSH-mediated agent execution, and worker-surface lifecycle outputs. `CurrentWorkerSurfaceBoundary.excludedResponsibilities` must list manager-side feature-branch preparation, worker-surface bootstrap orchestration, source-control promotion, and generic worker lifecycle management. `CurrentWorkerSurfaceBoundary.nonGoals` must state that this subject is only a standalone worker-readiness verification contract.",
  "What exact action contracts exist? The script must consume a config shape that names the repos to prepare, the canonical dashboard port, the screenshot destination, the fixed Codex and Claude prompt specs, and the worker-local browser path. It must derive the localhost dashboard URL from `dashboardPort` and use that derived URL consistently for dashboard launch, direct browser verification, and provider-driven browser verification. It must emit one `WorkerSetupPhaseResult` for each major phase: prerequisite validation, repo sync, dashboard launch, direct browser verification, Codex verification, and Claude verification. It must emit exactly one `ScreenshotArtifact` for the direct browser check, one for the Codex provider check, and one for the Claude provider check, unless a required phase fails before capture. It must treat `origin/development` as the required end state for every target repo and must report a failure if any repo does not reach that ref. It must report dirty working trees through `RepoSyncFailureDetail` and `RepoSyncResult.failureDetail`, not through `RepoTarget.requiredEndState`. It must not return `success: true` unless all required repos end on desiredRemoteRef, the dashboard is ready on localhost, and all three screenshot artifacts exist. It must return `WorkerSetupFailureSummary` as soon as a required phase fails, and the failure summary must preserve earlier successful artifacts and repo results. It must keep provider verification non-mutating: Codex and Claude runs may drive `agent-browser`, but they must not mutate repo state, alter the dashboard configuration, or rewrite the prompt source. `resumeStepId` and `rerunCommand` in `WorkerSetupFailureSummary` must point to the next actionable phase to rerun and must stay mechanically tied to failedPhase.",
  "What exact summaries cross boundaries? The final success summary must include the repo list, derived dashboard URL, and all screenshot artifact paths so downstream automation can validate the run without re-executing it.",
);
