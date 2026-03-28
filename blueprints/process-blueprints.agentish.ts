/// <reference path="./_agentish.d.ts" />

// Process Blueprints

const Agentish = define.language("Agentish");

const ProcessBlueprints = define.system("ProcessBlueprints", {
  format: Agentish,
  role: "Repository-stored process definitions cataloged for session selection and ticket snapshotting",
});

const Artifact = {
  catalog: define.workspace("BlueprintCatalog"),
  processBlueprint: define.document("ProcessBlueprintJson"),
  companionGuide: define.document("ProcessBlueprintGuide"),
  sessionAssignment: define.document("SessionProcessBlueprintAssignment"),
  catalogOrder: define.document("ProcessBlueprintCatalogOrder"),
};

const Actor = {
  operator: define.actor("WorkspaceOperator"),
  system: define.actor("ExpectationWatchdog"),
  agent: define.actor("WorkspaceAgent"),
};

const Policy = {
  jsonPrimary: define.concept("JsonPrimaryContract"),
  optionalGuide: define.concept("OptionalAgentishCompanion"),
  sharedCatalog: define.concept("SharedBlueprintCatalogPresence"),
  sessionScoped: define.concept("SessionScopedExpectation"),
  expectationDrivenIdleWatchdog: define.concept("ExpectationDrivenIdleWatchdog"),
  progressiveCatalogOrder: define.concept("ProgressiveProcessCatalogOrder"),
};

ProcessBlueprints.enforces(`
- Process blueprints live under blueprints/ as first-class blueprint artifacts.
- A process blueprint must be machine-readable without requiring prose parsing.
- A process blueprint may optionally have an Agentish companion guide with the same basename.
- The JSON process blueprint is the primary system contract for discovery, assignment, and watchdog behavior.
- Process blueprint is legacy naming for what is conceptually an agent-process definition rather than a live process-state holder.
- The JSON process blueprint should carry an explicit catalog order so the process list is presented in a stable progressive sequence rather than inferred from title sorting.
- A session may select one process blueprint as its active expectation contract.
- Session selection should resolve into a ticket-pinned process snapshot before long-running runtime work depends on that process.
- Starting a process should emit one canonical expectation event that includes the expectation message and the full process outline for the newly focused ticket.
- Process steps may represent ordinary work, waiting states, or constrained decision points.
- Idle watchdog behavior should use the selected process blueprint rather than a generic one-size-fits-all idle prompt.
- Idle watchdog continuation should name the next actionable ticket step rather than only the coarse process name when ticket step state is available.
- Different process blueprints may define different completion criteria, idle prompts, and stop conditions.
`);

ProcessBlueprints.defines(`
- ProcessBlueprintJson means the machine-readable process contract containing the fields required by the system to list, assign, and watchdog a process expectation.
- ProcessBlueprintGuide means an optional Agentish explanation of the process semantics, examples, and edge cases for agents and operators.
- LegacyProcessBlueprintName means the current repository naming still says process blueprint even though the conceptual role is a stateless process definition.
- ProcessBlueprintCatalogOrder means the explicit numeric display order used when presenting process choices in the catalog or session picker.
- JsonPrimaryContract means the system does not infer process behavior from prose when the JSON contract already defines it.
- OptionalAgentishCompanion means a process blueprint may omit the Agentish companion and still remain valid for system use.
- SharedBlueprintCatalogPresence means process blueprints are discovered from the same blueprints/ tree that holds other repository blueprints.
- SessionScopedExpectation means the selected process blueprint belongs to the session rather than to the provider runtime globally.
- ExpectationDrivenIdleWatchdog means the idle watchdog asks expectation-specific completion or continuation prompts based on the assigned process blueprint.
- ExpectationStartEvent means process start should surface one initial canonical event that shows both the selected expectation and the full step outline.
- ProcessDecisionStep means one named step whose allowed outcomes are explicitly enumerated in the machine contract rather than improvised from transcript prose.
- ProcessWaitStep means one named step whose purpose is to remain in a waiting state until an external event or user response arrives.
- ProgressiveProcessCatalogOrder means the process list should move from least-committal and most discussion-oriented choices toward more structured blueprint, process-definition, and implementation workflows, with Discuss first after the unassigned none state.
`);

ProcessBlueprints.contains(
  Artifact.catalog,
  Artifact.processBlueprint,
  Artifact.companionGuide,
  Artifact.sessionAssignment,
  Artifact.catalogOrder,
  Policy.jsonPrimary,
  Policy.optionalGuide,
  Policy.sharedCatalog,
  Policy.sessionScoped,
  Policy.expectationDrivenIdleWatchdog,
  Policy.progressiveCatalogOrder,
);

when(Artifact.catalog.contains(Artifact.processBlueprint))
  .then(ProcessBlueprints.requires(Policy.jsonPrimary))
  .and(ProcessBlueprints.requires(Policy.sharedCatalog))
  .and(ProcessBlueprints.requires(Policy.progressiveCatalogOrder));

when(Artifact.processBlueprint.pairsWith("an optional companion guide"))
  .then(ProcessBlueprints.requires(Policy.optionalGuide))
  .and(ProcessBlueprints.treats("same-basename pairing as the default discovery rule"));

when(Actor.operator.assigns(Artifact.processBlueprint).to(Artifact.sessionAssignment))
  .then(ProcessBlueprints.requires(Policy.sessionScoped))
  .and(ProcessBlueprints.expects("the assigned process blueprint id to be durable session metadata"))
  .and(ProcessBlueprints.prefers("ticket runtime state to pin an immutable snapshot of the selected process definition"));

when(Actor.system.observes("a session idle transition while expectation work remains unresolved"))
  .then(ProcessBlueprints.requires(Policy.expectationDrivenIdleWatchdog))
  .and(ProcessBlueprints.expects("the watchdog prompt to come from the assigned process blueprint JSON"))
  .and(ProcessBlueprints.prefers("the next actionable ticket step as the short continuation target when ticket state exists"));

when(Artifact.processBlueprint.exists())
  .then(ProcessBlueprints.expects(Artifact.catalogOrder))
  .and(ProcessBlueprints.treats("lower catalog-order numbers as earlier in the presented process sequence"));
