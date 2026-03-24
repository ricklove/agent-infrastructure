/// <reference path="../_agentish.d.ts" />

// Dashboard Terminal Blueprint State

const Agentish = define.language("Agentish");

const DashboardTerminalBlueprintState = define.system("DashboardTerminalBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Dashboard Terminal blueprints",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  notYetImplemented: define.concept("NotYetImplemented"),
  blueprintDefined: define.concept("BlueprintFullyDefined"),
  conceptLayer: define.concept("ConceptLayerComplete"),
  implementationPlanLayer: define.concept("ImplementationPlanLayerComplete"),
  contractsLayerMissing: define.concept("ContractsLayerDeferred"),
  noDashboardPlugin: define.concept("NoDashboardTerminalPluginExists"),
  noBackendPackage: define.concept("NoTerminalBackendPackageExists"),
  noUiPackage: define.concept("NoTerminalUiPackageExists"),
  noGatewayRoutes: define.concept("NoTerminalGatewayRoutesExist"),
  noPtyIntegration: define.concept("NoBunPtyIntegrationExists"),
  noWebSocketTransport: define.concept("NoTerminalWebSocketTransportExists"),
  noBrowserTerminal: define.concept("NoBrowserTerminalSurfaceExists"),
  deferredScope: define.concept("DeferredImplementationScope"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

DashboardTerminalBlueprintState.defines(`
- CurrentImplementationStatus means Dashboard Terminal does not yet exist as running code; the feature is fully defined at the blueprint layer only.
- AssessmentConfidence is high because the feature has zero implementation artifacts to compare against — the assessment is simply that nothing has been built yet.
- ImplementationEvidence is the absence of any terminal-related packages, routes, components, or backend processes in the current deployed system.
- This blueprint-state compares current implementation reality against the ideal Dashboard Terminal concept in dashboard-terminal.agentish.ts, the implementation-resolved plan in dashboard-terminal-dashboard-implementation.agentish.ts, and the shared workflow rules in development-process.agentish.ts.
- ImplementationGap means the entire feature surface described in both blueprint documents remains unbuilt.
- KnownIssue is that Bun's native PTY API should be verified against the actual installed Bun version before implementation begins.
`);

DashboardTerminalBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.notYetImplemented,
  CurrentReality.blueprintDefined,
  CurrentReality.conceptLayer,
  CurrentReality.implementationPlanLayer,
  CurrentReality.contractsLayerMissing,
  CurrentReality.noDashboardPlugin,
  CurrentReality.noBackendPackage,
  CurrentReality.noUiPackage,
  CurrentReality.noGatewayRoutes,
  CurrentReality.noPtyIntegration,
  CurrentReality.noWebSocketTransport,
  CurrentReality.noBrowserTerminal,
  CurrentReality.deferredScope,
  CurrentReality.workflowAlignment,
);

CurrentReality.notYetImplemented.means(`
- no terminal feature code exists anywhere in the current codebase
- no dashboard plugin registration for terminal exists
- no terminal-related packages exist under packages/
- no terminal routes exist in the dashboard gateway
- the dashboard does not render a Terminal tab or screen
`);

CurrentReality.blueprintDefined.means(`
- the concept blueprint defines the terminal system, session model, transport, security, UI, and interaction model
- the implementation plan blueprint resolves runtime decisions, API surface, UI components, scoping, and plugin integration
- both documents align on Bun native PTY, WebSocket transport, workspace scoping, copy-first keyboard, and auth-first acceptance
`);

CurrentReality.conceptLayer.means(`
- system purpose, core abstractions, invariants, definitions, and behavioral flows are all specified
- acceptance criteria are concrete: Codex CLI auth and Claude CLI auth from the browser terminal
`);

CurrentReality.implementationPlanLayer.means(`
- package structure, API endpoints, UI components, runtime decisions, and scope boundaries are all declared
- gateway proxy and lazy backend patterns align with the existing dashboard-plugins and system-runtime blueprints
`);

CurrentReality.contractsLayerMissing.means(`
- exact WebSocket message types are not yet defined
- exact API request and response shapes are not yet defined
- exact session state machine transitions are not yet defined
- these are expected to form during early implementation
`);

CurrentReality.noDashboardPlugin.means(`
- the dashboard plugin registry does not include a terminal feature entry
- no terminal tab appears in the dashboard shell
`);

CurrentReality.noBackendPackage.means(`
- no packages/dashboard-terminal-server or equivalent exists
- no PTY session management, no terminal API endpoints, no idle reaper
`);

CurrentReality.noUiPackage.means(`
- no packages/dashboard-terminal-ui or equivalent exists
- no terminal viewport, tab strip, session menu, create dialog, or keyboard handling
`);

CurrentReality.noGatewayRoutes.means(`
- the dashboard gateway does not proxy /api/dashboard-terminal or /ws/dashboard-terminal paths
- no lazy backend definition for terminal exists in the gateway configuration
`);

CurrentReality.noPtyIntegration.means(`
- no code in the repository uses Bun's native PTY APIs
- Bun PTY API availability and behavior should be verified against the installed runtime version before implementation
`);

CurrentReality.noWebSocketTransport.means(`
- no terminal-specific WebSocket handling exists
- no message framing, session multiplexing, or reconnect snapshot protocol
`);

CurrentReality.noBrowserTerminal.means(`
- no xterm-compatible terminal rendering exists in the dashboard UI
- no terminal keyboard handling, clipboard integration, or reconnect banner
`);

CurrentReality.deferredScope.means(`
- file-browser integration is future-facing per the blueprint
- agent-chat integration is future-facing per the blueprint
- multi-host terminal brokering is out of scope for V1
- collaborative or multi-viewer sessions are out of scope for V1
`);

CurrentReality.workflowAlignment.means(`
- Dashboard Terminal now has a dedicated blueprint-state document as required by the shared development process
- this document is intended to be the durable current-reality comparison for Dashboard Terminal implementation work
- implementation work should update this document as features are built and verified
`);

when(CurrentReality.notYetImplemented.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.gap))
  .and(DashboardTerminalBlueprintState.treats("the entire blueprint surface as unbuilt implementation gap"));

when(CurrentReality.blueprintDefined.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.status))
  .and(DashboardTerminalBlueprintState.treats("the feature as ready for implementation"));

when(CurrentReality.contractsLayerMissing.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.gap))
  .and(DashboardTerminalBlueprintState.treats("contracts as expected to form during early implementation rather than as a blocking gap"));

when(CurrentReality.noPtyIntegration.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.issue))
  .and(DashboardTerminalBlueprintState.treats("Bun PTY API verification as a prerequisite for the first implementation step"));
