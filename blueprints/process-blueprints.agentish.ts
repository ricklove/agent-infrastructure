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
  processTemplate: define.document("ProcessTemplateJson"),
  processStepBundle: define.document("ProcessStepBundleJson"),
  companionGuide: define.document("ProcessBlueprintGuide"),
  sessionAssignment: define.document("SessionProcessBlueprintAssignment"),
  catalogOrder: define.document("ProcessBlueprintCatalogOrder"),
  ticketProcessConfig: define.document("TicketOwnedProcessConfig"),
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
  templateAuthoringSource: define.concept("TemplateAuthoringSource"),
  ticketOwnedConfig: define.concept("TicketOwnedProcessConfigAuthority"),
  preConfirmationGate: define.concept("ProcessConfigPreConfirmationGate"),
};

ProcessBlueprints.enforces(`
- Process blueprints live under blueprints/ as first-class blueprint artifacts.
- Shared workspace process blueprints and process-step bundles may also load from `/home/ec2-user/workspace/blueprints/` as a common overlay surface.
- Shared workspace process templates may also load from `/home/ec2-user/workspace/blueprints/` as a common overlay surface.
- A process blueprint must be machine-readable without requiring prose parsing.
- A process template must be machine-readable without requiring prose parsing.
- A process blueprint may optionally have an Agentish companion guide with the same basename.
- The JSON process blueprint is the primary system contract for discovery, assignment, and ticket-owned continuation behavior.
- Process templates are authoring inputs that must resolve into ordinary process blueprints before runtime execution begins.
- Process blueprint is legacy naming for what is conceptually an agent-process definition rather than a live process-state holder.
- The JSON process blueprint should carry an explicit catalog order so the process list is presented in a stable progressive sequence rather than inferred from title sorting.
- A session may select one process blueprint as its active expectation contract.
- Session selection should resolve into a ticket-pinned process snapshot before long-running runtime work depends on that process.
- When a selected process blueprint was instantiated from a template, the ticket must own the effective process config, override set, and confirmation state.
- Template-backed process execution must pass through a pre-confirmation gate before ordinary ticket steps begin.
- Only template variables explicitly declared overridable may be changed after process selection.
- Starting a process should emit one canonical expectation event that includes the expectation message and the full process outline for the newly focused ticket.
- Process steps may represent ordinary work, waiting states, or constrained decision points.
- Process steps may also contain nested substeps that remain hierarchical in the outline while executing depth-first like ordinary steps.
- Reusable process-step bundles may be imported into a process or nested step tree without duplicating the step definitions inline.
- Nested step process blueprints are the canonical structured workflows for repository-defined development, deploy, and blueprint-authoring processes.
- Repository-local flat duplicates of a structured workflow should not coexist with the nested canonical process once the nested process is the intended catalog entry.
- Every mutable process expectation should begin by naming the only allowed mutable surface for that process and by forbidding edits from the shared repository checkout.
- When shared workspace and repository-local process-step bundles share the same id, the shared workspace bundle should override before any process `use` expansion occurs.
- When shared workspace and repository-local process blueprints share the same id, the shared workspace blueprint should override the repository-local definition in the presented catalog.
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
- SharedWorkspaceBlueprintOverlay means shared workspace process blueprints and process-step bundles from `/home/ec2-user/workspace/blueprints/` may overlay repository-local process definitions.
- SessionScopedExpectation means the selected process blueprint belongs to the session rather than to the provider runtime globally.
- ExpectationDrivenIdleWatchdog means immediate idle continuation remains process-specific, ticket-aware, and owned by the assigned process blueprint rather than by a generic legacy watchdog path.
- ExpectationStartEvent means process start should surface one initial canonical event that shows both the selected expectation and the full step outline.
- ProcessDecisionStep means one named step whose allowed outcomes are explicitly enumerated in the machine contract rather than improvised from transcript prose.
- ProcessStepBundleJson means one reusable machine-readable step bundle that may be imported into one or more process definitions.
- ProcessTemplateJson means one reusable machine-readable template source that resolves into an ordinary process blueprint after bindings and validation.
- CanonicalNestedProcessBlueprint means one repository-defined process blueprint that keeps the user-visible structured workflow in a nested step tree rather than maintaining a parallel flat duplicate.
- ExplicitMutableSurfaceExpectation means a mutable process expectation opens by naming the one allowed editing surface and by forbidding edits from the shared repository checkout.
- TemplateAuthoringSource means templates are source artifacts for authoring reusable process shapes rather than a separate runtime process class.
- TicketOwnedProcessConfig means the ticket record owns the confirmed effective config, accepted override set, and confirmation state for template-backed processes.
- ProcessConfigPreConfirmationGate means a template-backed process may not begin ordinary ticket-step execution until its ticket-owned effective config has been confirmed or corrected and revalidated.
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
  Artifact.processTemplate,
  Artifact.processStepBundle,
  Artifact.companionGuide,
  Artifact.sessionAssignment,
  Artifact.catalogOrder,
  Artifact.ticketProcessConfig,
  Policy.jsonPrimary,
  Policy.optionalGuide,
  Policy.sharedCatalog,
  Policy.sessionScoped,
  Policy.expectationDrivenIdleWatchdog,
  Policy.progressiveCatalogOrder,
  Policy.templateAuthoringSource,
  Policy.ticketOwnedConfig,
  Policy.preConfirmationGate,
);

when(Artifact.catalog.contains(Artifact.processBlueprint))
  .then(ProcessBlueprints.requires(Policy.jsonPrimary))
  .and(ProcessBlueprints.requires(Policy.sharedCatalog))
  .and(ProcessBlueprints.requires(Policy.progressiveCatalogOrder));

when(Artifact.catalog.contains(Artifact.processTemplate))
  .then(ProcessBlueprints.requires(Policy.templateAuthoringSource))
  .and(ProcessBlueprints.expects("templates to resolve into ordinary process blueprints before catalog-driven execution"));

when(Artifact.processBlueprint.pairsWith("an optional companion guide"))
  .then(ProcessBlueprints.requires(Policy.optionalGuide))
  .and(ProcessBlueprints.treats("same-basename pairing as the default discovery rule"));

when(Actor.operator.assigns(Artifact.processBlueprint).to(Artifact.sessionAssignment))
  .then(ProcessBlueprints.requires(Policy.sessionScoped))
  .and(ProcessBlueprints.expects("the assigned process blueprint id to be durable session metadata"))
  .and(ProcessBlueprints.prefers("ticket runtime state to pin an immutable snapshot of the selected process definition"))
  .and(ProcessBlueprints.expects("template-backed process config to become ticket-owned runtime state before execution begins"));

when(Artifact.processTemplate.exists())
  .then(ProcessBlueprints.requires(Policy.ticketOwnedConfig))
  .and(ProcessBlueprints.requires(Policy.preConfirmationGate))
  .and(ProcessBlueprints.expects("runtime execution to read the ticket-owned effective config rather than hidden loader-only defaults"));

when(Actor.system.observes("a session idle transition while expectation work remains unresolved"))
  .then(ProcessBlueprints.requires(Policy.expectationDrivenIdleWatchdog))
  .and(ProcessBlueprints.expects("ticket-owned continuation to come from the assigned process blueprint JSON"))
  .and(ProcessBlueprints.prefers("the next actionable ticket step as the short continuation target when ticket state exists"))
  .and(ProcessBlueprints.expects("legacy standalone watchdog prompts to be disabled once ticket-owned step continuation exists"));

when(Artifact.processBlueprint.exists())
  .then(ProcessBlueprints.expects(Artifact.catalogOrder))
  .and(ProcessBlueprints.treats("lower catalog-order numbers as earlier in the presented process sequence"));
