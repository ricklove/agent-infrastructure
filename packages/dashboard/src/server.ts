import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DashboardFeatureBackendDefinition } from "@agent-infrastructure/dashboard-plugin";
import { dashboardFeaturePlugins } from "./feature-plugins.js";

type ManagerHealthResponse = {
  ok: boolean;
  connectedWorkers: number;
  staleWorkers: number;
};

type WorkersResponse = {
  workers: Array<{
    workerId: string;
    instanceId: string;
    privateIp: string;
    status: string;
    lastHeartbeatAt: number;
    lastMetrics: {
      cpuPercent: number;
      memoryUsedBytes: number;
      memoryTotalBytes: number;
      memoryPercent: number;
      containerCount: number;
    } | null;
    lastContainers: Array<{
      containerId: string;
      containerName: string;
      projectId: string | null;
      cpuPercent: number;
      memoryUsedBytes: number;
      memoryLimitBytes: number;
      memoryPercent: number;
    }>;
  }>;
};

type ServicesResponse = {
  ok: boolean;
  rootNamespace: string;
  services: Array<{
    namespace: string;
    serviceName: string;
    instanceId: string;
    workerId: string;
    workerPrivateIp: string;
    hostPort: number;
    containerPort: number;
    protocol: string;
    healthy: boolean;
    updatedAtMs: number;
  }>;
};

type WorkerLifecycleEventType =
  | "launch_requested"
  | "create"
  | "launch"
  | "ec2_running"
  | "instance_status_ok"
  | "bootstrap_started"
  | "runtime_download_started"
  | "runtime_download_completed"
  | "docker_ready"
  | "telemetry_started"
  | "running"
  | "connected"
  | "stale"
  | "disconnected"
  | "hibernate_requested"
  | "hibernating"
  | "hibernated"
  | "wakeup_requested"
  | "wakeup"
  | "shutdown_requested"
  | "shutdown"
  | "terminated";

type WorkerLifecycleEventsResponse = {
  ok: boolean;
  events: Array<{
    workerId: string;
    instanceId: string;
    privateIp: string;
    nodeRole: "manager" | "worker";
    eventType: WorkerLifecycleEventType;
    eventTsMs: number;
    details: Record<string, unknown> | null;
  }>;
};

type AccessEnrollmentResponse = {
  ok: boolean;
  registrationUrl: string;
  expiresAtMs: number;
};

type SessionExchangeBody = {
  sessionKey: string;
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

type ProxyWsData = {
  kind: "graph-proxy";
  backendId: string;
  upstreamUrl: string;
  upstream: WebSocket | null;
  queue: string[];
};

type DashboardStatusWsData = {
  kind: "dashboard-status";
  heartbeatTimer: ReturnType<typeof setInterval> | null;
};

type DashboardWsData = ProxyWsData | DashboardStatusWsData;

type GatewayBackendDefinition = {
  id: string;
  apiBasePath?: string;
  wsBasePath?: string;
  baseUrl: string;
  wsUrl?: string;
  healthPath: string;
  startCommand?: string[];
  logPath?: string;
};

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(sourceDir, "../../..");
const dashboardDistDir = resolve(repoRoot, "apps/dashboard-app/dist");
const managerBaseUrl =
  process.env.MANAGER_INTERNAL_URL?.trim() || "http://127.0.0.1:8787";
const stateRoot = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state";
const systemEventLogPath =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() || `${stateRoot}/logs/system-events.log`;
const accessApiBaseUrl = process.env.DASHBOARD_ACCESS_API_BASE_URL?.trim() || "";
const enrollmentSecret = process.env.DASHBOARD_ENROLLMENT_SECRET?.trim() || "";
const sessionStorePath =
  process.env.DASHBOARD_SESSION_STORE_PATH?.trim() ||
  "/home/ec2-user/state/dashboard-sessions.json";
const port = Number.parseInt(process.env.DASHBOARD_PORT ?? "3000", 10);
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

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("DASHBOARD_PORT must be a positive integer");
}

const dashboardBackendRoots = [
  resolve(repoRoot, "packages/dashboard/package.json"),
  resolve(repoRoot, "packages/dashboard/src"),
];

