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
  implemented: define.concept("DashboardTerminalImplemented"),
  mobileVerified: define.concept("MobileTerminalVerified"),
  pluginRegistered: define.concept("DashboardTerminalPluginRegistered"),
  backendPackagePresent: define.concept("DashboardTerminalBackendPackagePresent"),
  uiPackagePresent: define.concept("DashboardTerminalUiPackagePresent"),
  gatewayRoutesPresent: define.concept("DashboardTerminalGatewayRoutesPresent"),
  bunPtyIntegrated: define.concept("BunPtyIntegrated"),
  websocketTransportPresent: define.concept("TerminalWebSocketTransportPresent"),
  mobileReadableOutput: define.concept("MobileReadableTerminalOutput"),
  shellNoiseRemaining: define.concept("ShellStartupNoiseRemaining"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

DashboardTerminalBlueprintState.defines(`
- CurrentImplementationStatus means Dashboard Terminal exists as running code in the dashboard, gateway, backend, and browser UI.
- AssessmentConfidence is high because the implementation was verified in local mobile browser testing and then compared directly against the deployed runtime behavior.
- ImplementationEvidence includes the dashboard terminal plugin, Bun PTY backend, proxied API and WebSocket routes, browser terminal surface, and mobile screenshots showing real command output.
- This blueprint-state compares current implementation reality against the ideal Dashboard Terminal concept in dashboard-terminal.agentish.ts, the implementation-resolved plan in dashboard-terminal-dashboard-implementation.agentish.ts, and the shared workflow rules in development-process.agentish.ts.
- ImplementationGap means remaining polish or scope follow-up rather than missing V1 feature construction.
- KnownIssue is that interactive shell startup still emits the standard no-job-control noise in the browser terminal because the shell is not attached to a full job-control terminal environment.
`);

DashboardTerminalBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.implemented,
  CurrentReality.mobileVerified,
  CurrentReality.pluginRegistered,
  CurrentReality.backendPackagePresent,
  CurrentReality.uiPackagePresent,
  CurrentReality.gatewayRoutesPresent,
  CurrentReality.bunPtyIntegrated,
  CurrentReality.websocketTransportPresent,
  CurrentReality.mobileReadableOutput,
  CurrentReality.shellNoiseRemaining,
  CurrentReality.workflowAlignment,
);

CurrentReality.implemented.means(`
- Dashboard Terminal is implemented end to end in the dashboard codebase
- the dashboard exposes a Terminal route and screen
- the gateway proxies terminal HTTP and WebSocket traffic
- the backend creates and manages Bun native PTY terminal sessions
`);

CurrentReality.mobileVerified.means(`
- the terminal route loads in a narrow mobile viewport without crashing the app
- a user can create a terminal session from mobile
- the mobile terminal viewport remains usable enough to issue basic shell commands and read the results
`);

CurrentReality.pluginRegistered.means(`
- the dashboard plugin registry includes Dashboard Terminal
- the dashboard shell can navigate to the terminal feature
`);

CurrentReality.backendPackagePresent.means(`
- packages/dashboard-terminal-server exists
- the backend provides session lifecycle management and PTY execution
`);

CurrentReality.uiPackagePresent.means(`
- packages/dashboard-terminal-ui exists
- the UI renders terminal sessions, command output, reconnect state, and input affordances
`);

CurrentReality.gatewayRoutesPresent.means(`
- the dashboard gateway proxies /api/dashboard-terminal and /ws/dashboard-terminal
- the UI receives a WebSocket root URL that matches the gateway path
`);

CurrentReality.bunPtyIntegrated.means(`
- the implementation uses Bun.Terminal for PTY-backed terminal sessions
- shell commands execute against the workspace environment
`);

CurrentReality.websocketTransportPresent.means(`
- terminal session data flows through the dashboard WebSocket gateway
- the mobile fix corrected the client to connect to the provided terminal WebSocket root directly rather than appending an extra path segment
`);

CurrentReality.mobileReadableOutput.means(`
- the terminal renderer strips common ANSI and OSC control sequences before writing fallback text output into the preformatted mobile view
- verified mobile command output includes readable results for pwd, echo hi, and uname -s
- verification screenshot: /home/ec2-user/state/screenshots/terminal-mobile-debug/after-commands-clean.png
`);

CurrentReality.shellNoiseRemaining.means(`
- shell startup currently shows standard bash job-control warnings in the browser terminal
- the warnings do not block command execution or readability of the command results
- this is acceptable for now but remains a polish target
`);

CurrentReality.workflowAlignment.means(`
- Dashboard Terminal has a maintained blueprint-state document as required by the shared development process
- this document now reflects implemented and verified behavior rather than pre-implementation placeholder text
- future terminal changes should keep this document aligned with verification results
`);

when(CurrentReality.implemented.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.status))
  .and(DashboardTerminalBlueprintState.treats("Dashboard Terminal V1 as implemented"));

when(CurrentReality.mobileVerified.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.evidence))
  .and(DashboardTerminalBlueprintState.treats("mobile terminal usability as verified rather than assumed"));

when(CurrentReality.mobileReadableOutput.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.evidence))
  .and(DashboardTerminalBlueprintState.treats("readable command output on mobile as a concrete acceptance milestone"));

when(CurrentReality.shellNoiseRemaining.exists())
  .then(DashboardTerminalBlueprintState.records(Assessment.issue))
  .and(DashboardTerminalBlueprintState.treats("shell startup warnings as non-blocking follow-up polish"));
