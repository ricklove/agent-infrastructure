/// <reference path="../_agentish.d.ts" />

// CDK Admin

const Agentish = define.language("Agentish", {
  purpose: "Ideal infrastructure contract definition",
});

const CdkAdmin = define.system("CdkAdmin", {
  format: Agentish,
  role: "Ideal external contract between AWS provisioning and the isolated admin host",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const CDK = define.system("AwsSetupCdk", {
  role: "Provisioner of admin infrastructure",
});

const AdminRepo = define.system("AdminRepo", {
  role: "Repo-owned admin runtime and setup surface",
});

const AdminHost = define.system("AdminHost", {
  role: "Provisioned EC2 host for the admin runtime",
});

const ManagedStack = define.system("ManagedStack", {
  role: "A stack that retains its own local manager, auth Lambda, and recovery Lambda",
});

const Access = define.system("DashboardAccessAuth", {
  role: "External caller that requests an admin dashboard access URL",
});

const Contract = {
  setupEntrypoint: define.entity("SetupEntrypoint"),
  bootstrapContext: define.entity("BootstrapContext"),
  runtimeTarget: define.entity("RuntimeTargetContract"),
  adminDiscovery: define.entity("AdminDiscoveryContract"),
  managedStackDiscovery: define.entity("ManagedStackDiscoveryContract"),
  dashboardIssuer: define.entity("DashboardSessionIssuerContract"),
  dashboardAccessUrl: define.entity("DashboardAccessUrl"),
  deployAuthority: define.entity("CrossStackDeployAuthority"),
  ssmRepairAuthority: define.entity("CrossStackSsmRepairAuthority"),
  runtimeFetchedSecrets: define.entity("RuntimeFetchedSecretsContract"),
};

const Path = {
  runtimeTarget: define.entity("RuntimeTargetPath"),
  bootstrapContext: define.entity("BootstrapContextPath"),
  setupScriptPath: define.entity("SetupScriptPath"),
};

const Policy = {
  adminOnlyCrossStackAuthority: define.concept("AdminOnlyCrossStackAuthority"),
  approvedScopeOnly: define.concept("ApprovedScopeOnly"),
  wakeBeforeSession: define.concept("WakeBeforeSession"),
  runtimeFetchPreferred: define.concept("RuntimeFetchPreferred"),
  stackLocalOwnershipPreserved: define.concept("StackLocalOwnershipPreserved"),
};

const StackScope = {
  manager: define.entity("StackLocalManager"),
  authLambda: define.entity("StackLocalAuthLambda"),
  recoveryLambda: define.entity("StackLocalRecoveryLambda"),
};

const Service = {
  dashboard: define.entity("AdminDashboardService"),
};

const NonContract = {
  wrapperScripts: define.entity("GeneratedWrapperScripts"),
  packageLayout: define.entity("InternalPackageLayout"),
  serviceUnits: define.entity("ServiceUnitImplementation"),
  helperScripts: define.entity("HelperScriptImplementation"),
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

CdkAdmin.contains(
  CDK,
  AdminRepo,
  AdminHost,
  ManagedStack,
  Access,
  Contract.setupEntrypoint,
  Contract.bootstrapContext,
  Contract.runtimeTarget,
  Contract.adminDiscovery,
  Contract.managedStackDiscovery,
  Contract.dashboardIssuer,
  Contract.dashboardAccessUrl,
  Contract.deployAuthority,
  Contract.ssmRepairAuthority,
  Contract.runtimeFetchedSecrets,
  Path.runtimeTarget,
  Path.bootstrapContext,
  Path.setupScriptPath,
  Policy.adminOnlyCrossStackAuthority,
  Policy.approvedScopeOnly,
  Policy.wakeBeforeSession,
  Policy.runtimeFetchPreferred,
  Policy.stackLocalOwnershipPreserved,
  StackScope.manager,
  StackScope.authLambda,
  StackScope.recoveryLambda,
  Service.dashboard,
  NonContract.wrapperScripts,
  NonContract.packageLayout,
  NonContract.serviceUnits,
  NonContract.helperScripts,
);

CdkAdmin.enforces(`
- The blueprint describes the ideal external provisioning contract for the admin host, not the current implementation.
- CDK depends on one repo-owned setup entrypoint plus the shared host-runtime-target contract.
- The admin host is the only cross-stack origin for approved deploy and repair actions.
- Cross-stack authority must be explicitly scoped to approved managed stacks rather than implied by ambient account reach.
- The admin host may wake from a dormant stopped state on a dashboard access attempt, but no dashboard session may be issued before runtime reconciliation succeeds.
- Sensitive configuration and credentials should prefer runtime AWS fetch paths over indiscriminate bootstrap or user-data copies.
- Every managed stack preserves its own manager, auth Lambda, and recovery Lambda as stack-local control surfaces.
- Internal files, packages, wrappers, and service wiring are not part of the external contract.
`);

CdkAdmin.defines(`
- The admin host clones the repo into a runtime root, reads ~/runtime-target.json, and converges through bun run setup:admin.
- CDK writes bootstrap context before setup runs, but bootstrap context does not redefine the desired role or desired code revision.
- Admin discovery lets the auth path find the admin host without hard-coded instance ids.
- Managed stack discovery lets the admin host enumerate only approved stack targets for deploy and repair work.
- CrossStackDeployAuthority means the admin host can synth, diff, deploy, and destroy approved stacks.
- CrossStackSsmRepairAuthority means the admin host can use SSM to inspect and repair approved manager-stack machines.
- RuntimeFetchedSecretsContract means deploy-time and runtime-sensitive values should be fetched from AWS services at runtime when possible rather than copied into user data.
- StackLocalOwnershipPreserved means managed stacks retain their own local manager, auth Lambda, and recovery Lambda even when the admin host can act across them.
`);

Path.runtimeTarget.means("~/runtime-target.json");
Path.bootstrapContext.means("/home/ec2-user/state/bootstrap-context.json");
Path.setupScriptPath.means("/home/ec2-user/runtime/scripts/setup.sh");

Contract.setupEntrypoint.means(`
- a repo-owned executable entrypoint
- idempotent host provisioning
- accepts runtime root, state root, workspace root, and bootstrap context path
`);

Contract.runtimeTarget.means(`
- the admin host follows the shared host-runtime-target contract
- the requested role is admin
- the requested repo source and branch or tag live in ~/runtime-target.json rather than in bootstrap context
`);

Contract.bootstrapContext.means(`
- a host-local provisioning record written by CDK
- contains infrastructure and integration facts needed by setup:admin
- does not override the desired role, repo source, or desired ref
`);

Contract.adminDiscovery.means(`
- the auth path can find the admin host by infrastructure tags or equivalent stable discovery metadata
- auth does not require a hard-coded instance id
`);

Contract.managedStackDiscovery.means(`
- the admin host can discover approved stacks and their manager machines by approved tags, naming rules, registry records, or assumed-role inventory
- discovery must return only stacks inside the admin host's approved authority scope
`);

Contract.deployAuthority.means(`
- the admin host can perform synth, diff, deploy, and destroy against approved stacks
- authority may be direct on the admin host role or may be exercised by assuming narrower per-stack roles
- the contract prefers scoped authority over a single unbounded ambient admin role
`);

Contract.ssmRepairAuthority.means(`
- the admin host can start sessions, send commands, and inspect command results for approved manager-stack machines
- the contract may include EC2 describe and stop or start support when required for repair flows
- the contract does not transfer normal stack-local ownership from the managed stack to the admin host
`);

Contract.runtimeFetchedSecrets.means(`
- runtime-sensitive values should be fetched from AWS services such as Secrets Manager, SSM Parameter Store, or STS at runtime
- bootstrap or user-data copies of sensitive values are discouraged except for temporary compatibility
`);

Contract.dashboardIssuer.means(`
- one repo-owned callable interface on the admin host
- returns a dashboard access URL
- issues a session only after the admin host has reconciled successfully after wake or cold start
- does not require callers to know internal package paths or helper implementation details
`);

Contract.dashboardAccessUrl.means(`
- a public URL for the admin dashboard
- includes whatever one-time session material is required for browser bootstrap
- must not be issued while admin runtime reconciliation is incomplete or failed
`);

// Concept
CdkAdmin.means(`
- one provisioning-side contract for the isolated admin host
- one explicit authority boundary for cross-stack deploy and repair work
- one strict separation between admin-host authority and stack-local manager ownership
- one wake, reconcile, then issue-session flow for dormant admin access
`);

ManagedStack.contains(
  StackScope.manager,
  StackScope.authLambda,
  StackScope.recoveryLambda,
);

// Scenarios
when(CDK.provisions(AdminHost))
  .then(CDK.clones(AdminRepo).to("the runtime root"))
  .and(CDK.writes(Contract.bootstrapContext).to(Path.bootstrapContext))
  .and(CDK.dependsOn(Contract.runtimeTarget))
  .and(CDK.executes(Contract.setupEntrypoint).through(Path.setupScriptPath))
  .and(AdminHost.exposes(Service.dashboard));

when(Access.needs(Contract.dashboardAccessUrl))
  .then(Access.finds(AdminHost).through(Contract.adminDiscovery))
  .and(AdminHost.may("start from a dormant stopped state"))
  .and(CdkAdmin.requires(Policy.wakeBeforeSession))
  .and(Access.calls(Contract.dashboardIssuer))
  .and(Access.receives(Contract.dashboardAccessUrl));

when(AdminHost.starts("after a dashboard access attempt"))
  .then(AdminHost.loads(Contract.runtimeTarget))
  .and(AdminHost.executes("bun run setup:admin"))
  .and(AdminHost.fetches(Contract.runtimeFetchedSecrets))
  .and(AdminHost.issues(Contract.dashboardAccessUrl).onlyAfter("successful reconciliation"));

when(AdminHost.operatesOn(ManagedStack))
  .then(CdkAdmin.requires(Policy.adminOnlyCrossStackAuthority))
  .and(CdkAdmin.requires(Policy.approvedScopeOnly))
  .and(AdminHost.discovers(ManagedStack).through(Contract.managedStackDiscovery))
  .and(AdminHost.mayUse(Contract.deployAuthority))
  .and(AdminHost.mayUse(Contract.ssmRepairAuthority))
  .and(ManagedStack.preserves(StackScope.manager, StackScope.authLambda, StackScope.recoveryLambda));

when(AdminHost.uses(Contract.ssmRepairAuthority))
  .then(AdminHost.targets("approved manager-stack machines only"))
  .and(CdkAdmin.requires(Policy.stackLocalOwnershipPreserved));

when(CDK.or(AdminHost).copies("sensitive values broadly through bootstrap or user data"))
  .then(CdkAdmin.encounters("avoidable credential sprawl"))
  .and(CdkAdmin.prefers(Contract.runtimeFetchedSecrets));

// ImplementationPlan
CdkAdmin.prescribes(`
- Keep cdk-admin as a dedicated subject rather than stretching cdk-manager-interface to cover admin semantics.
- Reuse the shared host-runtime-target contract for the admin host while specializing provisioning and IAM in cdk-admin.
- Keep the admin auth path coupled to admin-host discovery, wake, and reconciliation outcomes rather than to internal package paths.
- Keep cross-stack deploy and SSM repair authority scoped to approved stacks and approved manager-stack machines.
- Keep runtime-fetched secret and token retrieval preferred over bootstrap copies.
- Keep stack-local manager, auth Lambda, and recovery Lambda ownership with each managed stack.
- The ideal file hierarchy is:
  - blueprints/cdk-admin/cdk-admin.agentish.ts
  - blueprints/stack-admin/stack-admin.agentish.ts
  - blueprints/system-runtime/host-runtime-target.agentish.ts
  - blueprints/cdk-manager-interface.agentish.ts
  - ~/runtime-target.json
  - /home/ec2-user/state/bootstrap-context.json
  - /home/ec2-user/runtime/scripts/setup.sh
  - a repo-owned admin setup module behind bun run setup:admin
  - CDK code that provisions the admin EC2, IAM role, and dashboard access or wake path
  - admin runtime code that performs stack discovery, deploy actions, and SSM repair actions within approved scope
`);

// Contracts
Contract.bootstrapContext.contains(`
- region: required string
- adminInstanceType: required string
- adminSubnetIds: required string list
- adminSecurityGroupIds: required string list
- dashboardAccessApiBaseUrl: required string
- dashboardEnrollmentSecret: required string or deterministic AWS reference
- managedStackDiscoveryScope: required object describing approved discovery boundaries
- deployAuthorityMode: required string with values direct | assume-role
- runtimeSecretSources?: optional list of AWS-backed runtime secret sources
`);

Contract.managedStackDiscovery.contains(`
- scopeKind: required string with values tags | registry | assume-role-inventory | naming
- selector: required object
- selector must describe only approved managed-stack boundaries
`);

Contract.deployAuthority.contains(`
- allowedActions: required list and includes synth, diff, deploy, destroy as approved by environment policy
- authorityMode: required string with values direct | assume-role
- assumeRoleArns?: optional list required when authorityMode is assume-role
`);

Contract.ssmRepairAuthority.contains(`
- allowedActions: required list and includes start-session, send-command, get-command-status
- targetKind: required string and must equal manager-stack-machine
- allowEc2LifecycleAssist?: optional boolean for stop, start, or reboot help during repair
`);
