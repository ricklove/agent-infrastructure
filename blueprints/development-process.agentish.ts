/// <reference path="./_agentish.d.ts" />

// Development Process

const Agentish = define.language("Agentish");

const DevelopmentProcess = define.system("DevelopmentProcess", {
  format: Agentish,
  role: "Shared implementation workflow for blueprint-first source changes, verification, rollout, and post-deploy validation",
});

const Actor = {
  operator: define.actor("DevelopmentOperator"),
  providerAgent: define.actor("ProviderBackedAgent"),
};

const Artifact = {
  sourceRepo: define.workspace("SourceRepository"),
  runtimeCheckout: define.workspace("RuntimeCheckout"),
  temporaryState: define.workspace("TemporaryRuntimeState"),
  appData: define.workspace("DurableAppData"),
  blueprint: define.document("RelevantBlueprint"),
  blueprintState: define.document("RelevantBlueprintState"),
  screenshot: define.document("VerificationScreenshot"),
  ticketPlan: define.document("ImplementationTicketPlan"),
};

const Rule = {
  blueprintFirst: define.concept("BlueprintFirstChange"),
  blueprintCommitFirst: define.concept("BlueprintCommitBeforeImplementation"),
  blueprintStateRequired: define.concept("BlueprintStateTracksCurrentReality"),
  sourceOnly: define.concept("SourceOnlyEdits"),
  runtimeReadonly: define.concept("RuntimeReadonlyCheckout"),
  stateTemporaryOnly: define.concept("TemporaryStateOnly"),
  verifyLocally: define.concept("LocalVerification"),
  deployByCheckout: define.concept("DeployByRuntimeCheckout"),
  verifyVersions: define.concept("VersionMatchVerification"),
  verifyBehavior: define.concept("BehaviorVerification"),
  ticketPlanForActiveWork: define.concept("TicketSystemOwnsImplementationPlan"),
};

DevelopmentProcess.enforces(`
- Relevant blueprints must be reviewed and updated before implementation changes.
- Relevant blueprint-state documents must describe how current implementation compares to the ideal blueprint.
- Blueprint changes that alter architecture, workflow, or product requirements must be committed before dependent implementation work begins.
- Implementation must not continue past blueprint edits until those blueprint edits are committed.
- Active implementation plans should live in the ticket system rather than as durable repository design documents.
- Source is the only editing surface for intended behavior changes.
- Runtime is a deployed checkout and not an editing surface.
- state/ is only for temporary runtime state and recoverable operational artifacts.
- Durable app data must live outside state/.
- Provider-backed agents used for implementation must inherit this same workflow.
- UI-facing changes require real browser verification, screenshots, and deployed frontend-backend version matching.
- Responsive UI changes must be verified at small, medium, and wide viewport sizes.
- A rollout is not complete until post-deploy behavior has been verified on the live system.
`);

DevelopmentProcess.defines(`
- BlueprintFirstChange means architecture and policy are corrected in blueprints before code is changed.
- BlueprintCommitBeforeImplementation means blueprint edits are turned into a committed source revision before dependent implementation work starts.
- BlueprintStateTracksCurrentReality means blueprint-state records current implementation status, confidence, evidence, gaps, and known issues relative to the ideal blueprint.
- TemporaryStateOnly means logs, pids, sockets, caches, and controller metadata may live under state/, but durable user or app content may not.
- DeployByRuntimeCheckout means runtime is updated by checking out a committed source revision rather than editing deployed files directly.
- VersionMatchVerification means the served frontend version and running backend version must match exactly after rollout.
- TicketSystemOwnsImplementationPlan means active work sequencing, task breakdown, and unfinished implementation routing belong in tickets rather than in long-lived blueprint companion files.
`);

DevelopmentProcess.contains(
  Artifact.sourceRepo,
  Artifact.runtimeCheckout,
  Artifact.temporaryState,
  Artifact.appData,
  Artifact.blueprint,
  Artifact.blueprintState,
  Artifact.screenshot,
  Artifact.ticketPlan,
  Rule.blueprintFirst,
  Rule.blueprintCommitFirst,
  Rule.blueprintStateRequired,
  Rule.sourceOnly,
  Rule.runtimeReadonly,
  Rule.stateTemporaryOnly,
  Rule.verifyLocally,
  Rule.deployByCheckout,
  Rule.verifyVersions,
  Rule.verifyBehavior,
  Rule.ticketPlanForActiveWork,
);

when(Actor.operator.implements("a feature or fix"))
  .then(DevelopmentProcess.requires(Rule.blueprintFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintCommitFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintStateRequired))
  .and(DevelopmentProcess.requires(Rule.sourceOnly))
  .and(DevelopmentProcess.requires(Rule.verifyLocally))
  .and(DevelopmentProcess.requires(Rule.deployByCheckout))
  .and(DevelopmentProcess.requires(Rule.verifyBehavior))
  .and(DevelopmentProcess.requires(Rule.ticketPlanForActiveWork));

when(Actor.providerAgent.implements("a feature or fix inside agent-chat"))
  .then(DevelopmentProcess.requires(Rule.blueprintFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintCommitFirst))
  .and(DevelopmentProcess.requires(Rule.blueprintStateRequired))
  .and(DevelopmentProcess.requires("the same relevant blueprints the operator would check"))
  .and(DevelopmentProcess.requires("the same rollout and verification rules the operator would follow"))
  .and(DevelopmentProcess.requires("the same blueprint-state updates the operator would make"))
  .and(DevelopmentProcess.requires("the same ticket-plan discipline the operator would follow"));

when(Artifact.blueprint.exists())
  .then(DevelopmentProcess.expects(Artifact.blueprintState))
  .and(DevelopmentProcess.treats("blueprint as ideal and blueprint-state as current comparison"));

when(Actor.operator.starts("substantial unfinished implementation work"))
  .then(DevelopmentProcess.prefers(Artifact.ticketPlan))
  .and(DevelopmentProcess.keeps("implementation sequencing and active work tracking in the ticket system"));

when(Artifact.temporaryState.contains("durable app content"))
  .then(DevelopmentProcess.violates(Rule.stateTemporaryOnly));

when(Artifact.runtimeCheckout.receives("manual code edits"))
  .then(DevelopmentProcess.violates(Rule.runtimeReadonly));
