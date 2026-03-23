/// <reference path="../_agentish.d.ts" />

// Swarm Monitor

const Agentish = define.language("Agentish");

const SwarmMonitor = define.system("SwarmMonitor", {
  format: Agentish,
  role: "Low-overhead fleet telemetry for host health, container health, and crash-context process visibility",
});

const Manager = define.system("SwarmManager");
const Worker = define.system("SwarmWorker");
const Dashboard = define.system("SwarmDashboard");

const Host = {
  sample: define.entity("HostSample"),
  containerSample: define.entity("ContainerSample"),
  processSample: define.entity("ProcessSample"),
  processWindow: define.entity("ProcessWindow"),
  processRingBuffer: define.entity("ProcessRingBuffer"),
  processSnapshot: define.entity("TopProcessSnapshot"),
  processCpuRank: define.entity("TopCpuProcessRank"),
  processMemoryRank: define.entity("TopMemoryProcessRank"),
};

const Store = {
  metricsDb: define.document("MetricsDatabase"),
  workerSamples: define.document("WorkerSamplesTable"),
  containerSamples: define.document("ContainerSamplesTable"),
  processSamples: define.document("ProcessSamplesTable"),
};

const UI = {
  machineTimeline: define.entity("MachineTimelineScreen"),
  cpuSeries: define.entity("MachineCpuSeries"),
  memorySeries: define.entity("MachineMemorySeries"),
  processSeries: define.entity("TopProcessSeries"),
  processLegend: define.entity("ProcessLegend"),
  processDrilldown: define.entity("ProcessDrilldown"),
};

const Source = {
  procfs: define.system("Procfs"),
  docker: define.system("DockerStats"),
};

const Policy = {
  cheapOneSecondHostSample: define.concept("CheapOneSecondHostSample"),
  sparseProcessSampling: define.concept("SparseProcessSampling"),
  noBurstOnlyCapture: define.concept("NoBurstOnlyCapture"),
  procfsFirst: define.concept("ProcfsFirst"),
  boundedPayload: define.concept("BoundedPayload"),
  crashLeadupVisibility: define.concept("CrashLeadupVisibility"),
};

const Trigger = {
  periodicHostTick: define.event("PeriodicHostTick"),
  periodicProcessTick: define.event("PeriodicProcessTick"),
  anomalyObserved: define.event("HostAnomalyObserved"),
  disconnectObserved: define.event("WorkerDisconnectObserved"),
  reconnectObserved: define.event("WorkerReconnectObserved"),
};

SwarmMonitor.enforces(`
- Host CPU and RAM remain the cheapest, highest-frequency metrics.
- Process visibility is continuous but sparse.
- Process capture must not begin only after a spike has already started.
- Process capture should prefer procfs over shelling out to ps.
- Process payloads are bounded to top-ranked entries rather than full process tables.
- The monitor should preserve lead-up context before crashes, not only post-failure fragments.
- Machine-level monitoring and process-level context belong in the same metrics history.
- The swarm UI should expose machine timelines and top-process trends directly.
`);

SwarmMonitor.defines(`
- HostSample means the 1 Hz machine-level CPU and RAM sample already collected for each worker.
- ProcessSample means a low-rate process-level sample collected less often than HostSample.
- ProcessWindow means one sparse process collection tick with top CPU and top memory ranks.
- ProcessRingBuffer means the worker-side bounded memory of recent process windows before persistence.
- TopProcessSnapshot means a persisted process entry with pid, comm, cpu percent, rss bytes, and state.
- MachineTimelineScreen means a per-machine timeline view for CPU, RAM, and top processes.
- TopProcessSeries means a line graph that tracks one ranked process trend across time.
- SparseProcessSampling means process scanning at a lower cadence such as 5s, 10s, or 15s rather than every second.
- NoBurstOnlyCapture means spike capture cannot depend on starting extra work at the moment the host is already distressed.
`);

Worker.contains(Host.sample, Host.containerSample, Host.processRingBuffer, Host.processWindow);
Host.processWindow.contains(Host.processSnapshot, Host.processCpuRank, Host.processMemoryRank);
Manager.contains(Store.metricsDb, Store.workerSamples, Store.containerSamples, Store.processSamples);
Dashboard.contains(UI.machineTimeline, UI.cpuSeries, UI.memorySeries, UI.processSeries, UI.processLegend, UI.processDrilldown);

