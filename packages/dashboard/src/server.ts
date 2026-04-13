import { execFileSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  canonicalDashboardVersionFromTag,
  type DashboardFeatureBackendDefinition,
  fallbackDashboardVersion,
} from "@agent-infrastructure/dashboard-plugin"
import {
  type DashboardHostRole,
  getDashboardFeaturePlugins,
} from "./feature-plugins.js"

type ManagerHealthResponse = {
  ok: boolean
  connectedWorkers: number
  staleWorkers: number
}

type WorkersResponse = {
  workers: Array<{
    workerId: string
    instanceId: string
    privateIp: string
    status: string
    lastHeartbeatAt: number
    lastMetrics: {
      cpuPercent: number
      memoryUsedBytes: number
      memoryTotalBytes: number
      memoryPercent: number
      containerCount: number
    } | null
    lastContainers: Array<{
      containerId: string
      containerName: string
      projectId: string | null
      cpuPercent: number
      memoryUsedBytes: number
      memoryLimitBytes: number
      memoryPercent: number
    }>
  }>
}

type ServicesResponse = {
  ok: boolean
  rootNamespace: string
  services: Array<{
    namespace: string
    serviceName: string
    instanceId: string
    workerId: string
    workerPrivateIp: string
    hostPort: number
    containerPort: number
    protocol: string
    healthy: boolean
    updatedAtMs: number
  }>
}

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
  | "terminated"

type WorkerLifecycleEventsResponse = {
  ok: boolean
  events: Array<{
    workerId: string
    instanceId: string
    privateIp: string
    nodeRole: "manager" | "worker"
    eventType: WorkerLifecycleEventType
    eventTsMs: number
    details: Record<string, unknown> | null
  }>
}

type AccessEnrollmentResponse = {
  ok: boolean
  registrationUrl: string
  expiresAtMs: number
}

type RuntimeReleaseRecord = {
  tag: string
  version: string | null
}

type RuntimeReleaseStatusResponse = {
  ok: true
  currentVersion: string
  currentReleaseTag: string | null
  latestReleaseTag: string | null
  latestVersion: string | null
  updateAvailable: boolean
  recentReleaseTags: RuntimeReleaseRecord[]
}

type RuntimeDeployRequest =
  | {
      target: "latest"
    }
  | {
      target: "tag"
      tag: string
    }

type StackOutput = {
  OutputKey?: string
  OutputValue?: string
}

type StackSummary = {
  StackName?: string
  StackStatus?: string
  Outputs?: StackOutput[]
}

type Ec2InstanceSummary = {
  InstanceId?: string
  PrivateIpAddress?: string
  State?: { Name?: string }
}

type Ec2InstanceStatusSummary = {
  InstanceId?: string
  InstanceStatus?: { Status?: string }
  SystemStatus?: { Status?: string }
}

type SsmInstanceSummary = {
  InstanceId?: string
  PingStatus?: string
  LastPingDateTime?: string
}

type StackAdminRecord = {
  stackName: string
  stackStatus: string
  managerInstanceId: string
  managerPrivateIp: string
  dashboardAccessUrl: string
  dashboardHostname: string | null
  manager: {
    instanceState: string
    systemStatus: string | null
    instanceStatus: string | null
    ssmPingStatus: string | null
    lastSsmPingAt: string | null
  }
  dashboard: {
    reachable: boolean
    httpStatus: number | null
  }
}

type SessionExchangeBody = {
  sessionKey: string
}

type DashboardSessionRecord = {
  tokenHash: string
  expiresAtMs: number
  createdAtMs: number
  kind: "bootstrap" | "browser"
  usedAtMs?: number
  lastAccessAtMs?: number
  idleTimeoutMs?: number
}

type DashboardSessionStore = {
  sessions: DashboardSessionRecord[]
}

type ProxyWsData = {
  kind: "graph-proxy"
  backendId: string
  upstreamUrl: string
  upstream: WebSocket | null
  queue: string[]
  selectedProtocol: string | null
}

type DashboardStatusWsData = {
  kind: "dashboard-status"
  heartbeatTimer: ReturnType<typeof setInterval> | null
  selectedProtocol: string | null
}

type DashboardDebugLogWsData = {
  kind: "debug-log"
  selectedProtocol: string | null
}

type ProxyMessage = string | ArrayBuffer | Uint8Array

type ViteProxyWsData = {
  kind: "vite-proxy"
  upstreamUrl: string
  upstream: WebSocket | null
  queue: ProxyMessage[]
  requestedProtocols: string[]
  selectedProtocol: string | null
}

type MainDashboardProxyWsData = {
  kind: "main-dashboard-proxy"
  upstreamUrl: string
  upstream: WebSocket | null
  queue: ProxyMessage[]
  upstreamProtocols: string[]
  requestedProtocols: string[]
  selectedProtocol: string | null
}

type DashboardWsData =
  | ProxyWsData
  | DashboardStatusWsData
  | DashboardDebugLogWsData
  | ViteProxyWsData
  | MainDashboardProxyWsData

type GatewayBackendDefinition = {
  id: string
  apiBasePath?: string
  wsBasePath?: string
  baseUrl: string
  wsUrl?: string
  healthPath: string
  startupPolicy: "lazy" | "always"
  startCommand?: string[]
  logPath?: string
}

const sourceDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(sourceDir, "../../..")
const dashboardDistDir = resolve(repoRoot, "apps/dashboard-app/dist")
const managerBaseUrl =
  process.env.MANAGER_INTERNAL_URL?.trim() || "http://127.0.0.1:8787"
const dashboardDevFrontendManaged =
  process.env.DASHBOARD_DEV_FRONTEND?.trim() === "1" ||
  process.env.DASHBOARD_DEV_FRONTEND?.trim().toLowerCase() === "true"
const dashboardDevFrontendPort = Number.parseInt(
  process.env.DASHBOARD_DEV_FRONTEND_PORT?.trim() || "5173",
  10,
)
const dashboardDevFrontendHost =
  process.env.DASHBOARD_DEV_FRONTEND_HOST?.trim() || "127.0.0.1"
const dashboardDevFrontendUrl =
  process.env.DASHBOARD_DEV_FRONTEND_URL?.trim() ||
  (dashboardDevFrontendManaged
    ? `http://${dashboardDevFrontendHost}:${dashboardDevFrontendPort}`
    : "")
const dashboardDevMainDashboardProxyEnabled =
  process.env.DASHBOARD_DEV_MAIN_DASHBOARD_PROXY?.trim() === "1" ||
  process.env.DASHBOARD_DEV_MAIN_DASHBOARD_PROXY?.trim().toLowerCase() ===
    "true"
const dashboardDevMainDashboardUrl =
  process.env.DASHBOARD_DEV_MAIN_DASHBOARD_URL?.trim() ||
  "http://127.0.0.1:3000"
const dashboardDevMainDashboardAuthorization =
  process.env.DASHBOARD_DEV_MAIN_DASHBOARD_AUTHORIZATION?.trim() || ""
const dashboardDevMainDashboardProxyPaths = (
  process.env.DASHBOARD_DEV_MAIN_DASHBOARD_PROXY_PATHS?.trim() ||
  "/api/agent-chat,/ws/agent-chat"
)
  .split(",")
  .map((path) => path.trim().replace(/\/+$/u, ""))
  .filter(Boolean)
const stateRoot = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"
const systemEventLogPath =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() ||
  `${stateRoot}/logs/system-events.log`
