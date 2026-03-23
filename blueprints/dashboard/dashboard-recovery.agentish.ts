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
  monitor: define.entity("DashboardRecoveryMonitor"),
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
  tunnelCooldown: define.concept("QuickTunnelReplacementCooldown"),
  classifyFailuresSeparately: define.concept("SeparateOriginAndTunnelFailures"),
  escalateAfterFailedRepair: define.concept("EscalateAfterFailedRepair"),
};

DashboardRecovery.enforces(`
- Dashboard repair should be triggered by an active user connection attempt plus dashboard unreachability.
- The recovery path must not depend on the dashboard UI being reachable first.
- Automatic repair should start immediately when the manager receives a real connection attempt.
- One canonical dashboard tunnel should exist after recovery, not a pile of stale tunnels.
- If automatic repair still fails, the system should create an explicit ask-help incident for agent follow-up.
`);

Policy.activeAttemptRequired.means(`
- do not restart the dashboard just because it is idle
- require an active access attempt, readiness failure, or repeated access failure signal
`);

Policy.repairFirst.means(`
- on dashboard session issuance success, start a background recovery monitor immediately
- let Lambda keep polling readiness while the manager-side monitor repairs in parallel
- keep the monitor alive through the initial connection window rather than exiting after one healthy check
- if the monitor observes a dead local origin during that window, attempt repair automatically
- prune stale dashboard and tunnel processes
- restart the dashboard path when the local origin is dead
- persist the newest public URL as the canonical runtime state
`);

Policy.oneCanonicalTunnel.means(`
- dashboard recovery should converge to one live cloudflared process for the active dashboard port
- stale tunnel processes should be terminated during recovery
`);

Policy.tunnelCooldown.means(`
- quick tunnel replacement is rare, not eager
- repeated public-not-ready checks alone are not enough reason to churn the tunnel
- replace a quick tunnel only on strong evidence such as a dead cloudflared process or a long sustained tunnel-side failure
- enforce a replacement cooldown so recovery cannot create many quick tunnels in a short window
`);

Policy.classifyFailuresSeparately.means(`
- local dashboard origin failure and public tunnel failure are different failure classes
- when the local origin is dead, restart the dashboard server first without touching the tunnel
- when the local origin is healthy, treat public-unready as a tunnel-side problem
- keep the current quick tunnel when cloudflared is still alive unless strong evidence and cooldown permit replacement
`);

Policy.escalateAfterFailedRepair.means(`
- if repair and re-readiness both fail, emit a durable help-request incident
- help escalation is a real recovery artifact, not just a transient log line
`);

when(Access.lambda.invokes(Manager.sessionIssue).andObserves(Access.attempt))
  .then(DashboardRecovery.requires(Policy.activeAttemptRequired))
  .and(DashboardRecovery.requires(Policy.repairFirst))
  .and(DashboardRecovery.requires(Policy.classifyFailuresSeparately))
  .and(DashboardRecovery.requires(Policy.tunnelCooldown))
  .and(Manager.sessionIssue.starts(Manager.monitor))
  .and(Manager.monitor.detects(Manager.readinessFailure))
  .and(Manager.recovery.repairs(Manager.runtime))
  .and(Manager.recovery.reissues(Manager.sessionIssue));

when(Manager.monitor.detects(Manager.readinessFailure))
  .then(Manager.recovery.repairs(Manager.runtime))
  .and(Manager.recovery.reissues(Manager.sessionIssue));

when(Manager.recovery.repairs(Manager.runtime))
  .then(DashboardRecovery.requires(Policy.oneCanonicalTunnel))
  .and(DashboardRecovery.requires(Policy.classifyFailuresSeparately))
  .and(DashboardRecovery.requires(Policy.tunnelCooldown))
  .and(Manager.recovery.terminates(Manager.tunnel))
  .and(Manager.recovery.restarts(Manager.gateway))
  .and(Manager.recovery.mayReplace(Manager.tunnel));

when(Manager.recovery.fails())
  .then(DashboardRecovery.requires(Policy.escalateAfterFailedRepair))
  .and(Manager.helpRequest.records("a durable incident"))
  .and(Manager.helpRequest.requests("agent help"));
