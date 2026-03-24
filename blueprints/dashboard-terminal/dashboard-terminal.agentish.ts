/// <reference path="../_agentish.d.ts" />

// Dashboard Terminal

const Agentish = define.language("Agentish");

const DashboardTerminal = define.system("DashboardTerminal", {
  format: Agentish,
  role: "Workspace-scoped browser terminal system for interactive shell access through the dashboard",
});

const User = define.actor("DashboardOperator", {
  role: "Operator opening and using terminal sessions from the browser",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  feature: define.entity("DashboardTerminalFeature"),
  route: define.entity("DashboardTerminalRoute"),
  screen: define.entity("DashboardTerminalScreen"),
};

const Session = {
  terminal: define.workspace("TerminalSession"),
  tab: define.entity("TerminalTab"),
  shellProcess: define.entity("TerminalShellProcess"),
  pty: define.entity("PseudoTerminal"),
  cwd: define.entity("TerminalWorkingDirectory"),
  env: define.entity("TerminalEnvironment"),
  command: define.entity("ShellCommand"),
  transcript: define.document("TerminalTranscript"),
  resize: define.entity("TerminalResizeEvent"),
  input: define.entity("TerminalInputEvent"),
  output: define.entity("TerminalOutputEvent"),
  lifecycle: define.entity("TerminalLifecycleState"),
};

const Transport = {
  websocket: define.entity("TerminalWebSocket"),
  snapshot: define.entity("TerminalSnapshot"),
  attach: define.entity("AttachTerminalSession"),
  create: define.entity("CreateTerminalSession"),
  close: define.entity("CloseTerminalSession"),
  heartbeat: define.entity("TerminalHeartbeat"),
};

const Runtime = {
  backend: define.system("TerminalBackend"),
  host: define.system("ManagerHost"),
  processSpawner: define.entity("ShellProcessSpawner"),
  permissionPolicy: define.entity("TerminalPermissionPolicy"),
  allowedRoot: define.entity("AllowedWorkspaceRoot"),
  idleReaper: define.entity("IdleSessionReaper"),
  acceptanceCase: define.entity("TerminalAcceptanceCase"),
  reconnect: define.concept("ReconnectableTerminalSession"),
  workspaceScoped: define.concept("WorkspaceScopedTerminal"),
  shellFirst: define.concept("InteractiveShellFirst"),
  streamTransport: define.concept("StreamingDuplexTransport"),
};

const Security = {
  authBoundary: define.concept("DashboardSessionAuthBoundary"),
  hostBoundary: define.concept("ManagerHostExecutionBoundary"),
  pathGuard: define.concept("WorkspacePathGuard"),
  envFilter: define.concept("FilteredEnvironmentForwarding"),
  sessionIsolation: define.concept("PerSessionProcessIsolation"),
  audit: define.entity("TerminalAuditRecord"),
};

const Ui = {
  terminalSurface: define.entity("TerminalSurface"),
  tabBar: define.entity("TerminalTabBar"),
  sessionChrome: define.entity("TerminalSessionChrome"),
  cwdPicker: define.entity("TerminalWorkingDirectoryPicker"),
  shellBadge: define.entity("TerminalShellBadge"),
  reconnectBanner: define.entity("TerminalReconnectBanner"),
  shortcutHint: define.entity("TerminalShortcutHint"),
  emptyState: define.entity("TerminalEmptyState"),
  statusItems: define.entity("TerminalFeatureStatusItems"),
};

const Interaction = {
  keyboardModel: define.concept("BrowserTerminalKeyboardModel"),
  copyFirstCtrlC: define.concept("CopyFirstCtrlC"),
  interruptConfirm: define.concept("InterruptConfirmOnSecondCtrlC"),
  pasteFromClipboard: define.concept("PasteFromClipboard"),
};

DashboardTerminal.enforces(`
- Dashboard terminal is an interactive shell feature, not a one-shot command runner.
- The primary product reason for terminal access is to complete human-in-the-loop authentication and authorization flows that do not fit ordinary dashboard forms.
- The operator interacts with a real PTY-backed shell so readline, prompts, TUIs, and full-screen programs can work when practical.
- Terminal access is scoped to the manager host and explicitly allowed workspace roots rather than arbitrary remote hosts in V1.
- The browser communicates through a duplex streaming transport suitable for interactive keystrokes and shell output.
- Terminal sessions are reconnectable so a tab reload does not immediately destroy active shell state.
- Terminal sessions must be isolated per browser session and per terminal tab rather than multiplexed through one shared shell.
- Default working directories must stay inside approved workspace roots and reject path traversal or symlink escape.
- Environment forwarding must be explicit and filtered rather than inheriting an unbounded host environment.
- Authentication and authorization remain owned by the dashboard gateway session boundary.
- Idle sessions should expire conservatively so abandoned shells do not accumulate forever.
- Terminal output may be retained as bounded transcript or inspection state, but the running PTY is the live source of truth during a session.
- SSH-style remote host hopping is out of scope for V1 unless done by the operator inside the shell itself.
- The feature must not break interactive auth flows such as device-code login, OAuth CLI prompts, sudo prompts, ssh prompts, MFA challenges, or browser-launch instructions.
- Browser keyboard behavior must preserve familiar copy semantics while still allowing terminal interrupt signals.
- Browser keyboard behavior must support direct paste from the system clipboard into the live terminal session.
`);

DashboardTerminal.defines(`
- A terminal session is one browser-visible interactive shell attachment with its own PTY, working directory, environment, and lifecycle.
- WorkspaceScopedTerminal means session creation requires an approved starting directory rooted in the workspace or another declared safe root.
- InteractiveShellFirst means the system optimizes for long-lived shells and streaming interaction rather than request-response command execution.
- StreamingDuplexTransport means keystrokes, resize events, heartbeats, and output frames flow continuously between browser and backend.
- ReconnectableTerminalSession means the browser may detach and later reattach to the same live PTY within a bounded lifetime.
- ManagerHostExecutionBoundary means shell processes run only on the manager host runtime that already serves the dashboard.
- FilteredEnvironmentForwarding means only approved environment variables are injected into new shell processes.
- Human-in-the-loop auth flow means a CLI-driven login or approval sequence that requires a human to read prompts, copy codes, open URLs, or answer password and MFA challenges.
- Terminal acceptance case means a concrete CLI flow the feature must support before it is considered ready.
- CopyFirstCtrlC means Ctrl+C copies selected terminal text first instead of immediately sending SIGINT.
- InterruptConfirmOnSecondCtrlC means the UI shows a short-lived hint after copy-first Ctrl+C so a second Ctrl+C sends terminal interrupt.
- PasteFromClipboard means Ctrl+V inserts clipboard text into the active terminal session as PTY input rather than into a separate browser form field.
`);

Dashboard.shell.contains(Dashboard.feature, Dashboard.route, Dashboard.screen);
Dashboard.feature.contains(Runtime.backend, Ui.statusItems);

Session.terminal.contains(
  Session.tab,
  Session.shellProcess,
  Session.pty,
  Session.cwd,
  Session.env,
  Session.command,
  Session.transcript,
  Session.resize,
  Session.input,
  Session.output,
  Session.lifecycle,
);

Runtime.backend.contains(
  Transport.websocket,
  Transport.snapshot,
  Transport.attach,
  Transport.create,
  Transport.close,
  Transport.heartbeat,
  Runtime.processSpawner,
  Runtime.permissionPolicy,
  Runtime.allowedRoot,
  Runtime.idleReaper,
  Runtime.acceptanceCase,
  Security.audit,
);

Dashboard.screen.contains(
  Ui.terminalSurface,
  Ui.tabBar,
  Ui.sessionChrome,
  Ui.cwdPicker,
  Ui.shellBadge,
  Ui.reconnectBanner,
  Ui.shortcutHint,
  Ui.emptyState,
);

Runtime.backend.contains(Runtime.reconnect, Runtime.workspaceScoped, Runtime.streamTransport);
Runtime.backend.contains(Security.authBoundary, Security.hostBoundary, Security.pathGuard, Security.envFilter, Security.sessionIsolation);
Dashboard.screen.contains(Interaction.keyboardModel, Interaction.copyFirstCtrlC, Interaction.interruptConfirm, Interaction.pasteFromClipboard);

Session.terminal.means(`
- one live PTY-backed shell process
- one working directory
- one environment snapshot
- one browser attachment at a time in V1
- bounded reconnect support after browser refresh or network interruption
- explicit close semantics instead of relying only on browser disconnect
`);

Security.sessionIsolation.means(`
- each terminal tab owns its own PTY and process tree
- input from one terminal session never reaches another session
- browser attachment identity is checked before attach, resize, input, or close operations are accepted
`);

Runtime.acceptanceCase.means(`
- Codex CLI auth works from the browser terminal without falling back to a local desktop terminal
- Claude CLI auth works from the browser terminal without falling back to a local desktop terminal
- both flows preserve prompt fidelity, paste fidelity, URL readability, and enough session lifetime to finish login
- terminal selection copy works with Ctrl+C, while sending SIGINT remains available by pressing Ctrl+C again after the visible hint
- Ctrl+V pastes clipboard contents into the live shell exactly as terminal input
`);

when(User.opens(Dashboard.feature))
  .then(Dashboard.shell.renders(Ui.terminalSurface))
  .and(Dashboard.shell.shows(Ui.tabBar))
  .and(Dashboard.screen.shows(Ui.emptyState).before("the first terminal session exists"));

when(User.creates(Session.terminal))
  .then(Runtime.backend.validates(Runtime.allowedRoot))
  .and(Runtime.backend.applies(Security.pathGuard))
  .and(Runtime.backend.spawns(Session.shellProcess))
  .and(Session.shellProcess.attachesTo(Session.pty))
  .and(Dashboard.screen.focuses(Ui.terminalSurface));

when(User.typesInto(Ui.terminalSurface))
  .then(Dashboard.screen.sends(Session.input))
  .and(Transport.websocket.delivers(Session.input))
  .and(Session.pty.receives(Session.input));

when(User.presses("Ctrl+C"))
  .then(Dashboard.screen.applies(Interaction.copyFirstCtrlC))
  .and(Ui.shortcutHint.explains("Press Ctrl+C again to send Ctrl+C to the terminal"))
  .and(Dashboard.screen.sends("copy").before("sending terminal interrupt when text selection exists or copy-first mode is active"));

when(User.presses("Ctrl+V"))
  .then(Dashboard.screen.applies(Interaction.pasteFromClipboard))
  .and(Dashboard.screen.reads("clipboard text"))
  .and(Dashboard.screen.sends(Session.input).as("terminal paste"));

when(Session.shellProcess.emits(Session.output))
  .then(Session.pty.emits(Session.output))
  .and(Transport.websocket.delivers(Session.output))
  .and(Dashboard.screen.renders(Session.output));

when(User.resizes(Ui.terminalSurface))
  .then(Dashboard.screen.sends(Session.resize))
  .and(Transport.websocket.delivers(Session.resize))
  .and(Session.pty.applies(Session.resize));

when(Dashboard.screen.disconnects(Transport.websocket))
  .then(Runtime.backend.preserves(Session.terminal).for("a bounded reconnect window"))
  .and(Ui.reconnectBanner.explains("that the live session may be reattached"));

DashboardTerminal.prescribes(`
- Implement the backend around Bun's native PTY support rather than a polling command API or helper-process fallback.
- Keep shell startup, attach, resize, input, output, and close as explicit transport events.
- Make the browser terminal feature workspace-aware so cwd choice, session labels, and future file-browser integration line up.
- Prefer a transport contract that can support xterm-style rendering without feature-specific hacks in the dashboard shell.
- Treat security review as part of the product surface because terminal access is effectively browser-mediated shell access.
- Optimize early UX for auth-heavy workflows: reliable paste, clear URL and code visibility, stable reconnect, and no premature reap during login.
- Treat Codex CLI auth and Claude CLI auth as required acceptance tests rather than nice-to-have examples.
- Use a copy-first keyboard model so Ctrl+C copies like a browser app, with an explicit second-press escape hatch for terminal interrupt.
- Make Ctrl+V paste clipboard text straight into the PTY-backed session so auth codes and login commands can be pasted without friction.
`);
