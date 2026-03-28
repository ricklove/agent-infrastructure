/// <reference path="./_agentish.d.ts" />

// Deploy Manager Runtime

const Agentish = define.language("Agentish");

const DeployManagerRuntime = define.system("DeployManagerRuntime", {
  format: Agentish,
  role: "Standard operator rollout path for updating the deployed manager runtime checkout to a committed source revision without interfering with dashboard tunnel ownership",
});

const Actor = {
  operator: define.actor("RuntimeDeployOperator"),
  controller: define.actor("DashboardController"),
};

const Artifact = {
  sourceRepo: define.workspace("SourceRepository"),
  baseBranch: define.workspace("BaseBranch"),
  releaseBranch: define.workspace("ReleaseBranch"),
  runtimeCheckout: define.workspace("RuntimeCheckout"),
  releaseTag: define.document("ReleaseGitTag"),
  targetRevision: define.document("TargetRevision"),
  frontendBuild: define.document("RuntimeFrontendBuild"),
  backendProcess: define.entity("RuntimeBackendProcess"),
  tunnel: define.entity("DashboardTunnel"),
  verification: define.document("PostDeployVerification"),
};

const Policy = {
  sourceCommittedOnly: define.concept("CommittedSourceOnlyDeploy"),
  releaseFromMain: define.concept("ReleasePromotionFromMain"),
  tagTargetDeploy: define.concept("ReleaseTagDeployTarget"),
  runtimeCheckoutDeploy: define.concept("RuntimeCheckoutDeploy"),
  frontendBuildRequired: define.concept("FrontendBuildRequired"),
  backendRestartOnly: define.concept("BackendRestartOnly"),
  tunnelUntouched: define.concept("TunnelUntouchedByDeploy"),
  controllerOwnsTunnel: define.concept("ControllerOwnsTunnelLifecycle"),
  devProcessResumesAfterDeploy: define.concept("ReturnToDevelopmentProcessVerification"),
};

DeployManagerRuntime.enforces(`
- Deploy starts from a committed source revision that has already been promoted to `main`.
- Deploy starts from a release git tag created from that promoted release commit.
- Deploy updates the runtime checkout to the intended release tag.
- Deploy rebuilds frontend assets from the runtime checkout after that checkout update.
- Deploy may terminate local backend server processes so normal runtime supervision can restart them.
- Deploy does not manage dashboard tunnel lifecycle.
- Deploy does not replace, rotate, or reissue the dashboard public URL.
- In named tunnel mode, deploy does not recreate the named tunnel and does not rotate the stable stack-owned hostname as part of rollout.
- Tunnel provisioning for a new stack happens before CDK deploy, not during runtime deploy.
- Tunnel token secrets are prepared before CDK deploy and are consumed by reference during runtime rollout.
- The stack DNS route is prepared before CDK deploy and is not managed during runtime rollout.
- Stack-owned hostname metadata is prepared before CDK deploy and fetched by the manager at runtime rather than through EC2 user data.
- Sensitive dashboard runtime secrets should be consumed from AWS runtime fetch paths rather than refreshed through EC2 user data.
- Dashboard tunnel lifecycle remains owned by the dashboard controller.
- Deploy is not complete until the normal development-process post-deploy verification steps run.
`);

DeployManagerRuntime.defines(`
- CommittedSourceOnlyDeploy means rollout targets a committed source revision.
- ReleasePromotionFromMain means the release commit is promoted onto `main` before a runtime deploy is allowed.
- ReleaseTagDeployTarget means runtime checkout targets an immutable release git tag.
- RuntimeCheckoutDeploy means the deployed tree is advanced by git checkout of the release tag in the runtime checkout.
- FrontendBuildRequired means frontend assets are rebuilt from the runtime checkout after the target revision is selected.
- BackendRestartOnly means deploy restarts local backend server processes and relies on normal runtime supervision for recovery.
- TunnelUntouchedByDeploy means deploy never kills, replaces, rotates, or otherwise manages the dashboard tunnel.
- In named tunnel mode, TunnelUntouchedByDeploy also means deploy does not recreate the persistent named tunnel connector; only the controller manages connector health for the stable stack-owned hostname path.
- ControllerOwnsTunnelLifecycle means only the dashboard controller or its recovery policy decides tunnel repair or replacement.
- ReturnToDevelopmentProcessVerification means rollout hands back to the normal post-deploy verification flow for runtime revision and version checks, health checks, browser verification at the public Cloudflare manager dashboard URL, and manager-dashboard screenshots posted into the chat.
`);