function collectFiles(root: string): string[] {
  const stats = statSync(root);
  if (stats.isFile()) {
    return [root];
  }

  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => collectFiles(resolve(root, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function computeDashboardBackendVersion(): string {
  try {
    const gitHead = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    if (gitHead) {
      return `dashboard-${gitHead}`;
    }
  } catch {}

  const hash = createHash("sha256");
  const files = dashboardBackendRoots.flatMap((root) => collectFiles(root));

  for (const file of files) {
    hash.update(relative(repoRoot, file));
    hash.update("\n");
    hash.update(readFileSync(file));
    hash.update("\n");
  }
  return `dashboard-${hash.digest("hex").slice(0, 10)}`;
}

const dashboardBackendVersion = computeDashboardBackendVersion();
const backendEnsurePromises = new Map<string, Promise<void>>();

function logSystemStep(source: string, message: string): void {
  const line = `[${new Date().toISOString()}:${source}] ${message}`;
  mkdirSync(dirname(systemEventLogPath), { recursive: true });
  appendFileSync(systemEventLogPath, `${line}\n`);
  console.error(line);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function resolveBackendBaseUrl(definition: DashboardFeatureBackendDefinition): string {
  const envValue = definition.upstreamBaseUrlEnv
    ? process.env[definition.upstreamBaseUrlEnv]?.trim() ?? ""
    : "";
  return envValue || definition.defaultBaseUrl || "";
}

function createGatewayBackend(
  definition: DashboardFeatureBackendDefinition,
): GatewayBackendDefinition {
  const baseUrl = resolveBackendBaseUrl(definition);
  const logPath = definition.startup?.logFileName
    ? `${stateRoot}/logs/${definition.startup.logFileName}`
    : undefined;

  return {
    id: definition.id,
    apiBasePath: definition.apiBasePath,
    wsBasePath: definition.wsBasePath,
    baseUrl,
    wsUrl:
      baseUrl && definition.upstreamWsPath
        ? `${wsBaseUrlFromHttpOrigin(baseUrl)}${definition.upstreamWsPath}`
        : undefined,
    healthPath: definition.healthPath,
    startCommand:
      definition.startup?.kind === "bun-entry"
        ? ["bun", resolve(repoRoot, definition.startup.entry)]
        : undefined,
    logPath,
  };
}

const gatewayBackends = dashboardFeaturePlugins
  .flatMap((plugin) => (plugin.backend ? [createGatewayBackend(plugin.backend)] : []));

function dashboardStatusPayload() {
  return {
    type: "dashboard_status",
    ok: true,
    backendVersion: dashboardBackendVersion,
    timestamp: new Date().toISOString(),
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function wsBaseUrlFromHttpOrigin(origin: string): string {
  return origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

function isLoopbackRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function validateBrowserSessionToken(token: string): boolean {
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

function exchangeBootstrapSessionKey(sessionKey: string): {
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
      matchedExpiry = session.expiresAtMs;
      nextStore.sessions.push({
        ...session,
        usedAtMs: currentTime,
      });
      continue;
    }

    nextStore.sessions.push(session);
  }

  if (matchedExpiry === 0) {
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

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function requireDashboardSession(request: Request): Response | null {
  if (isLoopbackRequest(request)) {
    return null;
  }

  const sessionToken =
    request.headers.get("x-dashboard-session") ??
    new URL(request.url).searchParams.get("sessionToken") ??
    "";

  if (validateBrowserSessionToken(sessionToken)) {
    return null;
  }

  return jsonResponse({ ok: false, error: "dashboard session required" }, 401);
}

async function fetchAccessJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!accessApiBaseUrl) {
    throw new Error("dashboard access API is not configured");
  }

  const response = await fetch(`${accessApiBaseUrl}${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `dashboard access request failed for ${path}: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as T;
}

async function fetchManagerJson<T>(path: string): Promise<T> {
  const response = await fetch(`${managerBaseUrl}${path}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `manager request failed for ${path}: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as T;
}

async function isBackendHealthy(backend: GatewayBackendDefinition): Promise<boolean> {
  try {
    const response = await fetch(`${backend.baseUrl}${backend.healthPath}`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackendHealthy(
  backend: GatewayBackendDefinition,
  maxAttempts = 30,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isBackendHealthy(backend)) {
      return;
    }
    await Bun.sleep(250);
  }

  throw new Error(`${backend.id} did not become healthy in time`);
}

async function startBackend(backend: GatewayBackendDefinition): Promise<void> {
  if (!backend.startCommand || backend.startCommand.length === 0) {
    throw new Error(`${backend.id} backend is not configured for lazy start`);
  }

  const command = backend.startCommand.map(shellQuote).join(" ");
  if (backend.logPath) {
    mkdirSync(dirname(backend.logPath), { recursive: true });
    writeFileSync(backend.logPath, "");
  }
  logSystemStep("dashboard-server", `start ${backend.id} command=${command}`);

  const processHandle = Bun.spawn(
    [
      "bash",
      "-lc",
      `nohup ${command} >> '${backend.logPath ?? "/dev/null"}' 2>&1 < /dev/null & echo $!`,
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdout = await new Response(processHandle.stdout).text();
  const stderr = await new Response(processHandle.stderr).text();
  await processHandle.exited;

  if (processHandle.exitCode !== 0) {
    logSystemStep("dashboard-server", `error ${backend.id} launch_failed=${stderr.trim()}`);
    throw new Error(stderr.trim() || `failed to launch ${backend.id}`);
  }

  const pid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    logSystemStep("dashboard-server", `error ${backend.id} invalid_pid`);
    throw new Error(`failed to capture ${backend.id} pid`);
  }

  logSystemStep("dashboard-server", `exit ${backend.id} pid=${pid}`);
}

async function ensureBackend(backend: GatewayBackendDefinition): Promise<void> {
  if (await isBackendHealthy(backend)) {
    return;
  }

  const currentPromise = backendEnsurePromises.get(backend.id);
  if (!currentPromise) {
    const nextPromise = (async () => {
      if (await isBackendHealthy(backend)) {
        return;
      }
      await startBackend(backend);
      await waitForBackendHealthy(backend);
    })().finally(() => {
      backendEnsurePromises.delete(backend.id);
    });

    backendEnsurePromises.set(backend.id, nextPromise);
  }

  await backendEnsurePromises.get(backend.id);
}

function findApiBackend(pathname: string): GatewayBackendDefinition | undefined {
  return gatewayBackends.find((backend) => {
    if (!backend.apiBasePath) {
      return false;
    }
    return pathname === backend.apiBasePath || pathname.startsWith(`${backend.apiBasePath}/`);
  });
}

function findWsBackend(pathname: string): GatewayBackendDefinition | undefined {
  return gatewayBackends.find((backend) => {
    if (!backend.wsBasePath || !backend.wsUrl) {
      return false;
    }
    return pathname === backend.wsBasePath || pathname === `${backend.wsBasePath}/`;
  });
}

async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const swarmApiAliases = {
    health: new Set(["/api/health", "/api/agent-swarm/health"]),
    workers: new Set(["/api/workers", "/api/agent-swarm/workers"]),
    workerTimeline: new Set([
      "/api/workers/timeline",
      "/api/agent-swarm/workers/timeline",
    ]),
    workerEvents: new Set([
      "/api/workers/events",
      "/api/agent-swarm/workers/events",
    ]),
    services: new Set(["/api/services", "/api/agent-swarm/services"]),
    summary: new Set(["/api/summary", "/api/agent-swarm/summary"]),
  };

  if (url.pathname === "/api/config") {
    return jsonResponse({
      ok: true,
      accessAppUrl: accessApiBaseUrl,
      requiresSession: !isLoopbackRequest(request),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/session/exchange") {
    const body = await parseJsonBody<SessionExchangeBody>(request);
    if (!body || typeof body.sessionKey !== "string") {
      return jsonResponse({ ok: false, error: "sessionKey is required" }, 400);
    }

    const exchanged = exchangeBootstrapSessionKey(body.sessionKey);
    if (!exchanged) {
      return jsonResponse({ ok: false, error: "invalid session key" }, 401);
    }

    return jsonResponse({
      ok: true,
      sessionToken: exchanged.sessionToken,
      expiresAtMs: exchanged.expiresAtMs,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/access/enrollment-url") {
    const unauthorized = requireDashboardSession(request);
    if (unauthorized) {
      return unauthorized;
    }

    if (!accessApiBaseUrl || !enrollmentSecret) {
      return jsonResponse(
        { ok: false, error: "dashboard access registration is not configured" },
        503,
      );
    }

    try {
      const result = await fetchAccessJson<AccessEnrollmentResponse>(
        "/api/admin/enrollment-ticket",
        {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-dashboard-enrollment-secret": enrollmentSecret,
          },
          body: JSON.stringify({}),
        },
      );
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to create enrollment ticket",
        },
        502,
      );
    }
  }

  const unauthorized = requireDashboardSession(request);
  if (unauthorized) {
    return unauthorized;
  }

  if (swarmApiAliases.health.has(url.pathname)) {
    try {
      const managerHealth = await fetchManagerJson<ManagerHealthResponse>(
        "/health",
      );
      return jsonResponse({
        ok: true,
        dashboard: {
          port,
        },
        manager: managerHealth,
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to reach manager",
        },
        502,
      );
    }
  }

  if (swarmApiAliases.workers.has(url.pathname)) {
    try {
      const workers = await fetchManagerJson<WorkersResponse>("/workers");
      return jsonResponse(workers);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to fetch workers",
        },
        502,
      );
    }
  }

  if (swarmApiAliases.workerTimeline.has(url.pathname)) {
    try {
      const search = new URLSearchParams();
      const workerId = url.searchParams.get("workerId")?.trim() ?? "";
      const rangeMinutes = url.searchParams.get("rangeMinutes")?.trim() ?? "";
      const sinceTsMs = url.searchParams.get("sinceTsMs")?.trim() ?? "";
      const untilTsMs = url.searchParams.get("untilTsMs")?.trim() ?? "";

      if (workerId) {
        search.set("workerId", workerId);
      }

      if (rangeMinutes) {
        search.set("rangeMinutes", rangeMinutes);
      }

      if (sinceTsMs) {
        search.set("sinceTsMs", sinceTsMs);
      }

      if (untilTsMs) {
        search.set("untilTsMs", untilTsMs);
      }

      const suffix = search.toString();
      const timeline = await fetchManagerJson(
        `/workers/timeline${suffix ? `?${suffix}` : ""}`,
      );
      return jsonResponse(timeline);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to fetch worker timeline",
        },
        502,
      );
    }
  }

  if (swarmApiAliases.workerEvents.has(url.pathname)) {
    try {
      const search = new URLSearchParams();
      const workerId = url.searchParams.get("workerId")?.trim() ?? "";
      const limit = url.searchParams.get("limit")?.trim() ?? "";

      if (workerId) {
        search.set("workerId", workerId);
      }

      if (limit) {
        search.set("limit", limit);
      }

      const suffix = search.toString();
      const events = await fetchManagerJson<WorkerLifecycleEventsResponse>(
        `/workers/events${suffix ? `?${suffix}` : ""}`,
      );
      return jsonResponse(events);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to fetch worker events",
        },
        502,
      );
    }
  }

  if (swarmApiAliases.services.has(url.pathname)) {
    try {
      const services = await fetchManagerJson<ServicesResponse>("/services");
      return jsonResponse(services);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to fetch services",
        },
        502,
      );
    }
  }

  if (swarmApiAliases.summary.has(url.pathname)) {
    try {
      const [managerHealth, workers, services] = await Promise.all([
        fetchManagerJson<ManagerHealthResponse>("/health"),
        fetchManagerJson<WorkersResponse>("/workers"),
        fetchManagerJson<ServicesResponse>("/services"),
      ]);
      return jsonResponse({
        ok: true,
        manager: managerHealth,
        counts: {
          workers: workers.workers.length,
          connectedWorkers: workers.workers.filter(
            (worker) => worker.status === "connected",
          ).length,
          staleWorkers: workers.workers.filter(
            (worker) => worker.status === "stale",
          ).length,
          services: services.services.length,
          healthyServices: services.services.filter((service) => service.healthy)
            .length,
        },
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to build summary",
        },
        502,
      );
    }
  }

  const featureBackend = findApiBackend(url.pathname);
  if (featureBackend) {
    try {
      await ensureBackend(featureBackend);
      const response = await fetch(`${featureBackend.baseUrl}${url.pathname}${url.search}`, {
        method: request.method,
        headers: {
          accept: "application/json",
          ...(request.headers.get("content-type")
            ? { "content-type": request.headers.get("content-type")! }
            : {}),
        },
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await request.text(),
      });

      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          "content-type":
            response.headers.get("content-type") ??
            "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : `failed to proxy ${featureBackend.id} request`,
        },
        502,
      );
    }
  }

  return jsonResponse({ ok: false, error: "not found" }, 404);
}

