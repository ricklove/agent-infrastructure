import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";

type Status = "success" | "failure" | "skipped";

type WorkerPromptSpec = {
  promptId: string;
  sourceKind: "inline";
  sourceRef: string;
  resolvedText: string;
};

type RequiredEndState = {
  remoteRef: string;
};

type RepoTarget = {
  name: string;
  originUrl: string;
  localPath: string;
  desiredRemoteRef: string;
  requiredEndState: RequiredEndState;
};

type RepoSyncFailureDetail = {
  repoName: string;
  localPath: string;
  stage: string;
  failureKind: string;
  expectedRemoteRef: string;
  actualRemoteRef: string | null;
  cleanBeforeSync: boolean | null;
  cleanAfterSync: boolean | null;
  recoverable: boolean;
  notes: string;
};

type RepoSyncResult = {
  repoName: string;
  originUrl: string;
  localPath: string;
  cloneMode: "cloned" | "existing";
  desiredRemoteRef: string;
  actualRemoteRef: string | null;
  cleanBeforeSync: boolean | null;
  cleanAfterSync: boolean | null;
  endedOnRequiredRef: boolean;
  failureDetail: RepoSyncFailureDetail | null;
  notes: string;
};

type DashboardLaunchResult = {
  dashboardPort: number;
  dashboardUrl: string;
  pid: number;
  ready: boolean;
  readyAtMs: number | null;
  logPath: string;
  notes: string;
};

type BrowserVerificationResult = {
  toolName: string;
  url: string;
  viewport: string;
  screenshotPath: string;
  screenshotTaken: boolean;
  title: string;
  success: boolean;
  notes: string;
};

type ProviderVerificationInvocation = {
  providerKind: "codex" | "claude";
  command: string[];
  cwd: string;
  promptId: string;
  promptSource: string;
  resolvedPromptText: string;
  agentBrowserPath: string;
};

type ProviderVerificationResult = {
  providerKind: "codex" | "claude";
  invocation: ProviderVerificationInvocation;
  browserVerification: BrowserVerificationResult;
  success: boolean;
  notes: string;
  mutatesRepoState: boolean;
  mutatesDashboardConfig: boolean;
};

type ScreenshotArtifact = {
  path: string;
  ownerStep: string;
  label: string;
  viewport: string;
  capturedAtMs: number;
  sourceUrl: string;
};

type WorkerSetupPhaseResult = {
  stepId: string;
  phase: string;
  status: Status;
  startedAtMs: number;
  finishedAtMs: number;
  durationMs: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  repoResults: RepoSyncResult[];
  error: string | null;
};

type WorkerSetupFailureSummary = {
  failedStepId: string;
  failedPhase: string;
  failedAtMs: number;
  reason: string;
  recoverable: boolean;
  resumeStepId: string;
  rerunCommand: string;
  rerunCwd: string;
  partialArtifacts: ScreenshotArtifact[];
  partialRepos: RepoSyncResult[];
  nextAction: string;
};

type WorkerSetupSummary = {
  success: boolean;
  workspaceRoot: string;
  repos: RepoSyncResult[];
  dashboard: DashboardLaunchResult | null;
  browserChecks: BrowserVerificationResult[];
  providerChecks: ProviderVerificationResult[];
  artifacts: ScreenshotArtifact[];
  warnings: string[];
  errors: string[];
  phaseResults: WorkerSetupPhaseResult[];
  failure: WorkerSetupFailureSummary | null;
};

type WorkerSetupScriptConfig = {
  workspaceRoot: string;
  repoTargets: RepoTarget[];
  developmentBranch: string;
  dashboardPort: number;
  screenshotDir: string;
  codexPrompt: WorkerPromptSpec;
  claudePrompt: WorkerPromptSpec;
  agentBrowserPath: string;
  requireCleanRepos: boolean;
  cleanUntracked: boolean;
  dashboardStartCommand: string[];
  dependencyInstallCommand: string[];
  dashboardRepoPath: string;
  githubCredentialRoot: string;
  projectsRegistryPath: string;
  codexCommand: string[];
  claudeCommand: string[];
  summaryFile: string | null;
  keepDashboardRunning: boolean;
};

