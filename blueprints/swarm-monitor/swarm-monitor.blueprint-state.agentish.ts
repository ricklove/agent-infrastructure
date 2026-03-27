/// <reference path="../_agentish.d.ts" />

// Swarm Monitor Blueprint State

const Agentish = define.language("Agentish");

const SwarmMonitorBlueprintState = define.system("SwarmMonitorBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Swarm Monitor blueprint",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
};

const CurrentReality = {
  machineTimelinePresent: define.concept("MachineTimelinePresent"),
  machineSelectorPrimary: define.concept("MachineSelectorPrimary"),
  managerDefaultSelection: define.concept("ManagerDefaultSelection"),
  roleAnnotatedMachineOptions: define.concept("RoleAnnotatedMachineOptions"),
  verificationComplete: define.concept("VerificationComplete"),
};

SwarmMonitorBlueprintState.defines(`
- CurrentImplementationStatus means the dashboard swarm monitor currently renders a machine timeline with a visible machine selector rather than an unlabeled worker filter.
- AssessmentConfidence is high when local worker preview verification and browser checks confirm the selector placement, default selection, and role labels.
- ImplementationEvidence includes the explicit Machine selector label, manager-first ordering, role-annotated options, and browser verification against a worker-host preview.
- ImplementationGap means remaining follow-up in the swarm monitor area that is outside this selector clarity fix.
`);

SwarmMonitorBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  CurrentReality.machineTimelinePresent,
  CurrentReality.machineSelectorPrimary,
  CurrentReality.managerDefaultSelection,
  CurrentReality.roleAnnotatedMachineOptions,
  CurrentReality.verificationComplete,
);

CurrentReality.machineTimelinePresent.means(`
- the swarm dashboard renders a Machine Timeline section for per-machine CPU, RAM, and top-process history
- the timeline remains scoped by a selected machine rather than implicitly using a hidden worker state
`);

CurrentReality.machineSelectorPrimary.means(`
- the Machine Timeline header now includes an explicit Machine selector label
- the selector appears as a primary control beside the section heading instead of trailing the preset and range filters
`);

CurrentReality.managerDefaultSelection.means(`
- machine ordering places the manager first when available
- initial timeline selection falls back to the manager rather than an arbitrary worker
- stale or missing selections also recover to the first sorted machine entry
`);

CurrentReality.roleAnnotatedMachineOptions.means(`
- each machine option shows both node role and machine identity
- the current timeline subtitle also uses the role-annotated machine label
`);

CurrentReality.verificationComplete.means(`
- biome formatting and checks passed for the updated UI and blueprint files
- a targeted TypeScript check passed for packages/agent-swarm-ui
- a worker-host dashboard preview rendered the swarm screen in agent-browser
- browser verification confirmed the labeled Machine selector defaults to manager and lists role-annotated options
`);

when(CurrentReality.machineSelectorPrimary.exists())
  .then(SwarmMonitorBlueprintState.records(Assessment.status))
  .and(SwarmMonitorBlueprintState.treats("machine selection clarity as implemented behavior"));

when(CurrentReality.managerDefaultSelection.exists())
  .then(SwarmMonitorBlueprintState.records(Assessment.evidence))
  .and(SwarmMonitorBlueprintState.treats("manager-first defaulting as verified operator behavior"));

when(CurrentReality.verificationComplete.exists())
  .then(SwarmMonitorBlueprintState.records(Assessment.confidence))
  .and(SwarmMonitorBlueprintState.treats("the selector fix as locally verified before integration"));
