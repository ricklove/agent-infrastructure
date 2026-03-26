/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const SwarmManagerBlueprint = define.entity("SwarmManagerBlueprint", {
  format: Agentish,
  describes: "SwarmManagerArchitecture",
});

const Operator = define.actor("Operator", {
  role: "TrustedController",
});

const SwarmManager = define.system("SwarmManager", {
  role: "PrivateControlPlane",
});
const Worker = define.system("Worker", {
  role: "EC2RuntimeNode",
});
const EC2 = define.system("EC2");
const Docker = define.system("Docker");
const Git = define.system("Git");
const AWS = define.system("AWS");
const Cloudflared = define.system("Cloudflared");
const Dashboard = define.system("Dashboard");
const Telemetry = define.system("Telemetry");
const CloudInit = define.system("CloudInit");

const Fleet = define.entity("Fleet");
const WorkerImage = define.entity("WorkerImage");
const WorkerImageProfile = define.entity("WorkerImageProfile");
const WorkerImageCandidate = define.entity("WorkerImageCandidate");
const WorkerRuntimeRelease = define.entity("WorkerRuntimeRelease");
const ManagerRuntime = define.entity("ManagerRuntime");
const BunService = define.entity("BunService");
const BenchmarkRun = define.entity("BenchmarkRun");

const Truth = {
  inventory: define.entity("AwsInventory"),
  telemetry: define.entity("TelemetryReality"),
  history: define.entity("HistoricalLifecycle"),
  priority: ["inventory", "telemetry", "history"] as const,
};

const WorkerClasses = {
  bun: define.entity("BunWorkerClass"),
  browser: define.entity("BrowserWorkerClass"),
};

const StartupPaths = {
  immutable: define.entity("ImmutableStartupPath"),
  mutable: define.entity("MutableStartupPath"),
};

const Lifecycle = {
  launchRequested: define.event("LaunchRequested"),
  cloudInitStarted: define.event("CloudInitStarted"),
  telemetryStarted: define.event("TelemetryStarted"),
  wakeRequested: define.event("WakeRequested"),
  woke: define.event("Woke"),
  containerStartRequested: define.event("ContainerStartRequested"),
  builderFailed: define.event("BuilderFailed"),
  benchmarkFailed: define.event("BenchmarkFailed"),
  wakeFailed: define.event("WakeFailed"),
  ec2Running: define.state("Ec2Running"),
  dockerReady: define.state("DockerReady"),
  connected: define.state("Connected"),
  running: define.state("Running"),
  hibernating: define.state("Hibernating"),
  hibernated: define.state("Hibernated"),
  terminated: define.state("Terminated"),
  zombie: define.state("Zombie"),
  serviceReady: define.state("ServiceReady"),
};

const Policy = {
  trustedBootstrap: define.concept("TrustedBootstrap"),
  bootGraceWindow: define.concept("BootGraceWindow"),
  fewHighLevelCommands: define.concept("FewHighLevelCommands"),
  repeatedManualSSMOperations: define.concept("RepeatedManualSSMOperations"),
};

SwarmManager.observes(Truth.inventory).toUnderstand('ExistenceTruth');
SwarmManager.observes(Truth.telemetry).toUnderstand('LivenessTruth');
SwarmManager.observes(Truth.history).toUnderstand('TimingTruth');
SwarmManager.reconciles(Fleet).from(Truth.inventory, Truth.telemetry, Truth.history, {
  priority: Truth.priority,
});

SwarmManager.aligns(WorkerImageProfile).toMatch(WorkerImage);
SwarmManager.aligns(WorkerRuntimeRelease).toMatch("ActiveWorkerRuntime");
SwarmManager.owns("LifecycleExecution", "ImagePromotion", "BenchmarkExecution", "FailureRecovery");
SwarmManager.minimizes(Policy.repeatedManualSSMOperations);

Worker.runsOn(EC2);
Worker.starts(Docker);
Worker.starts(Telemetry);
Worker.reports(Truth.telemetry).to(SwarmManager);
Worker.records(Truth.history).through(Telemetry);

WorkerImageProfile.selects(WorkerImage, {
  for: [WorkerClasses.bun, WorkerClasses.browser],
});

StartupPaths.immutable.describes("BakedHostBoot");
StartupPaths.mutable.describes("RuntimeRefreshAfterBoot");

SwarmManager.measures('ColdStartTime', {
  from: Lifecycle.launchRequested,
  to: Lifecycle.running
});
SwarmManager.measures('WakeTime', {
  from: Lifecycle.wakeRequested,
  to: Lifecycle.running
});
SwarmManager.measures('ServiceReadyTime', {
  from: Lifecycle.containerStartRequested,
  to: Lifecycle.serviceReady
});

when(Operator.updates(ManagerRuntime).through(SwarmManager))
  .then(SwarmManager.synchronizes(ManagerRuntime).with(Git, {
    branch: "development",
  }));

when(Operator.publishes(WorkerRuntimeRelease).through(SwarmManager))
  .then(SwarmManager.generates(WorkerRuntimeRelease))
  .and(SwarmManager.marks(WorkerRuntimeRelease).as("ActiveWorkerRuntime"));

