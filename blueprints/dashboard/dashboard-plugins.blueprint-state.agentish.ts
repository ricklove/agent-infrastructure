/// <reference path="../_agentish.d.ts" />

// Dashboard Plugins - Blueprint State

const Agentish = define.language("Agentish");

const DashboardPluginsState = define.document("DashboardPluginsState", {
  format: Agentish,
  role: "Current implementation status, gaps, and known issues relative to the dashboard-plugins blueprint",
});

const Blueprint = define.document("dashboard-plugins.agentish.ts");

DashboardPluginsState.compares("current dashboard implementation", "ideal blueprint");

DashboardPluginsState.records(`
# Dashboard Plugins Implementation Status

## Overview
The dashboard plugin system is implemented per the blueprint architecture. Feature plugins are
properly defined, startup-policy driven, and integrated with both shell and gateway. The current
branch also proves dashboard-level composition of feature-provided Workbench node definitions into
the rendered Workbench screen.

## Current State vs Blueprint

### Alignment
- ✅ Plugin registry model implemented
- ✅ Lazy UI screen loading works
- ✅ Lazy backend startup works
- ✅ Plugin definitions expose an explicit `lazy` vs `always` backend startup policy
- ✅ The gateway/runtime proactively restores `always` backends after startup
- ✅ Feature-owned plugin definitions in place
- ✅ Tab metadata, routes, icons, tooltips properly configured
- ✅ Dashboard UI composition can inject feature-owned Workbench node definitions through composed plugin screen getProps

### Verification Status
- Workbench composed plugin registration: worker-local browser verification passed for menu open, text node create, int node create, and Agent Chat node create using package-local agent-browser checks in packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts
- Worker-local screenshot captured at /home/ec2-user/temp/worker-agent-chat-workbench-node.png

### Known Gaps
- The current Workbench node registration path is composed explicitly in dashboard-ui feature wiring rather than through a broader discoverable plugin-node contribution system
- Persisted reload coverage for feature-provided Workbench node state, including selected session ids, still needs an explicit verification pass

## Next Steps
1. Carry the composed Workbench node registration through remaining review, merge, and release steps
2. Add broader plugin-provided node coverage when additional feature nodes are introduced
3. Add persisted reload verification for feature-provided Workbench node state where needed
`);

DashboardPluginsState.tracks(`
- Implementation alignment with blueprint
- Dashboard-level composition of feature-owned Workbench node definitions
- Verification status for Workbench plugin registration behavior
- Known gaps and issues
`);
