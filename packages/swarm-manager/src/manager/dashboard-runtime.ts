import {
  appendFileSync,
  rmSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_DASHBOARD_RUNTIME_DIR,
  DEFAULT_DASHBOARD_SESSION_STORE_PATH,
} from "../paths.js";

export type DashboardRuntimeConfig = {
  port: number;
  managerUrl: string;
  useCloudflared: boolean;
  forceRebuild?: boolean;
  accessApiBaseUrl?: string;
  enrollmentSecret?: string;
};

type DashboardRuntimeState = {
  dashboardPid: number;
  dashboardLogPath: string;
  localUrl: string;
  cloudflaredPid?: number;
  cloudflaredLogPath?: string;
  tunnelPid?: number;
  tunnelLogPath?: string;
  tunnelProvider?: "cloudflared" | "localhost-run";
  publicUrl?: string;
  tunnelCreatedAtMs?: number;
  lastTunnelReplaceAtMs?: number;
};

type DashboardSessionRecord = {
  tokenHash: string;
  expiresAtMs: number;
  createdAtMs: number;
  kind: "bootstrap" | "browser";
  usedAtMs?: number;
  lastAccessAtMs?: number;
  idleTimeoutMs?: number;
};

type DashboardSessionStore = {
  sessions: DashboardSessionRecord[];
};

const sourceDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(sourceDir, "../../../..");
const dashboardDistDir = resolve(repoRoot, "apps/dashboard-app/dist");
const dashboardServerEntry = resolve(repoRoot, "packages/dashboard/src/server.ts");
const runtimeDir = process.env.DASHBOARD_RUNTIME_DIR?.trim() || DEFAULT_DASHBOARD_RUNTIME_DIR;
const runtimeStatePath = resolve(runtimeDir, "runtime-state.json");
const dashboardLogPath = resolve(runtimeDir, "dashboard.log");
const cloudflaredLogPath = resolve(runtimeDir, "cloudflared.log");
const localhostRunLogPath = resolve(runtimeDir, "localhost-run.log");
const bootstrapContextPath =
  process.env.SWARM_BOOTSTRAP_CONTEXT_PATH?.trim() || DEFAULT_BOOTSTRAP_CONTEXT_PATH;
const sessionStorePath =
  process.env.DASHBOARD_SESSION_STORE_PATH?.trim() || DEFAULT_DASHBOARD_SESSION_STORE_PATH;
const dashboardRecoveryMonitorEntry = resolve(
  repoRoot,
  "packages/swarm-manager/src/manager/monitor-dashboard-recovery.ts",
);
const browserSessionIdleTimeoutMs =
  Math.max(
    60,
    Number.parseInt(
      process.env.DASHBOARD_SESSION_IDLE_TIMEOUT_SECONDS ?? "900",
      10,
    ) || 900,
  ) * 1000;
const browserSessionRenewIntervalMs =
  Math.max(
    30,
    Number.parseInt(
      process.env.DASHBOARD_SESSION_RENEW_INTERVAL_SECONDS ?? "300",
      10,
    ) || 300,
  ) * 1000;
const SYSTEM_EVENT_LOG_PATH =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() || "/home/ec2-user/state/logs/system-events.log";
const dashboardRecoveryIncidentDir = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-recovery-incidents",
);
const dashboardHelpRequestDir = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-help-requests",
);
const dashboardRecoveryMonitorLogPath = resolve(runtimeDir, "dashboard-recovery-monitor.log");
const dashboardRecoveryMonitorLockPath = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-recovery-monitor.lock",
);
const quickTunnelReplacementCooldownMs =
  Math.max(
    300,
    Number.parseInt(process.env.DASHBOARD_TUNNEL_REPLACEMENT_COOLDOWN_SECONDS ?? "1800", 10) ||
      1800,
  ) * 1000;
const sustainedPublicFailureReplacementMs =
  Math.max(
    30,
    Number.parseInt(process.env.DASHBOARD_TUNNEL_SUSTAINED_FAILURE_SECONDS ?? "120", 10) || 120,
  ) * 1000;

function logSystemStep(source: string, message: string): void {
  const line = `[${new Date().toISOString()}:${source}] ${message}`;
  mkdirSync("/home/ec2-user/state/logs", { recursive: true });
  appendFileSync(SYSTEM_EVENT_LOG_PATH, `${line}\n`);
  console.error(line);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function ensureParentDir(path: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
}

function runChecked(
  command: string[],
  cwd = repoRoot,
  env?: Record<string, string>,
): void {
  const result = Bun.spawnSync(command, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`command failed: ${command.join(" ")}`);
  }
}

function isPidRunning(pid?: number): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRuntimeState(): DashboardRuntimeState | null {
  if (!existsSync(runtimeStatePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(runtimeStatePath, "utf8")) as DashboardRuntimeState;
  } catch {
    return null;
  }
}

function writeRuntimeState(state: DashboardRuntimeState): void {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(runtimeStatePath, JSON.stringify(state, null, 2));
}

