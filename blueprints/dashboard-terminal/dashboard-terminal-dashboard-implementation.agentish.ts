/// <reference path="../_agentish.d.ts" />

// Dashboard Terminal Dashboard Implementation

const Agentish = define.language("Agentish");

const DashboardTerminalDashboardImplementation = define.system("DashboardTerminalDashboardImplementation", {
  format: Agentish,
  role: "Implementation-resolved plan for adding a browser-based terminal feature to the dashboard",
});

const User = define.actor("DashboardOperator", {
  role: "Operator creating, attaching, and using browser terminal sessions",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("DashboardTerminalPlugin"),
  route: define.entity("DashboardTerminalRoute"),
  screen: define.entity("DashboardTerminalScreen"),
};

const Terminal = {
  backend: define.system("DashboardTerminalBackend"),
  session: define.entity("TerminalSession"),
  registry: define.entity("TerminalSessionRegistry"),
  pty: define.entity("PtyHandle"),
  shell: define.entity("ShellProcess"),
  cwd: define.entity("TerminalWorkingDirectory"),
  env: define.entity("TerminalEnvironment"),
  profile: define.entity("ShellProfile"),
  attachment: define.entity("TerminalAttachment"),
  idleTimer: define.entity("IdleTimeoutPolicy"),
  audit: define.document("TerminalAuditLog"),
};

const Api = {
  listSessions: define.entity("ListTerminalSessionsEndpoint"),
  createSession: define.entity("CreateTerminalSessionEndpoint"),
  closeSession: define.entity("CloseTerminalSessionEndpoint"),
  snapshotSession: define.entity("GetTerminalSnapshotEndpoint"),
  subscribeSession: define.entity("SubscribeTerminalSessionEndpoint"),
  attachSession: define.entity("AttachTerminalSessionEndpoint"),
  inputSession: define.entity("WriteTerminalInputEndpoint"),
  resizeSession: define.entity("ResizeTerminalEndpoint"),
};

const Ui = {
  workspacePanel: define.entity("TerminalWorkspacePanel"),
  terminalViewport: define.entity("TerminalViewport"),
  tabStrip: define.entity("TerminalTabStrip"),
  sessionMenu: define.entity("TerminalSessionMenu"),
  createDialog: define.entity("CreateTerminalDialog"),
  cwdField: define.entity("TerminalCwdField"),
  shellSelector: define.entity("TerminalShellSelector"),
  shortcutToast: define.entity("TerminalShortcutToast"),
  offlineState: define.entity("TerminalOfflineState"),
  loadingState: define.entity("TerminalLoadingState"),
  statusItems: define.entity("TerminalFeatureStatusItems"),
};

const Runtime = {
  lazyUi: define.concept("LazyTerminalUi"),
  lazyBackend: define.concept("LazyTerminalBackend"),
  ptyRuntime: define.concept("BunHostedPtyRuntime"),
  nativePty: define.concept("BunNativePty"),
  browserTerminal: define.concept("XtermCompatibleBrowserTerminal"),
  authFriendlyUx: define.concept("AuthFriendlyTerminalUx"),
  copyFirstKeyboard: define.concept("CopyFirstKeyboardPolicy"),
  clipboardPaste: define.concept("ClipboardPastePolicy"),
  reconnect: define.concept("SessionReattach"),
  boundedHistory: define.concept("BoundedTerminalScrollback"),
  workspaceGuard: define.concept("WorkspaceRootGuard"),
  auth: define.concept("DashboardAuthScopedTerminal"),
};

const Scope = {
  managerOnly: define.concept("ManagerHostOnlyExecution"),
  singleAttach: define.concept("SingleBrowserAttachmentV1"),
  workspaceRoots: define.concept("ApprovedWorkspaceRoots"),
  shellProfiles: define.concept("DeclaredShellProfiles"),
  noSharedShell: define.concept("NoSharedOperatorShell"),
};

const Decision = {
  featureId: define.entity("DashboardTerminalFeatureIdDecision"),
  backendPackage: define.entity("DashboardTerminalBackendPackageDecision"),
  uiPackage: define.entity("DashboardTerminalUiPackageDecision"),
  transport: define.entity("TerminalTransportDecision"),
  ptyLibrary: define.entity("PtyRuntimeDecision"),
  scrollback: define.entity("TerminalScrollbackDecision"),
  idleTimeout: define.entity("TerminalIdleTimeoutDecision"),
  acceptance: define.entity("TerminalAcceptanceDecision"),
};

const Package = {
  ui: define.package("DashboardTerminalUiPackage"),
  server: define.package("DashboardTerminalServerPackage"),
  dashboardUi: define.package("DashboardUiPackage"),
  dashboardServer: define.package("DashboardGatewayPackage"),
};

DashboardTerminalDashboardImplementation.enforces(`
- The dashboard terminal is a real dashboard plugin feature rather than a shell-owned escape hatch.
- The first implementation should ship an actual usable interactive terminal vertical slice rather than a placeholder panel.
- The first implementation should optimize first for Codex CLI auth and Claude CLI auth, because those are the immediate operator workflows that require browser terminal access.
- More general auth workflows such as ssh, sudo, or device-code login are secondary unless they conflict with the primary Codex CLI and Claude CLI auth cases.
- The gateway should proxy terminal traffic and lazy-start the backend on first terminal use.
- Transport must support interactive latency expectations for shell typing, resizing, and long-running output.
- Bun is the host runtime for this feature and V1 PTY support should use Bun's native terminal support directly.
- The terminal backend must create isolated PTY-backed shell sessions instead of reusing one shared operator shell.
- V1 execution happens on the manager host only and starts in approved workspace roots.
- Session attach, input, resize, snapshot, and close operations must all enforce dashboard-session authorization.
- Terminal creation UI should make cwd and shell profile explicit rather than silently picking unsafe defaults.
- Scrollback and transcript retention must be bounded so one noisy session does not exhaust server memory.
- Idle session cleanup must be conservative and visible rather than silently killing recently active terminals.
- The browser UX should make it easy to read login URLs, copy device codes, and keep the session alive while the operator completes out-of-band auth in another tab or device.
- Ctrl+C in the browser terminal should copy first and show a short note that the next Ctrl+C will send terminal interrupt.
- Ctrl+V in the browser terminal should paste clipboard text into the live shell input stream.
- File-browser and agent-chat integration are future-facing; V1 terminal can stand alone as a first-party dashboard tool.
`);

DashboardTerminalDashboardImplementation.defines(`
- DashboardTerminalBackend means the Bun server that owns terminal session lifecycle, PTY control, authorization, and realtime streaming.
- BunHostedPtyRuntime means the terminal backend is launched and managed from Bun around Bun's built-in terminal primitives.
- BunNativePty means terminal sessions use Bun's native PTY support directly via the runtime's terminal APIs instead of a helper-process fallback.
- XtermCompatibleBrowserTerminal means the browser UI uses a terminal rendering model capable of full interactive shell behavior.
- AuthFriendlyTerminalUx means the viewport and session chrome preserve the fidelity and stability needed for human login prompts and browser-mediated approval steps.
- CopyFirstKeyboardPolicy means browser copy semantics take precedence on the first Ctrl+C press and terminal interrupt is sent only on immediate repeat after a visible hint.
- ClipboardPastePolicy means Ctrl+V reads browser clipboard text and forwards it to the PTY as terminal input.
- SessionReattach means the browser may reconnect to an existing live terminal session and receive a bounded output snapshot plus live stream.
- ApprovedWorkspaceRoots means session cwd must belong to an allowlisted workspace root such as /home/ec2-user/workspace.
- DeclaredShellProfiles means the backend exposes a small explicit set of shells or startup commands such as login bash in workspace mode.
- Terminal acceptance means Codex CLI auth and Claude CLI auth both work from the dashboard terminal without requiring a separate machine-local terminal.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Terminal.backend);
Terminal.backend.contains(
  Terminal.session,
  Terminal.registry,
  Terminal.pty,
  Terminal.shell,
  Terminal.cwd,
  Terminal.env,
  Terminal.profile,
  Terminal.attachment,
  Terminal.idleTimer,
  Terminal.audit,
);

Terminal.backend.contains(
  Api.listSessions,
  Api.createSession,
  Api.closeSession,
  Api.snapshotSession,
  Api.subscribeSession,
  Api.attachSession,
  Api.inputSession,
  Api.resizeSession,
);

Dashboard.screen.contains(
  Ui.workspacePanel,
  Ui.terminalViewport,
  Ui.tabStrip,
  Ui.sessionMenu,
  Ui.createDialog,
  Ui.cwdField,
  Ui.shellSelector,
  Ui.shortcutToast,
  Ui.offlineState,
  Ui.loadingState,
  Ui.statusItems,
);

Dashboard.plugin.contains(Runtime.lazyUi, Runtime.lazyBackend);
Terminal.backend.contains(
  Runtime.ptyRuntime,
  Runtime.nativePty,
  Runtime.reconnect,
  Runtime.boundedHistory,
  Runtime.workspaceGuard,
  Runtime.auth,
);
Dashboard.screen.contains(Runtime.browserTerminal, Runtime.authFriendlyUx);
Dashboard.screen.contains(Runtime.copyFirstKeyboard, Runtime.clipboardPaste);

Scope.managerOnly.means(`
- shells run only on the manager host in V1
- the browser terminal is not a general remote-access broker
- operators may still run ssh inside the shell if host credentials and policy permit it
`);

Scope.singleAttach.means(`
- one browser attachment owns interactive input for a session in V1
- duplicate viewers or collaborative shells are out of scope
- reattach is supported after disconnect but simultaneous control is not
`);

Scope.workspaceRoots.means(`
- session cwd defaults to /home/ec2-user/workspace
- the backend may expose a short allowlist of other safe roots
- cwd validation rejects traversal, escape, and ambiguous symlink behavior
`);

Scope.shellProfiles.means(`
- V1 should expose a small explicit set of shells such as login bash
- profile labels should be understandable from the create-session UI
- arbitrary startup commands may be deferred until the base shell flow is stable
- shell startup should preserve whatever interactive environment Codex CLI auth and Claude CLI auth expect on the manager host
`);

Scope.noSharedShell.means(`
- the backend must not proxy the operator's own long-lived login shell
- each terminal session gets its own spawned process tree
- session close or reap should clean up only that terminal's processes
`);

when(Dashboard.shell.loads(Dashboard.plugin))
  .then(Dashboard.shell.renders("a Terminal tab"))
  .and(Dashboard.shell.applies(Runtime.lazyUi))
  .and(Dashboard.shell.defers("loading the terminal screen until the route is active"));

when(Dashboard.gateway.proxies(Terminal.backend))
  .then(Dashboard.gateway.applies(Runtime.lazyBackend))
  .and(Dashboard.gateway.starts("the terminal backend on first feature traffic"))
  .and(Dashboard.gateway.routes("dashboard-relative /api/dashboard-terminal and /ws/dashboard-terminal paths"));

when(User.creates(Terminal.session))
  .then(Ui.createDialog.collects(Ui.cwdField))
  .and(Ui.createDialog.collects(Ui.shellSelector))
  .and(Terminal.backend.applies(Runtime.workspaceGuard))
  .and(Terminal.backend.spawns(Terminal.shell))
  .and(Terminal.shell.attachesTo(Terminal.pty))
  .and(Dashboard.screen.focuses(Ui.terminalViewport));

when(Ui.terminalViewport.renders(Terminal.session))
  .then(Dashboard.screen.applies(Runtime.browserTerminal))
  .and(Dashboard.screen.applies(Runtime.copyFirstKeyboard))
  .and(Dashboard.screen.applies(Runtime.clipboardPaste))
  .and(Dashboard.screen.subscribes(Api.subscribeSession))
  .and(Dashboard.screen.sends(Api.resizeSession).when("viewport dimensions change"))
  .and(Dashboard.screen.sends(Api.inputSession).when("the operator types or pastes"));

when(User.presses("Ctrl+C").inside(Ui.terminalViewport))
  .then(Ui.shortcutToast.explains("Press Ctrl+C again to send Ctrl+C to the terminal"))
  .and(Dashboard.screen.copies("selected terminal text when available"))
  .and(Dashboard.screen.sends(Api.inputSession).onlyWhen("Ctrl+C is pressed again during the active confirmation window"));

when(User.presses("Ctrl+V").inside(Ui.terminalViewport))
  .then(Dashboard.screen.reads("clipboard text"))
  .and(Dashboard.screen.sends(Api.inputSession).as("terminal paste input"));

when(Dashboard.screen.reconnects(Terminal.session))
  .then(Dashboard.screen.calls(Api.attachSession))
  .and(Dashboard.screen.calls(Api.snapshotSession))
  .and(Terminal.backend.applies(Runtime.reconnect))
  .and(Ui.offlineState.clears("after live output resumes"));

Decision.acceptance.means(`
- the feature is not done until Codex CLI auth can be initiated, completed, and verified entirely inside the browser terminal
- the feature is not done until Claude CLI auth can be initiated, completed, and verified entirely inside the browser terminal
- acceptance should include reconnect during auth, URL and code readability, paste behavior, and prompt fidelity
- acceptance should include the copy-first Ctrl+C interaction and visible second-press interrupt hint
- acceptance should include Ctrl+V paste into the live terminal session
`);

DashboardTerminalDashboardImplementation.prescribes(`
- Add a new blueprint-owned feature package pair for UI and backend rather than burying terminal code inside generic dashboard files.
- Treat terminal transport as websocket-first, with small HTTP endpoints for create, list, close, and initial snapshot.
- Keep terminal session state feature-owned so tab names, cwd, attachment state, and idle timers are not inferred by the dashboard shell.
- Choose Bun's native PTY support as the V1 runtime path unless a later production constraint forces a documented change.
- Start with one strong terminal experience on the manager host before considering multi-host brokering, SSH key management, or collaborative sessions.
- Make auth flows the acceptance bar for V1: if common CLI login flows are unreliable, the terminal feature is not ready.
- Test first against the real Codex CLI and Claude CLI auth commands present on the manager host, not only synthetic PTY demos.
`);
