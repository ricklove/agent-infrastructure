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
  runtimeCheckout: define.workspace("RuntimeCheckout"),
  targetRevision: define.document("TargetRevision"),
  frontendBuild: define.document("RuntimeFrontendBuild"),
  backendProcess: define.entity("RuntimeBackendProcess"),
  tunnel: define.entity("DashboardTunnel"),
  verification: define.document("PostDeployVerification"),
};

const Policy = {
  sourceCommittedOnly: define.concept("CommittedSourceOnlyDeploy"),
  runtimeCheckoutDeploy: define.concept("RuntimeCheckoutDeploy"),
  frontendBuildRequired: define.concept("FrontendBuildRequired"),
  backendRestartOnly: define.concept("BackendRestartOnly"),
  tunnelUntouched: define.concept("TunnelUntouchedByDeploy"),
  controllerOwnsTunnel: define.concept("ControllerOwnsTunnelLifecycle"),
  devProcessResumesAfterDeploy: define.concept("ReturnToDevelopmentProcessVerification"),
};

DeployManagerRuntime.enforces(`
- Deploy starts from a committed source revision on the base branch.
- Deploy updates the runtime checkout to the intended committed revision.
- Deploy rebuilds frontend assets from the runtime checkout after that checkout update.
- Deploy may terminate local backend server processes so normal runtime supervision can restart them.
- Deploy does not manage dashboard tunnel lifecycle.
- Deploy does not replace, rotate, or reissue the dashboard public URL.
- Dashboard tunnel lifecycle remains owned by the dashboard controller.
- Deploy is not complete until the normal development-process post-deploy verification steps run.
`);

DeployManagerRuntime.defines(`
- CommittedSourceOnlyDeploy means rollout targets a committed source revision rather than runtime drift or uncommitted workspace state.
- RuntimeCheckoutDeploy means the deployed tree is advanced by git checkout or pull in the runtime checkout, not by manual file edits.
- FrontendBuildRequired means frontend assets are rebuilt from the runtime checkout after the target revision is selected.
- BackendRestartOnly means deploy restarts local backend server processes and relies on normal supervision for recovery rather than ad hoc runtime mutation.
- TunnelUntouchedByDeploy means deploy never kills, replaces, rotates, or otherwise manages the dashboard tunnel.
- ControllerOwnsTunnelLifecycle means only the dashboard controller or its recovery policy decides tunnel repair or replacement.
- ReturnToDevelopmentProcessVerification means rollout hands back to the normal post-deploy verification flow for version checks, health checks, browser verification, and screenshots.
`);

DeployManagerRuntime.contains(
  Artifact.sourceRepo,
  Artifact.baseBranch,
  Artifact.runtimeCheckout,
  Artifact.targetRevision,
  Artifact.frontendBuild,
  Artifact.backendProcess,
  Artifact.tunnel,
  Artifact.verification,
  Policy.sourceCommittedOnly,
  Policy.runtimeCheckoutDeploy,
  Policy.frontendBuildRequired,
  Policy.backendRestartOnly,
  Policy.tunnelUntouched,
  Policy.controllerOwnsTunnel,
  Policy.devProcessResumesAfterDeploy,
);

when(Actor.operator.runs("a standard manager runtime deploy"))
  .then(DeployManagerRuntime.requires(Policy.sourceCommittedOnly))
  .and(DeployManagerRuntime.requires(Policy.runtimeCheckoutDeploy))
  .and(DeployManagerRuntime.requires(Policy.frontendBuildRequired))
  .and(DeployManagerRuntime.requires(Policy.backendRestartOnly))
  .and(DeployManagerRuntime.requires(Policy.tunnelUntouched))
  .and(DeployManagerRuntime.requires(Policy.devProcessResumesAfterDeploy));

when(Artifact.runtimeCheckout.receives("the target committed revision"))
  .then(DeployManagerRuntime.expects(Artifact.frontendBuild))
  .and(DeployManagerRuntime.expects("frontend build completion before backend restart"));

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
  .and(DeployManagerRuntime.expects("real browser verification"));
