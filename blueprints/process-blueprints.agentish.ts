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
  processStepBundle: define.document("ProcessStepBundleJson"),
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
- The JSON process blueprint is the primary system contract for discovery, assignment, and ticket-owned continuation behavior.
- Process blueprint is legacy naming for what is conceptually an agent-process definition rather than a live process-state holder.
- The JSON process blueprint should carry an explicit catalog order so the process list is presented in a stable progressive sequence rather than inferred from title sorting.
- A session may select one process blueprint as its active expectation contract.
- Session selection should resolve into a ticket-pinned process snapshot before long-running runtime work depends on that process.
- Starting a process should emit one canonical expectation event that includes the expectation message and the full process outline for the newly focused ticket.
- Process steps may represent ordinary work, waiting states, or constrained decision points.
- Process steps may also contain nested substeps that remain hierarchical in the outline while executing depth-first like ordinary steps.
- Reusable process-step bundles may be imported into a process or nested step tree without duplicating the step definitions inline.
- Decision-step options may advance to the next step, jump to an explicit step id, complete the process, or block the process.
- Immediate idle continuation should use the selected process blueprint rather than a generic one-size-fits-all prompt.
- When ticket step state exists, immediate idle continuation should surface as a system ticket message that names the next actionable step rather than only the coarse process name.
- Legacy standalone watchdog prompts should not remain active once ticket-owned step continuation exists.
- Different process blueprints may define different completion criteria, idle prompts, and stop conditions.
`);

ProcessBlueprints.defines(`
- ProcessBlueprintJson means the machine-readable process contract containing the fields required by the system to list, assign, and drive ticket-owned continuation for a process expectation.
- ProcessBlueprintGuide means an optional Agentish explanation of the process semantics, examples, and edge cases for agents and operators.
- LegacyProcessBlueprintName means the current repository naming still says process blueprint even though the conceptual role is a stateless process definition.
- ProcessBlueprintCatalogOrder means the explicit numeric display order used when presenting process choices in the catalog or session picker.
- JsonPrimaryContract means the system does not infer process behavior from prose when the JSON contract already defines it.
- OptionalAgentishCompanion means a process blueprint may omit the Agentish companion and still remain valid for system use.
- SharedBlueprintCatalogPresence means process blueprints are discovered from the same blueprints/ tree that holds other repository blueprints.
- SessionScopedExpectation means the selected process blueprint belongs to the session rather than to the provider runtime globally.
- ExpectationDrivenIdleWatchdog means immediate idle continuation remains process-specific, ticket-aware, and owned by the assigned process blueprint rather than by a generic legacy watchdog path.
- ExpectationStartEvent means process start should surface one initial canonical event that shows both the selected expectation and the full step outline.
- ProcessDecisionStep means one named step whose allowed outcomes are explicitly enumerated in the machine contract rather than improvised from transcript prose.
- ProcessStepBundleJson means one reusable machine-readable step bundle that may be imported into one or more process definitions.
- ProcessWaitStep means one named step whose purpose is to remain in a waiting state until an external event or user response arrives.
- ProcessDecisionNextOutcome means a decision option that advances to the immediately following step without naming a separate target id.
- ProcessDecisionBlockOutcome means a decision option that blocks the process instead of advancing.
- ProcessDecisionGotoOutcome means a decision option that jumps to a specific named step id.
- ProcessDecisionCompleteOutcome means a decision option that completes the process.
- ProgressiveProcessCatalogOrder means the process list should move from least-committal and most discussion-oriented choices toward more structured blueprint, process-definition, and implementation workflows, with Discuss first after the unassigned none state.
`);

ProcessBlueprints.contains(
  Artifact.catalog,
  Artifact.processBlueprint,
  Artifact.processStepBundle,
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
  .and(ProcessBlueprints.expects("ticket-owned continuation to come from the assigned process blueprint JSON"))
  .and(ProcessBlueprints.prefers("the next actionable ticket step as the short continuation target when ticket state exists"))
  .and(ProcessBlueprints.expects("legacy standalone watchdog prompts to be disabled once ticket-owned step continuation exists"));

when(Artifact.processBlueprint.exists())
  .then(ProcessBlueprints.expects(Artifact.catalogOrder))
  .and(ProcessBlueprints.treats("lower catalog-order numbers as earlier in the presented process sequence"));