function clearRuntimeState(): void {
  try {
    rmSync(runtimeStatePath, { force: true });
  } catch {}
}

function getLastTunnelReplacementAttemptAtMs(state: DashboardRuntimeState | null): number {
  return (
    state?.lastTunnelReplaceAtMs ??
    state?.tunnelCreatedAtMs ??
    0
  );
}

function canAttemptQuickTunnelReplacement(state: DashboardRuntimeState | null, now: number): boolean {
  return now - getLastTunnelReplacementAttemptAtMs(state) >= quickTunnelReplacementCooldownMs;
}

function extractQuickTunnelUrls(): string[] {
  if (!existsSync(cloudflaredLogPath)) {
    return [];
  }

  try {
    const log = readFileSync(cloudflaredLogPath, "utf8");
    const matches = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g) ?? [];
    const deduped = new Set<string>();

    for (const match of matches) {
      const value = match.trim();
      if (value) {
        deduped.add(value);
      }
    }

    return [...deduped];
  } catch {
    return [];
  }
}

function discoverPidByPattern(pattern: RegExp): number | null {
  const shellPattern = shellQuote(pattern.source);
  const result = Bun.spawnSync(
    ["bash", "-lc", `ps -eo pid=,args= | rg --color never ${shellPattern}`],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  if (result.exitCode !== 0) {
    return null;
  }

  const output = result.stdout.toString().trim();
  if (!output) {
    return null;
  }

  for (const line of output.split("\n").reverse()) {
    const [pidToken] = line.trim().split(/\s+/, 1);
    const pid = Number.parseInt(pidToken ?? "", 10);
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      return pid;
    }
  }

  return null;
}