const DEFAULT_VIEWPORT = "1440x900";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function nowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function optionalOne(args: string[], flag: string): string | null {
  const index = args.findIndex((value) => value === flag);
  if (index === -1) {
    return null;
  }
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return null;
  }
  return next;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printHelp(): void {
  console.log(`Usage: bun ./scripts/worker-setup-direct-development.ts [options]

Options:
  --config <path>                  JSON config override file
  --workspace-root <path>          Workspace root for repo sync and dashboard launch
  --development-branch <name>      Local branch to reset onto origin/development (default: development)
  --dashboard-port <port>          Localhost Vite/dashboard port (default: 5173)
  --screenshot-dir <path>          Directory for screenshots and dashboard log
  --summary-file <path>            Optional JSON summary output path
  --agent-browser-path <path>      agent-browser binary path
  --allow-dirty-repos              Skip the clean-working-tree preflight
  --clean-untracked                Run git clean -fd during repo sync
  --keep-dashboard-running         Leave the dashboard process running after the script exits
  -h, --help                       Show this help
`);
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function resolvePath(root: string, maybeRelative: string): string {
  return isAbsolute(maybeRelative) ? maybeRelative : resolve(root, maybeRelative);
}

async function runCommand(
  command: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdinText?: string;
    allowFailure?: boolean;
  } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0 && !options.allowFailure) {
        rejectRun(
          new Error(
            `Command failed (${exitCode}): ${command.join(" ")}\n${stderr.trim() || stdout.trim()}`,
          ),
        );
        return;
      }
      resolveRun({ exitCode, stdout, stderr });
    });
    if (options.stdinText) {
      child.stdin.write(options.stdinText);
    }
    child.stdin.end();
  });
}

async function captureGitStatus(repoPath: string): Promise<string> {
  const result = await runCommand(["git", "status", "--porcelain"], { cwd: repoPath });
  return result.stdout.trim();
}

async function currentRef(repoPath: string): Promise<string | null> {
  const result = await runCommand(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: repoPath, allowFailure: true },
  );
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function emitPhase(result: WorkerSetupPhaseResult): void {
  console.log(JSON.stringify({ type: "phase_result", result }));
}

function makePromptSpec(promptId: string, resolvedText: string): WorkerPromptSpec {
  return {
    promptId,
    sourceKind: "inline",
    sourceRef: "scripts/worker-setup-direct-development.ts",
    resolvedText,
  };
}

async function inferRepoTargets(workspaceRoot: string, developmentBranch: string): Promise<RepoTarget[]> {
  const originResult = await runCommand(
    ["git", "remote", "get-url", "origin"],
    { cwd: workspaceRoot, allowFailure: true },
  );
  if (originResult.exitCode !== 0) {
    fail("Missing repoTargets and unable to infer origin from the current workspace.");
  }
  const originUrl = originResult.stdout.trim();
  return [
    {
      name: basename(workspaceRoot),
      originUrl,
      localPath: workspaceRoot,
      desiredRemoteRef: `origin/${developmentBranch}`,
      requiredEndState: {
        remoteRef: `origin/${developmentBranch}`,
      },
    },
  ];
}

function buildCodexPrompt(url: string, screenshotPath: string): string {
  return [
    "Do not edit files, do not run git mutations, and do not change local configuration.",
    `Use agent-browser against ${url}.`,
    `Take a screenshot and save it to ${screenshotPath}.`,
    "Return a short confirmation that includes the screenshot path.",
  ].join(" ");
}

function buildClaudePrompt(url: string, screenshotPath: string): string {
  return [
    "Do not edit files, do not run git mutations, and do not change local configuration.",
    `Use agent-browser against ${url}.`,
    `Take a screenshot and save it to ${screenshotPath}.`,
    "Return a short confirmation that includes the screenshot path.",
  ].join(" ");
}

