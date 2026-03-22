/// <reference path="../_agentish.d.ts" />

// System Runtime

const Agentish = define.language("Agentish");

const SystemRuntime = define.system("SystemRuntime", {
  format: Agentish,
  role: "Manager-host runtime boundary for bootstrap, supervision, session issuance, worker launch, and system-level observability",
});

const Operator = define.actor("RuntimeOperator", {
  role: "Human who provisions, updates, debugs, and inspects the manager host",
});

const AWS = {
  lambda: define.system("DashboardAccessLambda"),
  ssm: define.system("AwsSystemsManager"),
  ec2: define.system("AwsEc2"),
};

const Host = {
  manager: define.system("ManagerHost"),
  worker: define.system("WorkerHost"),
  runtime: define.workspace("RuntimeCheckout"),
  state: define.workspace("RuntimeState"),
  workspace: define.workspace("WorkspaceCheckout"),
  service: define.entity("SystemdService"),
  journal: define.document("JournaldLog"),
  logFile: define.document("SystemEventLogFile"),
};

const Layout = {
  scripts: define.workspace("RuntimeScripts"),
  tools: define.workspace("RepoTools"),
  packageScripts: define.workspace("PackageTools"),
  bootstrapAsset: define.document("BootstrapAsset"),
  envFile: define.document("RuntimeEnvFile"),
  unitFile: define.document("SystemdUnitFile"),
};

const Entrypoint = {
  setup: define.entity("SetupEntrypoint"),
  manager: define.entity("ManagerEntrypoint"),
  managerNode: define.entity("ManagerNodeEntrypoint"),
  workerMonitor: define.entity("WorkerMonitorEntrypoint"),
  issueDashboardSession: define.entity("IssueDashboardSessionEntrypoint"),
  launchWorker: define.entity("LaunchWorkerEntrypoint"),
  askpass: define.entity("GitAskpassEntrypoint"),
};

const RuntimeCode = {
  setupHost: define.entity("SetupHostProgram"),
  updateRuntime: define.entity("UpdateRuntimeProgram"),
  dashboardRuntime: define.entity("DashboardRuntimeProgram"),
  workerPower: define.entity("WorkerPowerProgram"),
  managerServer: define.entity("ManagerServerProgram"),
  workerAgent: define.entity("WorkerAgentProgram"),
  accessHandler: define.entity("DashboardAccessHandler"),
};

const Policy = {
  sourceOfTruth: define.concept("SourceFirstServerChange"),
  runtimeCheckoutOnly: define.concept("RuntimeCheckoutOnly"),
  runtimeNoEdits: define.concept("NoDirectRuntimeEdits"),
  scriptBoundary: define.concept("ScriptBoundaryRule"),
  logging: define.concept("SystemLoggingRule"),
};

const Eventing = {
  start: define.entity("ProcessStartEvent"),
  exit: define.entity("ProcessExitEvent"),
  error: define.entity("ProcessErrorEvent"),
  setup: define.entity("SetupEvent"),
  teardown: define.entity("TeardownEvent"),
  mutation: define.entity("SystemMutationEvent"),
};

SystemRuntime.enforces(`
- The source repository is canonical for server code.
- The runtime checkout is a deployed version, not an editing surface.
- Runtime updates happen by checking out committed source revisions.
- Externally called host scripts live in top-level scripts/.
- Repository helper tools live in top-level tools/.
- Package-local scripts are tools or assets, not the runtime entry surface.
- A TypeScript program should not call a shell script unless that shell script is a real outer system boundary.
- Valid shell boundaries are bootstrap, user-data, systemd entry, Lambda or SSM entry, and similar host-facing edges.
- Convenience wrapper scripts that merely bounce TS to TS are not justified.
- System-level logs should be simple human-readable lines, not overengineered structured logging glue.
- System event lines are written to a fixed file.
`);

SystemRuntime.defines(`
- RuntimeScripts means the externally called shell entrypoints that the deployed host relies on.
- RepoTools means repository helper scripts used by developers or operators but not part of the deployed host runtime boundary.
- PackageTools means package-local assets or workflow helpers that remain internal to a package.
- BootstrapAsset means a script or document consumed by provisioning or user-data rather than by an operator directly.
- SourceFirstServerChange means source is changed, committed, and only then rolled into runtime.
- RuntimeCheckoutOnly means the host runtime tree is updated by version checkout rather than ad hoc editing.
- ScriptBoundaryRule means shell exists only at real system edges.
- SystemLoggingRule means important system events emit short timestamped comments to a fixed log file.
`);

Host.manager.contains(
  Host.runtime,
  Host.state,
  Host.workspace,
  Host.service,
  Host.journal,
  Host.logFile,
);

