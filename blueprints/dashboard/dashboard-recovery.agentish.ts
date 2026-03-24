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
  controller: define.entity("ManagerController"),
  dashboardControl: define.entity("DashboardRecoveryController"),
  sessionIssue: define.entity("DashboardSessionIssue"),
  readinessFailure: define.event("DashboardReadinessFailure"),
  recovery: define.entity("DashboardRecoveryAttempt"),
  helpRequest: define.entity("DashboardHelpRequest"),
  tunnel: define.entity("CloudflaredTunnel"),
  namedTunnel: define.entity("NamedCloudflaredTunnel"),
  sessionHostname: define.entity("DashboardSessionHostname"),
  backupTunnel: define.entity("BackupTemporaryTunnel"),
  gateway: define.entity("DashboardGatewayProcess"),
};

const Policy = {
  activeAttemptRequired: define.concept("ActiveAttemptRequired"),
  repairFirst: define.concept("RepairFirst"),
  oneCanonicalTunnel: define.concept("OneCanonicalTunnel"),
  tunnelCooldown: define.concept("QuickTunnelReplacementCooldown"),
  classifyFailuresSeparately: define.concept("SeparateOriginAndTunnelFailures"),
  preferNamedTunnelWhenConfigured: define.concept("PreferNamedTunnelWhenConfigured"),
  sessionHostnameLifecycle: define.concept("SessionHostnameLifecycle"),
  backupTunnelFallback: define.concept("BackupTemporaryTunnelFallback"),
  escalateAfterFailedRepair: define.concept("EscalateAfterFailedRepair"),
  thinAlwaysOnController: define.concept("ThinAlwaysOnController"),
};

DashboardRecovery.enforces(`
- Dashboard repair should be triggered by an active user connection attempt plus dashboard unreachability.
- The recovery path must not depend on the dashboard UI being reachable first.
- Automatic repair should start immediately when the manager receives a real connection attempt.
- One thin always-on manager controller should own dashboard lifecycle and recovery policy through a dedicated dashboard-recovery domain.
- One canonical dashboard tunnel should exist after recovery, not a pile of stale tunnels.
- A thin always-on manager controller may supervise dashboard lifecycle without making the dashboard itself always-on.
- When named tunnel configuration exists, the manager should use one persistent named tunnel instead of issuing anonymous quick tunnels.
- Temporary ingress may use a backup tunnel provider when the primary quick tunnel provider cannot issue a URL.
- If automatic repair still fails, the system should create an explicit ask-help incident for agent follow-up.
`);

Policy.activeAttemptRequired.means(`
- do not restart the dashboard just because it is idle
- require an active access attempt, readiness failure, or repeated access failure signal
`);

Policy.repairFirst.means(`
- on dashboard session issuance success, notify the manager controller's dashboard-recovery domain immediately
- let Lambda keep polling readiness while the manager-side controller repairs in parallel
- keep one always-on manager controller as the single lifecycle and recovery owner for the dashboard path
- if the dashboard-recovery domain observes a dead local origin during an active connection window, attempt repair automatically
- if the dashboard-recovery domain observes that the current public URL fails while the local origin is still healthy during an active connection window, attempt tunnel repair immediately
- prune stale dashboard and tunnel processes
- restart the dashboard path when the local origin is dead
- persist the newest public URL as the canonical runtime state
- only return a public dashboard URL after the manager has verified that the URL itself is serving the dashboard
`);

Policy.oneCanonicalTunnel.means(`
- dashboard recovery should converge to one live cloudflared process for the active dashboard port
- stale tunnel processes should be terminated during recovery
- when a named tunnel is configured, recovery should converge to one persistent named tunnel connector plus the currently active session hostname mapping
`);

Policy.preferNamedTunnelWhenConfigured.means(`
- if stack-owned named tunnel runtime credentials and hostname-management capability are configured, the manager should prefer that path over anonymous quick tunnels
- manager runtime credentials for named tunnel mode should be limited to the tunnel runtime token, not the deploy-machine Cloudflare origin cert
- stack-owned hostname metadata for named tunnel mode should be fetched from AWS runtime configuration, not embedded in EC2 user data
- named tunnel mode should keep one persistent cloudflared connector alive for the stack-owned tunnel instead of creating a new tunnel process identity for each access attempt
- named tunnel mode should issue a fresh random hostname per dashboard session while reusing the same named tunnel connector
- named tunnel mode should preserve the quick-tunnel-style "fresh public URL per session" behavior without depending on trycloudflare.com
- quick tunnels remain the fallback path when named tunnel configuration is absent or unusable
`);

Policy.sessionHostnameLifecycle.means(`
- when named tunnel mode is active, a dashboard session should receive a random public hostname mapped through the persistent named tunnel
- session hostname creation is the named-tunnel equivalent of quick tunnel URL issuance
- the wildcard DNS route is created ahead of time for the stack-owned hostname space
- expired or abandoned session hostnames are just inactive URLs under that wildcard and do not require per-session DNS cleanup
- deleting the named tunnel itself is not part of normal session cleanup
`);

Policy.tunnelCooldown.means(`
- quick tunnel replacement is rare, not eager
- repeated public-not-ready checks alone are not enough reason to churn the tunnel
- replace a quick tunnel only on strong evidence such as a dead cloudflared process or a long sustained tunnel-side failure
- enforce a replacement cooldown so recovery cannot create many quick tunnels in a short window
`);

