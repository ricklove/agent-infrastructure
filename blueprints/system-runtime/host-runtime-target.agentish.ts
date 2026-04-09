/// <reference path="../_agentish.d.ts" />

// Host Runtime Target

const Agentish = define.language("Agentish");

const HostRuntimeTarget = define.system("HostRuntimeTarget", {
  format: Agentish,
  role: "Shared host runtime reconciliation contract for manager, worker, admin, and future host roles",
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
  machine: define.system("ManagedHost"),
};

const Role = {
  manager: define.entity("ManagerRole"),
  worker: define.entity("WorkerRole"),
  admin: define.entity("AdminRole"),
  future: define.entity("FutureHostRole"),
};

const Artifact = {
  runtimeTarget: define.document("RuntimeTarget"),
  bootstrapContext: define.document("BootstrapContext"),
  resolvedRuntimeState: define.document("ResolvedRuntimeState"),
  materializedRuntime: define.document("MaterializedRuntime"),
  mismatchRecord: define.document("RuntimeMismatchRecord"),
};

const Action = {
  loadRuntimeTarget: define.action("LoadRuntimeTarget"),
  materializeRuntime: define.action("MaterializeRuntime"),
  runRoleSetup: define.action("RunRoleSetup"),
  writeResolvedRuntimeState: define.action("WriteResolvedRuntimeState"),
};

const Policy = {
  desiredTargetAuthority: define.concept("DesiredTargetAuthority"),
  bootstrapSeparation: define.concept("BootstrapSeparation"),
  resolvedStatePreserved: define.concept("ResolvedStatePreserved"),
  canonicalRoleSetupPattern: define.concept("CanonicalRoleSetupPattern"),
  idempotentRoleSetup: define.concept("IdempotentRoleSetup"),
  transportAgnosticMaterialization: define.concept("TransportAgnosticMaterialization"),
  openRoleSet: define.concept("OpenRoleSet"),
};

const Path = {
  runtimeTarget: define.entity("RuntimeTargetPath"),
  bootstrapContext: define.entity("BootstrapContextPath"),
  resolvedRuntimeState: define.entity("ResolvedRuntimeStatePath"),
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

HostRuntimeTarget.contains(
  Host.machine,
  Role.manager,
  Role.worker,
  Role.admin,
  Role.future,
  Artifact.runtimeTarget,
  Artifact.bootstrapContext,
  Artifact.resolvedRuntimeState,
  Artifact.materializedRuntime,
  Artifact.mismatchRecord,
  Action.loadRuntimeTarget,
  Action.materializeRuntime,
  Action.runRoleSetup,
  Action.writeResolvedRuntimeState,
  Policy.desiredTargetAuthority,
  Policy.bootstrapSeparation,
  Policy.resolvedStatePreserved,
  Policy.canonicalRoleSetupPattern,
  Policy.idempotentRoleSetup,
  Policy.transportAgnosticMaterialization,
  Policy.openRoleSet,
  Path.runtimeTarget,
  Path.bootstrapContext,
  Path.resolvedRuntimeState,
);

HostRuntimeTarget.enforces(`
- Every managed host reads one desired runtime target from ~/runtime-target.json.
- ~/runtime-target.json is the sole authority for what runtime role and requested revision a managed host should converge to.
- Bootstrap and infrastructure facts remain separate from desired runtime target state.
- Resolved current runtime state remains separate from desired runtime target state.
- Every managed host converges by materializing runtime contents and then running bun run setup:<role>.
- bun run setup:<role> is the canonical convergence pattern for manager, worker, admin, and future host roles.
- Role setup must be idempotent and safe to rerun on first boot, later boot, reconnect, or explicit reconciliation.
- Materialization transport may differ by host role, but transport choice must not change the desired-target schema, the resolved-state schema, or the role setup boundary.
- Failure and mismatch state must be recorded explicitly rather than inferred by comparing ad hoc host artifacts later.
`);

HostRuntimeTarget.defines(`
- DesiredTargetAuthority means ~/runtime-target.json is the only host-local record that defines desired runtime role and requested revision.
- BootstrapSeparation means bootstrap context records provisioning and infrastructure facts without redefining desired runtime role, desired repo source, or desired revision.
- ResolvedStatePreserved means the host records what runtime was actually materialized and what the latest setup result was without overwriting the desired target.
- CanonicalRoleSetupPattern means managed hosts converge through bun run setup:<role> after runtime materialization completes.
- IdempotentRoleSetup means rerunning bun run setup:<role> re-applies intended host state without relying on first-boot assumptions.
- TransportAgnosticMaterialization means git checkout, release artifact materialization, and future acquisition paths are allowed when they all produce the same post-materialization setup boundary.
- OpenRoleSet means manager, worker, and admin are canonical current roles while future roles may be added without redefining the runtime-target contract.
`);

Path.runtimeTarget.means("~/runtime-target.json");
Path.bootstrapContext.means("~/state/bootstrap-context.json");
Path.resolvedRuntimeState.means("~/state/runtime-current.json");

Role.manager.means("the manager host role");
Role.worker.means("the worker host role");
Role.admin.means("the admin host role");
Role.future.means("a future host role admitted by the same runtime-target contract");

Artifact.runtimeTarget.means(`
- the desired-state document for one managed host
- contains one requested host role
- contains one requested runtime source
- contains one requested branch or tag target
- does not contain bootstrap-only infrastructure facts
`);

Artifact.bootstrapContext.means(`
- the host-local bootstrap document for provisioning and infrastructure facts
- written independently from the runtime target
- allowed to exist before runtime materialization or role setup begins
`);

Artifact.resolvedRuntimeState.means(`
- the host-local current-state record written by reconciliation
- records the actually materialized runtime result
- records the latest role setup result
- records mismatch or failure state without overwriting the desired target
`);

Artifact.materializedRuntime.means(`
- the runtime contents produced by one allowed materialization transport
- the direct input to bun run setup:<role>
`);

Artifact.mismatchRecord.means(`
- the explicit record that desired target and resolved current state do not agree
- preserved as part of resolved runtime state rather than hidden in unrelated logs
`);

// Concept
HostRuntimeTarget.means(`
- the host runtime reconciliation contract for managed hosts
- one shared desired-target authority for manager, worker, admin, and future roles
- one strict separation between desired target, bootstrap facts, and resolved current state
- one shared post-materialization role setup boundary
`);

Host.machine.contains(
  Artifact.runtimeTarget,
  Artifact.bootstrapContext,
  Artifact.resolvedRuntimeState,
);

// Scenarios
when(Host.machine.starts("first boot"))
  .then(Action.loadRuntimeTarget.reads(Path.runtimeTarget))
  .and(Action.materializeRuntime.uses(Artifact.runtimeTarget))
  .and(Action.runRoleSetup.uses(Artifact.materializedRuntime))
  .and(Action.writeResolvedRuntimeState.writes(Artifact.resolvedRuntimeState));

when(Host.machine.starts("rerun on an already provisioned host"))
  .then(Action.loadRuntimeTarget.reads(Path.runtimeTarget))
  .and(Action.materializeRuntime.uses(Artifact.runtimeTarget))
  .and(Action.runRoleSetup.uses(Artifact.materializedRuntime))
  .and(Action.writeResolvedRuntimeState.writes(Artifact.resolvedRuntimeState))
  .and(HostRuntimeTarget.requires(Policy.idempotentRoleSetup));

when(Action.loadRuntimeTarget.reads(Path.runtimeTarget))
  .then(HostRuntimeTarget.requires(Policy.desiredTargetAuthority))
  .and(Host.machine.surfaces("an explicit missing-file or schema failure when ~/runtime-target.json is absent or malformed"));

when(Action.materializeRuntime.uses(Artifact.runtimeTarget))
  .then(HostRuntimeTarget.requires(Policy.transportAgnosticMaterialization))
  .and(Action.materializeRuntime.produces(Artifact.materializedRuntime))
  .and(Host.machine.expects("materialized runtime contents before role setup runs"));

when(Action.runRoleSetup.uses(Artifact.materializedRuntime))
  .then(HostRuntimeTarget.requires(Policy.canonicalRoleSetupPattern))
  .and(Host.machine.expects("bun run setup:<role> to match the requested role in ~/runtime-target.json"));

when(Action.materializeRuntime.fails())
  .then(Host.machine.surfaces("an explicit materialization failure"))
  .and(Artifact.resolvedRuntimeState.records("the failed materialization result"))
  .and(Artifact.resolvedRuntimeState.preserves(Artifact.runtimeTarget));

when(Action.runRoleSetup.fails())
  .then(Host.machine.surfaces("an explicit role setup failure"))
  .and(Artifact.resolvedRuntimeState.records("the failed setup result"))
  .and(Artifact.resolvedRuntimeState.preserves(Artifact.runtimeTarget));

when(Artifact.runtimeTarget.disagreesWith(Artifact.resolvedRuntimeState))
  .then(Artifact.resolvedRuntimeState.records(Artifact.mismatchRecord))
  .and(Host.machine.surfaces("an explicit target-versus-current mismatch"))
  .and(Host.machine.forbids("collapsing desired and resolved state into one ambiguous record"));

// ImplementationPlan
HostRuntimeTarget.prescribes(`
- Keep ~/runtime-target.json as the operator-facing desired target for every managed host.
- Keep ~/state/bootstrap-context.json as the host-local bootstrap record for infrastructure and provisioning facts.
- Keep ~/state/runtime-current.json as the host-local resolved current-state record.
- Keep top-level scripts/ as the external host-entrypoint surface.
- Keep scripts/setup.sh as the outer bootstrap dispatcher rather than the owner of role-specific setup logic.
- Expose setup:manager and setup:worker as current grounded role aliases over shared role-setup code.
- Treat setup:admin as a future grounded role alias until a dedicated admin setup module exists.
- Keep runtime-target loading, materialization, and resolved-state writing in repo-owned reconciliation code behind the external scripts/ boundary.
- Keep role-specific setup handlers behind the shared bun run setup:<role> contract rather than as unrelated bootstrap systems.
- The ideal file hierarchy is:
  - ~/runtime-target.json
  - ~/state/bootstrap-context.json
  - ~/state/runtime-current.json
  - ~/runtime/scripts/setup.sh
  - package.json scripts for setup:manager and setup:worker
  - package.json script for setup:admin once an admin setup module exists
  - packages/swarm-manager/src/manager/setup-host.ts as the current shared bootstrap dispatcher target
  - packages/swarm-manager/src/host-runtime-target/load-runtime-target.ts
  - packages/swarm-manager/src/host-runtime-target/materialize-runtime.ts
  - packages/swarm-manager/src/host-runtime-target/write-runtime-current.ts
  - packages/swarm-manager/src/host-runtime-target/setup-manager.ts
  - packages/swarm-manager/src/host-runtime-target/setup-worker.ts
  - packages/swarm-manager/src/host-runtime-target/setup-admin.ts once the admin role is implemented
`);

// Contracts
Artifact.runtimeTarget.contains(`
- schemaVersion: required integer
- role: required string with canonical current values manager | worker | admin and allowance for future role strings
- runtimeSource: required object
- runtimeSource.repoUrl: required string
- runtimeSource.refKind: required string with values branch | tag
- runtimeSource.ref: required string
`);

Artifact.bootstrapContext.contains(`
- infrastructure facts required for provisioning, discovery, secrets wiring, or enrollment
- no desired runtime role field
- no desired repo source field
- no desired branch or tag field
`);

Artifact.resolvedRuntimeState.contains(`
- observedAt: required timestamp string
- materializationTransport: required string
- requestedRole: required string
- requestedRefKind: required string
- requestedRef: required string
- materializedRevision: required string
- contentsDigest: optional string
- setupStatus: required string with values succeeded | failed | mismatched
- setupExitCode: optional integer
- setupObservedAt: required timestamp string
- mismatchSummary: optional string
`);

Action.loadRuntimeTarget.means(`
- reads ~/runtime-target.json
- validates the runtime-target schema
- returns an explicit schema error when the desired target is malformed
`);

Action.materializeRuntime.means(`
- produces runtime contents for the requested runtime source
- may use git checkout, release artifact materialization, or another allowed transport
- must preserve the requested branch or tag semantics in the resolved current state
`);

Action.runRoleSetup.means(`
- executes bun run setup:<role> against materialized runtime contents
- is idempotent
- may rerun on every boot or reconnect
`);

Action.writeResolvedRuntimeState.means(`
- writes ~/state/runtime-current.json
- is the sole writer of the resolved current-state document
- records success, failure, or mismatch explicitly
`);

when(Artifact.bootstrapContext.crosses("a reconciliation boundary"))
  .then(Artifact.bootstrapContext.remains("bootstrap-only metadata"))
  .and(Artifact.bootstrapContext.excludes("desired runtime role"))
  .and(Artifact.bootstrapContext.excludes("desired runtime source"))
  .and(Artifact.bootstrapContext.excludes("desired branch or tag target"));

when(Artifact.runtimeTarget.crosses("a reconciliation boundary"))
  .then(Artifact.runtimeTarget.expects("one requested role"))
  .and(Artifact.runtimeTarget.expects("one requested runtime source"))
  .and(Artifact.runtimeTarget.expects("one requested branch or tag target"));

when(Artifact.resolvedRuntimeState.crosses("an inspection boundary"))
  .then(Artifact.resolvedRuntimeState.expects("the actually materialized revision"))
  .and(Artifact.resolvedRuntimeState.expects("the latest setup status"))
  .and(Artifact.resolvedRuntimeState.forbids("overwriting the desired target record"));