const accessApiBaseUrl = process.env.DASHBOARD_ACCESS_API_BASE_URL?.trim() || ""
const enrollmentSecret = process.env.DASHBOARD_ENROLLMENT_SECRET?.trim() || ""
const dashboardHostRole: DashboardHostRole =
  process.env.DASHBOARD_HOST_ROLE?.trim() === "admin" ? "admin" : "manager"
const sessionStorePath =
  process.env.DASHBOARD_SESSION_STORE_PATH?.trim() ||
  "/home/ec2-user/state/dashboard-sessions.json"
const port = Number.parseInt(process.env.DASHBOARD_PORT ?? "3000", 10)
const localFilePreviewAllowedRoots = [
  "/home/ec2-user/workspace",
  "/home/ec2-user/runtime",
] as const
const localFilePreviewMaxBytes = 1_000_000
const browserSessionIdleTimeoutMs =
  Math.max(
    60,
    Number.parseInt(
      process.env.DASHBOARD_SESSION_IDLE_TIMEOUT_SECONDS ?? "900",
      10,
    ) || 900,
  ) * 1000
const browserSessionRenewIntervalMs =
  Math.max(
    30,
    Number.parseInt(
      process.env.DASHBOARD_SESSION_RENEW_INTERVAL_SECONDS ?? "300",
      10,
    ) || 300,
  ) * 1000
const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."
const browserDebugLogPath =
  process.env.DASHBOARD_BROWSER_DEBUG_LOG_PATH?.trim() ||
  `${stateRoot}/logs/browser-debug.log`
const runtimeDeployLogPath = `${stateRoot}/logs/dashboard-runtime-deploy.log`
const dashboardDevFrontendLogPath =
  process.env.DASHBOARD_DEV_FRONTEND_LOG_PATH?.trim() ||
  `${stateRoot}/logs/dashboard-dev-frontend-${dashboardDevFrontendPort}.log`

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("DASHBOARD_PORT must be a positive integer")
}

if (
  dashboardDevFrontendManaged &&
  (!Number.isInteger(dashboardDevFrontendPort) || dashboardDevFrontendPort <= 0)
) {
  throw new Error("DASHBOARD_DEV_FRONTEND_PORT must be a positive integer")
}

const dashboardBackendRoots = [
  resolve(repoRoot, "packages/dashboard/package.json"),
  resolve(repoRoot, "packages/dashboard/src"),
]

function collectFiles(root: string): string[] {
  const stats = statSync(root)
  if (stats.isFile()) {
    return [root]
  }

  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => collectFiles(resolve(root, entry.name)))
    .sort((left, right) => left.localeCompare(right))
}

