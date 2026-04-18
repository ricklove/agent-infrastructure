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

const Gateway = {
  dashboard: define.system("DashboardGateway"),
  backend: define.entity("GatewayBackend"),
  definition: define.entity("GatewayBackendDefinition"),
  health: define.entity("GatewayBackendHealthCheck"),
  lazyStart: define.entity("GatewayLazyStartRule"),
  frontendDevProxy: define.entity("GatewayBackedFrontendDevProxy"),
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
  previewTunnel: define.document("WorkerPreviewTunnelUrl"),
};

const Preview = {
  dashboard: define.entity("WorkerPreviewDashboard"),
  vite: define.entity("DashboardFrontendDevServer"),
  session: define.entity("PreviewDashboardSession"),
};

const Layout = {
  scripts: define.workspace("RuntimeScripts"),
  tools: define.workspace("RepoTools"),
  packageScripts: define.workspace("PackageTools"),
  bootstrapAsset: define.document("BootstrapAsset"),
  envFile: define.document("RuntimeEnvFile"),
  unitFile: define.document("SystemdUnitFile"),
  workAtRegistry: define.document("WorkAtRegistry"),
};

const Tooling = {
  connectSsh: define.entity("ConnectSshTool"),
  connectVscode: define.entity("ConnectVscodeTool"),
  connectWorkerEc2Ssh: define.entity("ConnectWorkerEc2SshTool"),
  githubAppToken: define.entity("GithubAppTokenTool"),
  localSwarmTest: define.entity("LocalSwarmTestTool"),
  repoTool: define.entity("RepoTool"),
};

const Entrypoint = {
  setup: define.entity("SetupEntrypoint"),
  workAt: define.entity("WorkAtEntrypoint"),
  manager: define.entity("ManagerEntrypoint"),
  managerNode: define.entity("ManagerNodeEntrypoint"),
  managerController: define.entity("ManagerControllerEntrypoint"),
  workerMonitor: define.entity("WorkerMonitorEntrypoint"),
  issueDashboardSession: define.entity("IssueDashboardSessionEntrypoint"),
  launchWorker: define.entity("LaunchWorkerEntrypoint"),
  askpass: define.entity("GitAskpassEntrypoint"),
};

const RuntimeCode = {
  setupHost: define.entity("SetupHostProgram"),
  updateRuntime: define.entity("UpdateRuntimeProgram"),
  dashboardRuntime: define.entity("DashboardRuntimeProgram"),
  managerController: define.entity("ManagerControllerProgram"),
  dashboardServer: define.entity("DashboardServerProgram"),
  workerPower: define.entity("WorkerPowerProgram"),
  managerServer: define.entity("ManagerServerProgram"),
  workerAgent: define.entity("WorkerAgentProgram"),
  graphServer: define.entity("GraphServerProgram"),
  accessHandler: define.entity("DashboardAccessHandler"),
  swarmMonitor: define.entity("SwarmMonitorProgram"),
};

const Integration = {
  githubAppTokenResolution: define.entity("GitHubAppTokenResolution"),
  managerController: define.entity("ManagerController"),
  dashboardRecoveryController: define.entity("DashboardRecoveryController"),
  workspacePersistenceController: define.entity("WorkspacePersistenceController"),
};

