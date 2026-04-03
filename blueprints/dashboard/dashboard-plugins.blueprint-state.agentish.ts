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
branch also composes feature-provided Workbench node definitions into the rendered Workbench screen,
and the shipped `agent-chat` Workbench node now reuses the canonical Agent Chat session surface from
`agent-chat-ui` rather than a Workbench-only bounded renderer.

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
- ✅ The `agent-chat` Workbench node is still feature-owned in `agent-chat-ui`
- ✅ The `agent-chat` Workbench node now renders the canonical reusable Agent Chat session surface inside the node body

### Known Gaps
- The current Workbench node registration path is composed explicitly in dashboard-ui feature wiring rather than through a broader discoverable plugin-node contribution system
- Persisted reload coverage for feature-provided Workbench node state, including selected session ids for `agent-chat`, still needs an explicit save/load verification pass

## Next Steps
1. Add a dedicated save/load verification pass for persisted `agent-chat` node session selection
2. Decide whether Workbench node contributions should stay explicitly composed in `dashboard-ui` or move to a broader discoverable contribution seam
3. Keep package-local `agent-browser` checks alongside Workbench UI behavior as the fast verification loop
`);

DashboardPluginsState.tracks(`
- Implementation alignment with blueprint
- Dashboard-level composition of feature-owned Workbench node definitions
- Known gaps around persisted feature-node state verification and future plugin-node discovery design
`);
