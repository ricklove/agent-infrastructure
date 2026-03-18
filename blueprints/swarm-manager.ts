const SwarmManagerBlueprint = define.entity('SwarmManagerBlueprint', {
  format: 'Agentish',
  describes: 'SwarmManagerTopologyAndCausality'
});

const Operator = define.actor('Operator', {
  role: 'TrustedController'
});

const SwarmManager = define.system('SwarmManager', {
  role: 'PrivateControlPlane'
});
const Worker = define.system('Worker', {
  role: 'EC2BackedRuntimeNode'
});
const EC2 = define.system('EC2');
const Docker = define.system('Docker');
const Git = define.system('Git');
const AWS = define.system('AWS');
const Cloudflared = define.system('Cloudflared');
const Dashboard = define.system('Dashboard');
const Telemetry = define.system('Telemetry');
const CloudInit = define.system('CloudInit');

const Fleet = define.entity('Fleet');
const AwsInventory = define.entity('AwsInventory');
const TelemetryReality = define.entity('TelemetryReality');
const HistoricalLifecycle = define.entity('HistoricalLifecycle');
const WorkerImage = define.entity('WorkerImage');
const WorkerImageProfile = define.entity('WorkerImageProfile');
const WorkerClass = define.entity('WorkerClass');
const BunWorkerClass = define.entity('BunWorkerClass');
const BrowserWorkerClass = define.entity('BrowserWorkerClass');
const WorkerImageCandidate = define.entity('WorkerImageCandidate');
const WorkerRuntimeRelease = define.entity('WorkerRuntimeRelease');
const ActiveWorkerRuntime = define.entity('ActiveWorkerRuntime');
const ManagerRuntime = define.entity('ManagerRuntime');
const BunService = define.entity('BunService');
const BenchmarkRun = define.entity('BenchmarkRun');
const SourceCode = define.entity('SourceCode');
const Dependencies = define.entity('Dependencies');
const AccessUrl = define.entity('AccessUrl');
const DevelopmentBranch = define.entity('DevelopmentBranch');
const ImmutableStartupPath = define.entity('ImmutableStartupPath');
const MutableStartupPath = define.entity('MutableStartupPath');
const FailureRecovery = define.entity('FailureRecovery');
const LifecycleExecution = define.entity('LifecycleExecution');
const ImagePromotion = define.entity('ImagePromotion');
const BenchmarkExecution = define.entity('BenchmarkExecution');
const ExistenceTruth = define.entity('ExistenceTruth');
const LivenessTruth = define.entity('LivenessTruth');
const TimingTruth = define.entity('TimingTruth');
const HostPackageInstall = define.entity('HostPackageInstall');
const HostBunInstall = define.entity('HostBunInstall');
const RuntimeState = define.entity('RuntimeState');
const ColdStartTime = define.entity('ColdStartTime');
const WakeTime = define.entity('WakeTime');
const ServiceReadyTime = define.entity('ServiceReadyTime');

const TrustedBootstrap = define.concept('TrustedBootstrap');
const RepeatedManualSSMOperations = define.concept('RepeatedManualSSMOperations');
const FleetTruthPriority = define.concept('FleetTruthPriority');
const BootGraceWindow = define.concept('BootGraceWindow');
const FewHighLevelCommands = define.concept('FewHighLevelCommands');

const LaunchRequested = define.event('LaunchRequested');
const CloudInitStarted = define.event('CloudInitStarted');
const TelemetryStarted = define.event('TelemetryStarted');
const WakeRequested = define.event('WakeRequested');
const Woke = define.event('Woke');
const ContainerStartRequested = define.event('ContainerStartRequested');
const BuilderFailed = define.event('BuilderFailed');
const BenchmarkFailed = define.event('BenchmarkFailed');
const WakeFailed = define.event('WakeFailed');