function listPidsByPattern(pattern: RegExp): number[] {
  const shellPattern = shellQuote(pattern.source);
  const result = Bun.spawnSync(
    ["bash", "-lc", `ps -eo pid=,args= | rg --color never ${shellPattern}`],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  if (result.exitCode !== 0) {
    return [];
  }

  const output = result.stdout.toString().trim();
  if (!output) {
    return [];
  }

  const pids = new Set<number>();
  for (const line of output.split("\n")) {
    const [pidToken] = line.trim().split(/\s+/, 1);
    const pid = Number.parseInt(pidToken ?? "", 10);
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function listCloudflaredTunnelPids(): number[] {
  const result = Bun.spawnSync(["pgrep", "-f", "cloudflared tunnel"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    return [];
  }

  const output = result.stdout.toString().trim();
  if (!output) {
    return [];
  }

  const pids = new Set<number>();
  for (const line of output.split("\n")) {
    const pid = Number.parseInt(line.trim(), 10);
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function listLocalhostRunTunnelPids(): number[] {
  const result = Bun.spawnSync(["pgrep", "-f", "nokey@localhost.run"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    return [];
  }

  const output = result.stdout.toString().trim();
  if (!output) {
    return [];
  }

  const pids = new Set<number>();
  for (const line of output.split("\n")) {
    const pid = Number.parseInt(line.trim(), 10);
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function listTunnelPids(): number[] {
  return [...new Set([...listCloudflaredTunnelPids(), ...listLocalhostRunTunnelPids()])];
}

function getRuntimeTunnelPid(state: DashboardRuntimeState | null): number | undefined {
  return state?.tunnelPid ?? state?.cloudflaredPid;
}

function getRuntimeTunnelLogPath(state: DashboardRuntimeState | null): string | undefined {
  return state?.tunnelLogPath ?? state?.cloudflaredLogPath;
}

function getRuntimeTunnelProvider(
  state: DashboardRuntimeState | null,
): "cloudflared" | "localhost-run" | undefined {
  return state?.tunnelProvider ?? (state?.cloudflaredPid ? "cloudflared" : undefined);
}

function getTunnelCommandPattern(provider?: string, port?: number): RegExp {
  if (provider === "localhost-run") {
    return /ssh .*nokey@localhost\.run/;
  }

  return new RegExp(`cloudflared\\s+tunnel\\s+--url\\s+http:\\/\\/127\\.0\\.0\\.1:${port ?? 3000}`);
}

async function terminatePids(pids: number[], source: string): Promise<void> {
  const unique = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (unique.length === 0) {
    return;
  }

  logSystemStep(source, `start terminate_pids pids=${unique.join(",")}`);
  for (const pid of unique) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  await Bun.sleep(500);

  const stillRunning = unique.filter((pid) => isPidRunning(pid));
  for (const pid of stillRunning) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }

  logSystemStep(source, `exit terminate_pids pids=${unique.join(",")}`);
}

async function terminateDashboardRuntimeProcesses(port: number): Promise<void> {
  const dashboardPids = listPidsByPattern(/packages\/dashboard\/src\/server\.ts/);
  const cloudflaredPids = listPidsByPattern(
    new RegExp(`cloudflared\\s+tunnel\\s+--url\\s+http:\\/\\/127\\.0\\.0\\.1:${port}`),
  );
  const localhostRunPids = listPidsByPattern(/ssh .*nokey@localhost\.run/);

  await terminatePids(dashboardPids, "dashboard-runtime");
  await terminatePids(cloudflaredPids, "dashboard-runtime");
  await terminatePids(localhostRunPids, "dashboard-runtime");
}

function writeDashboardRecoveryIncident(detail: Record<string, unknown>): string {
  mkdirSync(dashboardRecoveryIncidentDir, { recursive: true });
  const path = resolve(
    dashboardRecoveryIncidentDir,
    `${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}.json`,
  );
  writeFileSync(path, `${JSON.stringify(detail, null, 2)}\n`);
  return path;
}

function writeDashboardHelpIncident(detail: Record<string, unknown>): string {
  mkdirSync(dashboardHelpRequestDir, { recursive: true });
  const path = resolve(
    dashboardHelpRequestDir,
    `${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}.json`,
  );
  writeFileSync(path, `${JSON.stringify(detail, null, 2)}\n`);
  return path;
}

function readDashboardRecoveryMonitorLockPid(): number | null {
  if (!existsSync(dashboardRecoveryMonitorLockPath)) {
    return null;
  }

  try {
    const value = readFileSync(dashboardRecoveryMonitorLockPath, "utf8").trim();
    const pid = Number.parseInt(value, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function recoverDashboardRuntimeState(
  config: DashboardRuntimeConfig,
): Promise<DashboardRuntimeState | null> {
  const localUrl = `http://127.0.0.1:${config.port}`;
  const dashboardHealthy = await isDashboardHealthy(config.port);
  if (!dashboardHealthy) {
    return null;
  }

  const dashboardPid =
    discoverPidByPattern(/packages\/dashboard\/src\/server\.ts/) ?? 0;

  if (!config.useCloudflared) {
    return {
      dashboardPid,
      dashboardLogPath,
      localUrl,
    };
  }

  const tunnelLogs: Array<{
    provider: "cloudflared" | "localhost-run";
    logPath: string;
  }> = [
    { provider: "cloudflared", logPath: cloudflaredLogPath },
    { provider: "localhost-run", logPath: localhostRunLogPath },
  ];

  for (const candidateLog of tunnelLogs) {
    if (!existsSync(candidateLog.logPath)) {
      continue;
    }

    let urls: string[] = [];
    try {
      const log = readFileSync(candidateLog.logPath, "utf8");
      urls = [...new Set(log.match(/https:\/\/[a-z0-9.-]+/gi) ?? [])];
    } catch {}

    for (const candidateUrl of urls.reverse()) {
      if (!(await isPublicDashboardReady(candidateUrl))) {
        continue;
      }

      const tunnelPid =
        candidateLog.provider === "cloudflared"
          ? discoverPidByPattern(/cloudflared\s+tunnel\s+--url\s+http:\/\/127\.0\.0\.1:\d+/) ?? 0
          : discoverPidByPattern(/ssh .*nokey@localhost\.run/) ?? 0;

      return {
        dashboardPid,
        dashboardLogPath,
        localUrl,
        tunnelPid,
        tunnelLogPath: candidateLog.logPath,
        tunnelProvider: candidateLog.provider,
        cloudflaredPid: candidateLog.provider === "cloudflared" ? tunnelPid : undefined,
        cloudflaredLogPath:
          candidateLog.provider === "cloudflared" ? cloudflaredLogPath : undefined,
        publicUrl: candidateUrl,
      };
    }
  }

  return null;
}

function readBootstrapContextValue(key: string): string {
  if (!existsSync(bootstrapContextPath)) {
    return "";
  }

  try {
    const payload = JSON.parse(readFileSync(bootstrapContextPath, "utf8")) as Record<
      string,
      unknown
    >;
    const value = payload[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

async function waitForHealth(port: number, maxAttempts = 40): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {}

    await Bun.sleep(500);
  }

  throw new Error("dashboard did not become healthy in time");
}

async function isDashboardHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function isPublicDashboardReady(publicUrl?: string): Promise<boolean> {
  if (!publicUrl) {
    return false;
  }

  try {
    const response = await fetch(`${publicUrl}/api/config`);
    return response.ok;
  } catch {
    return false;
  }
}

async function isExpectedProcess(pid: number | undefined, pattern: RegExp): Promise<boolean> {
  if (!pid || !Number.isInteger(pid) || pid <= 0 || !isPidRunning(pid)) {
    return false;
  }

  const procPath = `/proc/${pid}/cmdline`;
  if (!existsSync(procPath)) {
    return false;
  }

  try {
    const cmdline = readFileSync(procPath, "utf8").replaceAll("\u0000", " ").trim();
    return pattern.test(cmdline);
  } catch {
    return false;
  }
}

async function spawnDetached(
  command: string,
  logPath: string,
  env?: Record<string, string>,
): Promise<number> {
  logSystemStep("dashboard-runtime", `start detached=${command}`);
  ensureParentDir(logPath);
  writeFileSync(logPath, "");

  const processHandle = Bun.spawn(
    ["bash", "-lc", `nohup ${command} >> '${logPath}' 2>&1 < /dev/null & echo $!`],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdout = await new Response(processHandle.stdout).text();
  const stderr = await new Response(processHandle.stderr).text();
  await processHandle.exited;

  if (processHandle.exitCode !== 0) {
    logSystemStep("dashboard-runtime", `error failed_launch=${command}`);
    throw new Error(stderr.trim() || `failed to launch command: ${command}`);
  }

  if (stderr.trim().length > 0) {
    logSystemStep("dashboard-runtime", `error launch_stderr=${stderr.trim()}`);
    throw new Error(stderr.trim());
  }

  const pid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    logSystemStep("dashboard-runtime", `error invalid_pid=${command}`);
    throw new Error(`failed to capture pid for command: ${command}`);
  }

  logSystemStep("dashboard-runtime", `exit detached_pid=${pid} command=${command}`);

  return pid;
}

async function ensureDashboardBuilt(forceRebuild = false): Promise<void> {
  if (!forceRebuild && existsSync(dashboardDistDir)) {
    logSystemStep("dashboard-runtime", "exit dashboard_build=reused");
    return;
  }

  logSystemStep("dashboard-runtime", "start dashboard_build");
  runChecked(["bun", "run", "--filter", "@agent-infrastructure/dashboard-app", "build"]);
  logSystemStep("dashboard-runtime", "exit dashboard_build=completed");
}

async function startDashboardServer(config: DashboardRuntimeConfig): Promise<number> {
  const accessApiBaseUrl =
    config.accessApiBaseUrl?.trim() || readBootstrapContextValue("dashboardAccessApiBaseUrl");
  const enrollmentSecret =
    config.enrollmentSecret?.trim() || readBootstrapContextValue("dashboardEnrollmentSecret");

  const command = ["bun", dashboardServerEntry].map(shellQuote).join(" ");

  logSystemStep("dashboard-runtime", `start dashboard_server port=${config.port}`);
  return spawnDetached(command, dashboardLogPath, {
    DASHBOARD_PORT: String(config.port),
    MANAGER_INTERNAL_URL: config.managerUrl,
    DASHBOARD_ACCESS_API_BASE_URL: accessApiBaseUrl,
    DASHBOARD_ENROLLMENT_SECRET: enrollmentSecret,
  });
}

async function waitForUrlInLog(
  logPath: string,
  source: string,
  timeoutMs: number,
  pattern: RegExp,
): Promise<string> {
  const attempts = Math.ceil(timeoutMs / 500);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const log = readFileSync(logPath, "utf8");
      const match = log.match(pattern);
      if (match?.[0]) {
        return match[0];
      }
    } catch {}

    await Bun.sleep(500);
  }

  logSystemStep("dashboard-runtime", `error ${source}_no_url`);
  throw new Error(`${source} did not return a public URL in time`);
}

async function startCloudflared(port: number): Promise<{ pid: number; url: string }> {
  const command = [
    "cloudflared",
    "tunnel",
    "--url",
    `http://127.0.0.1:${port}`,
  ]
    .map(shellQuote)
    .join(" ");

  const pid = await spawnDetached(command, cloudflaredLogPath);
  const url = await waitForUrlInLog(
    cloudflaredLogPath,
    "cloudflared",
    20_000,
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
  );

  return {
    pid,
    url,
  };
}

async function startLocalhostRun(port: number): Promise<{ pid: number; url: string }> {
  const command = [
    "ssh",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ExitOnForwardFailure=yes",
    "-R",
    `80:127.0.0.1:${port}`,
    "nokey@localhost.run",
  ]
    .map(shellQuote)
    .join(" ");

  const pid = await spawnDetached(command, localhostRunLogPath);
  const url = await waitForUrlInLog(
    localhostRunLogPath,
    "localhost_run",
    25_000,
    /https:\/\/[a-z0-9.-]+/i,
  );

  return {
    pid,
    url,
  };
}

async function startTemporaryTunnel(
  port: number,
): Promise<{
  pid: number;
  url: string;
  provider: "cloudflared" | "localhost-run";
  logPath: string;
}> {
  try {
    const tunnel = await startCloudflared(port);
    return {
      pid: tunnel.pid,
      url: tunnel.url,
      provider: "cloudflared",
      logPath: cloudflaredLogPath,
    };
  } catch (error) {
    logSystemStep(
      "dashboard-runtime",
      `warn cloudflared_start_failed detail=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const tunnel = await startLocalhostRun(port);
  logSystemStep(
    "dashboard-runtime",
    `exit fallback_tunnel_provider=localhost-run public_url=${tunnel.url}`,
  );
  return {
    pid: tunnel.pid,
    url: tunnel.url,
    provider: "localhost-run",
    logPath: localhostRunLogPath,
  };
}

export async function ensureDashboardRuntime(
  config: DashboardRuntimeConfig,
): Promise<DashboardRuntimeState> {
  logSystemStep("dashboard-runtime", `setup.start port=${config.port} cloudflared=${config.useCloudflared}`);
  mkdirSync(runtimeDir, { recursive: true });

  const currentState =
    readRuntimeState() ?? (await recoverDashboardRuntimeState(config));
  const dashboardRunning = await isExpectedProcess(
    currentState?.dashboardPid,
    /packages\/dashboard\/src\/server\.ts/,
  );
  const discoveredDashboardPid =
    dashboardRunning
      ? (currentState?.dashboardPid ?? 0)
      : discoverPidByPattern(/packages\/dashboard\/src\/server\.ts/) ?? 0;
  const cloudflaredRunning = await isExpectedProcess(
    getRuntimeTunnelPid(currentState),
    getTunnelCommandPattern(getRuntimeTunnelProvider(currentState), config.port),
  );
  const dashboardHealthy = await isDashboardHealthy(config.port);
  const publicDashboardReady =
    config.useCloudflared && typeof currentState?.publicUrl === "string"
      ? await isPublicDashboardReady(currentState.publicUrl)
      : false;

  const canReuseDashboard =
    currentState &&
    (dashboardRunning || dashboardHealthy) &&
    (!config.useCloudflared ||
      ((cloudflaredRunning || publicDashboardReady) &&
        typeof currentState.publicUrl === "string" &&
        currentState.publicUrl.trim().length > 0));

  if (canReuseDashboard) {
    logSystemStep("dashboard-runtime", "exit runtime=reused-current-state");
    writeRuntimeState(currentState);
    return currentState;
  }

  const recoveredState = await recoverDashboardRuntimeState(config);
  if (recoveredState) {
    logSystemStep("dashboard-runtime", "exit runtime=recovered-state");
    writeRuntimeState(recoveredState);
    return recoveredState;
  }

  clearRuntimeState();

  await ensureDashboardBuilt(config.forceRebuild === true);

  const dashboardPid = dashboardHealthy
    ? dashboardRunning
      ? (currentState?.dashboardPid as number)
      : discoveredDashboardPid
    : await startDashboardServer(config);

  await waitForHealth(config.port);

  let nextState: DashboardRuntimeState = {
    dashboardPid,
    dashboardLogPath,
    localUrl: `http://127.0.0.1:${config.port}`,
  };

  if (!config.useCloudflared) {
    logSystemStep("dashboard-runtime", "setup.complete local_only=true");
    writeRuntimeState(nextState);
    return nextState;
  }

  if (cloudflaredRunning && currentState?.publicUrl && publicDashboardReady) {
    nextState = {
      ...nextState,
      tunnelPid: getRuntimeTunnelPid(currentState),
      tunnelLogPath: getRuntimeTunnelLogPath(currentState) ?? cloudflaredLogPath,
      tunnelProvider: getRuntimeTunnelProvider(currentState),
      cloudflaredPid:
        getRuntimeTunnelProvider(currentState) === "cloudflared"
          ? getRuntimeTunnelPid(currentState)
          : undefined,
      cloudflaredLogPath:
        getRuntimeTunnelProvider(currentState) === "cloudflared"
          ? cloudflaredLogPath
          : undefined,
      publicUrl: currentState.publicUrl,
      tunnelCreatedAtMs: currentState.tunnelCreatedAtMs,
      lastTunnelReplaceAtMs: currentState.lastTunnelReplaceAtMs,
    };
    logSystemStep("dashboard-runtime", "exit cloudflared=reused");
    writeRuntimeState(nextState);
    return nextState;
  }

  const tunnel = await startTemporaryTunnel(config.port);
  const tunnelCreatedAtMs = Date.now();
  nextState = {
    ...nextState,
    tunnelPid: tunnel.pid,
    tunnelLogPath: tunnel.logPath,
    tunnelProvider: tunnel.provider,
    cloudflaredPid: tunnel.provider === "cloudflared" ? tunnel.pid : undefined,
    cloudflaredLogPath: tunnel.provider === "cloudflared" ? cloudflaredLogPath : undefined,
    publicUrl: tunnel.url,
    tunnelCreatedAtMs,
    lastTunnelReplaceAtMs: tunnelCreatedAtMs,
  };
  logSystemStep("dashboard-runtime", `setup.complete public_url=${tunnel.url}`);
  writeRuntimeState(nextState);
  return nextState;
}

function readSessionStore(): DashboardSessionStore {
  if (!existsSync(sessionStorePath)) {
    return { sessions: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(sessionStorePath, "utf8")) as DashboardSessionStore;
    return Array.isArray(parsed.sessions) ? parsed : { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

function writeSessionStore(store: DashboardSessionStore): void {
  mkdirSync(resolve(sessionStorePath, ".."), { recursive: true });
  writeFileSync(sessionStorePath, JSON.stringify(store, null, 2));
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validateDashboardSessionToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }

  const currentTime = Date.now();
  const tokenHash = hashSessionToken(trimmed);
  const nextStore: DashboardSessionStore = { sessions: [] };
  let matched = false;

  for (const session of readSessionStore().sessions) {
    if (session.expiresAtMs <= currentTime) {
      continue;
    }

    if (session.kind === "browser" && session.tokenHash === tokenHash) {
      matched = true;
      const idleTimeoutMs = session.idleTimeoutMs ?? browserSessionIdleTimeoutMs;
      const lastAccessAtMs = session.lastAccessAtMs ?? session.createdAtMs;
      if (currentTime - lastAccessAtMs >= browserSessionRenewIntervalMs) {
        nextStore.sessions.push({
          ...session,
          lastAccessAtMs: currentTime,
          expiresAtMs: currentTime + idleTimeoutMs,
          idleTimeoutMs,
        });
      } else {
        nextStore.sessions.push(session);
      }
      continue;
    }

    nextStore.sessions.push(session);
  }

  writeSessionStore(nextStore);
  return matched;
}

export function exchangeDashboardSessionKey(sessionKey: string): {
  sessionToken: string;
  expiresAtMs: number;
} | null {
  const trimmed = sessionKey.trim();
  if (!trimmed) {
    return null;
  }

  const currentTime = Date.now();
  const bootstrapHash = hashSessionToken(trimmed);
  const nextStore: DashboardSessionStore = { sessions: [] };
  let matchedBootstrap = false;
  let matchedExpiry = 0;

  for (const session of readSessionStore().sessions) {
    if (session.expiresAtMs <= currentTime) {
      continue;
    }

    if (
      session.kind === "bootstrap" &&
      !session.usedAtMs &&
      session.tokenHash === bootstrapHash
    ) {
      matchedBootstrap = true;
      matchedExpiry = session.expiresAtMs;
      nextStore.sessions.push({
        ...session,
        usedAtMs: currentTime,
      });
      continue;
    }

    nextStore.sessions.push(session);
  }

  if (!matchedBootstrap) {
    writeSessionStore(nextStore);
    return null;
  }

  const sessionToken = randomBytes(32).toString("hex");
  const browserExpiresAtMs = currentTime + browserSessionIdleTimeoutMs;
  nextStore.sessions.push({
    tokenHash: hashSessionToken(sessionToken),
    expiresAtMs: browserExpiresAtMs,
    createdAtMs: currentTime,
    kind: "browser",
    lastAccessAtMs: currentTime,
    idleTimeoutMs: browserSessionIdleTimeoutMs,
  });
  writeSessionStore(nextStore);

  return {
    sessionToken,
    expiresAtMs: browserExpiresAtMs,
  };
}

export async function issueDashboardSession(input?: {
  port?: number;
  managerUrl?: string;
  ttlSeconds?: number;
}): Promise<{
  token: string;
  expiresAtMs: number;
  localUrl: string;
  publicUrl: string;
  sessionUrl: string;
  dashboardPid: number;
  cloudflaredPid: number;
}> {
  logSystemStep("dashboard-runtime", "start issue_dashboard_session");
  const runtime = await ensureDashboardRuntime({
    port: input?.port ?? 3000,
    managerUrl: input?.managerUrl ?? "http://127.0.0.1:8787",
    useCloudflared: true,
  });

  const tunnelPid = runtime.tunnelPid ?? runtime.cloudflaredPid;
  if (!runtime.publicUrl || !tunnelPid) {
    throw new Error("dashboard runtime did not produce a public URL");
  }

  const currentTime = Date.now();
  const ttlMs = Math.max(60, input?.ttlSeconds ?? 900) * 1000;
  const token = randomBytes(32).toString("hex");
  const expiresAtMs = currentTime + ttlMs;
  const nextSessions = readSessionStore().sessions.filter(
    (session) => session.expiresAtMs > currentTime,
  );

  nextSessions.push({
    tokenHash: hashSessionToken(token),
    expiresAtMs,
    createdAtMs: currentTime,
    kind: "bootstrap",
  });
  writeSessionStore({ sessions: nextSessions });

  const sessionUrl = `${runtime.publicUrl}/?sessionKey=${token}`;
  logSystemStep("dashboard-runtime", `exit issue_dashboard_session expires_at_ms=${expiresAtMs}`);
  return {
    token,
    expiresAtMs,
    localUrl: runtime.localUrl,
    publicUrl: runtime.publicUrl,
    sessionUrl,
    dashboardPid: runtime.dashboardPid,
    cloudflaredPid: tunnelPid,
  };
}

export async function waitForPublicDashboardReady(
  publicUrl: string,
  maxAttempts = 30,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isPublicDashboardReady(publicUrl)) {
      return;
    }
    await Bun.sleep(delayMs);
  }

  throw new Error("dashboard public URL did not become ready in time");
}

export function requestDashboardHelp(input: {
  reason?: string;
  dashboardUrl?: string;
  detail?: string;
}): string {
  const payload = {
    at: new Date().toISOString(),
    reason: input.reason?.trim() || "dashboard-recovery-failed",
    dashboardUrl: input.dashboardUrl?.trim() || "",
    detail: input.detail?.trim() || "",
  };
  const incidentPath = writeDashboardHelpIncident(payload);
  logSystemStep(
    "dashboard-help",
    `requested reason=${payload.reason} dashboard_url=${payload.dashboardUrl || "unknown"} incident=${incidentPath}`,
  );
  return incidentPath;
}

export async function startDashboardRecoveryMonitor(input: {
  port?: number;
  managerUrl?: string;
  publicUrl: string;
}): Promise<number> {
  const existingPid = readDashboardRecoveryMonitorLockPid();
  if (existingPid && isPidRunning(existingPid)) {
    logSystemStep("dashboard-recovery-monitor", `exit existing_pid=${existingPid}`);
    return existingPid;
  }

  const command = [
    "bun",
    dashboardRecoveryMonitorEntry,
    "--port",
    String(input.port ?? 3000),
    "--manager-url",
    input.managerUrl ?? "http://127.0.0.1:8787",
    "--public-url",
    input.publicUrl,
  ]
    .map(shellQuote)
    .join(" ");

  logSystemStep("dashboard-recovery-monitor", `start public_url=${input.publicUrl}`);
  return spawnDetached(command, dashboardRecoveryMonitorLogPath, {
    AGENT_STATE_DIR: process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
    SYSTEM_EVENT_LOG_PATH,
  });
}

export async function runDashboardRecoveryMonitor(input: {
  port?: number;
  managerUrl?: string;
  publicUrl: string;
}): Promise<void> {
  const port = input.port ?? 3000;
  const managerUrl = input.managerUrl ?? "http://127.0.0.1:8787";
  let expectedPublicUrl = input.publicUrl.trim();
  const pid = process.pid;
  const lockPid = readDashboardRecoveryMonitorLockPid();

  if (lockPid && lockPid !== pid && isPidRunning(lockPid)) {
    logSystemStep("dashboard-recovery-monitor", `exit lock_held_by=${lockPid}`);
    return;
  }

  ensureParentDir(dashboardRecoveryMonitorLockPath);
  writeFileSync(dashboardRecoveryMonitorLockPath, `${pid}\n`);

  try {
    logSystemStep(
      "dashboard-recovery-monitor",
      `start pid=${pid} public_url=${expectedPublicUrl} port=${port}`,
    );
    const monitorDeadline = Date.now() + 90_000;
    let publicFailureSinceMs: number | null = null;
    while (Date.now() < monitorDeadline) {
      const currentState = readRuntimeState();
      if (currentState?.publicUrl?.trim() !== expectedPublicUrl) {
        logSystemStep(
          "dashboard-recovery-monitor",
          `exit stale_public_url expected=${expectedPublicUrl} current=${currentState?.publicUrl ?? "missing"}`,
        );
        return;
      }

      const dashboardHealthy = await isDashboardHealthy(port);
      const publicReady = await isPublicDashboardReady(expectedPublicUrl);
      const cloudflaredRunning = await isExpectedProcess(
        getRuntimeTunnelPid(currentState),
        getTunnelCommandPattern(getRuntimeTunnelProvider(currentState), port),
      );
      const now = Date.now();

      if (!dashboardHealthy) {
        await terminatePids(
          currentState?.dashboardPid ? [currentState.dashboardPid] : [],
          "dashboard-recovery-monitor",
        );
        const dashboardPid = await startDashboardServer({
          port,
          managerUrl,
          useCloudflared: true,
        });
        await waitForHealth(port);
        writeRuntimeState({
          dashboardPid,
          dashboardLogPath,
          localUrl: `http://127.0.0.1:${port}`,
          tunnelPid: getRuntimeTunnelPid(currentState),
          tunnelLogPath: getRuntimeTunnelLogPath(currentState),
          tunnelProvider: getRuntimeTunnelProvider(currentState),
          cloudflaredPid:
            getRuntimeTunnelProvider(currentState) === "cloudflared"
              ? getRuntimeTunnelPid(currentState)
              : undefined,
          cloudflaredLogPath:
            getRuntimeTunnelProvider(currentState) === "cloudflared"
              ? cloudflaredLogPath
              : undefined,
          publicUrl: expectedPublicUrl,
          tunnelCreatedAtMs: currentState?.tunnelCreatedAtMs,
          lastTunnelReplaceAtMs: currentState?.lastTunnelReplaceAtMs,
        });
        logSystemStep(
          "dashboard-recovery-monitor",
          `restart dashboard_pid=${dashboardPid} public_url=${expectedPublicUrl}`,
        );
        publicFailureSinceMs = null;
        await Bun.sleep(1000);
        continue;
      }

      if (publicReady) {
        publicFailureSinceMs = null;
      } else {
        publicFailureSinceMs ??= now;
        const publicFailureDurationMs = now - publicFailureSinceMs;
        const cooldownReady = canAttemptQuickTunnelReplacement(currentState, now);
        const shouldReplaceTunnel =
          !cloudflaredRunning ||
          publicFailureDurationMs >= sustainedPublicFailureReplacementMs;

        if (cloudflaredRunning) {
          logSystemStep(
            "dashboard-recovery-monitor",
            `warn public_not_ready_keep_existing public_url=${expectedPublicUrl} duration_ms=${publicFailureDurationMs}`,
          );
        } else {
          logSystemStep(
            "dashboard-recovery-monitor",
            `warn tunnel_process_missing public_url=${expectedPublicUrl} duration_ms=${publicFailureDurationMs}`,
          );
        }

        if (shouldReplaceTunnel && cooldownReady) {
          const tunnelPids = listTunnelPids();
          await terminatePids(tunnelPids, "dashboard-recovery-monitor");
          const tunnel = await startTemporaryTunnel(port);
          expectedPublicUrl = tunnel.url;
          const replacementAtMs = Date.now();
          writeRuntimeState({
            dashboardPid: currentState?.dashboardPid ?? 0,
            dashboardLogPath,
            localUrl: `http://127.0.0.1:${port}`,
            tunnelPid: tunnel.pid,
            tunnelLogPath: tunnel.logPath,
            tunnelProvider: tunnel.provider,
            cloudflaredPid: tunnel.provider === "cloudflared" ? tunnel.pid : undefined,
            cloudflaredLogPath: tunnel.provider === "cloudflared" ? cloudflaredLogPath : undefined,
            publicUrl: tunnel.url,
            tunnelCreatedAtMs: replacementAtMs,
            lastTunnelReplaceAtMs: replacementAtMs,
          });
          logSystemStep(
            "dashboard-recovery-monitor",
            `replace_tunnel old_public_url=${currentState?.publicUrl ?? "missing"} new_public_url=${tunnel.url} tunnel_provider=${tunnel.provider} tunnel_pid=${tunnel.pid}`,
          );
          publicFailureSinceMs = null;
          await Bun.sleep(1000);
          continue;
        }

        if (shouldReplaceTunnel && !cooldownReady) {
          const cooldownRemainingMs =
            quickTunnelReplacementCooldownMs -
            (now - getLastTunnelReplacementAttemptAtMs(currentState));
          logSystemStep(
            "dashboard-recovery-monitor",
            `warn tunnel_replacement_cooldown public_url=${expectedPublicUrl} remaining_ms=${Math.max(0, cooldownRemainingMs)}`,
          );
          await Bun.sleep(1000);
          continue;
        }
      }

      await Bun.sleep(2000);
    }

    logSystemStep(
      "dashboard-recovery-monitor",
      `exit watch_window_complete public_url=${expectedPublicUrl}`,
    );
  } catch (error) {
    requestDashboardHelp({
      reason: "dashboard-monitor-recovery-failed",
      dashboardUrl: expectedPublicUrl,
      detail:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "dashboard monitor recovery failed",
    });
    logSystemStep(
      "dashboard-recovery-monitor",
      `error public_url=${expectedPublicUrl} detail=${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    const currentLockPid = readDashboardRecoveryMonitorLockPid();
    if (currentLockPid === pid) {
      rmSync(dashboardRecoveryMonitorLockPath, { force: true });
    }
  }
}

export async function recoverDashboardSession(input?: {
  port?: number;
  managerUrl?: string;
  ttlSeconds?: number;
  reason?: string;
}): Promise<{
  token: string;
  expiresAtMs: number;
  localUrl: string;
  publicUrl: string;
  sessionUrl: string;
  dashboardPid: number;
  cloudflaredPid: number;
}> {
  const port = input?.port ?? 3000;
  const reason = input?.reason?.trim() || "dashboard-unreachable";
  logSystemStep("dashboard-recovery", `start reason=${reason} port=${port}`);

  try {
    await terminateDashboardRuntimeProcesses(port);
    clearRuntimeState();
    const session = await issueDashboardSession({
      port,
      managerUrl: input?.managerUrl,
      ttlSeconds: input?.ttlSeconds,
    });
    logSystemStep(
      "dashboard-recovery",
      `exit public_url=${session.publicUrl} dashboard_pid=${session.dashboardPid} cloudflared_pid=${session.cloudflaredPid}`,
    );
    return session;
  } catch (error) {
    const incidentPath = writeDashboardRecoveryIncident({
      at: new Date().toISOString(),
      reason,
      port,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : { error: String(error) },
    });
    logSystemStep("dashboard-recovery", `error incident=${incidentPath}`);
    throw error;
  }
}
