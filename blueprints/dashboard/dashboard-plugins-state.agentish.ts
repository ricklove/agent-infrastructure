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
properly defined, lazy-loaded, and integrated with both shell and gateway.

## Current State vs Blueprint

### Alignment
- ✅ Plugin registry model implemented
- ✅ Lazy UI screen loading works
- ✅ Lazy backend startup works
- ✅ Feature-owned plugin definitions in place
- ✅ Tab metadata, routes, icons, tooltips properly configured

### Recently Fixed Issues
- **Agent Swarm UI Scrolling (2026-03-23)**: The AgentSwarmScreen component was missing overflow
  scrolling on its main content area. The outer container used flex h-full flex-col but the
  content div at line 970 lacked overflow-y-auto and flex-1 classes. Fixed by adding these
  classes to enable proper vertical scrolling when content exceeds viewport height.

### Known Gaps
- None currently identified

### Recently Fixed Issues (Continued)
- **Agent Swarm Process Color Distribution (2026-03-23)**: Colors are keyed by PID with preset
  hue slots (23 positions) and salted hashes for saturation/lightness to ensure each unique
  process instance gets a visually distinct color without collisions.

### Verification Status
- Agent Swarm UI scrolling fix: Awaiting browser verification and screenshot

## Next Steps
1. Verify agent swarm scrolling fix in browser with screenshots
2. Deploy and verify version matching
3. Test at multiple viewport sizes per responsive UI requirements
`);

DashboardPluginsState.tracks(`
- Implementation alignment with blueprint
- UI/UX issues and fixes
- Verification status for changes
- Known gaps and issues
`);