when(Operator.launches(Worker).through(SwarmManager))
  .then(SwarmManager.selects(WorkerImageProfile))
  .and(EC2.materializes(Worker))
  .and(SwarmManager.records(Lifecycle.launchRequested).in(Truth.history));

when(Worker.reaches(Lifecycle.ec2Running))
  .then(SwarmManager.records(Lifecycle.ec2Running).in(Truth.history))
  .and(SwarmManager.projects(Worker).into(Fleet));

when(Worker.starts(CloudInit))
  .then(SwarmManager.records(Lifecycle.cloudInitStarted).in(Truth.history));

when(Worker.reaches(Lifecycle.dockerReady))
  .then(SwarmManager.records(Lifecycle.dockerReady).in(Truth.history));

when(Worker.starts(Telemetry))
  .then(SwarmManager.records(Lifecycle.telemetryStarted).in(Truth.history));

when(Worker.reaches(Lifecycle.connected))
  .then(SwarmManager.records(Lifecycle.connected).in(Truth.history))
  .and(SwarmManager.projects(Worker).into(Fleet));

when(Worker.reaches(Lifecycle.running))
  .then(SwarmManager.records(Lifecycle.running).in(Truth.history));

when(SwarmManager.observes(Worker, {
  in: Truth.inventory,
  as: Lifecycle.running,
  without: Truth.telemetry,
  past: Policy.bootGraceWindow
}))
  .then(SwarmManager.classifies(Worker).as(Lifecycle.zombie))
  .and(SwarmManager.records(Lifecycle.zombie).in(Truth.history));

when(Operator.hibernates(Worker).through(SwarmManager))
  .then(SwarmManager.records(Lifecycle.hibernating).in(Truth.history))
  .and(EC2.hibernates(Worker))
  .and(SwarmManager.records(Lifecycle.hibernated).in(Truth.history));

when(Operator.wakes(Worker).through(SwarmManager))
  .then(SwarmManager.records(Lifecycle.wakeRequested).in(Truth.history))
  .and(EC2.wakes(Worker))
  .and(SwarmManager.records(Lifecycle.woke).in(Truth.history));

when(Operator.terminates(Worker).through(SwarmManager))
  .then(EC2.discards(Worker))
  .and(SwarmManager.records(Lifecycle.terminated).in(Truth.history));

when(Operator.builds(WorkerImage).through(SwarmManager))
  .then(SwarmManager.launches(WorkerImageCandidate).as(Worker))
  .and(SwarmManager.projects(WorkerImageCandidate).into(Fleet))
  .and(SwarmManager.provisions(WorkerImageCandidate))
  .and(SwarmManager.snapshots(WorkerImageCandidate).into(WorkerImage))
  .and(SwarmManager.terminates(WorkerImageCandidate));

when(Operator.promotes(WorkerImage).through(SwarmManager))
  .then(SwarmManager.points(WorkerImageProfile).to(WorkerImage));

when(BunService.uses(StartupPaths.immutable))
  .then(Worker.skips("HostPackageInstall"))
  .and(Worker.skips("HostBunInstall"))
  .and(Worker.starts(Docker))
  .and(Worker.starts(Telemetry));

when(BunService.uses(StartupPaths.mutable))
  .then(BunService.synchronizes("SourceCode").with(Git))
  .and(BunService.installs("Dependencies"))
  .and(BunService.reconciles("RuntimeState"));

when(Operator.benchmarks(BunService).through(SwarmManager).on(Worker))
  .then(SwarmManager.starts(BunService).through(Docker).on(Worker))
  .and(SwarmManager.records(Lifecycle.containerStartRequested).in(BenchmarkRun))
  .and(BunService.synchronizes("SourceCode").with(Git))
  .and(BunService.installs("Dependencies"))
  .and(BunService.reaches(Lifecycle.serviceReady))
  .and(SwarmManager.records(Lifecycle.serviceReady).in(BenchmarkRun));

when(Operator.opens(Dashboard).through(SwarmManager))
  .then(Operator.authenticatesWith(AWS).through(Policy.trustedBootstrap))
  .and(SwarmManager.starts(Dashboard))
  .and(SwarmManager.starts(Cloudflared))
  .and(SwarmManager.returns("AccessUrl").to(Operator));

when(SwarmManager.encounters(Lifecycle.builderFailed))
  .then(SwarmManager.records(Lifecycle.builderFailed).in(Truth.history))
  .and(SwarmManager.executes("FailureRecovery"));

when(SwarmManager.encounters(Lifecycle.benchmarkFailed))
  .then(SwarmManager.records(Lifecycle.benchmarkFailed).in(BenchmarkRun))
  .and(SwarmManager.executes("FailureRecovery"));

when(SwarmManager.encounters(Lifecycle.wakeFailed))
  .then(SwarmManager.records(Lifecycle.wakeFailed).in(Truth.history))
  .and(SwarmManager.executes("FailureRecovery"));

when(Operator.operates(SwarmManager))
  .then(Operator.issues(Policy.fewHighLevelCommands))
  .and(SwarmManager.executes("LifecycleExecution"))
  .and(SwarmManager.executes("ImagePromotion"))
  .and(SwarmManager.executes("BenchmarkExecution"))
  .and(SwarmManager.enforces(Truth.priority));