function defaultConfig(
  workspaceRoot: string,
  repoTargets: RepoTarget[],
): WorkerSetupScriptConfig {
  const dashboardPort = 5173;
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
  const screenshotDir = resolve(workspaceRoot, "tmp", "worker-setup-direct-development");
  return {
    workspaceRoot,
    repoTargets,
    developmentBranch: "development",
    dashboardPort,
    screenshotDir,
    codexPrompt: makePromptSpec(
      "codex-local-dashboard-screenshot",
      buildCodexPrompt(
        dashboardUrl,
        resolve(screenshotDir, "codex-dashboard.png"),
      ),
    ),
    claudePrompt: makePromptSpec(
      "claude-local-dashboard-screenshot",
      buildClaudePrompt(
        dashboardUrl,
        resolve(screenshotDir, "claude-dashboard.png"),
      ),
    ),
    agentBrowserPath: "agent-browser",
    requireCleanRepos: true,
    cleanUntracked: false,
    dashboardStartCommand: [
      "bun",
      "run",
      "--filter",
      "@agent-infrastructure/dashboard-app",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(dashboardPort),
      "--strictPort",
    ],
    dependencyInstallCommand: ["bun", "install"],
    dashboardRepoPath: workspaceRoot,
    githubCredentialRoot: resolve(homedir(), ".config", "agent-github"),
    projectsRegistryPath: resolve(homedir(), "workspace", "data", "projects", "registry.json"),
    codexCommand: [
      "codex",
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "danger-full-access",
      "-C",
      workspaceRoot,
    ],
    claudeCommand: [
      "claude",
      "-p",
      "--dangerously-skip-permissions",
      "--permission-mode",
      "bypassPermissions",
    ],
    summaryFile: null,
    keepDashboardRunning: false,
  };
}

async function parseArgs(argv: string[]): Promise<WorkerSetupScriptConfig> {
  if (hasFlag(argv, "--help") || hasFlag(argv, "-h")) {
    printHelp();
    process.exit(0);
  }
  const workspaceRoot = resolve(optionalOne(argv, "--workspace-root") ?? process.cwd());
  const developmentBranch = optionalOne(argv, "--development-branch") ?? "development";
  const inferredRepos = await inferRepoTargets(workspaceRoot, developmentBranch);
  const base = defaultConfig(workspaceRoot, inferredRepos);
  const configPath = optionalOne(argv, "--config");
  const rawConfig = configPath ? readJsonFile<Partial<WorkerSetupScriptConfig>>(resolve(workspaceRoot, configPath)) : {};
  const dashboardPort = Number(optionalOne(argv, "--dashboard-port") ?? rawConfig.dashboardPort ?? base.dashboardPort);
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
  const screenshotDir = resolvePath(
    workspaceRoot,
    optionalOne(argv, "--screenshot-dir") ?? rawConfig.screenshotDir ?? base.screenshotDir,
  );
  const repoTargets = (rawConfig.repoTargets ?? base.repoTargets).map((repo) => {
    const localPath = resolvePath(workspaceRoot, repo.localPath);
    const desiredRemoteRef = repo.desiredRemoteRef ?? `origin/${developmentBranch}`;
    return {
      ...repo,
      name: repo.name ?? basename(localPath),
      localPath,
      desiredRemoteRef,
      requiredEndState: repo.requiredEndState ?? {
        remoteRef: desiredRemoteRef,
      },
    };
  });
  const codexPromptText =
    rawConfig.codexPrompt?.resolvedText ??
    buildCodexPrompt(dashboardUrl, resolve(screenshotDir, "codex-dashboard.png"));
  const claudePromptText =
    rawConfig.claudePrompt?.resolvedText ??
    buildClaudePrompt(dashboardUrl, resolve(screenshotDir, "claude-dashboard.png"));

  return {
    ...base,
    ...rawConfig,
    workspaceRoot,
    repoTargets,
    developmentBranch,
    dashboardPort,
    screenshotDir,
    codexPrompt: makePromptSpec(
      rawConfig.codexPrompt?.promptId ?? base.codexPrompt.promptId,
      codexPromptText,
    ),
    claudePrompt: makePromptSpec(
      rawConfig.claudePrompt?.promptId ?? base.claudePrompt.promptId,
      claudePromptText,
    ),
    agentBrowserPath: optionalOne(argv, "--agent-browser-path") ?? rawConfig.agentBrowserPath ?? base.agentBrowserPath,
    requireCleanRepos: hasFlag(argv, "--allow-dirty-repos")
      ? false
      : rawConfig.requireCleanRepos ?? base.requireCleanRepos,
    cleanUntracked: hasFlag(argv, "--clean-untracked") || rawConfig.cleanUntracked || false,
    dashboardStartCommand: rawConfig.dashboardStartCommand ?? [
      "bun",
      "run",
      "--filter",
      "@agent-infrastructure/dashboard-app",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(dashboardPort),
      "--strictPort",
    ],
    dependencyInstallCommand:
      rawConfig.dependencyInstallCommand ?? base.dependencyInstallCommand,
    dashboardRepoPath: resolvePath(
      workspaceRoot,
      rawConfig.dashboardRepoPath ?? base.dashboardRepoPath,
    ),
    githubCredentialRoot: resolvePath(
      workspaceRoot,
      rawConfig.githubCredentialRoot ?? base.githubCredentialRoot,
    ),
    projectsRegistryPath: resolvePath(
      workspaceRoot,
      rawConfig.projectsRegistryPath ?? base.projectsRegistryPath,
    ),
    codexCommand: rawConfig.codexCommand ?? base.codexCommand,
    claudeCommand: rawConfig.claudeCommand ?? base.claudeCommand,
    summaryFile: optionalOne(argv, "--summary-file")
      ? resolvePath(workspaceRoot, optionalOne(argv, "--summary-file") as string)
      : rawConfig.summaryFile ?? null,
    keepDashboardRunning: hasFlag(argv, "--keep-dashboard-running") || rawConfig.keepDashboardRunning || false,
  };
}

