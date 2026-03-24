/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Ideal infrastructure contract definition",
});

const CdkManagerInterface = define.system("CdkManagerInterface", {
  format: Agentish,
  role: "Ideal external contract between AWS provisioning and the manager repo",
});

const CDK = define.system("AwsSetupCdk", {
  role: "Provisioner of manager infrastructure",
});

const ManagerRepo = define.system("ManagerRepo", {
  role: "Repo-owned manager runtime and setup surface",
});

const ManagerHost = define.system("ManagerHost", {
  role: "Provisioned EC2 host for the manager runtime",
});

const Auth = define.system("DashboardAccessAuth", {
  role: "External caller that requests a dashboard access URL",
});

const Contract = {
  setupEntrypoint: define.entity("SetupEntrypoint"),
  bootstrapContext: define.entity("BootstrapContext"),
  managerDiscovery: define.entity("ManagerDiscoveryContract"),
  dashboardIssuer: define.entity("DashboardSessionIssuerContract"),
  dashboardAccessUrl: define.entity("DashboardAccessUrl"),
  namedTunnelConfig: define.entity("NamedTunnelConfig"),
  namedTunnelProvisioning: define.entity("NamedTunnelProvisioning"),
};

const Paths = {
  runtimeRoot: define.entity("RuntimeRootPath"),
  stateRoot: define.entity("StateRootPath"),
  workspaceRoot: define.entity("WorkspaceRootPath"),
  bootstrapContextPath: define.entity("BootstrapContextPath"),
  setupScriptPath: define.entity("SetupScriptPath"),
  cloudflareZoneConfigPath: define.entity("CloudflareZoneConfigPath"),
  cloudflarePreparedTunnelConfigPath: define.entity("CloudflarePreparedTunnelConfigPath"),
};

const Tags = {
  swarm: define.entity("SwarmTag"),
  role: define.entity("ManagerRoleTag"),
};

const Service = {
  monitor: define.entity("ManagerMonitorService"),
  dashboard: define.entity("DashboardService"),
};

const NonContract = {
  wrapperScripts: define.entity("GeneratedWrapperScripts"),
  packageLayout: define.entity("InternalPackageLayout"),
  serviceUnits: define.entity("ServiceUnitImplementation"),
  helperScripts: define.entity("HelperScriptImplementation"),
};

CdkManagerInterface.enforces(`
- The blueprint describes the ideal external contract, not the current implementation.
- CDK depends on one repo-owned setup entrypoint.
- Auth depends on one repo-owned dashboard session issuer contract.
- Internal files, packages, wrappers, and service wiring are not part of the external contract.
`);

CdkManagerInterface.defines(`
- The manager host clones the manager repo into a runtime root.
- CDK writes bootstrap context before setup runs.
- AWS setup commands automatically run a pre-CDK Cloudflare provisioning step when local Cloudflare zone config exists.
- The repo exposes one idempotent setup entrypoint.
- Running setup from repo contents plus bootstrap context is sufficient to provision the manager host.
- After setup, the manager host provides a monitor service and a dashboard service.
- CDK may read deploy-machine-only prepared Cloudflare tunnel config from a local file outside the repo and project it into bootstrap context.
- If named tunnel configuration is present in bootstrap context, the manager host can provide dashboard public ingress through that stack-owned tunnel plus ephemeral session hostnames.
- Auth can request a dashboard access URL without knowing the repo's internal structure.
`);

Paths.runtimeRoot.means("/home/ec2-user/runtime");
Paths.stateRoot.means("/home/ec2-user/state");
Paths.workspaceRoot.means("/home/ec2-user/workspace");
Paths.bootstrapContextPath.means("/home/ec2-user/state/bootstrap-context.json");
Paths.setupScriptPath.means("/home/ec2-user/runtime/scripts/setup.sh");
Paths.cloudflareZoneConfigPath.means("~/.cloudflared/zone-config.json");
Paths.cloudflarePreparedTunnelConfigPath.means("~/.cloudflared/stack-tunnels/<stackName>.json");

Contract.setupEntrypoint.means(`
- a repo-owned executable entrypoint
- idempotent host provisioning
- accepts runtime root, state root, workspace root, and bootstrap context path
`);

Contract.bootstrapContext.contains(`
- region
- swarmTagKey
- swarmTagValue
- workerInstanceType
- workerInstanceProfileArn
- workerSecurityGroupId
- workerSubnetIds
- runtimeRepoUrl
- runtimeRepoRef
- agentHome
- workerRuntimeReleaseBucketName
- managerMonitorPort
- swarmMaxSize
- dashboardAccessApiBaseUrl
- dashboardEnrollmentSecret
`);

Contract.bootstrapContext.evolves(`
- setup may enrich bootstrap context with discovered runtime values
- setup may not require CDK to know those derived values in advance
`);

