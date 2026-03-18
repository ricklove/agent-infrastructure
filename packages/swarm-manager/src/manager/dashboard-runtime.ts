import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
};

type DashboardSessionStore = {
  sessions: DashboardSessionRecord[];
};

const sourceDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(sourceDir, "../../../..");
const dashboardDistDir = resolve(repoRoot, "apps/dashboard-app/dist");
const dashboardServerEntry = resolve(repoRoot, "packages/dashboard/src/server.ts");
const runtimeDir = resolve(repoRoot, ".runtime/dashboard");
const runtimeStatePath = resolve(runtimeDir, "runtime-state.json");
const dashboardLogPath = resolve(runtimeDir, "dashboard.log");
const cloudflaredLogPath = resolve(runtimeDir, "cloudflared.log");
const bootstrapContextPath = "/opt/agent-swarm/bootstrap-context.json";
const sessionStorePath =
  process.env.DASHBOARD_SESSION_STORE_PATH?.trim() ||
  "/var/lib/agent-swarm-monitor/dashboard-sessions.json";

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

async function spawnDetached(
  command: string,
  logPath: string,
  env?: Record<string, string>,
): Promise<number> {
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
    throw new Error(stderr.trim() || `failed to launch command: ${command}`);
  }

  if (stderr.trim().length > 0) {
    throw new Error(stderr.trim());
  }

  const pid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`failed to capture pid for command: ${command}`);
  }

  return pid;
}

async function ensureDashboardBuilt(forceRebuild = false): Promise<void> {
  if (!forceRebuild && existsSync(dashboardDistDir)) {
    return;
  }

  runChecked(["bun", "run", "--filter", "@agent-infrastructure/dashboard-app", "build"]);
}

async function startDashboardServer(config: DashboardRuntimeConfig): Promise<number> {
  const accessApiBaseUrl =
    config.accessApiBaseUrl?.trim() || readBootstrapContextValue("dashboardAccessApiBaseUrl");
  const enrollmentSecret =
    config.enrollmentSecret?.trim() || readBootstrapContextValue("dashboardEnrollmentSecret");

  const command = ["bun", dashboardServerEntry].map(shellQuote).join(" ");

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

  throw new Error("cloudflared did not return a quick tunnel URL in time");
}

export async function ensureDashboardRuntime(
  config: DashboardRuntimeConfig,
): Promise<DashboardRuntimeState> {
  mkdirSync(runtimeDir, { recursive: true });

  const currentState = readRuntimeState();
  const dashboardRunning = isPidRunning(currentState?.dashboardPid);
  const cloudflaredRunning = isPidRunning(currentState?.cloudflaredPid);

  if (
    currentState &&
    dashboardRunning &&
    (!config.useCloudflared ||
      (cloudflaredRunning && typeof currentState.publicUrl === "string"))
  ) {
    return currentState;
  }

  await ensureDashboardBuilt(config.forceRebuild === true);

  const dashboardPid = dashboardRunning
    ? (currentState?.dashboardPid as number)
    : await startDashboardServer(config);

  await waitForHealth(config.port);

  let nextState: DashboardRuntimeState = {
    dashboardPid,
    dashboardLogPath,
    localUrl: `http://127.0.0.1:${config.port}`,
  };

  if (!config.useCloudflared) {
    writeRuntimeState(nextState);
    return nextState;
  }

  if (cloudflaredRunning && currentState?.publicUrl) {
    nextState = {
      ...nextState,
      cloudflaredPid: currentState.cloudflaredPid,
      cloudflaredLogPath: currentState.cloudflaredLogPath ?? cloudflaredLogPath,
      publicUrl: currentState.publicUrl,
    };
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
  nextStore.sessions.push({
    tokenHash: hashSessionToken(sessionToken),
    expiresAtMs: matchedExpiry,
    createdAtMs: currentTime,
    kind: "browser",
  });
  writeSessionStore(nextStore);

  return {
    sessionToken,
    expiresAtMs: matchedExpiry,
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