function computeDashboardBackendVersion(): string {
  try {
    const exactTags = execFileSync(
      "git",
      ["tag", "--points-at", "HEAD", "--sort=-creatordate"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    )
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
    for (const tag of exactTags) {
      const exactReleaseVersion = canonicalDashboardVersionFromTag(tag)
      if (exactReleaseVersion) {
        return exactReleaseVersion
      }
    }

    const gitHead = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim()
    if (gitHead) {
      return fallbackDashboardVersion(gitHead)
    }
  } catch {}

  const hash = createHash("sha256")
  const files = dashboardBackendRoots.flatMap((root) => collectFiles(root))

  for (const file of files) {
    hash.update(relative(repoRoot, file))
    hash.update("\n")
    hash.update(readFileSync(file))
    hash.update("\n")
  }
  return fallbackDashboardVersion(hash.digest("hex").slice(0, 10))
}

const dashboardBackendVersion = computeDashboardBackendVersion()
const backendEnsurePromises = new Map<string, Promise<void>>()

function gitOutput(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim()
}

function listVisibleReleaseTags(): string[] {
  try {
    return gitOutput(["tag", "--list", "release-*", "--sort=-creatordate"])
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function currentExactReleaseTag(): string | null {
  try {
    const tags = gitOutput([
      "tag",
      "--points-at",
      "HEAD",
      "--sort=-creatordate",
    ])
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.startsWith("release-"))
    return tags[0] ?? null
  } catch {
    return null
  }
}

function readRuntimeReleaseStatus(): RuntimeReleaseStatusResponse {
  const currentReleaseTag = currentExactReleaseTag()
  const recentReleaseTags = listVisibleReleaseTags().slice(0, 12)
  const latestReleaseTag = recentReleaseTags[0] ?? null

  return {
    ok: true,
    currentVersion: dashboardBackendVersion,
    currentReleaseTag,
    latestReleaseTag,
    latestVersion: latestReleaseTag
      ? canonicalDashboardVersionFromTag(latestReleaseTag)
      : null,
    updateAvailable:
      latestReleaseTag !== null && currentReleaseTag !== latestReleaseTag,
    recentReleaseTags: recentReleaseTags.map((tag) => ({
      tag,
      version: canonicalDashboardVersionFromTag(tag),
    })),
  }
}

async function startRuntimeDeploy(targetTag?: string): Promise<{
  pid: number
  logPath: string
}> {
  mkdirSync(dirname(runtimeDeployLogPath), { recursive: true })

  const deployCommand = targetTag
    ? `nohup bun run deploy-manager-runtime ${shellQuote(targetTag)} >> ${shellQuote(runtimeDeployLogPath)} 2>&1 < /dev/null & echo $!`
    : `nohup bun run deploy-manager-runtime >> ${shellQuote(runtimeDeployLogPath)} 2>&1 < /dev/null & echo $!`

  const processHandle = Bun.spawn(["bash", "-lc", deployCommand], {
    cwd: repoRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = await new Response(processHandle.stdout).text()
  const stderr = await new Response(processHandle.stderr).text()
  await processHandle.exited

  if (processHandle.exitCode !== 0) {
    throw new Error(stderr.trim() || "failed to start runtime deploy")
  }

  const pid = Number.parseInt(stdout.trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("failed to capture runtime deploy pid")
  }

  return {
    pid,
    logPath: runtimeDeployLogPath,
  }
}

function logSystemStep(source: string, message: string): void {
  const line = `[${new Date().toISOString()}:${source}] ${message}`
  mkdirSync(dirname(systemEventLogPath), { recursive: true })
  appendFileSync(systemEventLogPath, `${line}\n`)
  console.error(line)
}

function appendBrowserDebugLog(payload: string): void {
  mkdirSync(dirname(browserDebugLogPath), { recursive: true })
  appendFileSync(browserDebugLogPath, `${payload}\n`)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function resolveBackendBaseUrl(
  definition: DashboardFeatureBackendDefinition,
): string {
  const envValue = definition.upstreamBaseUrlEnv
    ? (process.env[definition.upstreamBaseUrlEnv]?.trim() ?? "")
    : ""
  return envValue || definition.defaultBaseUrl || ""
}

function createGatewayBackend(
  definition: DashboardFeatureBackendDefinition,
): GatewayBackendDefinition {
  const baseUrl = resolveBackendBaseUrl(definition)
  const logPath = definition.startup?.logFileName
    ? `${stateRoot}/logs/${definition.startup.logFileName}`
    : undefined

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
    startupPolicy: definition.startupPolicy,
    startCommand:
      definition.startup?.kind === "bun-entry"
        ? ["bun", resolve(repoRoot, definition.startup.entry)]
        : undefined,
    logPath,
  }
}

const gatewayBackends = getDashboardFeaturePlugins(dashboardHostRole).flatMap(
  (plugin) => (plugin.backend ? [createGatewayBackend(plugin.backend)] : []),
)
const viteDevFrontendEnsurePromises = new Map<string, Promise<void>>()

function dashboardStatusPayload() {
  return {
    type: "dashboard_status",
    ok: true,
    backendVersion: dashboardBackendVersion,
    timestamp: new Date().toISOString(),
  }
}

function jsonResponse(
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  })
}

function wsBaseUrlFromHttpOrigin(origin: string): string {
  return origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
}

function copyResponseHeaders(headers: Headers): Record<string, string> {
  const copied: Record<string, string> = {}
  headers.forEach((value, key) => {
    copied[key] = value
  })
  return copied
}

function proxiedRequestHeaders(request: Request): Headers {
  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("content-length")
  return headers
}

function mainDashboardProxyRequestHeaders(request: Request): Headers {
  const headers = proxiedRequestHeaders(request)
  if (dashboardDevMainDashboardAuthorization) {
    headers.set("authorization", dashboardDevMainDashboardAuthorization)
  }
  return headers
}

function pathMatchesProxyPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function shouldProxyToMainDashboard(pathname: string): boolean {
  return (
    dashboardDevMainDashboardProxyEnabled &&
    dashboardDevMainDashboardProxyPaths.some((prefix) =>
      pathMatchesProxyPrefix(pathname, prefix),
    )
  )
}

function mainDashboardHttpUrl(url: URL): string {
  return `${dashboardDevMainDashboardUrl.replace(/\/+$/u, "")}${url.pathname}${url.search}`
}

function mainDashboardWebSocketUrl(url: URL): string {
  return `${wsBaseUrlFromHttpOrigin(dashboardDevMainDashboardUrl).replace(/\/+$/u, "")}${url.pathname}${url.search}`
}

function mainDashboardProxyWebSocketProtocols(
  requestedProtocols: string[],
): string[] {
  if (!dashboardDevMainDashboardAuthorization) {
    return requestedProtocols
  }
  const match = /^Bearer\s+(.+)$/i.exec(dashboardDevMainDashboardAuthorization)
  if (!match) {
    return requestedProtocols
  }
  return [`${dashboardSessionWebSocketProtocolPrefix}${match[1]}`]
}

async function proxyRequestToMainDashboard(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url)
  const response = await fetch(mainDashboardHttpUrl(url), {
    method: request.method,
    headers: mainDashboardProxyRequestHeaders(request),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
  })
  return new Response(response.body, {
    status: response.status,
    headers: copyResponseHeaders(response.headers),
  })
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function readSessionStore(): DashboardSessionStore {
  if (!existsSync(sessionStorePath)) {
    return { sessions: [] }
  }

  try {
    const parsed = JSON.parse(
      readFileSync(sessionStorePath, "utf8"),
    ) as DashboardSessionStore
    return Array.isArray(parsed.sessions) ? parsed : { sessions: [] }
  } catch {
    return { sessions: [] }
  }
}

function writeSessionStore(store: DashboardSessionStore): void {
  mkdirSync(resolve(sessionStorePath, ".."), { recursive: true })
  writeFileSync(sessionStorePath, JSON.stringify(store, null, 2))
}

function isLoopbackRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return (
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
  )
}

function validateBrowserSessionToken(token: string): boolean {
  const trimmed = token.trim()
  if (!trimmed) {
    return false
  }

  const currentTime = Date.now()
  const tokenHash = hashSessionToken(trimmed)
  const nextStore: DashboardSessionStore = { sessions: [] }
  let matched = false

  for (const session of readSessionStore().sessions) {
    if (session.expiresAtMs <= currentTime) {
      continue
    }

    if (session.kind === "browser" && session.tokenHash === tokenHash) {
      matched = true
      const idleTimeoutMs = session.idleTimeoutMs ?? browserSessionIdleTimeoutMs
      const lastAccessAtMs = session.lastAccessAtMs ?? session.createdAtMs
      if (currentTime - lastAccessAtMs >= browserSessionRenewIntervalMs) {
        nextStore.sessions.push({
          ...session,
          lastAccessAtMs: currentTime,
          expiresAtMs: currentTime + idleTimeoutMs,
          idleTimeoutMs,
        })
      } else {
        nextStore.sessions.push(session)
      }
      continue
    }

    nextStore.sessions.push(session)
  }

  writeSessionStore(nextStore)
  return matched
}

function exchangeBootstrapSessionKey(sessionKey: string): {
  sessionToken: string
  expiresAtMs: number
} | null {
  const trimmed = sessionKey.trim()
  if (!trimmed) {
    return null
  }

  const currentTime = Date.now()
  const bootstrapHash = hashSessionToken(trimmed)
  const nextStore: DashboardSessionStore = { sessions: [] }
  let matchedExpiry = 0

  for (const session of readSessionStore().sessions) {
    if (session.expiresAtMs <= currentTime) {
      continue
    }

    if (
      session.kind === "bootstrap" &&
      !session.usedAtMs &&
      session.tokenHash === bootstrapHash
    ) {
      matchedExpiry = session.expiresAtMs
      nextStore.sessions.push({
        ...session,
        usedAtMs: currentTime,
      })
      continue
    }

    nextStore.sessions.push(session)
  }

  if (matchedExpiry === 0) {
    writeSessionStore(nextStore)
    return null
  }

  const sessionToken = randomBytes(32).toString("hex")
  const browserExpiresAtMs = currentTime + browserSessionIdleTimeoutMs
  nextStore.sessions.push({
    tokenHash: hashSessionToken(sessionToken),
    expiresAtMs: browserExpiresAtMs,
    createdAtMs: currentTime,
    kind: "browser",
    lastAccessAtMs: currentTime,
    idleTimeoutMs: browserSessionIdleTimeoutMs,
  })
  writeSessionStore(nextStore)

  return {
    sessionToken,
    expiresAtMs: browserExpiresAtMs,
  }
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

function authorizationInstruction() {
  return "Send Authorization: Bearer <dashboard-session-token> after exchanging the one-time sessionKey."
}

function websocketAuthorizationInstruction() {
  return "Send the dashboard session token in Sec-WebSocket-Protocol as dashboard-session.v1.<token>, not in the URL."
}

function dashboardAuthErrorResponse(input: {
  error: string
  missingHeader?: string
  invalidHeader?: string
  instructions: string[]
  wwwAuthenticate?: string
}): Response {
  return jsonResponse(
    {
      ok: false,
      error: input.error,
      ...(input.missingHeader ? { missingHeader: input.missingHeader } : {}),
      ...(input.invalidHeader ? { invalidHeader: input.invalidHeader } : {}),
      instructions: input.instructions,
    },
    401,
    input.wwwAuthenticate
      ? {
          "www-authenticate": input.wwwAuthenticate,
        }
      : undefined,
  )
}

function extractBearerSessionToken(
  request: Request,
): { token: string } | { response: Response } {
  const authorization = request.headers.get("authorization")?.trim() ?? ""
  if (!authorization) {
    return {
      response: dashboardAuthErrorResponse({
        error: "dashboard session required: missing Authorization header",
        missingHeader: "Authorization",
        instructions: [
          authorizationInstruction(),
          "Use the bootstrap sessionKey only with POST /api/session/exchange and remove it from the URL immediately after exchange.",
        ],
        wwwAuthenticate: 'Bearer realm="dashboard", error="invalid_token"',
      }),
    }
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  if (!match?.[1]?.trim()) {
    return {
      response: dashboardAuthErrorResponse({
        error: "dashboard session required: invalid Authorization header",
        invalidHeader: "Authorization",
        instructions: [
          authorizationInstruction(),
          "Do not place the dashboard session token in query strings or other URL parameters.",
        ],
        wwwAuthenticate:
          'Bearer realm="dashboard", error="invalid_token", error_description="Expected Bearer token"',
      }),
    }
  }

  return { token: match[1].trim() }
}

function extractWebSocketSessionToken(
  request: Request,
): { token: string; selectedProtocol: string } | { response: Response } {
  const header = request.headers.get("sec-websocket-protocol")?.trim() ?? ""
  if (!header) {
    return {
      response: dashboardAuthErrorResponse({
        error:
          "dashboard session required: missing Sec-WebSocket-Protocol header",
        missingHeader: "Sec-WebSocket-Protocol",
        instructions: [
          websocketAuthorizationInstruction(),
          "Do not place the dashboard session token in the WebSocket URL.",
        ],
      }),
    }
  }

  const selectedProtocol = header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .find((entry) => entry.startsWith(dashboardSessionWebSocketProtocolPrefix))

  if (!selectedProtocol) {
    return {
      response: dashboardAuthErrorResponse({
        error:
          "dashboard session required: missing dashboard-session auth protocol in Sec-WebSocket-Protocol",
        missingHeader: "Sec-WebSocket-Protocol",
        instructions: [
          websocketAuthorizationInstruction(),
          "Do not place the dashboard session token in the WebSocket URL.",
        ],
      }),
    }
  }

  const token = selectedProtocol
    .slice(dashboardSessionWebSocketProtocolPrefix.length)
    .trim()
  if (!token) {
    return {
      response: dashboardAuthErrorResponse({
        error:
          "dashboard session required: invalid Sec-WebSocket-Protocol auth value",
        invalidHeader: "Sec-WebSocket-Protocol",
        instructions: [
          websocketAuthorizationInstruction(),
          "Do not place the dashboard session token in the WebSocket URL.",
        ],
      }),
    }
  }

  return { token, selectedProtocol }
}

function requireDashboardSession(request: Request): Response | null {
  if (isLoopbackRequest(request)) {
    return null
  }

  const sessionToken = extractBearerSessionToken(request)
  if ("response" in sessionToken) {
    return sessionToken.response
  }

  if (validateBrowserSessionToken(sessionToken.token)) {
    return null
  }

  return dashboardAuthErrorResponse({
    error: "dashboard session required: invalid or expired bearer token",
    invalidHeader: "Authorization",
    instructions: [
      authorizationInstruction(),
      "Request a fresh dashboard access link if the browser session has expired.",
    ],
    wwwAuthenticate:
      'Bearer realm="dashboard", error="invalid_token", error_description="Expired or unknown dashboard session token"',
  })
}

function requireDashboardWebSocketSession(request: Request): {
  selectedProtocol: string | null
  response: Response | null
} {
  if (isLoopbackRequest(request)) {
    return { selectedProtocol: null, response: null }
  }

  const sessionToken = extractWebSocketSessionToken(request)
  if ("response" in sessionToken) {
    return { selectedProtocol: null, response: sessionToken.response }
  }

  if (validateBrowserSessionToken(sessionToken.token)) {
    return { selectedProtocol: sessionToken.selectedProtocol, response: null }
  }

  return {
    selectedProtocol: null,
    response: dashboardAuthErrorResponse({
      error:
        "dashboard session required: invalid or expired WebSocket auth token",
      invalidHeader: "Sec-WebSocket-Protocol",
      instructions: [
        websocketAuthorizationInstruction(),
        "Request a fresh dashboard access link if the browser session has expired.",
      ],
    }),
  }
}

function requestedWebSocketProtocols(request: Request): string[] {
  const header = request.headers.get("sec-websocket-protocol")?.trim() ?? ""
  if (!header) {
    return []
  }

  return header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function execJson<T>(command: string, args: string[]): T {
  const stdout = execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  }).trim()
  return JSON.parse(stdout) as T
}

function selectWebSocketProtocol(protocols: string[]): string | null {
  return protocols[0] ?? null
}

function proxyMessagePayload(
  message: string | Buffer | Uint8Array,
): ProxyMessage {
  if (typeof message === "string") {
    return message
  }

  return message instanceof Uint8Array ? message : new Uint8Array(message)
}

function proxyEventPayload(
  data: string | ArrayBuffer | Uint8Array,
): ProxyMessage {
  if (typeof data === "string") {
    return data
  }

  return data instanceof Uint8Array ? data : data
}

async function fetchAccessJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!accessApiBaseUrl) {
    throw new Error("dashboard access API is not configured")
  }

  const response = await fetch(`${accessApiBaseUrl}${path}`, init)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `dashboard access request failed for ${path}: ${response.status} ${text}`,
    )
  }

  return (await response.json()) as T
}

