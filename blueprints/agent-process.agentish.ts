/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentProcess = define.system("AgentProcess", {
  format: Agentish,
  role: "Stateless workflow definition for a class of agentic work",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

AgentProcess.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

when(SubjectBlueprint.contains(Section.concept))
  .then(Section.concept.answers("why the process exists, what abstractions are authoritative, and what must remain stateless"));

when(SubjectBlueprint.contains(Section.scenarios))
  .then(Section.scenarios.answers("how process start, step progression, blocked states, completion, and revision loops should appear to operators and agents"));

when(SubjectBlueprint.contains(Section.implementationPlan))
  .then(Section.implementationPlan.answers("where process definition ownership ends, how outline and transition structure stay recoverable, and how snapshots preserve runtime-readable process data"));

when(SubjectBlueprint.contains(Section.contracts))
  .then(Section.contracts.answers("exact process-contract fields, step and transition fields, completion-mode semantics, and snapshot-preservation fields"));

const Actor = {
  operator: define.actor("WorkspaceOperator"),
  agent: define.actor("WorkspaceAgent"),
  ticket: define.entity("AgentTicket"),
};

const Artifact = {
  definition: define.document("AgentProcessDefinition"),
  machineContract: define.document("AgentProcessMachineContract"),
  guide: define.document("AgentProcessGuide"),
  outline: define.document("AgentProcessOutline"),
  snapshot: define.document("AgentProcessSnapshot"),
  catalog: define.workspace("AgentProcessCatalog"),
  watchdogPolicy: define.document("AgentProcessWatchdogPolicy"),
};

const Watchdog = {
  idleTimeoutMs: define.document("AgentProcessWatchdogIdleTimeoutMs"),
  shortTarget: define.document("AgentProcessWatchdogShortTarget"),
  continuationPrompt: define.document("AgentProcessWatchdogContinuationPrompt"),
  blockedPrompt: define.document("AgentProcessWatchdogBlockedPrompt"),
  donePrompt: define.document("AgentProcessWatchdogDonePrompt"),
};

const Step = {
  node: define.entity("AgentProcessStep"),
  id: define.document("AgentProcessStepId"),
  title: define.document("AgentProcessStepTitle"),
  nodeKind: define.document("AgentProcessStepKind"),
  decisionPrompt: define.document("AgentProcessDecisionPrompt"),
  decisionOption: define.entity("AgentProcessDecisionOption"),
  decisionOptionId: define.document("AgentProcessDecisionOptionId"),
  decisionOptionTitle: define.document("AgentProcessDecisionOptionTitle"),
  decisionOptionGoto: define.document("AgentProcessDecisionOptionGoto"),
  decisionOptionCompletes: define.document("AgentProcessDecisionOptionCompletesProcess"),
  doneToken: define.document("AgentProcessStepDoneToken"),
  blockedToken: define.document("AgentProcessStepBlockedToken"),
  transition: define.entity("AgentProcessTransition"),
  target: define.document("AgentProcessTransitionTarget"),
  kind: define.document("AgentProcessTransitionKind"),
};

const Contract = {
  processId: define.document("AgentProcessId"),
  title: define.document("AgentProcessTitle"),
  catalogOrder: define.document("AgentProcessCatalogOrder"),
  expectation: define.document("AgentProcessExpectation"),
  completionMode: define.document("AgentProcessCompletionMode"),
  allowedCompletionMode: define.document("AllowedAgentProcessCompletionMode"),
  completionToken: define.document("AgentProcessCompletionToken"),
  blockedToken: define.document("AgentProcessBlockedToken"),
  stopCondition: define.document("AgentProcessStopCondition"),
  runtimeOutlineRequired: define.document("AgentProcessRuntimeOutlineRequired"),
};

const Policy = {
  stateless: define.concept("ProcessDefinitionIsStateless"),
  structuredSource: define.concept("StructuredProcessSource"),
  reusableSteps: define.concept("ComposableSubsteps"),
  snapshotPinned: define.concept("TicketPinsProcessSnapshot"),
  normalizedContract: define.concept("NormalizedMachineContract"),
  singleNextStep: define.concept("SingleNextStepProgression"),
};

AgentProcess.enforces(`
- An agent process is a definition, not a live holder of runtime progress.
- A process definition should remain readable for humans and normalizable for the system.
- A process definition may have both a machine-readable contract and an Agentish guide, but the machine contract remains the primary runtime source.
- The process source should expose explicit steps, stable step ids, and explicit transitions or back-references when revision loops exist.
- A process definition should be renderable as a nested checklist-style outline for full inspection in the UI.
- Similar long-running processes should reuse shared substeps instead of restating slightly divergent prose.
- A process definition should define exact process-level terminal tokens and may also define exact step-level tokens for step completion or step-level blocked states.
- A process definition should expose one authoritative next actionable step at a time for any non-terminal ticket instance.
- A running ticket should pin an immutable snapshot of the resolved process definition so runtime execution does not depend on a mutable source branch or file.
- Process evolution should not silently rewrite already-running ticket meaning.
`);

AgentProcess.defines(`
- AgentProcessDefinition means the durable source definition for a class of workflow.
- AgentProcessMachineContract means the normalized runtime contract used for selection, watchdog behavior, and ticket execution.
- AgentProcessGuide means the Agentish companion that explains process semantics, rationale, and edge cases.
- AgentProcessOutline means the human-readable ordered step source for the process.
- AgentProcessSnapshot means the immutable ticket-pinned resolved copy of one process definition.
- AgentProcessWatchdogPolicy means the process-owned idle, blocked, and completion policy.
- AgentProcessWatchdogIdleTimeoutMs means the idle duration before the watchdog becomes eligible.
- AgentProcessWatchdogShortTarget means the compact next-step or process target named in watchdog-facing status surfaces.
- AgentProcessWatchdogContinuationPrompt means the exact watchdog continuation prompt for unresolved active work.
- AgentProcessWatchdogBlockedPrompt means the exact watchdog prompt used when the runtime needs blocked-state resolution.
- AgentProcessWatchdogDonePrompt means the exact watchdog prompt used when the runtime is terminal-ready and expects explicit completion resolution.
- AgentProcessStep means one named stable step in the process.
- AgentProcessStepKind means one of task, wait, or decision.
- AgentProcessDecisionPrompt means the exact constrained question asked when a decision step becomes active.
- AgentProcessDecisionOption means one allowed answer to a decision step.
- AgentProcessStepDoneToken means the exact token that marks one step complete when the process uses explicit step tokens.
- AgentProcessStepBlockedToken means the exact token that marks one step blocked when the process uses explicit step tokens.
- AgentProcessTransition means an allowed advance, return, branch, or terminal edge between steps.
- AllowedAgentProcessCompletionMode means one of exact_reply, explicit_step_tokens, or external_resolution.
- ProcessDefinitionIsStateless means the definition never carries live execution progress.
- StructuredProcessSource means the authoring source stays explicit enough that the system does not need to infer control flow from large prose paragraphs.
- ComposableSubsteps means shared process segments may be reused across several process definitions.
- TicketPinsProcessSnapshot means runtime execution is anchored to the immutable snapshot rather than to a mutable live source.
- NormalizedMachineContract means the selected process resolves into one closed machine-readable contract before tickets depend on it.
- SingleNextStepProgression means the runtime should allow completion only for the one current next step derived from the process definition and the ticket state.
`);

Artifact.catalog.contains(Artifact.definition);
Artifact.definition.contains(
  Artifact.machineContract,
  Artifact.guide,
  Artifact.outline,
  Artifact.watchdogPolicy,
  Watchdog.idleTimeoutMs,
  Watchdog.shortTarget,
  Watchdog.continuationPrompt,
  Watchdog.blockedPrompt,
  Watchdog.donePrompt,
  Step.node,
  Step.id,
  Step.title,
  Step.nodeKind,
  Step.decisionPrompt,
  Step.decisionOption,
  Step.decisionOptionId,
  Step.decisionOptionTitle,
  Step.decisionOptionGoto,
  Step.decisionOptionCompletes,
  Step.doneToken,
  Step.blockedToken,
  Step.transition,
  Step.target,
  Step.kind,
  Contract.processId,
  Contract.title,
  Contract.catalogOrder,
  Contract.expectation,
  Contract.completionMode,
  Contract.allowedCompletionMode,
  Contract.completionToken,
  Contract.blockedToken,
  Contract.stopCondition,
  Policy.stateless,
  Policy.structuredSource,
  Policy.reusableSteps,
  Policy.snapshotPinned,
  Policy.normalizedContract,
  Policy.singleNextStep,
);

Artifact.machineContract.contains(
  Contract.processId,
  Contract.title,
  Contract.catalogOrder,
  Contract.expectation,
  Contract.completionMode,
  Contract.allowedCompletionMode,
  Contract.completionToken,
  Contract.blockedToken,
  Contract.stopCondition,
  Contract.runtimeOutlineRequired,
  Artifact.watchdogPolicy,
  Step.node,
  Step.transition,
);

Artifact.watchdogPolicy.contains(
  Watchdog.idleTimeoutMs,
  Watchdog.shortTarget,
  Watchdog.continuationPrompt,
  Watchdog.blockedPrompt,
  Watchdog.donePrompt,
);

Step.node.contains(
  Step.id,
  Step.title,
  Step.nodeKind,
  Step.decisionPrompt,
  Step.decisionOption,
  Step.doneToken,
  Step.blockedToken,
  Step.transition,
);
Step.decisionOption.contains(
  Step.decisionOptionId,
  Step.decisionOptionTitle,
  Step.decisionOptionGoto,
  Step.decisionOptionCompletes,
);
Step.transition.contains(Step.kind, Step.target);

when(Artifact.catalog.contains(Artifact.definition))
  .then(AgentProcess.requires(Policy.structuredSource))
  .and(AgentProcess.requires(Policy.reusableSteps))
  .and(AgentProcess.requires(Policy.normalizedContract))
  .and(AgentProcess.requires(Policy.singleNextStep));

when(Policy.stateless.exists())
  .then(Artifact.definition.requires(Policy.stateless));

when(Artifact.outline.defines(Step.node))
  .then(Step.node.expects(Step.id))
  .and(Step.node.expects(Step.title))
  .and(Step.node.expects(Step.nodeKind))
  .and(Step.transition.avoids("implicit prose-only control flow"));

when(Step.nodeKind.is("decision"))
  .then(Step.node.expects(Step.decisionPrompt))
  .and(Step.node.expects(Step.decisionOption));

when(Actor.operator.selects(Artifact.definition))
  .then(Actor.ticket.requires(Artifact.snapshot))
  .and(AgentProcess.requires(Policy.snapshotPinned));

when(Artifact.snapshot.exists())
  .then(Artifact.snapshot.preserves(Artifact.machineContract))
  .and(Artifact.snapshot.preserves(Artifact.watchdogPolicy))
  .and(Artifact.snapshot.preserves(Artifact.outline))
  .and(Artifact.snapshot.preserves(Step.node))
  .and(Artifact.snapshot.preserves(Step.transition));

when(Actor.agent.follows(Artifact.snapshot))
  .then(Actor.agent.uses(Artifact.machineContract))
  .and(Actor.agent.uses(Artifact.watchdogPolicy))
  .and(Actor.agent.uses(Artifact.outline).for("human-readable step semantics"));

when(Artifact.machineContract.exists())
  .then(Artifact.machineContract.expects(Artifact.outline))
  .and(Artifact.machineContract.expects(Contract.expectation))
  .and(Artifact.machineContract.expects(Contract.completionMode))
  .and(Artifact.machineContract.expects(Contract.allowedCompletionMode))
  .and(Artifact.machineContract.expects(Contract.completionToken))
  .and(Artifact.machineContract.expects(Contract.blockedToken))
  .and(Artifact.machineContract.expects(Contract.runtimeOutlineRequired))
  .and(Artifact.machineContract.expects(Artifact.watchdogPolicy));

when(Artifact.watchdogPolicy.exists())
  .then(Artifact.watchdogPolicy.expects(Watchdog.idleTimeoutMs))
  .and(Artifact.watchdogPolicy.expects(Watchdog.shortTarget))
  .and(Artifact.watchdogPolicy.expects(Watchdog.continuationPrompt))
  .and(Artifact.watchdogPolicy.expects(Watchdog.blockedPrompt))
  .and(Artifact.watchdogPolicy.expects(Watchdog.donePrompt));

when(Contract.completionMode.exists())
  .then(Contract.completionMode.requires(Contract.allowedCompletionMode));

when(Contract.completionMode.is("exact_reply"))
  .then(Artifact.machineContract.requires(Contract.completionToken))
  .and(Artifact.machineContract.requires(Contract.blockedToken))
  .and(Artifact.machineContract.treats("exact token matching as the terminal process boundary"));

when(Contract.completionMode.is("explicit_step_tokens"))
  .then(Artifact.machineContract.requires(Step.doneToken))
  .and(Artifact.machineContract.treats("step tokens as the authoritative legal step-transition boundary"))
  .and(Artifact.machineContract.allows("process completion only after all required steps are terminally resolved"));

when(Contract.completionMode.is("external_resolution"))
  .then(Artifact.machineContract.forbids("treating freeform agent text as process completion by itself"))
  .and(Artifact.machineContract.treats("runtime state validation as the terminal process boundary"));

when(Contract.runtimeOutlineRequired.exists())
  .then(Artifact.snapshot.requires(Artifact.outline))
  .and(Artifact.machineContract.treats("outline visibility as runtime-required rather than source-only context"));