function contentTypeForPath(pathname: string): string {
  if (pathname.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (pathname.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (pathname.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (pathname.endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}

async function serveStatic(url: URL): Promise<Response> {
  if (!existsSync(dashboardDistDir)) {
    return new Response(
      "Dashboard assets are missing. Run `bun run build:dashboard` first.",
      {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  const relativePath =
    url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const targetPath = join(dashboardDistDir, relativePath);
  const fallbackPath = join(dashboardDistDir, "index.html");
  const selectedPath = existsSync(targetPath) ? targetPath : fallbackPath;
  const file = Bun.file(selectedPath);

  return new Response(file, {
    headers: {
      "content-type": contentTypeForPath(selectedPath),
      "cache-control": selectedPath.endsWith("index.html")
        ? "no-store"
        : "public, max-age=300",
    },
  });
}

const server = Bun.serve<DashboardWsData>({
  port,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url);
    const wsBackend = findWsBackend(url.pathname);

    if (wsBackend) {
      const unauthorized = requireDashboardSession(request);
      if (unauthorized) {
        return unauthorized;
      }

      try {
        await ensureBackend(wsBackend);
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "failed to start agent graph server",
          },
          502,
        );
      }

      if (
        server.upgrade(request, {
          data: {
            kind: "graph-proxy",
            backendId: wsBackend.id,
            upstreamUrl: `${wsBackend.wsUrl}${url.search}`,
            upstream: null,
            queue: [],
          },
        })
      ) {
        return undefined;
      }

      return new Response("upgrade failed", { status: 500 });
    }

    if (
      url.pathname === "/ws/dashboard-status" ||
      url.pathname === "/ws/dashboard-status/"
    ) {
      const unauthorized = requireDashboardSession(request);
      if (unauthorized) {
        return unauthorized;
      }

      if (
        server.upgrade(request, {
          data: { kind: "dashboard-status", heartbeatTimer: null },
        })
      ) {
        return undefined;
      }

      return new Response("upgrade failed", { status: 500 });
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request);
    }

    return serveStatic(url);
  },
  websocket: {
    open(ws) {
      if (ws.data.kind === "dashboard-status") {
        ws.send(JSON.stringify(dashboardStatusPayload()));
        ws.data.heartbeatTimer = setInterval(() => {
          try {
            ws.send(JSON.stringify(dashboardStatusPayload()));
          } catch {}
        }, 15000);
        return;
      }

      const proxyData = ws.data;
      const backend = gatewayBackends.find(
        (candidate) => candidate.id === proxyData.backendId,
      );
      if (!backend?.wsUrl) {
        try {
          ws.close();
        } catch {}
        return;
      }
      const upstream = new WebSocket(proxyData.upstreamUrl || backend.wsUrl);
      proxyData.upstream = upstream;

      upstream.addEventListener("open", () => {
        for (const message of proxyData.queue) {
          upstream.send(message);
        }
        proxyData.queue = [];
      });

      upstream.addEventListener("message", (event) => {
        ws.send(String(event.data));
      });

      upstream.addEventListener("close", () => {
        try {
          ws.close();
        } catch {}
      });

      upstream.addEventListener("error", () => {
        try {
          ws.close();
        } catch {}
      });
    },
    message(ws, message) {
      if (ws.data.kind === "dashboard-status") {
        return;
      }

      const payload = String(message);
      const upstream = ws.data.upstream;
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(payload);
        return;
      }

      ws.data.queue.push(payload);
    },
    close(ws) {
      if (ws.data.kind === "dashboard-status") {
        if (ws.data.heartbeatTimer) {
          clearInterval(ws.data.heartbeatTimer);
          ws.data.heartbeatTimer = null;
        }
        return;
      }

      try {
        ws.data.upstream?.close();
      } catch {}
    },
  },
});

console.log(
  JSON.stringify({
    ok: true,
    event: "dashboard_server_started",
    url: `http://${server.hostname}:${server.port}`,
    backendVersion: dashboardBackendVersion,
    managerBaseUrl,
    dashboardDistDir,
    accessApiBaseUrl,
  }),
);