async function fetchManagerJson<T>(path: string): Promise<T> {
  const response = await fetch(`${managerBaseUrl}${path}`, {
    headers: {
      accept: "application/json",
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `manager request failed for ${path}: ${response.status} ${text}`,
    )
  }

  return (await response.json()) as T
}

function stackOutputValue(
  outputs: StackOutput[] | undefined,
  key: string,
): string {
  return (
    outputs?.find((output) => output.OutputKey === key)?.OutputValue?.trim() ||
    ""
  )
}

async function readDashboardHostnameFromParameter(
  parameterName: string,
): Promise<string | null> {
  const trimmed = parameterName.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parameter = execJson<{ Parameter?: { Value?: string } }>("aws", [
      "ssm",
      "get-parameter",
      "--name",
      trimmed,
      "--output",
      "json",
    ])
    const rawValue = parameter.Parameter?.Value?.trim() || ""
    if (!rawValue) {
      return null
    }
    const parsed = JSON.parse(rawValue) as { hostnameBase?: string }
    return parsed.hostnameBase?.trim() || null
  } catch {
    return null
  }
}

async function checkDashboardReachability(
  hostname: string | null,
): Promise<{ reachable: boolean; httpStatus: number | null }> {
  const trimmed = hostname?.trim() || ""
  if (!trimmed) {
    return { reachable: false, httpStatus: null }
  }

  try {
    const response = await fetch(`https://${trimmed}/api/config`, {
      signal: AbortSignal.timeout(4000),
    })
    return {
      reachable: response.ok,
      httpStatus: response.status,
    }
  } catch {
    return { reachable: false, httpStatus: null }
  }
}