Contract.managerDiscovery.means(`
- auth can find the manager by infrastructure tags
- auth does not require hard-coded instance ids
`);

Tags.swarm.means("tag:AgentSwarm = <swarmTagValue>");
Tags.role.means("tag:Role = agent-swarm-manager");

Contract.dashboardIssuer.means(`
- one repo-owned callable interface on the manager host
- returns a dashboard access URL
- returns a one-time bootstrap URL rather than a long-lived authenticated API base URL
- may reuse an existing dashboard runtime
- may reuse an existing quick tunnel
- may reuse one configured named cloudflared tunnel and create a fresh session hostname on that tunnel
- may notify the manager controller dashboard-recovery domain to keep dashboard access alive during active use
- does not require callers to know internal package paths or helper implementation details
`);

Contract.namedTunnelConfig.means(`
- optional bootstrap configuration for a stack-owned named cloudflared tunnel
- sourced by CDK from ~/.cloudflared/stack-tunnels/<stackName>.json on the machine running cdk deploy
- manager runtime fetches the stack-owned hostname metadata and tunnel token from deterministic AWS names derived from the stack name
- manager runtime does not receive named-tunnel metadata through EC2 user data
- manager runtime does not receive the deploy-machine origin cert
- absence of this config means the manager falls back to temporary ingress such as quick tunnels
`);

Contract.namedTunnelProvisioning.means(`
- a pre-CDK script reads ~/.cloudflared/zone-config.json on the deploy machine
- that script creates or reuses one named tunnel per deployed stack
- that script creates or reuses one wildcard DNS route for the deployed stack hostname space
- that script writes or updates a deterministic AWS Secrets Manager secret for the tunnel runtime token
- that script writes or updates a deterministic AWS SSM parameter for the stack-owned hostname metadata
- that script writes ~/.cloudflared/stack-tunnels/<stackName>.json for CDK consumption using the config parameter name, not plaintext token values
- normal aws-setup synth/diff/deploy commands should invoke this step automatically rather than requiring operators to remember a separate preparatory command
- CDK grants the manager role read access to those deterministic AWS config locations without embedding the values in EC2 user data
- manager setup fetches the tunnel token and hostname metadata at runtime
`);

Contract.dashboardAccessUrl.means(`
- a public URL for the dashboard
- includes whatever one-time session material is required for bootstrap
- that session material is only for initial browser bootstrap and must not be reused as ongoing API or WebSocket URL auth
`);

when(CDK.provisions(ManagerHost))
  .then(CDK.clones(ManagerRepo).to(Paths.runtimeRoot))
  .and(CDK.mayRead(Contract.namedTunnelConfig).from(Paths.cloudflarePreparedTunnelConfigPath))
  .and(CDK.writes(Contract.bootstrapContext).to(Paths.bootstrapContextPath))
  .and(CDK.executes(Contract.setupEntrypoint).through(Paths.setupScriptPath));

when(Contract.setupEntrypoint.runs())
  .then(ManagerRepo.provisions(ManagerHost))
  .and(ManagerHost.exposes(Service.monitor))
  .and(ManagerHost.exposes(Service.dashboard));

when(Auth.needs(Contract.dashboardAccessUrl))
  .then(Auth.finds(ManagerHost).through(Contract.managerDiscovery))
  .and(Auth.calls(Contract.dashboardIssuer))
  .and(Auth.receives(Contract.dashboardAccessUrl));

when(ManagerHost.exposes(Service.monitor))
  .then(Service.monitor.uses("the configured manager monitor port"));

when(ManagerHost.exposes(Service.dashboard))
  .then(Service.dashboard.uses("local port 3000"));

NonContract.wrapperScripts.means("optional host convenience layer");
NonContract.packageLayout.means("changeable internal structure behind repo-owned contracts");
NonContract.serviceUnits.means("changeable supervision mechanism");
NonContract.helperScripts.means("changeable operational helpers");

when(CDK.dependsOn(NonContract.wrapperScripts))
  .then(CdkManagerInterface.encounters("avoidable implementation coupling"));

when(CDK.dependsOn(NonContract.packageLayout))
  .then(CdkManagerInterface.encounters("avoidable internal structure coupling"));

when(Auth.dependsOn(NonContract.wrapperScripts))
  .then(CdkManagerInterface.encounters("avoidable auth-to-runtime coupling"));

when(Auth.dependsOn(NonContract.packageLayout))
  .then(CdkManagerInterface.encounters("avoidable auth-to-internal coupling"));

CdkManagerInterface.prescribes(`
- Prefer repo-owned entrypoints over generated host wrappers.
- Prefer path and schema contracts over package-path knowledge.
- Keep CDK and auth coupled to outcomes, not implementation layout.
- Treat generated wrappers, service unit generation, and helper scripts as replaceable details.
`);
