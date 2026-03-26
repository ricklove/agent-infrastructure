/// <reference path="./_agentish.d.ts" />

// Process Blueprints

const Agentish = define.language("Agentish");

const ProcessBlueprints = define.system("ProcessBlueprints", {
  format: Agentish,
  role: "Machine-readable execution contracts that can be assigned to a chat session and used by the system to drive expectation-aware watchdog behavior",
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
- The JSON process blueprint should carry an explicit catalog order so the process list is presented in a stable progressive sequence rather than inferred from title sorting.
- A session may select one process blueprint as its active expectation contract.
- Idle watchdog behavior should use the selected process blueprint rather than a generic one-size-fits-all idle prompt.
- Different process blueprints may define different completion criteria, idle prompts, and stop conditions.
`);

ProcessBlueprints.defines(`
- ProcessBlueprintJson means the machine-readable process contract containing the fields required by the system to list, assign, and watchdog a process expectation.
- ProcessBlueprintGuide means an optional Agentish explanation of the process semantics, examples, and edge cases for agents and operators.
- ProcessBlueprintCatalogOrder means the explicit numeric display order used when presenting process choices in the catalog or session picker.
- JsonPrimaryContract means the system does not infer process behavior from prose when the JSON contract already defines it.
- OptionalAgentishCompanion means a process blueprint may omit the Agentish companion and still remain valid for system use.
- SharedBlueprintCatalogPresence means process blueprints are discovered from the same blueprints/ tree that holds other repository blueprints.
- SessionScopedExpectation means the selected process blueprint belongs to the session rather than to the provider runtime globally.
- ExpectationDrivenIdleWatchdog means the idle watchdog asks expectation-specific completion or continuation prompts based on the assigned process blueprint.
- ProgressiveProcessCatalogOrder means the process list should move from least-committal and most discussion-oriented choices toward more structured blueprint and implementation workflows, with Discuss first after the unassigned none state.
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
  .and(ProcessBlueprints.expects("the assigned process blueprint id to be durable session metadata"));

when(Actor.system.observes("a session idle transition while expectation work remains unresolved"))
  .then(ProcessBlueprints.requires(Policy.expectationDrivenIdleWatchdog))
  .and(ProcessBlueprints.expects("the watchdog prompt to come from the assigned process blueprint JSON"));

when(Artifact.processBlueprint.exists())
  .then(ProcessBlueprints.expects(Artifact.catalogOrder))
  .and(ProcessBlueprints.treats("lower catalog-order numbers as earlier in the presented process sequence"));