async function listManagedStacks(): Promise<StackAdminRecord[]> {
  const described = execJson<{ Stacks?: StackSummary[] }>("aws", [
    "cloudformation",
    "describe-stacks",
    "--output",
    "json",
  ])
  const candidateStacks = (described.Stacks ?? [])
    .map((stack) => ({
      stackName: stack.StackName?.trim() || "",
      stackStatus: stack.StackStatus?.trim() || "",
      outputs: stack.Outputs ?? [],
    }))
    .filter(
      (stack) =>
        stack.stackName !== "AgentAdminCdk" &&
        Boolean(stackOutputValue(stack.outputs, "ManagerInstanceId")),
    )

  const instanceIds = candidateStacks
    .map((stack) => stackOutputValue(stack.outputs, "ManagerInstanceId"))
    .filter(Boolean)

  const ec2Instances = instanceIds.length
    ? execJson<{ Reservations?: Array<{ Instances?: Ec2InstanceSummary[] }> }>(
        "aws",
        [
          "ec2",
          "describe-instances",
          "--instance-ids",
          ...instanceIds,
          "--output",
          "json",
        ],
      )
    : { Reservations: [] }
  const instanceMap = new Map<string, Ec2InstanceSummary>()
  for (const reservation of ec2Instances.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      const instanceId = instance.InstanceId?.trim()
      if (instanceId) {
        instanceMap.set(instanceId, instance)
      }
    }
  }

  const ec2Statuses = instanceIds.length
    ? execJson<{ InstanceStatuses?: Ec2InstanceStatusSummary[] }>("aws", [
        "ec2",
        "describe-instance-status",
        "--include-all-instances",
        "--instance-ids",
        ...instanceIds,
        "--output",
        "json",
      ])
    : { InstanceStatuses: [] }
  const statusMap = new Map<string, Ec2InstanceStatusSummary>()
  for (const status of ec2Statuses.InstanceStatuses ?? []) {
    const instanceId = status.InstanceId?.trim()
    if (instanceId) {
      statusMap.set(instanceId, status)
    }
  }

  const ssmInfo = execJson<{ InstanceInformationList?: SsmInstanceSummary[] }>(
    "aws",
    ["ssm", "describe-instance-information", "--output", "json"],
  )
  const ssmMap = new Map<string, SsmInstanceSummary>()
  for (const instance of ssmInfo.InstanceInformationList ?? []) {
    const instanceId = instance.InstanceId?.trim()
    if (instanceId) {
      ssmMap.set(instanceId, instance)
    }
  }

  const records = await Promise.all(
    candidateStacks.map(async (stack) => {
      const managerInstanceId = stackOutputValue(
        stack.outputs,
        "ManagerInstanceId",
      )
      const privateIp =
        stackOutputValue(stack.outputs, "ManagerPrivateIp") ||
        instanceMap.get(managerInstanceId)?.PrivateIpAddress?.trim() ||
        ""
      const dashboardAccessUrl = stackOutputValue(
        stack.outputs,
        "DashboardAccessUrl",
      )
      const cloudflareConfigParameterName = stackOutputValue(
        stack.outputs,
        "CloudflareTunnelConfigParameterName",
      )
      const dashboardHostname = await readDashboardHostnameFromParameter(
        cloudflareConfigParameterName,
      )
      const dashboard = await checkDashboardReachability(dashboardHostname)
      const instance = instanceMap.get(managerInstanceId)
      const instanceStatus = statusMap.get(managerInstanceId)
      const ssm = ssmMap.get(managerInstanceId)

      return {
        stackName: stack.stackName,
        stackStatus: stack.stackStatus,
        managerInstanceId,
        managerPrivateIp: privateIp,
        dashboardAccessUrl,
        dashboardHostname,
        manager: {
          instanceState: instance?.State?.Name?.trim() || "unknown",
          systemStatus: instanceStatus?.SystemStatus?.Status?.trim() || null,
          instanceStatus:
            instanceStatus?.InstanceStatus?.Status?.trim() || null,
          ssmPingStatus: ssm?.PingStatus?.trim() || null,
          lastSsmPingAt: ssm?.LastPingDateTime?.trim() || null,
        },
        dashboard,
      } satisfies StackAdminRecord
    }),
  )

  return records.sort((left, right) =>
    left.stackName.localeCompare(right.stackName),
  )
}

async function isBackendHealthy(
  backend: GatewayBackendDefinition,
): Promise<boolean> {
  try {
    const response = await fetch(`${backend.baseUrl}${backend.healthPath}`)
    return response.ok
  } catch {
    return false
  }
}

async function waitForBackendHealthy(
  backend: GatewayBackendDefinition,
  maxAttempts = 30,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isBackendHealthy(backend)) {
      return
    }
    await Bun.sleep(250)
  }

  throw new Error(`${backend.id} did not become healthy in time`)
}

async function isManagedViteDevFrontendHealthy(): Promise<boolean> {
  if (!dashboardDevFrontendManaged || !dashboardDevFrontendUrl) {
    return true
  }

  try {
    const response = await fetch(dashboardDevFrontendUrl, {
      headers: {
        accept: "text/html,*/*",
      },
    })
    return response.ok
  } catch {
    return false
  }
}

async function waitForManagedViteDevFrontendHealthy(
  maxAttempts = 40,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isManagedViteDevFrontendHealthy()) {
      return
    }
    await Bun.sleep(250)
  }

  throw new Error("dashboard dev frontend did not become healthy in time")
}