SwarmMonitor.means(`
- low-overhead host sampling
- sparse process visibility
- bounded storage
- pre-crash forensic context
- a machine-first monitoring UI
`);

Policy.cheapOneSecondHostSample.means(`
- keep current 1 Hz CPU and RAM sampling
- keep per-container telemetry on its existing path
- do not add expensive process enumeration to every heartbeat
`);

Policy.sparseProcessSampling.means(`
- scan processes periodically at a lower cadence than host metrics
- default toward 5s to 15s intervals
- compute per-process CPU from deltas across successive process samples
- rank and retain only the most relevant entries
`);

Policy.noBurstOnlyCapture.means(`
- do not rely on starting a new collector only after CPU or RAM has already spiked
- maintain recent lead-up context continuously
- allow anomaly thresholds to influence persistence or retention, not initial collection
`);

Policy.procfsFirst.means(`
- read process stats from /proc
- avoid ps in the steady-state path
- avoid expensive full argv capture by default
`);

Policy.boundedPayload.means(`
- capture only top N by CPU and top N by RSS
- include pid, comm, cpuPercent, rssBytes, and state
- prefer short stable identity fields over large command payloads
`);

Policy.crashLeadupVisibility.means(`
- preserve enough recent process history to explain spikes before a crash
- persist process windows often enough that a reboot does not erase the story
- let operators correlate machine CPU and RAM spikes with top-process trends
`);

when(Worker.emits(Trigger.periodicHostTick))
  .then(Worker.collects(Host.sample))
  .and(Worker.requires(Policy.cheapOneSecondHostSample));

when(Worker.emits(Trigger.periodicProcessTick))
  .then(Worker.collects(Host.processWindow))
  .and(Host.processWindow.observes(Source.procfs))
  .and(Worker.requires(Policy.sparseProcessSampling))
  .and(Worker.requires(Policy.procfsFirst))
  .and(Worker.requires(Policy.boundedPayload));

when(Worker.collects(Host.processWindow))
  .then(Host.processRingBuffer.retains(Host.processWindow))
  .and(Worker.preserves(Policy.crashLeadupVisibility))
  .and(Worker.forbids("starting process capture only after a spike"));

when(Worker.observes(Trigger.anomalyObserved))
  .then(Worker.applies(Policy.noBurstOnlyCapture))
  .and(Worker.mayIncrease("persistence urgency"))
  .and(Worker.shouldNotIncrease("sampling cost materially at the moment of distress"));

when(Worker.observes(Trigger.disconnectObserved).orObserves(Trigger.reconnectObserved))
  .then(Worker.flushes(Host.processRingBuffer).to(Store.processSamples))
  .and(Manager.records(Host.processSnapshot).in(Store.processSamples));

when(Manager.receives(Host.sample))
  .then(Manager.records(Host.sample).in(Store.workerSamples));

when(Manager.receives(Host.containerSample))
  .then(Manager.records(Host.containerSample).in(Store.containerSamples));

when(Manager.receives(Host.processSnapshot))
  .then(Manager.records(Host.processSnapshot).in(Store.processSamples))
  .and(Manager.associates(Host.processSnapshot).with(Host.sample));

when(Dashboard.renders(UI.machineTimeline))
  .then(UI.machineTimeline.includes(UI.cpuSeries))
  .and(UI.machineTimeline.includes(UI.memorySeries))
  .and(UI.machineTimeline.includes(UI.processSeries))
  .and(UI.machineTimeline.includes(UI.processLegend));

when(Dashboard.focuses("a machine"))
  .then(UI.machineTimeline.shows("machine CPU over time"))
  .and(UI.machineTimeline.shows("machine RAM over time"))
  .and(UI.machineTimeline.shows("top-process CPU lines over time"))
  .and(UI.machineTimeline.shows("top-process RSS lines over time"))
  .and(UI.processDrilldown.shows("ranked process snapshots for the selected time window"));