DeployManagerRuntime.contains(
  Artifact.sourceRepo,
  Artifact.baseBranch,
  Artifact.releaseBranch,
  Artifact.runtimeCheckout,
  Artifact.releaseTag,
  Artifact.targetRevision,
  Artifact.frontendBuild,
  Artifact.backendProcess,
  Artifact.tunnel,
  Artifact.verification,
  Policy.sourceCommittedOnly,
  Policy.releaseFromMain,
  Policy.tagTargetDeploy,
  Policy.runtimeCheckoutDeploy,
  Policy.frontendBuildRequired,
  Policy.backendRestartOnly,
  Policy.tunnelUntouched,
  Policy.controllerOwnsTunnel,
  Policy.devProcessResumesAfterDeploy,
);

when(Actor.operator.runs("a standard manager runtime deploy"))
  .then(DeployManagerRuntime.requires(Policy.sourceCommittedOnly))
  .and(DeployManagerRuntime.requires(Policy.releaseFromMain))
  .and(DeployManagerRuntime.requires(Policy.tagTargetDeploy))
  .and(DeployManagerRuntime.requires(Policy.runtimeCheckoutDeploy))
  .and(DeployManagerRuntime.requires(Policy.frontendBuildRequired))
  .and(DeployManagerRuntime.requires(Policy.backendRestartOnly))
  .and(DeployManagerRuntime.requires(Policy.tunnelUntouched))
  .and(DeployManagerRuntime.requires(Policy.devProcessResumesAfterDeploy));

when(Artifact.runtimeCheckout.receives("the target release tag"))
  .then(DeployManagerRuntime.expects(Artifact.frontendBuild))
  .and(DeployManagerRuntime.expects("frontend build completion before backend restart"))
  .and(DeployManagerRuntime.expects("runtime checkout revision to match the tagged release commit"));

when(Artifact.releaseTag.identifies("the deploy target"))
  .then(DeployManagerRuntime.expects(Artifact.releaseBranch))
  .and(DeployManagerRuntime.expects("the release tag to point at a commit on main"));

when(Actor.operator.restarts("runtime backend processes during deploy"))
  .then(DeployManagerRuntime.keeps(Artifact.tunnel))
  .and(DeployManagerRuntime.reliesOn("normal runtime supervision to bring local backend processes back"))
  .and(DeployManagerRuntime.avoids("controller or tunnel management actions as a deploy shortcut"));

when(Actor.controller.owns("dashboard lifecycle and recovery"))
  .then(DeployManagerRuntime.requires(Policy.controllerOwnsTunnel))
  .and(DeployManagerRuntime.treats(Artifact.tunnel).as("controller-owned operational state"));

when(Artifact.verification.records("post-deploy outcome"))
  .then(DeployManagerRuntime.expects("runtime checkout revision match"))
  .and(DeployManagerRuntime.expects("frontend and backend version match"))
  .and(DeployManagerRuntime.expects("live health verification"))
  .and(DeployManagerRuntime.expects("issuance of a manager-dashboard session URL with `bun run issue:dashboard-session`"))
  .and(DeployManagerRuntime.expects("real browser verification at the public Cloudflare manager dashboard URL using the issued manager-dashboard session URL"))
  .and(DeployManagerRuntime.expects("a screenshot posted into the chat as a markdown image from the approved temporary image space under `~/temp` showing the changes on the manager dashboard at the public Cloudflare manager dashboard URL"));

when(Actor.operator.cannot("post a manager-dashboard screenshot into the chat as a markdown image from the approved temporary image space under `~/temp` for the new release"))
  .then(DeployManagerRuntime.treats("the rollout as failed"))
  .and(DeployManagerRuntime.requires("rollback to an earlier known-good release tag"))
  .and(DeployManagerRuntime.requires("continued screenshot verification until a stable working release is found"))
  .and(DeployManagerRuntime.requires("deletion of the failed release tag locally and on the remote after recovery"));
