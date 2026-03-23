/// <reference path="../_agentish.d.ts" />

// Dashboard Recovery

const Agentish = define.language("Agentish");

const DashboardRecovery = define.system("DashboardRecovery", {
  format: Agentish,
  role: "Recovery control path that restores dashboard reachability when a user is actively trying to connect",
});

const Access = {
  lambda: define.system("DashboardAccessLambda"),
  attempt: define.event("DashboardAccessAttempt"),
};

const Manager = {
  host: define.system("ManagerHost"),
  runtime: define.system("DashboardRuntime"),
  sessionIssue: define.entity("DashboardSessionIssue"),
  readinessFailure: define.event("DashboardReadinessFailure"),
  recovery: define.entity("DashboardRecoveryAttempt"),
  helpRequest: define.entity("DashboardHelpRequest"),
  tunnel: define.entity("CloudflaredTunnel"),
  gateway: define.entity("DashboardGatewayProcess"),
};

const Policy = {
  activeAttemptRequired: define.concept("ActiveAttemptRequired"),
  repairFirst: define.concept("RepairFirst"),
  oneCanonicalTunnel: define.concept("OneCanonicalTunnel"),
  escalateAfterFailedRepair: define.concept("EscalateAfterFailedRepair"),
};

DashboardRecovery.enforces(`
- Dashboard repair should be triggered by an active user connection attempt plus dashboard unreachability.
- The recovery path must not depend on the dashboard UI being reachable first.
- Automatic repair should happen before escalation.
- One canonical dashboard tunnel should exist after recovery, not a pile of stale tunnels.
- If automatic repair still fails, the system should create an explicit ask-help incident for agent follow-up.
`);

Policy.activeAttemptRequired.means(`
- do not restart the dashboard just because it is idle
- require an active access attempt, readiness failure, or repeated access failure signal
`);

Policy.repairFirst.means(`
- on dashboard session issuance success but public readiness failure, attempt repair automatically
- prune stale dashboard and tunnel processes
- restart the dashboard path and reissue a fresh session URL
`);

Policy.oneCanonicalTunnel.means(`
- dashboard recovery should converge to one live cloudflared process for the active dashboard port
- stale tunnel processes should be terminated during recovery
`);

Policy.escalateAfterFailedRepair.means(`
- if repair and re-readiness both fail, emit a durable help-request incident
- help escalation is a real recovery artifact, not just a transient log line
`);

when(Access.lambda.invokes(Manager.sessionIssue).andObserves(Access.attempt))
  .then(DashboardRecovery.requires(Policy.activeAttemptRequired))
  .and(DashboardRecovery.requires(Policy.repairFirst))
  .and(Manager.sessionIssue.detects(Manager.readinessFailure))
  .and(Manager.recovery.repairs(Manager.runtime))
  .and(Manager.recovery.reissues(Manager.sessionIssue));

when(Manager.recovery.repairs(Manager.runtime))
  .then(DashboardRecovery.requires(Policy.oneCanonicalTunnel))
  .and(Manager.recovery.terminates(Manager.tunnel))
  .and(Manager.recovery.restarts(Manager.gateway));

when(Manager.recovery.fails())
  .then(DashboardRecovery.requires(Policy.escalateAfterFailedRepair))
  .and(Manager.helpRequest.records("a durable incident"))
  .and(Manager.helpRequest.requests("agent help"));
