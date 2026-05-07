/// <reference path="./_agentish.d.ts" />

// Workspace Health

const Agentish = define.language("Agentish");

const WorkspaceHealth = define.system("WorkspaceHealth", {
  format: Agentish,
  role: "Manager-owned workspace readiness and session health-profile contract",
});

const Operator = define.actor("WorkspaceHealthOperator", {
  role: "Human who expects one fast health profile to reveal whether a workspace is ready for agent work",
});

const Runtime = {
  managerController: define.system("ManagerHealthController"),
  agentChatGate: define.system("AgentChatHealthGate"),
  workAt: define.system("WorkAtExecutionSurface"),
};

const Workspace = {
  profile: define.document("WorkspaceHealthProfile"),
  check: define.document("WorkspaceHealthCheck"),
  binding: define.entity("WorkspaceHealthBinding"),
  target: define.entity("WorkspaceHealthTarget"),
};

const Session = {
  chat: define.workspace("HealthBoundChatSession"),
  selectedProfile: define.entity("SelectedWorkspaceHealthProfile"),
  freshness: define.entity("HealthFreshnessWindow"),
  policy: define.entity("SessionHealthPolicy"),
};

const Result = {
  report: define.document("WorkspaceHealthReport"),
  finding: define.entity("WorkspaceHealthFinding"),
  evidence: define.document("WorkspaceHealthEvidence"),
  staleState: define.entity("StaleHealthState"),
};

const Repair = {
  mode: define.entity("HealthRepairMode"),
  script: define.document("WorkspaceHealthRepairScript"),
  incident: define.document("WorkspaceHealthIncident"),
  escalation: define.entity("AgentRepairEscalation"),
};

WorkspaceHealth.enforces(`
- Every workspace health check must be single-purpose, fast, deterministic, and side-effect free.
- Every workspace health check must be executable from the manager runtime without requiring exploratory agent reasoning.
- Worker-local checks should run from the manager through WorkAtExecutionSurface rather than through a separate always-on worker health daemon.
- A workspace health profile is the authoritative list of checks that define readiness for one concrete workspace task shape.
- A profile may bind concrete parameters such as worker target, repo root, branch policy, verification URL, and allowed artifact path into reusable generic checks.
- An active chat session may select exactly one workspace health profile at a time.
- If the selected workspace health profile is stale when the operator triggers work, AgentChatHealthGate must refresh the stale checks before mutating work begins.
- Background polling should focus on active chat sessions and active workspace bindings rather than on every historical profile instance.
- Workspace health and session policy health remain separate even when the operator sees them in one session surface.
- A failing check may trigger scripted repair only when that repair is explicitly declared safe for that check.
- Agent-driven repair or investigation must begin only after the declared scripted repair path has failed or is unavailable.
- Only checks marked as active-run interruption conditions may interrupt an already running agent turn; other failures should warn, block the next turn, or queue repair without forcing an immediate stop.
- Health reports must preserve per-check evidence, freshness, severity, and repairability so the operator and agent can act on concrete failures instead of a generic unhealthy label.
`);

WorkspaceHealth.defines(`
- WorkspaceHealthCheck means one named reusable probe with one narrow purpose, one executable probe path, one pass condition, and one optional repair reference.
- WorkspaceHealthProfile means one declarative list of check bindings that together define workspace readiness for a concrete task shape such as frontend PR review, live peer development, or discuss-only exploratory work.
- WorkspaceHealthBinding means one profile-specific attachment of a reusable check to concrete parameters such as target worker, repo root, expected branch, or verification route.
- SelectedWorkspaceHealthProfile means the health profile currently attached to one active chat session.
- HealthFreshnessWindow means the interval after which a cached health result is considered stale and must be refreshed before gated work continues.
- WorkspaceHealthReport means the aggregated profile result produced from the most recent successful execution of the selected checks.
- WorkspaceHealthFinding means one check result with status, severity, freshness, repair mode, and evidence.
- WorkspaceHealthEvidence means the structured proof attached to one finding, such as the executed command, target host, observed output, and timestamps.
- HealthRepairMode means whether a failure warns, blocks work, permits safe scripted repair, or requires agent escalation.
- WorkspaceHealthRepairScript means one explicit automation path referenced by a health check when safe repair is available.
- WorkspaceHealthIncident means the durable record created when a profile failure requires operator awareness, scripted repair history, or agent escalation.
- AgentChatHealthGate means the session-side decision point that refreshes stale checks before work begins and decides whether a failure warns, blocks, or interrupts.
- ManagerHealthController means the manager-side runtime that loads profiles, executes checks, caches reports, schedules background polling for active sessions, and records incidents.
- WorkAtExecutionSurface means the manager-owned transport for executing worker-local probes and worker-local scripted repairs against registered work targets.
`);

Runtime.managerController.contains(
  Workspace.profile,
  Workspace.check,
  Workspace.binding,
  Result.report,
  Result.finding,
  Result.evidence,
  Repair.incident,
  Repair.script,
);
Runtime.agentChatGate.contains(Session.chat, Session.selectedProfile, Session.freshness, Session.policy, Result.staleState);
Runtime.workAt.contains(Workspace.target);

Workspace.profile.contains(Workspace.binding, Session.freshness, Session.policy);
Workspace.binding.contains(Workspace.check, Workspace.target, Repair.mode, Repair.script);
Result.report.contains(Result.finding);
Result.finding.contains(Result.evidence, Repair.mode);
Repair.incident.contains(Result.finding, Result.report, Repair.escalation);

when(Session.chat.selects(Session.selectedProfile))
  .then(Session.selectedProfile.uses(Workspace.profile))
  .and(Runtime.agentChatGate.uses(Session.freshness))
  .and(Runtime.agentChatGate.uses(Session.policy));

when(Runtime.agentChatGate.detects(Result.staleState))
  .then(Runtime.managerController.executes(Workspace.check))
  .and(Runtime.managerController.refreshes(Result.report));

when(Workspace.check.targets(Workspace.target))
  .then(Runtime.managerController.mayUse(Runtime.workAt))
  .and(Result.finding.creates(Result.evidence));

when(Result.finding.fails())
  .then(Repair.incident.records(Result.finding))
  .and(Runtime.agentChatGate.applies(Repair.mode));

when(Repair.script.belongsTo(Workspace.check))
  .then(Runtime.managerController.mayInvoke(Repair.script))
  .and(Repair.incident.records("scripted repair outcome before agent escalation"));

WorkspaceHealth.means(`
- reusable health checks
- profile-driven readiness
- manager-side execution
- stale-before-start refresh
- active-session background polling
- safe scripted repair first
- explicit agent escalation after automation failure
`);