Policy.classifyFailuresSeparately.means(`
- local dashboard origin failure and public tunnel failure are different failure classes
- the dashboard-recovery domain must prove which class failed by testing both the local origin and the current public URL
- when the local origin is dead, restart the dashboard server first without touching the tunnel
- when the local origin is healthy, treat public-unready as a tunnel-side problem
- a working public tunnel with a dead local server means "repair server, keep tunnel"
- a dead public tunnel with a healthy local server means "repair or replace tunnel, keep server"
- keep the current quick tunnel when cloudflared is still alive unless strong evidence and cooldown permit replacement
`);

Policy.backupTunnelFallback.means(`
- the manager should prefer the primary temporary tunnel provider first
- when the primary temporary tunnel provider cannot issue a usable URL, the manager may fall back to a backup temporary tunnel provider
- the backup provider should preserve the temporary-URL model rather than forcing a permanent ingress change
- recovery should still converge to one canonical active tunnel after fallback
- a tunnel URL that exists in logs but does not serve the dashboard is not usable and must not be returned
`);

Policy.escalateAfterFailedRepair.means(`
- if repair and re-readiness both fail, emit a durable help-request incident
- help escalation is a real recovery artifact, not just a transient log line
`);

Policy.thinAlwaysOnController.means(`
- keep one tiny always-on controller process under systemd
- the manager controller owns dashboard lifecycle and dashboard recovery policy through a dedicated dashboard-recovery domain
- the manager controller owns lifecycle policy, not the heavy dashboard server itself
- the manager controller should poll cheaply and should not recreate dashboard runtime or tunnels on every loop when the current runtime is already healthy
- while active browser or bootstrap sessions exist, keep the dashboard server and tunnel available
- when no active dashboard sessions remain for an idle window, stop the dashboard server and tunnel
- the tunnel may survive dashboard server restarts during active use when the tunnel itself is healthy
`);

when(Access.lambda.invokes(Manager.sessionIssue).andObserves(Access.attempt))
  .then(DashboardRecovery.requires(Policy.activeAttemptRequired))
  .and(DashboardRecovery.requires(Policy.repairFirst))
  .and(DashboardRecovery.requires(Policy.classifyFailuresSeparately))
  .and(DashboardRecovery.requires(Policy.preferNamedTunnelWhenConfigured))
  .and(DashboardRecovery.requires(Policy.sessionHostnameLifecycle))
  .and(DashboardRecovery.requires(Policy.tunnelCooldown))
  .and(DashboardRecovery.requires(Policy.thinAlwaysOnController))
  .and(DashboardRecovery.requires(Policy.backupTunnelFallback))
  .and(Manager.sessionIssue.notifies(Manager.controller))
  .and(Manager.controller.routes("dashboard recovery work").to(Manager.dashboardControl))
  .and(Manager.dashboardControl.detects(Manager.readinessFailure))
  .and(Manager.dashboardControl.repairs(Manager.runtime))
  .and(Manager.dashboardControl.reissues(Manager.sessionIssue));

when(Manager.dashboardControl.detects(Manager.readinessFailure))
  .then(Manager.dashboardControl.repairs(Manager.runtime))
  .and(Manager.dashboardControl.reissues(Manager.sessionIssue));

when(Manager.dashboardControl.repairs(Manager.runtime))
  .then(DashboardRecovery.requires(Policy.oneCanonicalTunnel))
  .and(DashboardRecovery.requires(Policy.classifyFailuresSeparately))
  .and(DashboardRecovery.requires(Policy.preferNamedTunnelWhenConfigured))
  .and(DashboardRecovery.requires(Policy.sessionHostnameLifecycle))
  .and(DashboardRecovery.requires(Policy.tunnelCooldown))
  .and(DashboardRecovery.requires(Policy.backupTunnelFallback))
  .and(Manager.dashboardControl.terminates(Manager.tunnel))
  .and(Manager.dashboardControl.keeps(Manager.namedTunnel))
  .and(Manager.dashboardControl.rotates(Manager.sessionHostname))
  .and(Manager.dashboardControl.mayReplace(Manager.backupTunnel))
  .and(Manager.dashboardControl.restarts(Manager.gateway))
  .and(Manager.dashboardControl.mayReplace(Manager.tunnel));

when(Manager.dashboardControl.fails())
  .then(DashboardRecovery.requires(Policy.escalateAfterFailedRepair))
  .and(Manager.helpRequest.records("a durable incident"))
  .and(Manager.helpRequest.requests("agent help"));

when(Manager.dashboardControl.observes("active dashboard sessions"))
  .then(DashboardRecovery.requires(Policy.thinAlwaysOnController))
  .and(Manager.dashboardControl.keeps(Manager.gateway))
  .and(Manager.dashboardControl.keeps(Manager.tunnel));

when(Manager.dashboardControl.observes("dashboard idle timeout"))
  .then(DashboardRecovery.requires(Policy.thinAlwaysOnController))
  .and(Manager.dashboardControl.stops(Manager.gateway))
  .and(Manager.dashboardControl.stops(Manager.tunnel));
