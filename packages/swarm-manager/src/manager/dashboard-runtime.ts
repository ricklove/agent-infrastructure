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
  publicUrl?: string;
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
const bootstrapContextPath =
  process.env.SWARM_BOOTSTRAP_CONTEXT_PATH?.trim() || DEFAULT_BOOTSTRAP_CONTEXT_PATH;
const sessionStorePath =
  process.env.DASHBOARD_SESSION_STORE_PATH?.trim() || DEFAULT_DASHBOARD_SESSION_STORE_PATH;
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

  let publicUrl = "";
  for (const candidate of extractQuickTunnelUrls().reverse()) {
    if (await isPublicDashboardReady(candidate)) {
      publicUrl = candidate;
      break;
    }
  }

  if (!publicUrl) {
    return null;
  }

  const cloudflaredPid =
    discoverPidByPattern(/cloudflared\s+tunnel\s+--url\s+http:\/\/127\.0\.0\.1:\d+/) ??
    0;

  return {
    dashboardPid,
    dashboardLogPath,
    localUrl,
    cloudflaredPid,
    cloudflaredLogPath,
    publicUrl,
  };
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
  const pattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const log = readFileSync(cloudflaredLogPath, "utf8");
      const match = log.match(pattern);
      if (match) {
        return {
          pid,
          url: match[0],
        };
      }
    } catch {}

    await Bun.sleep(500);
  }

  logSystemStep("dashboard-runtime", `error cloudflared_no_url port=${port}`);
  throw new Error("cloudflared did not return a quick tunnel URL in time");
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
    currentState?.cloudflaredPid,
    /cloudflared\s+tunnel/,
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
      ((cloudflaredRunning ||
        Boolean(currentState.cloudflaredPid) ||
        publicDashboardReady) &&
        typeof currentState.publicUrl === "string" &&
        publicDashboardReady));

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
      cloudflaredPid: currentState.cloudflaredPid,
      cloudflaredLogPath: currentState.cloudflaredLogPath ?? cloudflaredLogPath,
      publicUrl: currentState.publicUrl,
    };
    logSystemStep("dashboard-runtime", "exit cloudflared=reused");
    writeRuntimeState(nextState);
    return nextState;
  }

  const tunnel = await startCloudflared(config.port);
  nextState = {
    ...nextState,
    cloudflaredPid: tunnel.pid,
    cloudflaredLogPath,
    publicUrl: tunnel.url,
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

  if (!runtime.publicUrl || !runtime.cloudflaredPid) {
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
    cloudflaredPid: runtime.cloudflaredPid,
  };
}