async function startManagedViteDevFrontend(): Promise<void> {
  if (!dashboardDevFrontendManaged || !dashboardDevFrontendUrl) {
    return
  }

  mkdirSync(dirname(dashboardDevFrontendLogPath), { recursive: true })
  const command = [
    "bun",
    "run",
    "--filter",
    "@agent-infrastructure/dashboard-app",
    "dev",
    "--",
    "--host",
    dashboardDevFrontendHost,
    "--port",
    String(dashboardDevFrontendPort),
  ]
  logSystemStep(
    "dashboard-server",
    `start dashboard-dev-frontend command=${command.map(shellQuote).join(" ")}`,
  )

  const processHandle = Bun.spawn(
    [
      "bash",
      "-lc",
      `nohup ${command.map(shellQuote).join(" ")} >> ${shellQuote(dashboardDevFrontendLogPath)} 2>&1 < /dev/null & echo $!`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DASHBOARD_DEV_SERVER_PORT: String(port),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  const stdout = await new Response(processHandle.stdout).text()
  const stderr = await new Response(processHandle.stderr).text()
  await processHandle.exited

  if (processHandle.exitCode !== 0) {
    logSystemStep(
      "dashboard-server",
      `error dashboard-dev-frontend launch_failed=${stderr.trim()}`,
    )
    throw new Error(stderr.trim() || "failed to launch dashboard dev frontend")
  }

  const pid = Number.parseInt(stdout.trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    logSystemStep(
      "dashboard-server",
      "error dashboard-dev-frontend invalid_pid",
    )
    throw new Error("failed to capture dashboard dev frontend pid")
  }

  logSystemStep("dashboard-server", `exit dashboard-dev-frontend pid=${pid}`)
}

async function ensureManagedViteDevFrontend(): Promise<void> {
  if (!dashboardDevFrontendManaged || !dashboardDevFrontendUrl) {
    return
  }

  if (await isManagedViteDevFrontendHealthy()) {
    return
  }

  const key = dashboardDevFrontendUrl
  const currentPromise = viteDevFrontendEnsurePromises.get(key)
  if (!currentPromise) {
    const nextPromise = (async () => {
      if (await isManagedViteDevFrontendHealthy()) {
        return
      }
      await startManagedViteDevFrontend()
      await waitForManagedViteDevFrontendHealthy()
    })().finally(() => {
      viteDevFrontendEnsurePromises.delete(key)
    })

    viteDevFrontendEnsurePromises.set(key, nextPromise)
  }

  await viteDevFrontendEnsurePromises.get(key)
}

function startManagedViteDevFrontendWatchdog(): void {
  if (!dashboardDevFrontendManaged || !dashboardDevFrontendUrl) {
    return
  }

  void ensureManagedViteDevFrontend().catch((error) => {
    logSystemStep(
      "dashboard-server",
      `error dashboard-dev-frontend ensure_failed=${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  })

  setInterval(() => {
    void ensureManagedViteDevFrontend().catch((error) => {
      logSystemStep(
        "dashboard-server",
        `error dashboard-dev-frontend ensure_failed=${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
  }, 3000)
}

async function startBackend(backend: GatewayBackendDefinition): Promise<void> {
  if (!backend.startCommand || backend.startCommand.length === 0) {
    throw new Error(`${backend.id} backend is not configured for lazy start`)
  }

  const command = backend.startCommand.map(shellQuote).join(" ")
  if (backend.logPath) {
    mkdirSync(dirname(backend.logPath), { recursive: true })
    writeFileSync(backend.logPath, "")
  }
  logSystemStep("dashboard-server", `start ${backend.id} command=${command}`)

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
  )

  const stdout = await new Response(processHandle.stdout).text()
  const stderr = await new Response(processHandle.stderr).text()
  await processHandle.exited

  if (processHandle.exitCode !== 0) {
    logSystemStep(
      "dashboard-server",
      `error ${backend.id} launch_failed=${stderr.trim()}`,
    )
    throw new Error(stderr.trim() || `failed to launch ${backend.id}`)
  }

  const pid = Number.parseInt(stdout.trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    logSystemStep("dashboard-server", `error ${backend.id} invalid_pid`)
    throw new Error(`failed to capture ${backend.id} pid`)
  }

  logSystemStep("dashboard-server", `exit ${backend.id} pid=${pid}`)
}

async function ensureBackend(backend: GatewayBackendDefinition): Promise<void> {
  if (await isBackendHealthy(backend)) {
    return
  }

  const currentPromise = backendEnsurePromises.get(backend.id)
  if (!currentPromise) {
    const nextPromise = (async () => {
      if (await isBackendHealthy(backend)) {
        return
      }
      await startBackend(backend)
      await waitForBackendHealthy(backend)
    })().finally(() => {
      backendEnsurePromises.delete(backend.id)
    })

    backendEnsurePromises.set(backend.id, nextPromise)
  }

  await backendEnsurePromises.get(backend.id)
}

async function ensureAlwaysBackends(): Promise<void> {
  const backends = gatewayBackends.filter(
    (backend) => backend.startupPolicy === "always",
  )
  await Promise.all(
    backends.map(async (backend) => {
      try {
        await ensureBackend(backend)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        logSystemStep(
          "dashboard-server",
          `error ${backend.id} ensure_always_failed=${detail}`,
        )
      }
    }),
  )
}

function findApiBackend(
  pathname: string,
): GatewayBackendDefinition | undefined {
  return gatewayBackends.find((backend) => {
    if (!backend.apiBasePath) {
      return false
    }
    return (
      pathname === backend.apiBasePath ||
      pathname.startsWith(`${backend.apiBasePath}/`)
    )
  })
}

function findWsBackend(pathname: string): GatewayBackendDefinition | undefined {
  return gatewayBackends.find((backend) => {
    if (!backend.wsBasePath || !backend.wsUrl) {
      return false
    }
    return (
      pathname === backend.wsBasePath || pathname === `${backend.wsBasePath}/`
    )
  })
}

async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
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
  }

  if (url.pathname === "/api/config") {
    return jsonResponse({
      ok: true,
      accessAppUrl: accessApiBaseUrl,
      requiresSession: !isLoopbackRequest(request),
      hostRole: dashboardHostRole,
    })
  }

  if (request.method === "GET" && url.pathname === "/api/runtime-release") {
    const unauthorized = requireDashboardSession(request)
    if (unauthorized) {
      return unauthorized
    }

    return jsonResponse(readRuntimeReleaseStatus())
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/runtime-release/deploy"
  ) {
    const unauthorized = requireDashboardSession(request)
    if (unauthorized) {
      return unauthorized
    }

    const body = await parseJsonBody<RuntimeDeployRequest>(request)
    if (!body || (body.target !== "latest" && body.target !== "tag")) {
      return jsonResponse(
        { ok: false, error: "target must be latest or tag" },
        400,
      )
    }

    const requestedTag = body.target === "tag" ? body.tag.trim() : ""
    if (body.target === "tag" && !requestedTag) {
      return jsonResponse({ ok: false, error: "tag is required" }, 400)
    }

    if (body.target === "tag") {
      const visibleTags = new Set(listVisibleReleaseTags())
      if (!visibleTags.has(requestedTag)) {
        return jsonResponse({ ok: false, error: "unknown release tag" }, 404)
      }
    }

    try {
      const deploy = await startRuntimeDeploy(
        body.target === "tag" ? requestedTag : undefined,
      )
      return jsonResponse(
        {
          ok: true,
          target: body.target,
          ...(body.target === "tag" ? { tag: requestedTag } : {}),
          pid: deploy.pid,
          logPath: deploy.logPath,
        },
        202,
      )
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to start deploy",
        },
        500,
      )
    }
  }

  if (request.method === "POST" && url.pathname === "/api/session/exchange") {
    const body = await parseJsonBody<SessionExchangeBody>(request)
    if (!body || typeof body.sessionKey !== "string") {
      return jsonResponse({ ok: false, error: "sessionKey is required" }, 400)
    }

    const exchanged = exchangeBootstrapSessionKey(body.sessionKey)
    if (!exchanged) {
      return jsonResponse({ ok: false, error: "invalid session key" }, 401)
    }

    return jsonResponse({
      ok: true,
      sessionToken: exchanged.sessionToken,
      expiresAtMs: exchanged.expiresAtMs,
    })
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/access/enrollment-url"
  ) {
    const unauthorized = requireDashboardSession(request)
    if (unauthorized) {
      return unauthorized
    }

    if (!accessApiBaseUrl || !enrollmentSecret) {
      return jsonResponse(
        { ok: false, error: "dashboard access registration is not configured" },
        503,
      )
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
      )
      return jsonResponse(result)
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "failed to create enrollment ticket",
        },
        502,
      )
    }
  }

  if (request.method === "GET" && url.pathname === "/api/stack-admin/stacks") {
    const unauthorized = requireDashboardSession(request)
    if (unauthorized) {
      return unauthorized
    }
    if (dashboardHostRole !== "admin") {
      return jsonResponse(
        { ok: false, error: "stack admin is not enabled" },
        404,
      )
    }

    try {
      const stacks = await listManagedStacks()
      return jsonResponse({
        ok: true,
        stacks,
      })
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "failed to load managed stacks",
        },
        500,
      )
    }
  }

  const unauthorized = requireDashboardSession(request)
  if (unauthorized) {
    return unauthorized
  }

  if (swarmApiAliases.health.has(url.pathname)) {
    try {
      const managerHealth =
        await fetchManagerJson<ManagerHealthResponse>("/health")
      return jsonResponse({
        ok: true,
        dashboard: {
          port,
        },
        manager: managerHealth,
      })
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to reach manager",
        },
        502,
      )
    }
  }

  if (swarmApiAliases.workers.has(url.pathname)) {
    try {
      const workers = await fetchManagerJson<WorkersResponse>("/workers")
      return jsonResponse(workers)
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to fetch workers",
        },
        502,
      )
    }
  }

  if (swarmApiAliases.workerTimeline.has(url.pathname)) {
    try {
      const search = new URLSearchParams()
      const workerId = url.searchParams.get("workerId")?.trim() ?? ""
      const rangeMinutes = url.searchParams.get("rangeMinutes")?.trim() ?? ""
      const sinceTsMs = url.searchParams.get("sinceTsMs")?.trim() ?? ""
      const untilTsMs = url.searchParams.get("untilTsMs")?.trim() ?? ""

      if (workerId) {
        search.set("workerId", workerId)
      }

      if (rangeMinutes) {
        search.set("rangeMinutes", rangeMinutes)
      }

      if (sinceTsMs) {
        search.set("sinceTsMs", sinceTsMs)
      }

      if (untilTsMs) {
        search.set("untilTsMs", untilTsMs)
      }

      const suffix = search.toString()
      const timeline = await fetchManagerJson(
        `/workers/timeline${suffix ? `?${suffix}` : ""}`,
      )
      return jsonResponse(timeline)
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "failed to fetch worker timeline",
        },
        502,
      )
    }
  }

  if (swarmApiAliases.workerEvents.has(url.pathname)) {
    try {
      const search = new URLSearchParams()
      const workerId = url.searchParams.get("workerId")?.trim() ?? ""
      const limit = url.searchParams.get("limit")?.trim() ?? ""

      if (workerId) {
        search.set("workerId", workerId)
      }

      if (limit) {
        search.set("limit", limit)
      }

      const suffix = search.toString()
      const events = await fetchManagerJson<WorkerLifecycleEventsResponse>(
        `/workers/events${suffix ? `?${suffix}` : ""}`,
      )
      return jsonResponse(events)
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "failed to fetch worker events",
        },
        502,
      )
    }
  }

  if (swarmApiAliases.services.has(url.pathname)) {
    try {
      const services = await fetchManagerJson<ServicesResponse>("/services")
      return jsonResponse(services)
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to fetch services",
        },
        502,
      )
    }
  }

  if (swarmApiAliases.summary.has(url.pathname)) {
    try {
      const [managerHealth, workers, services] = await Promise.all([
        fetchManagerJson<ManagerHealthResponse>("/health"),
        fetchManagerJson<WorkersResponse>("/workers"),
        fetchManagerJson<ServicesResponse>("/services"),
      ])
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
          healthyServices: services.services.filter(
            (service) => service.healthy,
          ).length,
        },
      })
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "failed to build summary",
        },
        502,
      )
    }
  }

  if (request.method === "GET" && url.pathname === "/api/local-file-preview") {
    const requestedPath = url.searchParams.get("path")?.trim() ?? ""
    if (!requestedPath) {
      return jsonResponse({ ok: false, error: "path is required" }, 400)
    }

    const resolvedPath = resolve(requestedPath)
    if (!isAllowedLocalFilePreviewPath(resolvedPath)) {
      return jsonResponse(
        { ok: false, error: "path is outside allowed preview roots" },
        403,
      )
    }

    if (!existsSync(resolvedPath)) {
      return jsonResponse({ ok: false, error: "file not found" }, 404)
    }

    const stats = statSync(resolvedPath)
    if (!stats.isFile()) {
      return jsonResponse({ ok: false, error: "path is not a file" }, 400)
    }

    if (stats.size > localFilePreviewMaxBytes) {
      return jsonResponse(
        {
          ok: false,
          error: `file is too large to preview (${stats.size} bytes)`,
        },
        413,
      )
    }

    return new Response(Bun.file(resolvedPath), {
      headers: {
        "content-type": contentTypeForLocalFilePreview(resolvedPath),
        "content-disposition": `inline; filename="${basename(resolvedPath)}"`,
        "cache-control": "no-store",
      },
    })
  }

  const featureBackend = findApiBackend(url.pathname)
  if (featureBackend) {
    try {
      await ensureBackend(featureBackend)
      const response = await fetch(
        `${featureBackend.baseUrl}${url.pathname}${url.search}`,
        {
          method: request.method,
          headers: {
            accept: "application/json",
            ...(request.headers.get("content-type")
              ? { "content-type": request.headers.get("content-type") ?? "" }
              : {}),
          },
          body:
            request.method === "GET" || request.method === "HEAD"
              ? undefined
              : await request.text(),
        },
      )

      const body = await response.arrayBuffer()
      const contentType =
        response.headers.get("content-type") ??
        "application/json; charset=utf-8"
      const cacheControl = response.headers.get("cache-control") ?? "no-store"
      const contentLength = response.headers.get("content-length")

      return new Response(body, {
        status: response.status,
        headers: {
          "content-type": contentType,
          "cache-control": cacheControl,
          ...(contentLength ? { "content-length": contentLength } : {}),
        },
      })
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
      )
    }
  }

  return jsonResponse({ ok: false, error: "not found" }, 404)
}