const Policy = {
  sourceOfTruth: define.concept("SourceFirstServerChange"),
  runtimeCheckoutOnly: define.concept("RuntimeCheckoutOnly"),
  runtimeNoEdits: define.concept("NoDirectRuntimeEdits"),
  scriptBoundary: define.concept("ScriptBoundaryRule"),
  logging: define.concept("SystemLoggingRule"),
  fullUpdateWorkflow: define.concept("FullManagerUpdateWorkflow"),
  workerPreviewTopology: define.concept("WorkerPreviewTopology"),
  gatewayBackedPreview: define.concept("GatewayBackedPreviewMode"),
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
- Feature backends behind the dashboard gateway must declare whether they are `lazy` or `always`.
- The dashboard gateway may start a `lazy` backend only when a feature path is actually used.
- The dashboard runtime should proactively start and restore any backend declared `always`.
- The dashboard gateway should prefer declared backend definitions over ad hoc one-off launch logic.
- Manager updates should follow one full development process from source edit through post-deploy verification.
- state/ is only for temporary runtime state and recoverable operational artifacts, never durable app data.
- Swarm monitor process visibility should use sparse continuous sampling rather than burst-only capture.
- EC2 worker inventory refresh should default to slow zombie reconciliation rather than second-level live polling.
- One thin always-on manager controller should own manager-host policy loops under separate internal control domains rather than as unrelated systemd services.
- Dashboard session issuance during an active connect attempt should notify the manager controller's dashboard-recovery domain.
- Dashboard recovery should distinguish local origin failure from public tunnel failure.
- Quick tunnel replacement should be conservative, cooldown-based, and never eager churn.
- Temporary dashboard ingress should support a backup tunnel provider when the primary provider cannot issue a URL.
- Runtime-installed work surface tools should use flag-style control commands so registered target names cannot conflict with tool control verbs.
- Dashboard session issuance should only return a public URL after the manager has verified that the returned URL serves the dashboard.
- The returned dashboard URL may contain one-time bootstrap session material only for the initial browser redirect; all later dashboard API and WebSocket auth must be enforced by the Bun gateway through headers rather than URL parameters.
- Workspace durability for canonical app data should be handled by the manager controller's workspace-persistence domain rather than by browser clients or ad hoc cron glue.
- Heavy repository development work should prefer worker hosts over the manager runtime host so the control plane remains available for deploy and verification.
- A worker promoted into an active development surface should include git and copied commit authorship so it can create branch-local commits without receiving long-lived external repository credentials.
- A worker promoted into an active development surface should use its own worker-local workspace root and worker-local runtime root rather than sharing manager-host runtime or shared integration checkouts.
- Worker-host development surfaces must not have direct write access to the manager host shared repository checkout or runtime checkout.
- Manager-host git credentials and canonical repository authority must remain on the manager integration surface unless an explicit controlled handoff path is invoked.
- Prompt-driven exploratory surfaces on workers should create AgentChat sessions in the Discuss process by default so they do not begin code-changing work implicitly.
- Supported worker dashboard preview should run as a worker-local replica of the dashboard runtime rather than as raw Vite exposed directly to the operator.
- Supported worker dashboard preview should keep the same dashboard, backend, and feature-service port topology as the manager runtime unless a more specific runtime blueprint explicitly closes a different preview topology.
- Supported worker dashboard preview should use the Bun dashboard gateway as the public origin and may proxy frontend development traffic to a worker-local Vite dev server so HMR remains available.
- Supported worker dashboard preview should route temporary public ingress to the worker Bun dashboard gateway rather than directly to the Vite dev server.
- Supported worker dashboard preview should preserve the normal dashboard session bootstrap and gateway-owned auth flow unless an explicit local-only exception is closed elsewhere.
- If the active development worker becomes unhealthy or unreachable, the normal recovery path is to repair it, reboot it, or create a replacement worker rather than resuming heavy development on the manager runtime host by default.
- Once a replacement worker is healthy and active, superseded unused worker instances should be disposed so the swarm does not accumulate stale development hosts.
`);

SystemRuntime.defines(`
- RuntimeScripts means the externally called shell entrypoints that the deployed host relies on.
- RepoTools means repository helper scripts used by developers or operators but not part of the deployed host runtime boundary.
- ConnectWorkerEc2SshTool means the repository helper that reuses low-load swarm workers when possible, launches a worker when needed, bootstraps SSH, and then connects directly to the worker private IP.
- Worker development readiness means the worker has git plus copied commit authorship identity so it can behave like a remote execution worktree while the manager host remains the authenticated integration surface.
- Worker-local workspace root means the checkout and working directory used for worker editing live on the worker and are replaceable without mutating manager-host canonical surfaces.
- Worker-local runtime root means worker-side services and temporary runtime state stay on the worker rather than sharing the manager runtime tree.
- Discuss-first exploratory session means a prompt-driven design or critique interaction starts in the Discuss process and only moves into implementation when the operator explicitly asks for that escalation.
- WorkerPreviewTopology means a worker preview uses the same dashboard runtime topology as the manager, with Bun as the public gateway entrypoint and Vite hidden behind a frontend dev proxy when HMR is needed.
- GatewayBackedPreviewMode means preview requests, API traffic, and websocket upgrades all enter through the Bun dashboard gateway even while frontend assets come from a proxied Vite dev server.
- Worker recovery means restoring a usable development worker by repair, reboot, or replacement before resuming heavy development work.
- Superseded worker disposal means removing stale unused worker instances after a healthy replacement worker takes over the active development role.
- PackageTools means package-local assets or workflow helpers that remain internal to a package.
- BootstrapAsset means a script or document consumed by provisioning or user-data rather than by an operator directly.
- SourceFirstServerChange means source is changed, committed, and only then rolled into runtime.
- RuntimeCheckoutOnly means the host runtime tree is updated by version checkout rather than ad hoc editing.
- ScriptBoundaryRule means shell exists only at real system edges.
- SystemLoggingRule means important system events emit short timestamped comments to a fixed log file.
- GatewayBackendDefinition means one declared backend contract with base URL, health probe, optional start command, and explicit startup policy.
- FullManagerUpdateWorkflow means source change, local verification, commit, push, runtime rollout, and post-deploy checks.
- SwarmMonitorProgram means the worker or manager telemetry path that captures cheap host metrics and sparse process context.
- ManagerController means one thin always-on manager-host control plane with distinct internal domains for dashboard recovery and workspace persistence.
- Dashboard bootstrap URL means the one-time access URL returned by session issuance before the browser exchanges bootstrap auth into a session-scoped transport token.
- WorkAtRegistry means a state-backed mapping from a registered work target name to its execution host, working directory, and shell.
`);

Host.manager.contains(
  Host.runtime,
  Host.state,
  Host.workspace,
  Host.service,
  Host.journal,
  Host.logFile,
  Gateway.dashboard,
);

Host.worker.contains(Preview.dashboard, Preview.vite, Preview.session, Host.previewTunnel);

Host.runtime.contains(Layout.scripts, Layout.tools, Layout.packageScripts);
Layout.scripts.contains(
  Entrypoint.setup,
  Entrypoint.workAt,
  Entrypoint.manager,
  Entrypoint.managerNode,
  Entrypoint.managerController,
  Entrypoint.workerMonitor,
  Entrypoint.issueDashboardSession,
  Entrypoint.launchWorker,
  Entrypoint.askpass,
);
Layout.tools.contains(
  Tooling.connectSsh,
  Tooling.connectVscode,
  Tooling.connectWorkerEc2Ssh,
  Tooling.githubAppToken,
  Tooling.localSwarmTest,
);
Layout.packageScripts.contains(Layout.bootstrapAsset);

Entrypoint.setup.contains(RuntimeCode.setupHost, RuntimeCode.updateRuntime);
Entrypoint.manager.contains(RuntimeCode.managerServer);
Entrypoint.managerNode.contains(RuntimeCode.workerAgent);
Entrypoint.managerController.contains(RuntimeCode.managerController);
Entrypoint.workerMonitor.contains(RuntimeCode.workerAgent);
Entrypoint.issueDashboardSession.contains(RuntimeCode.dashboardRuntime);
Entrypoint.launchWorker.contains(Layout.bootstrapAsset);
Entrypoint.askpass.contains(Integration.githubAppTokenResolution);
Gateway.dashboard.contains(
  Gateway.backend,
  Gateway.definition,
  Gateway.health,
  Gateway.lazyStart,
  Gateway.frontendDevProxy,
);
Gateway.backend.contains(RuntimeCode.graphServer);

Host.state.contains(Layout.envFile, Layout.unitFile, Layout.workAtRegistry, Host.logFile);
Host.logFile.contains(Eventing.start, Eventing.exit, Eventing.error, Eventing.setup, Eventing.teardown, Eventing.mutation);

SystemRuntime.means(`
- a manager-host contract
- a filesystem contract
- a script-placement contract
- a deployment workflow contract
- a system-level logging contract
- a lazy gateway-backend contract
- a worker preview dashboard contract
- a swarm-monitor observability contract
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

Policy.fullUpdateWorkflow.means(`
 - check /home/ec2-user/workspace/README.md before assuming local tool availability
 - check relevant notes under /home/ec2-user/workspace/tools/ for installed machine-specific utilities
- check the relevant blueprints before making implementation changes
- treat blueprint review as mandatory, not optional
- edit source only
- verify locally before rollout
- commit source
- push source
- update runtime by checkout to the pushed revision
- restart or reissue affected runtime processes
- run post-deploy health and behavior checks
- use the browser tool on the real UI for post-deploy verification
- capture screenshots as evidence of post-deploy UI state
- verify the served frontend version matches the deployed revision
- verify the running backend version matches the deployed revision
- require the deployed frontend version and deployed backend version to match exactly
- move heavy repo-wide checks, builds, lint-fix passes, and broad refactors onto a worker host rather than the manager runtime host
- use bun run agent:connect-worker-ec2-ssh as the normal repository command for reaching a reusable or newly launched worker
- treat any frontend-backend version mismatch as a failed rollout state
- treat durable app data under state/ as a failed architecture state
`);

Policy.workerPreviewTopology.means(`
- same dashboard-facing ports as the manager runtime
- Bun dashboard gateway as the public preview origin
- Vite dev server only as the frontend development upstream
- worker-local feature APIs and websockets still entering through Bun
- preview tunnel aimed at Bun rather than raw Vite
`);

Policy.gatewayBackedPreview.means(`
- browser session bootstrap still uses the dashboard gateway
- API and websocket auth stay gateway-owned
- frontend HMR may traverse the Bun-to-Vite proxy path
- preview URLs are temporary worker-local review surfaces rather than canonical dashboard release URLs
`);

Integration.managerController.means(`
- one thin always-on systemd service on the manager host
- owns manager-host policy loops but not the heavy serving runtimes themselves
- contains the dashboard recovery controller and workspace persistence controller as separate internal domains
- keeps code-level separation between control domains even when they share one Bun process
`);

Integration.dashboardRecoveryController.means(`
- the dashboard lifecycle and recovery domain inside the manager controller
- receives dashboard-session issuance and readiness-failure signals
- supervises dashboard reachability without turning the dashboard server into an always-on monolith
`);

Integration.workspacePersistenceController.means(`
- the workspace durability domain inside the manager controller
- serializes workspace git staging, commit, push, retry, and escalation behavior
- owns automatic and manual persistence triggers for the workspace repository
- exists because git push is part of persistence for canonical workspace-backed app data
`);

Gateway.lazyStart.means(`
- lazy feature backend processes are started on first use
- always feature backend processes are started when the dashboard runtime starts
- gateway proxy traffic is the trigger point for lazy backends
- unhealthy backends may be started or restarted by the gateway
- backends should not be marked always-on without an explicit feature need for proactive availability
`);

when(Operator.changes("server code"))
  .then(SystemRuntime.requires(Policy.sourceOfTruth))
  .and(SystemRuntime.forbids(Policy.runtimeNoEdits))
  .and(SystemRuntime.requires(Policy.runtimeCheckoutOnly));

when(AWS.lambda.invokes(Entrypoint.issueDashboardSession))
  .then(AWS.ssm.executes("a host command"))
  .and(Host.manager.runs(Entrypoint.issueDashboardSession))
  .and(SystemRuntime.treats("that script as a valid external boundary"))
  .and(Entrypoint.issueDashboardSession.notifies("the manager controller dashboard-recovery domain"))
  .and(Entrypoint.issueDashboardSession.returns("the current bootstrap URL quickly"))
  .and(AWS.lambda.continues("dashboard readiness polling against that bootstrap URL"))
  .and(Integration.dashboardRecoveryController.detects("dashboard readiness failure during active use"))
  .then(Integration.dashboardRecoveryController.repairs(RuntimeCode.dashboardRuntime))
  .and(Integration.dashboardRecoveryController.classifies("origin failure separately from tunnel failure"))
  .and(Integration.dashboardRecoveryController.requires("testing the local origin and the current public URL before deciding which side failed"))
  .and(Integration.dashboardRecoveryController.repairs("the dashboard server independently when the tunnel is still working"))
  .and(Integration.dashboardRecoveryController.repairs("the tunnel independently when the local dashboard server is still healthy"))
  .and(Integration.dashboardRecoveryController.repairs("the tunnel immediately during an active connect attempt when the local server is healthy and the current public URL test fails"))
  .and(Integration.dashboardRecoveryController.keeps("the current quick tunnel while cloudflared is still alive"))
  .and(Integration.dashboardRecoveryController.replaces("a quick tunnel only on strong evidence and after cooldown"))
  .and(Integration.dashboardRecoveryController.avoids("full runtime re-ensure churn while dashboard and tunnel are already healthy"))
  .and(Integration.dashboardRecoveryController.fallsBack("to a backup temporary tunnel provider when the primary provider cannot issue a URL"))
  .and(Entrypoint.issueDashboardSession.records("a durable help-request incident on unrecoverable failure"));

when(Host.manager.starts(Host.service))
  .then(
    Host.service
      .executes(Entrypoint.manager)
      .orExecutes(Entrypoint.managerNode)
      .orExecutes(Entrypoint.managerController),
  )
  .and(SystemRuntime.treats("those scripts as valid systemd boundaries"));

when(Operator.runs(Entrypoint.workAt))
  .then(SystemRuntime.expects("registered work target names to be bare command arguments"))
  .and(SystemRuntime.expects("tool control operations to use `--help`, `--list`, `--register`, `--unregister`, and `--check`"))
  .and(SystemRuntime.expects("`--register <name> -- ...` to separate work-at control arguments from target specification"))
  .and(SystemRuntime.expects("the work-at registry to live under runtime state rather than inside the deployed checkout"))
  .and(SystemRuntime.expects("single-command, piped multiline, and interactive shell modes to preserve stdin, TTY behavior, target working directory, and exit codes"));

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

when(Gateway.dashboard.proxies("feature traffic"))
  .then(Gateway.dashboard.mayEnsure(Gateway.backend))
  .and(Gateway.backend.uses(Gateway.definition))
  .and(Gateway.definition.includes(Gateway.health))
  .and(Gateway.definition.mayInclude("a lazy or always startup policy"));

when(Gateway.dashboard.detects("an unhealthy feature backend"))
  .then(Gateway.dashboard.applies(Gateway.lazyStart))
  .and(Host.logFile.records(Eventing.start))
  .and(Host.logFile.records(Eventing.error))
  .and(SystemRuntime.treats("gateway-triggered backend recovery as a system-level event"));

when(Operator.requests("the full manager development process"))
  .then(SystemRuntime.requires(Policy.fullUpdateWorkflow))
  .and(SystemRuntime.requires(Policy.sourceOfTruth))
  .and(SystemRuntime.requires(Policy.runtimeCheckoutOnly))
  .and(SystemRuntime.requires("blueprint review before implementation changes"))
  .and(SystemRuntime.requires("post-deploy checks before declaring success"))
  .and(SystemRuntime.requires("browser-tool verification with screenshots for UI-facing changes"));

when(Operator.runs("a worker dashboard preview workflow"))
  .then(SystemRuntime.requires(Policy.workerPreviewTopology))
  .and(SystemRuntime.requires(Policy.gatewayBackedPreview))
  .and(SystemRuntime.expects(Preview.dashboard))
  .and(SystemRuntime.expects(Preview.vite))
  .and(SystemRuntime.expects(Host.previewTunnel))
  .and(SystemRuntime.expects("the preview tunnel to terminate at the worker Bun dashboard gateway"))
  .and(SystemRuntime.expects("worker preview auth and websocket upgrades to continue through the Bun dashboard gateway"));

when(Operator.changes("manager or dashboard behavior"))
  .then(SystemRuntime.requires("checking the relevant blueprints first"))
  .and(SystemRuntime.forbids("implementation-first changes that ignore existing blueprint rules"));

when(Operator.implements("a provider-specific integration"))
  .then(SystemRuntime.requires("re-checking the current provider docs before implementation"))
  .and(SystemRuntime.requires("re-checking relevant open-source reference implementations before implementation"))
  .and(SystemRuntime.forbids("implementing provider adapters from stale memory alone"));

when(RuntimeCode.workerPower.isUsedBy("a manager test or manager workflow"))
  .then(SystemRuntime.prefers("direct TS invocation"))
  .and(SystemRuntime.reduces("TS to shell to TS indirection"));

when(RuntimeCode.swarmMonitor.observes("host distress"))
  .then(SystemRuntime.prefers("pre-existing sparse process context"))
  .and(SystemRuntime.forbids("starting expensive process scans only after the spike has already started"))
  .and(SystemRuntime.treats("process lead-up capture as a manager observability requirement"));

when(Layout.tools.contains(Tooling.repoTool))
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
- setup-manager.sh installs work-at from top-level scripts/ as /usr/local/bin/work-at
- systemd points at top-level runtime scripts
- Lambda or SSM points at top-level runtime scripts
- worker user data may remain package-local when it is an internal bootstrap asset rather than an operator entrypoint
- the dashboard gateway owns lazy feature backend startup
- each lazy backend should be described once through a backend definition rather than hardcoded repeatedly
- the default manager update process is source edit, local verification, commit, push, runtime checkout, restart, and post-deploy verification
- post-deploy verification for UI-facing work includes browser-tool checks and saved screenshots
`);