Host.runtime.contains(Layout.scripts, Layout.tools, Layout.packageScripts);
Layout.scripts.contains(
  Entrypoint.setup,
  Entrypoint.manager,
  Entrypoint.managerNode,
  Entrypoint.workerMonitor,
  Entrypoint.issueDashboardSession,
  Entrypoint.launchWorker,
  Entrypoint.askpass,
);
Layout.tools.contains(define.entity("ConnectSshTool"), define.entity("ConnectVscodeTool"), define.entity("GithubAppTokenTool"), define.entity("LocalSwarmTestTool"));
Layout.packageScripts.contains(Layout.bootstrapAsset);

Entrypoint.setup.contains(RuntimeCode.setupHost, RuntimeCode.updateRuntime);
Entrypoint.manager.contains(RuntimeCode.managerServer);
Entrypoint.managerNode.contains(RuntimeCode.workerAgent);
Entrypoint.workerMonitor.contains(RuntimeCode.workerAgent);
Entrypoint.issueDashboardSession.contains(RuntimeCode.dashboardRuntime);
Entrypoint.launchWorker.contains(Layout.bootstrapAsset);
Entrypoint.askpass.contains(define.entity("GitHubAppTokenResolution"));

Host.state.contains(Layout.envFile, Layout.unitFile, Host.logFile);
Host.logFile.contains(Eventing.start, Eventing.exit, Eventing.error, Eventing.setup, Eventing.teardown, Eventing.mutation);

SystemRuntime.means(`
- a manager-host contract
- a filesystem contract
- a script-placement contract
- a deployment workflow contract
- a system-level logging contract
`);

Policy.sourceOfTruth.means(`
- edit source in the project repo
- commit source
- roll runtime to that commit
- never rely on runtime drift as the intended state
`);

Policy.scriptBoundary.means(`
- systemd entrypoints are valid shell boundaries
- Lambda or SSM host commands are valid shell boundaries
- bootstrap and EC2 user-data are valid shell boundaries
- package-internal TS control flow should stay in TS
`);

Policy.logging.means(`
- [timestamp:source] comment
- one fixed log file for system-level events
- log start, exit, error, setup, teardown, and important system mutations
- optimize for operator readability over logging cleverness
`);

when(Operator.changes("server code"))
  .then(SystemRuntime.requires(Policy.sourceOfTruth))
  .and(SystemRuntime.forbids(Policy.runtimeNoEdits))
  .and(SystemRuntime.requires(Policy.runtimeCheckoutOnly));

when(AWS.lambda.invokes(Entrypoint.issueDashboardSession))
  .then(AWS.ssm.executes("a host command"))
  .and(Host.manager.runs(Entrypoint.issueDashboardSession))
  .and(SystemRuntime.treats("that script as a valid external boundary"));

when(Host.manager.starts(Host.service))
  .then(Host.service.executes(Entrypoint.manager).orExecutes(Entrypoint.managerNode))
  .and(SystemRuntime.treats("those scripts as valid systemd boundaries"));

when(Entrypoint.launchWorker.prepares(Host.worker))
  .then(Entrypoint.launchWorker.injects(Layout.bootstrapAsset))
  .and(Layout.bootstrapAsset.writes(Layout.unitFile))
  .and(Layout.bootstrapAsset.starts(Entrypoint.workerMonitor));

when(RuntimeCode.setupHost.writes(Layout.unitFile))
  .then(Host.logFile.records(Eventing.mutation))
  .and(Host.logFile.records(Eventing.setup))
  .and(SystemRuntime.treats("systemd unit generation as a system-level mutation"));

when(RuntimeCode.updateRuntime.restarts(Host.service))
  .then(Host.logFile.records(Eventing.teardown))
  .and(Host.logFile.records(Eventing.start))
  .and(SystemRuntime.treats("service restart as a system-level event"));

when(RuntimeCode.workerPower.isUsedBy("a manager test or manager workflow"))
  .then(SystemRuntime.prefers("direct TS invocation"))
  .and(SystemRuntime.reduces("TS to shell to TS indirection"));

when(Layout.tools.contains(define.entity("RepoTool")))
  .then(SystemRuntime.keeps("repository helpers out of the runtime script surface"))
  .and(SystemRuntime.preserves("top-level scripts as the host-facing contract"));

when(SystemRuntime.records("system events"))
  .then(Host.logFile.locatesAt("/home/ec2-user/state/logs/system-events.log"))
  .and(Host.logFile.uses(Policy.logging));

SystemRuntime.prescribes(`
- top-level scripts/ is the deployed runtime entry surface
- top-level tools/ is the repository helper surface
- package scripts remain only for package-local assets such as worker-user-data.sh
- setup.sh is the host bootstrap controller
- systemd points at top-level runtime scripts
- Lambda or SSM points at top-level runtime scripts
- worker user data may remain package-local when it is an internal bootstrap asset rather than an operator entrypoint
`);