function contentTypeForLocalFilePreview(pathname: string): string {
  if (
    pathname.endsWith(".ts") ||
    pathname.endsWith(".tsx") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".jsx") ||
    pathname.endsWith(".mjs") ||
    pathname.endsWith(".cjs") ||
    pathname.endsWith(".md") ||
    pathname.endsWith(".txt")
  ) {
    return "text/plain; charset=utf-8"
  }
  return contentTypeForStaticPath(pathname)
}

function contentTypeForStaticPath(pathname: string): string {
  if (pathname.endsWith(".html")) {
    return "text/html; charset=utf-8"
  }
  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8"
  }
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8"
  }
  if (pathname.endsWith(".json")) {
    return "application/json; charset=utf-8"
  }
  if (pathname.endsWith(".svg")) {
    return "image/svg+xml"
  }
  if (pathname.endsWith(".png")) {
    return "image/png"
  }
  return "application/octet-stream"
}

function isAllowedLocalFilePreviewPath(pathname: string): boolean {
  return localFilePreviewAllowedRoots.some((rootPath) => {
    return pathname === rootPath || pathname.startsWith(`${rootPath}/`)
  })
}

async function serveStatic(url: URL): Promise<Response> {
  if (dashboardDevFrontendUrl) {
    try {
      await ensureManagedViteDevFrontend()
    } catch (error) {
      return new Response(
        `Dashboard dev frontend is unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          status: 503,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      )
    }

    const upstreamUrl = `${dashboardDevFrontendUrl}${url.pathname}${url.search}`
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        accept: "*/*",
      },
    })

    return new Response(response.body, {
      status: response.status,
      headers: copyResponseHeaders(response.headers),
    })
  }

  if (!existsSync(dashboardDistDir)) {
    return new Response(
      "Dashboard assets are missing. Run `bun run build:dashboard` first.",
      {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      },
    )
  }

  const relativePath =
    url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "")
  const targetPath = join(dashboardDistDir, relativePath)
  const fallbackPath = join(dashboardDistDir, "index.html")
  const selectedPath = existsSync(targetPath) ? targetPath : fallbackPath
  const file = Bun.file(selectedPath)

  return new Response(file, {
    headers: {
      "content-type": contentTypeForStaticPath(selectedPath),
      "cache-control": selectedPath.endsWith("index.html")
        ? "no-store"
        : "public, max-age=300",
    },
  })
}

const server = Bun.serve<DashboardWsData>({
  port,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url)
    const wsBackend = findWsBackend(url.pathname)
    const requestWantsWebSocket =
      request.headers.get("upgrade")?.toLowerCase() === "websocket"

    if (shouldProxyToMainDashboard(url.pathname)) {
      if (requestWantsWebSocket) {
        const requestedProtocols = requestedWebSocketProtocols(request)
        const selectedProtocol = selectWebSocketProtocol(requestedProtocols)
        const upstreamProtocols =
          mainDashboardProxyWebSocketProtocols(requestedProtocols)
        if (
          server.upgrade(request, {
            data: {
              kind: "main-dashboard-proxy",
              upstreamUrl: mainDashboardWebSocketUrl(url),
              upstream: null,
              queue: [],
              upstreamProtocols,
              requestedProtocols,
              selectedProtocol,
            },
            headers: selectedProtocol
              ? { "Sec-WebSocket-Protocol": selectedProtocol }
              : undefined,
          })
        ) {
          return undefined
        }

        return new Response("upgrade failed", { status: 500 })
      }

      return proxyRequestToMainDashboard(request)
    }

    if (wsBackend) {
      const wsSession = requireDashboardWebSocketSession(request)
      if (wsSession.response) {
        return wsSession.response
      }

      if (
        server.upgrade(request, {
          data: {
            kind: "graph-proxy",
            backendId: wsBackend.id,
            upstreamUrl: `${wsBackend.wsUrl}${url.search}`,
            upstream: null,
            queue: [],
            selectedProtocol: wsSession.selectedProtocol,
          },
          headers: wsSession.selectedProtocol
            ? { "Sec-WebSocket-Protocol": wsSession.selectedProtocol }
            : undefined,
        })
      ) {
        return undefined
      }

      return new Response("upgrade failed", { status: 500 })
    }

    if (
      url.pathname === "/ws/dashboard-status" ||
      url.pathname === "/ws/dashboard-status/"
    ) {
      const wsSession = requireDashboardWebSocketSession(request)
      if (wsSession.response) {
        return wsSession.response
      }

      if (
        server.upgrade(request, {
          data: {
            kind: "dashboard-status",
            heartbeatTimer: null,
            selectedProtocol: wsSession.selectedProtocol,
          },
          headers: wsSession.selectedProtocol
            ? { "Sec-WebSocket-Protocol": wsSession.selectedProtocol }
            : undefined,
        })
      ) {
        return undefined
      }

      return new Response("upgrade failed", { status: 500 })
    }

    if (url.pathname === "/ws/debug-log" || url.pathname === "/ws/debug-log/") {
      const wsSession = requireDashboardWebSocketSession(request)
      if (wsSession.response) {
        return wsSession.response
      }

      if (
        server.upgrade(request, {
          data: {
            kind: "debug-log",
            selectedProtocol: wsSession.selectedProtocol,
          },
          headers: wsSession.selectedProtocol
            ? { "Sec-WebSocket-Protocol": wsSession.selectedProtocol }
            : undefined,
        })
      ) {
        return undefined
      }

      return new Response("upgrade failed", { status: 500 })
    }

    if (requestWantsWebSocket && dashboardDevFrontendUrl) {
      try {
        await ensureManagedViteDevFrontend()
      } catch {
        return new Response("dashboard dev frontend unavailable", {
          status: 503,
        })
      }

      const upstreamUrl = `${wsBaseUrlFromHttpOrigin(dashboardDevFrontendUrl)}${url.pathname}${url.search}`
      const requestedProtocols = requestedWebSocketProtocols(request)
      const selectedProtocol = selectWebSocketProtocol(requestedProtocols)
      if (
        server.upgrade(request, {
          data: {
            kind: "vite-proxy",
            upstreamUrl,
            upstream: null,
            queue: [],
            requestedProtocols,
            selectedProtocol,
          },
          headers: selectedProtocol
            ? { "Sec-WebSocket-Protocol": selectedProtocol }
            : undefined,
        })
      ) {
        return undefined
      }

      return new Response("upgrade failed", { status: 500 })
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request)
    }

    return serveStatic(url)
  },
  websocket: {
    open(ws) {
      if (ws.data.kind === "dashboard-status") {
        ws.send(JSON.stringify(dashboardStatusPayload()))
        ws.data.heartbeatTimer = setInterval(() => {
          try {
            ws.send(JSON.stringify(dashboardStatusPayload()))
          } catch {}
        }, 15000)
        return
      }

      if (ws.data.kind === "debug-log") {
        return
      }

      if (ws.data.kind === "vite-proxy") {
        const proxyData = ws.data
        const upstream =
          proxyData.requestedProtocols.length > 0
            ? new WebSocket(proxyData.upstreamUrl, proxyData.requestedProtocols)
            : new WebSocket(proxyData.upstreamUrl)
        proxyData.upstream = upstream

        upstream.addEventListener("open", () => {
          for (const message of proxyData.queue) {
            upstream.send(message)
          }
          proxyData.queue = []
        })

        upstream.addEventListener("message", (event) => {
          ws.send(proxyEventPayload(event.data))
        })

        upstream.addEventListener("close", () => {
          try {
            ws.close()
          } catch {}
        })

        upstream.addEventListener("error", () => {
          try {
            ws.close()
          } catch {}
        })
        return
      }

      if (ws.data.kind === "main-dashboard-proxy") {
        const proxyData = ws.data
        const upstream =
          proxyData.upstreamProtocols.length > 0
            ? new WebSocket(proxyData.upstreamUrl, proxyData.upstreamProtocols)
            : new WebSocket(proxyData.upstreamUrl)
        proxyData.upstream = upstream

        upstream.addEventListener("open", () => {
          for (const message of proxyData.queue) {
            upstream.send(message)
          }
          proxyData.queue = []
        })

        upstream.addEventListener("message", (event) => {
          ws.send(proxyEventPayload(event.data))
        })

        upstream.addEventListener("close", () => {
          try {
            ws.close()
          } catch {}
        })

        upstream.addEventListener("error", () => {
          try {
            ws.close()
          } catch {}
        })
        return
      }

      const proxyData = ws.data
      const backend = gatewayBackends.find(
        (candidate) => candidate.id === proxyData.backendId,
      )
      if (!backend?.wsUrl) {
        try {
          ws.close()
        } catch {}
        return
      }
      void (async () => {
        try {
          await ensureBackend(backend)
        } catch {
          try {
            ws.close()
          } catch {}
          return
        }

        const upstreamUrl = proxyData.upstreamUrl || backend.wsUrl
        if (!upstreamUrl) {
          try {
            ws.close()
          } catch {}
          return
        }

        const upstream = new WebSocket(upstreamUrl)
        proxyData.upstream = upstream

        upstream.addEventListener("open", () => {
          for (const message of proxyData.queue) {
            upstream.send(message)
          }
          proxyData.queue = []
        })

        upstream.addEventListener("message", (event) => {
          ws.send(String(event.data))
        })

        upstream.addEventListener("close", () => {
          try {
            ws.close()
          } catch {}
        })

        upstream.addEventListener("error", () => {
          try {
            ws.close()
          } catch {}
        })
      })()
    },
    message(ws, message) {
      if (ws.data.kind === "dashboard-status") {
        return
      }

      if (ws.data.kind === "debug-log") {
        appendBrowserDebugLog(String(message))
        return
      }

      if (ws.data.kind === "vite-proxy") {
        const payload = proxyMessagePayload(message)
        const upstream = ws.data.upstream
        if (upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.send(payload)
          return
        }
        ws.data.queue.push(payload)
        return
      }

      if (ws.data.kind === "main-dashboard-proxy") {
        const payload = proxyMessagePayload(message)
        const upstream = ws.data.upstream
        if (upstream && upstream.readyState === WebSocket.OPEN) {
          upstream.send(payload)
          return
        }
        ws.data.queue.push(payload)
        return
      }

      const payload = String(message)
      const upstream = ws.data.upstream
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(payload)
        return
      }

      ws.data.queue.push(payload)
    },
    close(ws) {
      if (ws.data.kind === "dashboard-status") {
        if (ws.data.heartbeatTimer) {
          clearInterval(ws.data.heartbeatTimer)
          ws.data.heartbeatTimer = null
        }
        return
      }

      if (ws.data.kind === "debug-log") {
        return
      }

      if (ws.data.kind === "vite-proxy") {
        try {
          ws.data.upstream?.close()
        } catch {}
        return
      }

      if (ws.data.kind === "main-dashboard-proxy") {
        try {
          ws.data.upstream?.close()
        } catch {}
        return
      }

      try {
        ws.data.upstream?.close()
      } catch {}
    },
  },
})

void ensureAlwaysBackends()
startManagedViteDevFrontendWatchdog()

console.log(
  JSON.stringify({
    ok: true,
    event: "dashboard_server_started",
    url: `http://${server.hostname}:${server.port}`,
    backendVersion: dashboardBackendVersion,
    managerBaseUrl,
    dashboardDistDir,
    dashboardDevFrontendManaged,
    dashboardDevFrontendUrl,
    dashboardDevMainDashboardProxyEnabled,
    dashboardDevMainDashboardUrl,
    dashboardDevMainDashboardProxyPaths,
    accessApiBaseUrl,
  }),
)
