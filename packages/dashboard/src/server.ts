import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(sourceDir, "../../..");
const dashboardDistDir = resolve(repoRoot, "apps/dashboard-app/dist");
const managerBaseUrl =
  process.env.MANAGER_INTERNAL_URL?.trim() || "http://127.0.0.1:8787";
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);

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

  if (url.pathname === "/api/health") {
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

  if (url.pathname === "/api/workers") {
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

  if (url.pathname === "/api/workers/events") {
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

  if (url.pathname === "/api/services") {
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

  if (url.pathname === "/api/summary") {
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

const server = Bun.serve({
  port,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request);
    }

    return serveStatic(url);
  },
});

console.log(
  JSON.stringify({
    ok: true,
    event: "dashboard_server_started",
    url: `http://${server.hostname}:${server.port}`,
    managerBaseUrl,
    dashboardDistDir,
    accessApiBaseUrl,
  }),
);