const Ec2Running = define.state('Ec2Running');
const DockerReady = define.state('DockerReady');
const Connected = define.state('Connected');
const Running = define.state('Running');
const Hibernating = define.state('Hibernating');
const Hibernated = define.state('Hibernated');
const Terminated = define.state('Terminated');
const Zombie = define.state('Zombie');
const ServiceReady = define.state('ServiceReady');

SwarmManager.observes(AwsInventory).toUnderstand(ExistenceTruth);
SwarmManager.observes(TelemetryReality).toUnderstand(LivenessTruth);
SwarmManager.observes(HistoricalLifecycle).toUnderstand(TimingTruth);
SwarmManager.aligns(Fleet).toMatch(AwsInventory);
SwarmManager.refines(Fleet).with(TelemetryReality);
SwarmManager.explains(Fleet).through(HistoricalLifecycle);
SwarmManager.aligns(WorkerImageProfile).toMatch(WorkerImage);
SwarmManager.aligns(WorkerRuntimeRelease).toMatch(ActiveWorkerRuntime);
SwarmManager.owns(LifecycleExecution);
SwarmManager.owns(ImagePromotion);
SwarmManager.owns(BenchmarkExecution);
SwarmManager.owns(FailureRecovery);
SwarmManager.minimizes(RepeatedManualSSMOperations);

FleetTruthPriority.orders(AwsInventory, TelemetryReality, HistoricalLifecycle);

Worker.runsOn(EC2);
Worker.starts(Docker);
Worker.starts(Telemetry);
Worker.reports(TelemetryReality).to(SwarmManager);
Worker.projects(HistoricalLifecycle).from('LifecycleEvents');

WorkerImageProfile.selects(WorkerClass);
BunWorkerClass.specializes(WorkerClass);
BrowserWorkerClass.specializes(WorkerClass);

ImmutableStartupPath.describes('BakedWorkerBoot');
MutableStartupPath.describes('RuntimeRefreshAfterBoot');

ExistenceTruth.derivesFrom(AwsInventory);
LivenessTruth.derivesFrom(TelemetryReality);
TimingTruth.derivesFrom(HistoricalLifecycle);

SwarmManager.measures(ColdStartTime, {
  from: LaunchRequested,
  to: Running
});
SwarmManager.measures(WakeTime, {
  from: WakeRequested,
  to: Running
});
SwarmManager.measures(ServiceReadyTime, {
  from: ContainerStartRequested,
  to: ServiceReady
});

when(Operator.updates(ManagerRuntime).through(SwarmManager))
  .then(SwarmManager.synchronizes(ManagerRuntime).with(Git, {
    branch: DevelopmentBranch
  }));

when(Operator.publishes(WorkerRuntimeRelease).through(SwarmManager))
  .then(SwarmManager.generates(WorkerRuntimeRelease))
  .and(SwarmManager.marks(WorkerRuntimeRelease).as(ActiveWorkerRuntime));

when(Operator.launches(Worker).through(SwarmManager))
  .then(SwarmManager.selects(WorkerImageProfile))
  .and(EC2.materializes(Worker))
  .and(SwarmManager.records(LaunchRequested).in(HistoricalLifecycle));

when(Worker.reaches(Ec2Running))
  .then(SwarmManager.records(Ec2Running).in(HistoricalLifecycle))
  .and(SwarmManager.projects(Worker).into(Fleet));

when(Worker.starts(CloudInit))
  .then(SwarmManager.records(CloudInitStarted).in(HistoricalLifecycle));

when(Worker.reaches(DockerReady))
  .then(SwarmManager.records(DockerReady).in(HistoricalLifecycle));

when(Worker.starts(Telemetry))
  .then(SwarmManager.records(TelemetryStarted).in(HistoricalLifecycle));

when(Worker.reaches(Connected))
  .then(SwarmManager.records(Connected).in(HistoricalLifecycle))
  .and(SwarmManager.projects(Worker).into(Fleet));

when(Worker.reaches(Running))
  .then(SwarmManager.records(Running).in(HistoricalLifecycle));