async function validatePrerequisites(config: WorkerSetupScriptConfig): Promise<Record<string, unknown>> {
  const requiredCommands = ["git", "bun", config.agentBrowserPath, config.codexCommand[0], config.claudeCommand[0]];
  for (const command of requiredCommands) {
    const result = await runCommand(["bash", "-lc", `command -v ${command}`], {
      allowFailure: true,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Missing required command: ${command}`);
    }
  }
  if (!existsSync(config.githubCredentialRoot)) {
    throw new Error(`Missing GitHub credential root: ${config.githubCredentialRoot}`);
  }
  if (!existsSync(config.projectsRegistryPath)) {
    throw new Error(`Missing projects registry: ${config.projectsRegistryPath}`);
  }
  for (const repo of config.repoTargets) {
    const remoteBranch = repo.requiredEndState.remoteRef.replace(/^origin\//, "");
    const authCheck = await runCommand(
      ["git", "ls-remote", repo.originUrl, remoteBranch],
      { cwd: config.workspaceRoot, allowFailure: true },
    );
    if (authCheck.exitCode !== 0) {
      throw new Error(`Git auth or remote lookup failed for ${repo.originUrl}`);
    }
  }
  return {
    requiredCommands,
    githubCredentialRoot: config.githubCredentialRoot,
    projectsRegistryPath: config.projectsRegistryPath,
    repoOrigins: config.repoTargets.map((repo) => repo.originUrl),
  };
}

async function installDependencies(
  config: WorkerSetupScriptConfig,
): Promise<Record<string, unknown>> {
  const result = await runCommand(config.dependencyInstallCommand, {
    cwd: config.dashboardRepoPath,
  });
  return {
    command: config.dependencyInstallCommand,
    cwd: config.dashboardRepoPath,
    stdoutBytes: result.stdout.length,
    stderrBytes: result.stderr.length,
  };
}

async function syncRepo(
  repo: RepoTarget,
  config: WorkerSetupScriptConfig,
): Promise<RepoSyncResult> {
  const repoPath = repo.localPath;
  let cloneMode: "cloned" | "existing" = "existing";
  if (!existsSync(repoPath)) {
    ensureDir(dirname(repoPath));
    await runCommand(["git", "clone", repo.originUrl, repoPath], {
      cwd: config.workspaceRoot,
    });
    cloneMode = "cloned";
  }

  const cleanBefore = (await captureGitStatus(repoPath)) === "";
  if (config.requireCleanRepos && !cleanBefore) {
    return {
      repoName: repo.name,
      originUrl: repo.originUrl,
      localPath: repoPath,
      cloneMode,
      desiredRemoteRef: repo.desiredRemoteRef,
      actualRemoteRef: await currentRef(repoPath),
      cleanBeforeSync: false,
      cleanAfterSync: null,
      endedOnRequiredRef: false,
      failureDetail: {
        repoName: repo.name,
        localPath: repoPath,
        stage: "repo-preflight",
        failureKind: "dirty-working-tree",
        expectedRemoteRef: repo.requiredEndState.remoteRef,
        actualRemoteRef: await currentRef(repoPath),
        cleanBeforeSync: false,
        cleanAfterSync: null,
        recoverable: true,
        notes: "Working tree is dirty and requireCleanRepos is enabled.",
      },
      notes: "Repo preflight failed.",
    };
  }

  await runCommand(["git", "fetch", "origin", "--prune"], { cwd: repoPath });
  await runCommand(
    ["git", "checkout", "-B", config.developmentBranch, repo.desiredRemoteRef],
    { cwd: repoPath },
  );
  await runCommand(["git", "reset", "--hard", repo.desiredRemoteRef], {
    cwd: repoPath,
  });
  if (config.cleanUntracked) {
    await runCommand(["git", "clean", "-fd"], { cwd: repoPath });
  }

  const actualRemoteRef = await currentRef(repoPath);
  const cleanAfter = (await captureGitStatus(repoPath)) === "";
  const endedOnRequiredRef = actualRemoteRef === config.developmentBranch;
  const failureDetail =
    endedOnRequiredRef
      ? null
      : {
          repoName: repo.name,
          localPath: repoPath,
          stage: "repo-sync",
          failureKind: "ref-mismatch",
          expectedRemoteRef: repo.requiredEndState.remoteRef,
          actualRemoteRef,
          cleanBeforeSync: cleanBefore,
          cleanAfterSync: cleanAfter,
          recoverable: true,
          notes: "Repo did not end on the required local branch after sync.",
        };

  return {
    repoName: repo.name,
    originUrl: repo.originUrl,
    localPath: repoPath,
    cloneMode,
    desiredRemoteRef: repo.desiredRemoteRef,
    actualRemoteRef,
    cleanBeforeSync: cleanBefore,
    cleanAfterSync: cleanAfter,
    endedOnRequiredRef,
    failureDetail,
    notes: endedOnRequiredRef ? "Repo synchronized to development." : "Repo synchronization failed.",
  };
}

async function startDashboard(config: WorkerSetupScriptConfig): Promise<{
  child: ReturnType<typeof spawn>;
  result: DashboardLaunchResult;
}> {
  ensureDir(config.screenshotDir);
  const logPath = resolve(config.screenshotDir, "dashboard.log");
  const stdoutFd = openSync(logPath, "a");
  const stderrFd = openSync(logPath, "a");
  const child = spawn(config.dashboardStartCommand[0], config.dashboardStartCommand.slice(1), {
    cwd: config.dashboardRepoPath,
    env: process.env,
    stdio: ["ignore", stdoutFd, stderrFd],
  });
  const dashboardUrl = `http://127.0.0.1:${config.dashboardPort}`;
  const deadline = nowMs() + 120_000;
  while (nowMs() < deadline) {
    try {
      const response = await fetch(dashboardUrl);
      if (response.ok) {
        return {
          child,
          result: {
            dashboardPort: config.dashboardPort,
            dashboardUrl,
            pid: child.pid ?? -1,
            ready: true,
            readyAtMs: nowMs(),
            logPath,
            notes: "Dashboard responded on localhost.",
          },
        };
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Dashboard did not become ready at ${dashboardUrl}`);
}

async function runAgentBrowserVerification(
  config: WorkerSetupScriptConfig,
  url: string,
  screenshotPath: string,
  stepId: string,
): Promise<{ result: BrowserVerificationResult; artifact: ScreenshotArtifact }> {
  const sessionName = `worker-setup-${stepId}`;
  await runCommand([
    config.agentBrowserPath,
    "--session",
    sessionName,
    "set",
    "viewport",
    "1440",
    "900",
  ]);
  await runCommand([
    config.agentBrowserPath,
    "--session",
    sessionName,
    "open",
    url,
  ]);
  await runCommand([
    config.agentBrowserPath,
    "--session",
    sessionName,
    "wait",
    "1500",
  ]);
  const titleResult = await runCommand([
    config.agentBrowserPath,
    "--session",
    sessionName,
    "get",
    "title",
  ]);
  await runCommand([
    config.agentBrowserPath,
    "--session",
    sessionName,
    "screenshot",
    screenshotPath,
  ]);
  await runCommand([
    config.agentBrowserPath,
    "--session",
    sessionName,
    "close",
  ], { allowFailure: true });

  const capturedAtMs = nowMs();
  return {
    result: {
      toolName: "agent-browser",
      url,
      viewport: DEFAULT_VIEWPORT,
      screenshotPath,
      screenshotTaken: true,
      title: titleResult.stdout.trim(),
      success: true,
      notes: "Direct browser verification completed.",
    },
    artifact: {
      path: screenshotPath,
      ownerStep: stepId,
      label: basename(screenshotPath),
      viewport: DEFAULT_VIEWPORT,
      capturedAtMs,
      sourceUrl: url,
    },
  };
}

async function runProviderVerification(
  config: WorkerSetupScriptConfig,
  providerKind: "codex" | "claude",
  promptSpec: WorkerPromptSpec,
  screenshotPath: string,
): Promise<{ result: ProviderVerificationResult; artifact: ScreenshotArtifact }> {
  const command =
    providerKind === "codex"
      ? [...config.codexCommand, promptSpec.resolvedText]
      : [...config.claudeCommand, promptSpec.resolvedText];
  const repoRoot = config.dashboardRepoPath;
  const before = await captureGitStatus(repoRoot);
  await runCommand(command, { cwd: repoRoot });
  const after = await captureGitStatus(repoRoot);
  if (before !== after) {
    throw new Error(`${providerKind} verification mutated git state.`);
  }
  if (!existsSync(screenshotPath)) {
    throw new Error(`${providerKind} verification did not create screenshot ${screenshotPath}`);
  }

  const browserVerification: BrowserVerificationResult = {
    toolName: providerKind,
    url: `http://127.0.0.1:${config.dashboardPort}`,
    viewport: DEFAULT_VIEWPORT,
    screenshotPath,
    screenshotTaken: true,
    title: "",
    success: true,
    notes: `${providerKind} verification completed.`,
  };
  const artifact: ScreenshotArtifact = {
    path: screenshotPath,
    ownerStep: `${providerKind}-verification`,
    label: basename(screenshotPath),
    viewport: DEFAULT_VIEWPORT,
    capturedAtMs: nowMs(),
    sourceUrl: `http://127.0.0.1:${config.dashboardPort}`,
  };
  return {
    result: {
      providerKind,
      invocation: {
        providerKind,
        command,
        cwd: repoRoot,
        promptId: promptSpec.promptId,
        promptSource: promptSpec.sourceRef,
        resolvedPromptText: promptSpec.resolvedText,
        agentBrowserPath: config.agentBrowserPath,
      },
      browserVerification,
      success: true,
      notes: `${providerKind} provider screenshot verified.`,
      mutatesRepoState: false,
      mutatesDashboardConfig: false,
    },
    artifact,
  };
}

function stopProcess(child: ReturnType<typeof spawn> | null): void {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
}

async function runPhase<T>(
  stepId: string,
  phase: string,
  inputs: Record<string, unknown>,
  repoResults: RepoSyncResult[],
  action: () => Promise<T>,
): Promise<{ phaseResult: WorkerSetupPhaseResult; value: T }> {
  const startedAtMs = nowMs();
  try {
    const value = await action();
    const finishedAtMs = nowMs();
    const phaseResult: WorkerSetupPhaseResult = {
      stepId,
      phase,
      status: "success",
      startedAtMs,
      finishedAtMs,
      durationMs: finishedAtMs - startedAtMs,
      inputs,
      outputs: value && typeof value === "object" ? (value as Record<string, unknown>) : { value },
      repoResults,
      error: null,
    };
    emitPhase(phaseResult);
    return { phaseResult, value };
  } catch (error) {
    const finishedAtMs = nowMs();
    const phaseResult: WorkerSetupPhaseResult = {
      stepId,
      phase,
      status: "failure",
      startedAtMs,
      finishedAtMs,
      durationMs: finishedAtMs - startedAtMs,
      inputs,
      outputs: {},
      repoResults,
      error: error instanceof Error ? error.message : String(error),
    };
    emitPhase(phaseResult);
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      phaseResult,
    });
  }
}

async function main(): Promise<void> {
  const config = await parseArgs(process.argv.slice(2));
  ensureDir(config.screenshotDir);

  const warnings: string[] = [];
  const errors: string[] = [];
  const artifacts: ScreenshotArtifact[] = [];
  const browserChecks: BrowserVerificationResult[] = [];
  const providerChecks: ProviderVerificationResult[] = [];
  const phaseResults: WorkerSetupPhaseResult[] = [];
  let repoResults: RepoSyncResult[] = [];
  let dashboardChild: ReturnType<typeof spawn> | null = null;
  let dashboard: DashboardLaunchResult | null = null;

  try {
    const prereq = await runPhase(
      "prerequisite-validation",
      "prerequisite-validation",
      { workspaceRoot: config.workspaceRoot },
      repoResults,
      async () => await validatePrerequisites(config),
    );
    phaseResults.push(prereq.phaseResult);

    const dependencyPhase = await runPhase(
      "dependency-install",
      "dependency-install",
      { command: config.dependencyInstallCommand, cwd: config.dashboardRepoPath },
      repoResults,
      async () => await installDependencies(config),
    );
    phaseResults.push(dependencyPhase.phaseResult);

    const repoPhase = await runPhase(
      "repo-sync",
      "repo-sync",
      { repoTargets: config.repoTargets.map((repo) => repo.localPath) },
      repoResults,
      async () => {
        repoResults = [];
        for (const repo of config.repoTargets) {
          const result = await syncRepo(repo, config);
          repoResults.push(result);
          if (result.failureDetail) {
            throw new Error(result.failureDetail.notes);
          }
        }
        return { repoResults };
      },
    );
    phaseResults.push(repoPhase.phaseResult);

    const dashboardPhase = await runPhase(
      "dashboard-launch",
      "dashboard-launch",
      { dashboardPort: config.dashboardPort },
      repoResults,
      async () => {
        const launched = await startDashboard(config);
        dashboardChild = launched.child;
        dashboard = launched.result;
        return dashboard;
      },
    );
    phaseResults.push(dashboardPhase.phaseResult);

    const directScreenshot = resolve(config.screenshotDir, "direct-dashboard.png");
    const directPhase = await runPhase(
      "direct-browser-verification",
      "direct-browser-verification",
      { dashboardUrl: dashboard.dashboardUrl, screenshotPath: directScreenshot },
      repoResults,
      async () => {
        const verification = await runAgentBrowserVerification(
          config,
          dashboard.dashboardUrl,
          directScreenshot,
          "direct-browser-verification",
        );
        browserChecks.push(verification.result);
        artifacts.push(verification.artifact);
        return verification.result;
      },
    );
    phaseResults.push(directPhase.phaseResult);

    const codexPhase = await runPhase(
      "codex-verification",
      "codex-verification",
      { promptId: config.codexPrompt.promptId },
      repoResults,
      async () => {
        const verification = await runProviderVerification(
          config,
          "codex",
          config.codexPrompt,
          resolve(config.screenshotDir, "codex-dashboard.png"),
        );
        providerChecks.push(verification.result);
        artifacts.push(verification.artifact);
        return verification.result;
      },
    );
    phaseResults.push(codexPhase.phaseResult);

    const claudePhase = await runPhase(
      "claude-verification",
      "claude-verification",
      { promptId: config.claudePrompt.promptId },
      repoResults,
      async () => {
        const verification = await runProviderVerification(
          config,
          "claude",
          config.claudePrompt,
          resolve(config.screenshotDir, "claude-dashboard.png"),
        );
        providerChecks.push(verification.result);
        artifacts.push(verification.artifact);
        return verification.result;
      },
    );
    phaseResults.push(claudePhase.phaseResult);

    const summary: WorkerSetupSummary = {
      success: true,
      workspaceRoot: config.workspaceRoot,
      repos: repoResults,
      dashboard,
      browserChecks,
      providerChecks,
      artifacts,
      warnings,
      errors,
      phaseResults,
      failure: null,
    };
    if (config.summaryFile) {
      ensureDir(dirname(config.summaryFile));
      writeFileSync(config.summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({ type: "summary", summary }, null, 2));
  } catch (error) {
    const phaseResult = (error as { phaseResult?: WorkerSetupPhaseResult }).phaseResult;
    if (phaseResult) {
      phaseResults.push(phaseResult);
    }
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    const failure: WorkerSetupFailureSummary = {
      failedStepId: phaseResult?.stepId ?? "unknown",
      failedPhase: phaseResult?.phase ?? "unknown",
      failedAtMs: nowMs(),
      reason: message,
      recoverable: true,
      resumeStepId: phaseResult?.stepId ?? "unknown",
      rerunCommand: `bun ./scripts/worker-setup-direct-development.ts`,
      rerunCwd: config.workspaceRoot,
      partialArtifacts: artifacts,
      partialRepos: repoResults,
      nextAction: "Fix the reported failing phase and rerun the script.",
    };
    const summary: WorkerSetupSummary = {
      success: false,
      workspaceRoot: config.workspaceRoot,
      repos: repoResults,
      dashboard,
      browserChecks,
      providerChecks,
      artifacts,
      warnings,
      errors,
      phaseResults,
      failure,
    };
    if (config.summaryFile) {
      ensureDir(dirname(config.summaryFile));
      writeFileSync(config.summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({ type: "summary", summary }, null, 2));
    process.exitCode = 1;
  } finally {
    if (!config.keepDashboardRunning) {
      stopProcess(dashboardChild);
    }
  }
}

await main();
