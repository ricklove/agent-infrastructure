/// <reference path="../_agentish.d.ts" />

// Stack Admin

const Agentish = define.language("Agentish");

const StackAdmin = define.system("StackAdmin", {
  format: Agentish,
  role: "Admin-host infrastructure administration subject for cross-stack operations, plugin composition, and dormant wake-on-access behavior",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const Host = {
  admin: define.system("AdminHost"),
  manager: define.system("ManagerHost"),
  stack: define.system("ManagedStack"),
};

const Dashboard = {
  shell: define.system("DashboardShell"),
  plugin: define.entity("DashboardFeaturePlugin"),
  registry: define.entity("DashboardPluginRegistry"),
  session: define.entity("DashboardSession"),
  accessAttempt: define.event("DashboardAccessAttempt"),
};

const Plugin = {
  stackAdmin: define.entity("StackAdminPlugin"),
  chat: define.entity("AgentChatPlugin"),
  terminal: define.entity("DashboardTerminalPlugin"),
  projects: define.entity("ProjectsPlugin"),
  swarmTelemetry: define.entity("TemporarySwarmTelemetryPlugin"),
};

const Runtime = {
  runtimeTarget: define.document("RuntimeTarget"),
  bootstrapContext: define.document("BootstrapContext"),
  resolvedRuntimeState: define.document("ResolvedRuntimeState"),
  setupAdmin: define.action("SetupAdmin"),
  materialization: define.action("RuntimeMaterialization"),
};

const StackScope = {
  manager: define.entity("StackLocalManager"),
  authLambda: define.entity("StackLocalAuthLambda"),
  recoveryLambda: define.entity("StackLocalRecoveryLambda"),
};

const Policy = {
  adminOnlyCrossStackAuthority: define.concept("AdminOnlyCrossStackAuthority"),
  isolatedAdminStack: define.concept("IsolatedAdminStack"),
  pluginComposedAdminShell: define.concept("PluginComposedAdminShell"),
  sharedGatewayAuth: define.concept("SharedGatewayAuth"),
  reconciliationBeforeSessionIssue: define.concept("ReconciliationBeforeSessionIssue"),
  dormantAutoStop: define.concept("DormantAutoStop"),
  wakeOnAccessAttempt: define.concept("WakeOnAccessAttempt"),
  temporaryTelemetryReuse: define.concept("TemporaryTelemetryReuse"),
  stackLocalOwnershipPreserved: define.concept("StackLocalOwnershipPreserved"),
};

SubjectBlueprint.contains(
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

StackAdmin.contains(
  Host.admin,
  Host.manager,
  Host.stack,
  Dashboard.shell,
  Dashboard.plugin,
  Dashboard.registry,
  Dashboard.session,
  Dashboard.accessAttempt,
  Plugin.stackAdmin,
  Plugin.chat,
  Plugin.terminal,
  Plugin.projects,
  Plugin.swarmTelemetry,
  Runtime.runtimeTarget,
  Runtime.bootstrapContext,
  Runtime.resolvedRuntimeState,
  Runtime.setupAdmin,
  Runtime.materialization,
  StackScope.manager,
  StackScope.authLambda,
  StackScope.recoveryLambda,
  Policy.adminOnlyCrossStackAuthority,
  Policy.isolatedAdminStack,
  Policy.pluginComposedAdminShell,
  Policy.sharedGatewayAuth,
  Policy.reconciliationBeforeSessionIssue,
  Policy.dormantAutoStop,
  Policy.wakeOnAccessAttempt,
  Policy.temporaryTelemetryReuse,
  Policy.stackLocalOwnershipPreserved,
);

StackAdmin.enforces(`
- stack-admin exists as the single cross-stack administration host and plugin surface.
- The admin host follows the shared host-runtime-target contract through ~/runtime-target.json and bun run setup:admin.
- The admin host is isolated and does not own a worker fleet in its own stack.
- Cross-stack infrastructure administration belongs only to the admin host, not to per-stack managers or per-stack auth or recovery Lambdas.
- The admin dashboard shell is plugin-composed rather than a special-case shell surface.
- The admin plugin registry includes agent-chat, dashboard-terminal, projects, and stack-admin.
- agent-swarm-ui may appear on the admin host only as temporary telemetry reuse and must not redefine the admin host as a swarm manager.
- Browser auth, gateway session validation, and dashboard transport remain shared dashboard concerns rather than admin-specific auth inventions.
- A dormant admin host may auto-stop, but no dashboard session may be issued until runtime reconciliation succeeds after wake.
- Per-stack managers and their auth or recovery Lambdas remain isolated to their source stacks.
`);

StackAdmin.defines(`
- AdminOnlyCrossStackAuthority means cross-stack deploy, diff, destroy, and related infrastructure actions originate only from the admin host.
- IsolatedAdminStack means the admin stack contains one admin host and shared dashboard services but no owned worker fleet.
- PluginComposedAdminShell means the admin dashboard uses the same first-party plugin model as the rest of the dashboard system instead of a bespoke shell-owned surface.
- SharedGatewayAuth means admin browser session auth reuses the shared dashboard gateway auth and bootstrap flow.
- ReconciliationBeforeSessionIssue means wake or cold start must finish runtime-target loading, runtime materialization, setup:admin, and resolved-state writing before a session is issued.
- DormantAutoStop means the admin host may stop itself after an idle window rather than staying always on.
- WakeOnAccessAttempt means an auth-Lambda dashboard access attempt is the wake boundary for a dormant admin host.
- TemporaryTelemetryReuse means the swarm telemetry plugin may be reused on admin only as an interim telemetry display and not as a durable ownership signal.
- StackLocalOwnershipPreserved means each managed stack retains its own manager, auth Lambda, and recovery Lambda as stack-local control surfaces.
`);

// Concept
StackAdmin.means(`
- one isolated admin-host subject for cross-stack infrastructure administration
- one plugin-composed admin dashboard shell
- one admin-role runtime-target setup boundary through bun run setup:admin
- one strict separation between admin-host authority and stack-local manager authority
`);

Host.admin.contains(
  Runtime.runtimeTarget,
  Runtime.bootstrapContext,
  Runtime.resolvedRuntimeState,
  Dashboard.shell,
);

Host.stack.contains(
  StackScope.manager,
  StackScope.authLambda,
  StackScope.recoveryLambda,
);

// Scenarios
when(Dashboard.registry.includes(Plugin.swarmTelemetry))
  .then(StackAdmin.requires(Policy.temporaryTelemetryReuse))
  .and(Plugin.swarmTelemetry.avoids("claiming worker-fleet ownership for the admin stack"));

when(Dashboard.accessAttempt.targets(Host.admin))
  .then(StackAdmin.requires(Policy.wakeOnAccessAttempt))
  .and(Host.admin.may("start from a dormant stopped state"))
  .and(Runtime.runtimeTarget.loads("before runtime materialization"))
  .and(Runtime.materialization.uses(Runtime.runtimeTarget))
  .and(Runtime.setupAdmin.uses(Runtime.runtimeTarget))
  .and(Runtime.resolvedRuntimeState.records("the latest reconciliation result"))
  .and(StackAdmin.requires(Policy.reconciliationBeforeSessionIssue))
  .and(Dashboard.shell.loads(Dashboard.registry))
  .and(Dashboard.registry.includes(
    Plugin.chat,
    Plugin.terminal,
    Plugin.projects,
    Plugin.stackAdmin,
  ))
  .and(Dashboard.session.issuesOnlyAfter("successful reconciliation"));

when(Runtime.materialization.fails().or(Runtime.setupAdmin.fails()))
  .then(Host.admin.surfaces("an explicit blocked admin entry"))
  .and(Dashboard.session.forbids("issuing a partially trusted admin shell"));

when(Dashboard.session.exists("for the admin host"))
  .then(Plugin.stackAdmin.may("perform cross-stack administration"))
  .and(StackAdmin.requires(Policy.adminOnlyCrossStackAuthority))
  .and(StackAdmin.requires(Policy.stackLocalOwnershipPreserved))
  .and(Plugin.stackAdmin.owns("the cross-stack operation surface after session issuance"))
  .and(Host.stack.preserves(StackScope.manager, StackScope.authLambda, StackScope.recoveryLambda));

when(Host.admin.attempts("to absorb stack-local manager, auth Lambda, or recovery Lambda ownership"))
  .then(StackAdmin.encounters("an isolation failure"))
  .and(StackAdmin.rejects("the ownership transfer"));

// ImplementationPlan
StackAdmin.prescribes(`
- Keep stack-admin as a dedicated subject rather than smearing admin-host behavior into manager or projects.
- Reuse the shared host-runtime-target contract for the admin host while specializing the admin implementation behind bun run setup:admin.
- Keep the admin dashboard shell plugin-composed with shared utility plugins plus the privileged stack-admin plugin.
- Keep per-stack managers and their auth or recovery Lambdas owned by their source stacks even when the admin host can operate across them.
- Make runtime reconciliation a gate before dashboard session issuance after wake or cold start.
- Keep shared dashboard session issuance as a gateway/runtime concern rather than a stack-admin plugin concern.
- Allow the admin host to auto-stop when dormant rather than keeping an always-on worker or fleet loop.
- Treat agent-swarm-ui on admin as temporary telemetry reuse only.
- The ideal file hierarchy is:
  - blueprints/stack-admin/stack-admin.agentish.ts
  - blueprints/system-runtime/host-runtime-target.agentish.ts
  - ~/runtime-target.json
  - a bootstrap-context record
  - a resolved-runtime-state record
  - a shared dashboard registry
  - a new first-party stack-admin server package
  - a new first-party stack-admin UI package
`);

// Contracts
Runtime.runtimeTarget.contains(`
- schemaVersion: required integer
- role: required string and must equal admin
- runtimeSource: required object
- runtimeSource.repoUrl: required string
- runtimeSource.refKind: required string with values branch | tag
- runtimeSource.ref: required string
`);

Runtime.bootstrapContext.contains(`
- bootstrap-only provisioning and infrastructure facts
- no desired admin role override
- no desired runtime source override
- no desired ref override
`);

Runtime.resolvedRuntimeState.contains(`
- observedAt: required timestamp string
- materializationTransport: required string
- requestedRole: required string and must equal admin
- requestedRefKind: required string with values branch | tag
- requestedRef: required string
- materializedRevision: required string
- contentsDigest?: optional string
- setupStatus: required string with values succeeded | failed | mismatched
- setupExitCode?: optional integer
- setupObservedAt: required timestamp string
- mismatchSummary?: optional string
`);

Dashboard.registry.contains(Plugin.chat, Plugin.terminal, Plugin.projects, Plugin.stackAdmin);

Runtime.setupAdmin.means(`
- executes bun run setup:admin
- is idempotent
- runs only against materialized runtime contents
`);

Dashboard.accessAttempt.means(`
- the auth-Lambda-triggered request boundary that may wake a dormant admin host
- does not authorize session issue before runtime reconciliation succeeds
`);

Dashboard.session.means(`
- may be issued only after successful admin runtime reconciliation
- is explicitly blocked when runtime-target load, materialization, setup:admin, or resolved-state write has not succeeded
- remains a shared dashboard gateway/runtime contract rather than a stack-admin plugin contract
`);

when(Dashboard.registry.includes(Plugin.swarmTelemetry))
  .then(StackAdmin.requires(Policy.temporaryTelemetryReuse))
  .and(Dashboard.registry.treats(Plugin.swarmTelemetry).as("a temporary telemetry exception rather than a stable registry member"));

when(Host.stack.crosses("a stack-local control boundary"))
  .then(Host.stack.expects(StackScope.manager))
  .and(Host.stack.expects(StackScope.authLambda))
  .and(Host.stack.expects(StackScope.recoveryLambda))
  .and(Host.admin.forbids("taking ownership of those stack-local control surfaces"));

when(Host.admin.crosses("an admin control boundary"))
  .then(Host.admin.expects(Plugin.stackAdmin))
  .and(Host.admin.expects(Runtime.runtimeTarget))
  .and(Host.admin.expects(Runtime.resolvedRuntimeState));