when(SwarmManager.observes(Worker, {
  in: AwsInventory,
  as: Running,
  without: Telemetry,
  past: BootGraceWindow
}))
  .then(SwarmManager.classifies(Worker).as(Zombie))
  .and(SwarmManager.records(Zombie).in(HistoricalLifecycle));

when(Operator.hibernates(Worker).through(SwarmManager))
  .then(SwarmManager.records(Hibernating).in(HistoricalLifecycle))
  .and(EC2.hibernates(Worker))
  .and(SwarmManager.records(Hibernated).in(HistoricalLifecycle));

when(Operator.wakes(Worker).through(SwarmManager))
  .then(SwarmManager.records(WakeRequested).in(HistoricalLifecycle))
  .and(EC2.wakes(Worker))
  .and(SwarmManager.records(Woke).in(HistoricalLifecycle));

when(Operator.terminates(Worker).through(SwarmManager))
  .then(EC2.discards(Worker))
  .and(SwarmManager.records(Terminated).in(HistoricalLifecycle));

when(Operator.builds(WorkerImage).through(SwarmManager))
  .then(SwarmManager.launches(WorkerImageCandidate).as(Worker))
  .and(SwarmManager.projects(WorkerImageCandidate).into(Fleet))
  .and(SwarmManager.provisions(WorkerImageCandidate))
  .and(SwarmManager.snapshots(WorkerImageCandidate).into(WorkerImage))
  .and(SwarmManager.terminates(WorkerImageCandidate));

when(Operator.promotes(WorkerImage).through(SwarmManager))
  .then(SwarmManager.points(WorkerImageProfile).to(WorkerImage))
  .and(SwarmManager.executes(ImagePromotion));

when(BunService.uses(ImmutableStartupPath))
  .then(Worker.skips(HostPackageInstall))
  .and(Worker.skips(HostBunInstall))
  .and(Worker.starts(Docker))
  .and(Worker.starts(Telemetry));

when(BunService.uses(MutableStartupPath))
  .then(BunService.synchronizes(SourceCode).with(Git))
  .and(BunService.installs(Dependencies))
  .and(BunService.reconciles(RuntimeState));

when(Operator.benchmarks(BunService).through(SwarmManager).on(Worker))
  .then(SwarmManager.starts(BunService).through(Docker).on(Worker))
  .and(SwarmManager.records(ContainerStartRequested).in(BenchmarkRun))
  .and(BunService.synchronizes(SourceCode).with(Git))
  .and(BunService.installs(Dependencies))
  .and(BunService.reaches(ServiceReady))
  .and(SwarmManager.records(ServiceReady).in(BenchmarkRun))
  .and(SwarmManager.executes(BenchmarkExecution));

when(Operator.opens(Dashboard).through(SwarmManager))
  .then(Operator.authenticatesWith(AWS).through(TrustedBootstrap))
  .and(SwarmManager.starts(Dashboard))
  .and(SwarmManager.starts(Cloudflared))
  .and(SwarmManager.returns(AccessUrl).to(Operator));

when(SwarmManager.encounters(BuilderFailed))
  .then(SwarmManager.records(BuilderFailed).in(HistoricalLifecycle))
  .and(SwarmManager.executes(FailureRecovery));

when(SwarmManager.encounters(BenchmarkFailed))
  .then(SwarmManager.records(BenchmarkFailed).in(BenchmarkRun))
  .and(SwarmManager.executes(FailureRecovery));

when(SwarmManager.encounters(WakeFailed))
  .then(SwarmManager.records(WakeFailed).in(HistoricalLifecycle))
  .and(SwarmManager.executes(FailureRecovery));

when(Operator.operates(SwarmManager))
  .then(Operator.issues(FewHighLevelCommands))
  .and(SwarmManager.executes(LifecycleExecution))
  .and(SwarmManager.executes(ImagePromotion))
  .and(SwarmManager.executes(BenchmarkExecution))
  .and(SwarmManager.enforces(FleetTruthPriority));
