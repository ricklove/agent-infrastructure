import { createHash, randomBytes } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_DASHBOARD_RUNTIME_DIR,
  DEFAULT_DASHBOARD_SESSION_STORE_PATH,
} from "../paths.js"

export type DashboardRuntimeConfig = {
  port: number
  managerUrl: string
  useCloudflared: boolean
  forceRebuild?: boolean
  accessApiBaseUrl?: string
  enrollmentSecret?: string
}

type DashboardRuntimeState = {
  dashboardPid: number
  dashboardLogPath: string
  localUrl: string
  cloudflaredPid?: number
  cloudflaredLogPath?: string
  cloudflaredMode?: "quick" | "named"
  tunnelPid?: number
  tunnelLogPath?: string
  tunnelProvider?: "cloudflared" | "localhost-run"
  publicUrl?: string
  tunnelCreatedAtMs?: number
  lastTunnelReplaceAtMs?: number
  namedTunnelId?: string
  namedTunnelName?: string
  namedTunnelHostnameBase?: string
}

type DashboardSessionRecord = {
  tokenHash: string
  expiresAtMs: number
  createdAtMs: number
  kind: "bootstrap" | "browser"
  publicHostname?: string
  usedAtMs?: number
  lastAccessAtMs?: number
  idleTimeoutMs?: number
}

type DashboardSessionStore = {
  sessions: DashboardSessionRecord[]
}

const sourceDir = dirname(fileURLToPath(import.meta.url))
export const repoRoot = resolve(sourceDir, "../../../..")
const dashboardDistDir = resolve(repoRoot, "apps/dashboard-app/dist")
const dashboardServerEntry = resolve(
  repoRoot,
  "packages/dashboard/src/server.ts",
)
const runtimeDir =
  process.env.DASHBOARD_RUNTIME_DIR?.trim() || DEFAULT_DASHBOARD_RUNTIME_DIR
const runtimeStatePath = resolve(runtimeDir, "runtime-state.json")
const dashboardLogPath = resolve(runtimeDir, "dashboard.log")
const cloudflaredLogPath = resolve(runtimeDir, "cloudflared.log")
const cloudflaredConfigPath = resolve(runtimeDir, "cloudflared-config.yml")
const localhostRunLogPath = resolve(runtimeDir, "localhost-run.log")
const localhostRunPublicUrlPattern = /https:\/\/[a-z0-9-]+\.lhr\.life/gi
const bootstrapContextPath =
  process.env.SWARM_BOOTSTRAP_CONTEXT_PATH?.trim() ||
  DEFAULT_BOOTSTRAP_CONTEXT_PATH
const sessionStorePath =
  process.env.DASHBOARD_SESSION_STORE_PATH?.trim() ||
  DEFAULT_DASHBOARD_SESSION_STORE_PATH
const _dashboardLifecycleControllerEntry = resolve(
  repoRoot,
  "packages/swarm-manager/src/manager/dashboard-controller.ts",
)
const localhostRunTunnelEntry = resolve(
  repoRoot,
  "packages/swarm-manager/src/manager/localhost-run-tunnel.ts",
)
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
const SYSTEM_EVENT_LOG_PATH =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() ||
  "/home/ec2-user/state/logs/system-events.log"
const dashboardRecoveryIncidentDir = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-recovery-incidents",
)
const dashboardHelpRequestDir = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-help-requests",
)
const _dashboardLifecycleControllerLogPath = resolve(
  runtimeDir,
  "dashboard-lifecycle-controller.log",
)
const dashboardLifecycleControllerLockPath = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-lifecycle-controller.lock",
)
const dashboardLifecycleRequestPath = resolve(
  process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state",
  "dashboard-lifecycle-request.json",
)
const quickTunnelHostnamePattern = /^[a-z0-9-]+\.trycloudflare\.com$/i
const cloudflareZoneName =
  process.env.CLOUDFLARED_ZONE_NAME?.trim() ||
  readBootstrapContextValue("cloudflareZoneName")
const cloudflareTunnelId =
  process.env.CLOUDFLARED_TUNNEL_ID?.trim() ||
  readBootstrapContextValue("cloudflareTunnelId")
const cloudflareTunnelName =
  process.env.CLOUDFLARED_TUNNEL_NAME?.trim() ||
  readBootstrapContextValue("cloudflareTunnelName")
const cloudflareHostnameBase =
  process.env.CLOUDFLARED_HOSTNAME_BASE?.trim() ||
  readBootstrapContextValue("cloudflareHostnameBase")
const cloudflareTunnelToken = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim() || ""
const quickTunnelReplacementCooldownMs =
  Math.max(
    300,
    Number.parseInt(
      process.env.DASHBOARD_TUNNEL_REPLACEMENT_COOLDOWN_SECONDS ?? "1800",
      10,
    ) || 1800,
  ) * 1000
const sustainedPublicFailureReplacementMs =
  Math.max(
    30,
    Number.parseInt(
      process.env.DASHBOARD_TUNNEL_SUSTAINED_FAILURE_SECONDS ?? "120",
      10,
    ) || 120,
  ) * 1000
const dashboardLifecycleDemandSeconds =
  Math.max(
    30,
    Number.parseInt(
      process.env.DASHBOARD_LIFECYCLE_DEMAND_SECONDS ?? "120",
      10,
    ) || 120,
  ) * 1000
const dashboardLifecyclePollMs =
  Math.max(
    1,
    Number.parseInt(process.env.DASHBOARD_LIFECYCLE_POLL_SECONDS ?? "2", 10) ||
      2,
  ) * 1000
const dashboardLifecycleHealthyRecheckMs =
  Math.max(
    5,
    Number.parseInt(
      process.env.DASHBOARD_LIFECYCLE_HEALTHY_RECHECK_SECONDS ?? "15",
      10,
    ) || 15,
  ) * 1000

type DashboardLifecycleRequest = {
  port: number
  managerUrl: string
  requestedAtMs: number
  keepAliveUntilMs: number
}

type DashboardRuntimeStatus = {
  dashboardHealthy: boolean
  dashboardRunning: boolean
  tunnelRunning: boolean
  publicReady: boolean
}

function getLastTunnelReplacementAttemptAtMs(
  state: DashboardRuntimeState | null,
): number {
  return state?.lastTunnelReplaceAtMs ?? state?.tunnelCreatedAtMs ?? 0
}

function logSystemStep(source: string, message: string): void {
  const line = `[${new Date().toISOString()}:${source}] ${message}`
  mkdirSync("/home/ec2-user/state/logs", { recursive: true })
  appendFileSync(SYSTEM_EVENT_LOG_PATH, `${line}\n`)
  console.error(line)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function ensureParentDir(path: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true })
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
  })

  if (result.exitCode !== 0) {
    throw new Error(`command failed: ${command.join(" ")}`)
  }
}

function isPidRunning(pid?: number): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readRuntimeState(): DashboardRuntimeState | null {
  if (!existsSync(runtimeStatePath)) {
    return null
  }

  try {
    return JSON.parse(
      readFileSync(runtimeStatePath, "utf8"),
    ) as DashboardRuntimeState
  } catch {
    return null
  }
}

function writeRuntimeState(state: DashboardRuntimeState): void {
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(runtimeStatePath, JSON.stringify(state, null, 2))
}

function clearRuntimeState(): void {
  try {
    rmSync(runtimeStatePath, { force: true })
  } catch {}
}

function getPortFromRuntimeState(state: DashboardRuntimeState | null): number {
  if (!state?.localUrl) {
    return 3000
  }

  try {
    const parsed = new URL(state.localUrl)
    const port = Number.parseInt(parsed.port || "3000", 10)
    return Number.isInteger(port) && port > 0 ? port : 3000
  } catch {
    return 3000
  }
}

function _extractQuickTunnelUrls(): string[] {
  if (!existsSync(cloudflaredLogPath)) {
    return []
  }

  try {
    const log = readFileSync(cloudflaredLogPath, "utf8")
    const matches = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g) ?? []
    const deduped = new Set<string>()

    for (const match of matches) {
      const value = match.trim()
      if (value) {
        deduped.add(value)
      }
    }

    return [...deduped]
  } catch {
    return []
  }
}

function discoverPidByPattern(pattern: RegExp): number | null {
  const shellPattern = shellQuote(pattern.source)
  const result = Bun.spawnSync(
    ["bash", "-lc", `ps -eo pid=,args= | rg --color never ${shellPattern}`],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  if (result.exitCode !== 0) {
    return null
  }

  const output = result.stdout.toString().trim()
  if (!output) {
    return null
  }

  for (const line of output.split("\n").reverse()) {
    const [pidToken] = line.trim().split(/\s+/, 1)
    const pid = Number.parseInt(pidToken ?? "", 10)
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      return pid
    }
  }

  return null
}

function listPidsByPattern(pattern: RegExp): number[] {
  const shellPattern = shellQuote(pattern.source)
  const result = Bun.spawnSync(
    ["bash", "-lc", `ps -eo pid=,args= | rg --color never ${shellPattern}`],
    {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  if (result.exitCode !== 0) {
    return []
  }

  const output = result.stdout.toString().trim()
  if (!output) {
    return []
  }

  const pids = new Set<number>()
  for (const line of output.split("\n")) {
    const [pidToken] = line.trim().split(/\s+/, 1)
    const pid = Number.parseInt(pidToken ?? "", 10)
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      pids.add(pid)
    }
  }

  return [...pids]
}

function listCloudflaredTunnelPids(): number[] {
  const result = Bun.spawnSync(["pgrep", "-f", "cloudflared tunnel"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  })

  if (result.exitCode !== 0) {
    return []
  }

  const output = result.stdout.toString().trim()
  if (!output) {
    return []
  }

  const pids = new Set<number>()
  for (const line of output.split("\n")) {
    const pid = Number.parseInt(line.trim(), 10)
    if (Number.isInteger(pid) && pid > 0 && isPidRunning(pid)) {
      pids.add(pid)
    }
  }

  return [...pids]
}

function listLocalhostRunTunnelPids(): number[] {
  return [
    ...new Set([
      ...listPidsByPattern(/localhost-run-tunnel\.ts/),
      ...listPidsByPattern(/ssh .*nokey@localhost\.run/),
    ]),
  ]
}

function listTunnelPids(): number[] {
  return [
    ...new Set([
      ...listCloudflaredTunnelPids(),
      ...listLocalhostRunTunnelPids(),
    ]),
  ]
}

function getRuntimeTunnelPid(
  state: DashboardRuntimeState | null,
): number | undefined {
  return state?.tunnelPid ?? state?.cloudflaredPid
}

function getRuntimeTunnelLogPath(
  state: DashboardRuntimeState | null,
): string | undefined {
  return state?.tunnelLogPath ?? state?.cloudflaredLogPath
}

function getRuntimeTunnelProvider(
  state: DashboardRuntimeState | null,
): "cloudflared" | "localhost-run" | undefined {
  return (
    state?.tunnelProvider ?? (state?.cloudflaredPid ? "cloudflared" : undefined)
  )
}

function getTunnelCommandPattern(
  provider?: string,
  port?: number,
  state?: DashboardRuntimeState | null,
): RegExp {
  if (provider === "localhost-run") {
    return /localhost-run-tunnel\.ts/
  }

  if (state?.cloudflaredMode === "named") {
    const namedConfig = getNamedTunnelConfig()
    if (namedConfig) {
      return new RegExp(
        `cloudflared\\s+tunnel\\s+--config\\s+${namedConfig.configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+run`,
      )
    }
    return /cloudflared\s+tunnel.*\srun/
  }

  return new RegExp(
    `cloudflared\\s+tunnel\\s+--url\\s+http:\\/\\/127\\.0\\.0\\.1:${port ?? 3000}`,
  )
}

async function terminatePids(pids: number[], source: string): Promise<void> {
  const unique = [...new Set(pids)].filter(
    (pid) => Number.isInteger(pid) && pid > 0,
  )
  if (unique.length === 0) {
    return
  }

  logSystemStep(source, `start terminate_pids pids=${unique.join(",")}`)
  for (const pid of unique) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {}
  }

  await Bun.sleep(500)

  const stillRunning = unique.filter((pid) => isPidRunning(pid))
  for (const pid of stillRunning) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {}
  }

  logSystemStep(source, `exit terminate_pids pids=${unique.join(",")}`)
}

async function terminateDashboardRuntimeProcesses(port: number): Promise<void> {
  const dashboardPids = listPidsByPattern(
    /packages\/dashboard\/src\/server\.ts/,
  )
  const cloudflaredPids = [
    ...new Set([
      ...listPidsByPattern(
        getTunnelCommandPattern("cloudflared", port, {
          cloudflaredMode: "quick",
        } as DashboardRuntimeState),
      ),
      ...listPidsByPattern(
        getTunnelCommandPattern("cloudflared", port, {
          cloudflaredMode: "named",
        } as DashboardRuntimeState),
      ),
    ]),
  ]
  const localhostRunPids = listPidsByPattern(/ssh .*nokey@localhost\.run/)

  await terminatePids(dashboardPids, "dashboard-runtime")
  await terminatePids(cloudflaredPids, "dashboard-runtime")
  await terminatePids(localhostRunPids, "dashboard-runtime")
}

function writeDashboardRecoveryIncident(
  detail: Record<string, unknown>,
): string {
  mkdirSync(dashboardRecoveryIncidentDir, { recursive: true })
  const path = resolve(
    dashboardRecoveryIncidentDir,
    `${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}.json`,
  )
  writeFileSync(path, `${JSON.stringify(detail, null, 2)}\n`)
  return path
}

function writeDashboardHelpIncident(detail: Record<string, unknown>): string {
  mkdirSync(dashboardHelpRequestDir, { recursive: true })
  const path = resolve(
    dashboardHelpRequestDir,
    `${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}.json`,
  )
  writeFileSync(path, `${JSON.stringify(detail, null, 2)}\n`)
  return path
}

function readDashboardLifecycleControllerLockPid(): number | null {
  if (!existsSync(dashboardLifecycleControllerLockPath)) {
    return null
  }

  try {
    const value = readFileSync(
      dashboardLifecycleControllerLockPath,
      "utf8",
    ).trim()
    const pid = Number.parseInt(value, 10)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function readDashboardLifecycleRequest(): DashboardLifecycleRequest | null {
  if (!existsSync(dashboardLifecycleRequestPath)) {
    return null
  }

  try {
    const payload = JSON.parse(
      readFileSync(dashboardLifecycleRequestPath, "utf8"),
    ) as Partial<DashboardLifecycleRequest>
    const port = Number(payload.port)
    const requestedAtMs = Number(payload.requestedAtMs)
    const keepAliveUntilMs = Number(payload.keepAliveUntilMs)
    const managerUrl =
      typeof payload.managerUrl === "string" &&
      payload.managerUrl.trim().length > 0
        ? payload.managerUrl.trim()
        : "http://127.0.0.1:8787"

    if (
      !Number.isInteger(port) ||
      port <= 0 ||
      !Number.isFinite(requestedAtMs) ||
      !Number.isFinite(keepAliveUntilMs)
    ) {
      return null
    }

    return {
      port,
      managerUrl,
      requestedAtMs,
      keepAliveUntilMs,
    }
  } catch {
    return null
  }
}

function writeDashboardLifecycleRequest(
  request: DashboardLifecycleRequest,
): void {
  ensureParentDir(dashboardLifecycleRequestPath)
  writeFileSync(
    dashboardLifecycleRequestPath,
    `${JSON.stringify(request, null, 2)}\n`,
  )
}

function clearDashboardLifecycleRequest(): void {
  rmSync(dashboardLifecycleRequestPath, { force: true })
}

async function recoverDashboardRuntimeState(
  config: DashboardRuntimeConfig,
): Promise<DashboardRuntimeState | null> {
  const localUrl = `http://127.0.0.1:${config.port}`
  const dashboardHealthy = await isDashboardHealthy(config.port)
  if (!dashboardHealthy) {
    return null
  }

  const dashboardPid =
    discoverPidByPattern(/packages\/dashboard\/src\/server\.ts/) ?? 0

  if (!config.useCloudflared) {
    return {
      dashboardPid,
      dashboardLogPath,
      localUrl,
    }
  }

  const namedTunnelConfig = getNamedTunnelConfig()
  if (namedTunnelConfig) {
    const tunnelPid =
      discoverPidByPattern(
        getTunnelCommandPattern("cloudflared", config.port, {
          dashboardPid,
          dashboardLogPath,
          localUrl,
          cloudflaredMode: "named",
        }),
      ) ?? 0
    const publicUrl = `https://${namedTunnelConfig.hostname}`

    if (tunnelPid > 0 && (await isPublicDashboardReady(publicUrl))) {
      return {
        dashboardPid,
        dashboardLogPath,
        localUrl,
        tunnelPid,
        tunnelLogPath: cloudflaredLogPath,
        tunnelProvider: "cloudflared",
        cloudflaredPid: tunnelPid,
        cloudflaredLogPath,
        cloudflaredMode: "named",
        publicUrl,
        namedTunnelName: namedTunnelConfig.tunnelName,
        namedTunnelHostnameBase: namedTunnelConfig.hostname,
      }
    }
  }

  const tunnelLogs: Array<{
    provider: "cloudflared" | "localhost-run"
    logPath: string
  }> = [
    { provider: "cloudflared", logPath: cloudflaredLogPath },
    { provider: "localhost-run", logPath: localhostRunLogPath },
  ]

  for (const candidateLog of tunnelLogs) {
    if (!existsSync(candidateLog.logPath)) {
      continue
    }

    let urls: string[] = []
    try {
      const log = readFileSync(candidateLog.logPath, "utf8")
      urls =
        candidateLog.provider === "localhost-run"
          ? [...new Set(log.match(localhostRunPublicUrlPattern) ?? [])]
          : [...new Set(log.match(/https:\/\/[a-z0-9.-]+/gi) ?? [])]
    } catch {}

    for (const candidateUrl of urls.reverse()) {
      if (!(await isPublicDashboardReady(candidateUrl))) {
        continue
      }

      const tunnelPid =
        candidateLog.provider === "cloudflared"
          ? (discoverPidByPattern(
              /cloudflared\s+tunnel\s+--url\s+http:\/\/127\.0\.0\.1:\d+/,
            ) ?? 0)
          : (discoverPidByPattern(/localhost-run-tunnel\.ts/) ?? 0)

      if (tunnelPid <= 0) {
        continue
      }

      return {
        dashboardPid,
        dashboardLogPath,
        localUrl,
        tunnelPid,
        tunnelLogPath: candidateLog.logPath,
        tunnelProvider: candidateLog.provider,
        cloudflaredPid:
          candidateLog.provider === "cloudflared" ? tunnelPid : undefined,
        cloudflaredLogPath:
          candidateLog.provider === "cloudflared"
            ? cloudflaredLogPath
            : undefined,
        cloudflaredMode:
          candidateLog.provider === "cloudflared" ? "quick" : undefined,
        publicUrl: candidateUrl,
      }
    }
  }

  return null
}

function readBootstrapContextValue(key: string): string {
  if (!existsSync(bootstrapContextPath)) {
    return ""
  }

  try {
    const payload = JSON.parse(
      readFileSync(bootstrapContextPath, "utf8"),
    ) as Record<string, unknown>
    const value = payload[key]
    return typeof value === "string" ? value.trim() : ""
  } catch {
    return ""
  }
}

function readOptionalFile(path?: string): string {
  const trimmed = path?.trim()
  if (!trimmed || !existsSync(trimmed)) {
    return ""
  }

  try {
    return readFileSync(trimmed, "utf8").trim()
  } catch {
    return ""
  }
}

type NamedTunnelConfig = {
  tunnelId: string
  tunnelName: string
  hostname: string
  configPath: string
}

function sanitizeDnsLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

function sanitizeDnsHostname(value: string): string {
  return value
    .split(".")
    .map((label) => sanitizeDnsLabel(label))
    .filter((label) => label.length > 0)
    .join(".")
}

function getNamedTunnelConfig(): NamedTunnelConfig | null {
  if (
    !cloudflareZoneName ||
    !cloudflareTunnelId ||
    !cloudflareTunnelName ||
    !cloudflareTunnelToken
  ) {
    return null
  }

  const tunnelName = sanitizeDnsLabel(cloudflareTunnelName)
  const hostname = sanitizeDnsHostname(
    cloudflareHostnameBase || `${tunnelName}.${cloudflareZoneName}`,
  )

  return {
    tunnelId: cloudflareTunnelId,
    tunnelName,
    hostname,
    configPath: cloudflaredConfigPath,
  }
}

async function waitForHealth(port: number, maxAttempts = 40): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) {
        return
      }
    } catch {}

    await Bun.sleep(500)
  }

  throw new Error("dashboard did not become healthy in time")
}

async function isDashboardHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

async function isPublicDashboardReady(publicUrl?: string): Promise<boolean> {
  if (!publicUrl) {
    return false
  }

  try {
    const parsedUrl = new URL(publicUrl)
    if (quickTunnelHostnamePattern.test(parsedUrl.hostname)) {
      return isPublicDashboardReadyWithExplicitResolve(publicUrl)
    }
  } catch {
    return false
  }

  try {
    const response = await fetch(`${publicUrl}/api/config`)
    return response.ok
  } catch {
    return isPublicDashboardReadyWithExplicitResolve(publicUrl)
  }
}

async function resolveHostnameViaDnsGoogle(
  hostname: string,
): Promise<string[]> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
    )
    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as {
      Answer?: Array<{ data?: string }>
    }
    return (payload.Answer ?? [])
      .map((answer) => answer.data?.trim() ?? "")
      .filter((value) => value.length > 0)
  } catch {
    return []
  }
}

async function isPublicDashboardReadyWithExplicitResolve(
  publicUrl: string,
): Promise<boolean> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(publicUrl)
  } catch {
    return false
  }

  if (!quickTunnelHostnamePattern.test(parsedUrl.hostname)) {
    return false
  }

  const addresses = await resolveHostnameViaDnsGoogle(parsedUrl.hostname)
  if (addresses.length === 0) {
    return false
  }

  for (const address of addresses) {
    const result = Bun.spawnSync(
      [
        "curl",
        "-sS",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "--resolve",
        `${parsedUrl.hostname}:443:${address}`,
        `${publicUrl}/api/config`,
      ],
      {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
      },
    )

    if (result.exitCode === 0 && result.stdout.toString().trim() === "200") {
      return true
    }
  }

  return false
}

async function isExpectedProcess(
  pid: number | undefined,
  pattern: RegExp,
): Promise<boolean> {
  if (!pid || !Number.isInteger(pid) || pid <= 0 || !isPidRunning(pid)) {
    return false
  }

  const procPath = `/proc/${pid}/cmdline`
  if (!existsSync(procPath)) {
    return false
  }

  try {
    const cmdline = readFileSync(procPath, "utf8")
      .replaceAll("\u0000", " ")
      .trim()
    return pattern.test(cmdline)
  } catch {
    return false
  }
}

async function getDashboardRuntimeStatus(
  port: number,
  state: DashboardRuntimeState | null,
  options?: {
    checkPublic?: boolean
  },
): Promise<DashboardRuntimeStatus> {
  const dashboardHealthy = await isDashboardHealthy(port)
  const dashboardPid = (await isExpectedProcess(
    state?.dashboardPid,
    /packages\/dashboard\/src\/server\.ts/,
  ))
    ? state?.dashboardPid
    : discoverPidByPattern(/packages\/dashboard\/src\/server\.ts/)
  const dashboardRunning = Boolean(dashboardPid)
  const tunnelPid = (await isExpectedProcess(
    getRuntimeTunnelPid(state),
    getTunnelCommandPattern(getRuntimeTunnelProvider(state), port, state),
  ))
    ? getRuntimeTunnelPid(state)
    : discoverPidByPattern(
        getTunnelCommandPattern(getRuntimeTunnelProvider(state), port, state),
      )
  const tunnelRunning = Boolean(state?.publicUrl) && Boolean(tunnelPid)
  const publicReady =
    Boolean(state?.publicUrl) &&
    options?.checkPublic === true &&
    state?.publicUrl
      ? await isPublicDashboardReady(state.publicUrl)
      : false

  return {
    dashboardHealthy,
    dashboardRunning,
    tunnelRunning,
    publicReady,
  }
}

async function spawnDetached(
  command: string,
  logPath: string,
  env?: Record<string, string>,
): Promise<number> {
  logSystemStep("dashboard-runtime", `start detached=${command}`)
  ensureParentDir(logPath)
  writeFileSync(logPath, "")

  const processHandle = Bun.spawn(
    [
      "bash",
      "-lc",
      `nohup ${command} >> '${logPath}' 2>&1 < /dev/null & echo $!`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  const stdout = await new Response(processHandle.stdout).text()
  const stderr = await new Response(processHandle.stderr).text()
  await processHandle.exited

  if (processHandle.exitCode !== 0) {
    logSystemStep("dashboard-runtime", `error failed_launch=${command}`)
    throw new Error(stderr.trim() || `failed to launch command: ${command}`)
  }

  if (stderr.trim().length > 0) {
    logSystemStep("dashboard-runtime", `error launch_stderr=${stderr.trim()}`)
    throw new Error(stderr.trim())
  }

  const pid = Number.parseInt(stdout.trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    logSystemStep("dashboard-runtime", `error invalid_pid=${command}`)
    throw new Error(`failed to capture pid for command: ${command}`)
  }

  logSystemStep(
    "dashboard-runtime",
    `exit detached_pid=${pid} command=${command}`,
  )

  return pid
}

async function spawnDetachedSession(
  command: string,
  logPath: string,
  env?: Record<string, string>,
): Promise<number> {
  logSystemStep("dashboard-runtime", `start detached=${command}`)
  ensureParentDir(logPath)
  writeFileSync(logPath, "")

  const processHandle = Bun.spawn(
    [
      "bash",
      "-lc",
      `setsid ${command} >> '${logPath}' 2>&1 < /dev/null & echo $!`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  const stdout = await new Response(processHandle.stdout).text()
  const stderr = await new Response(processHandle.stderr).text()
  await processHandle.exited

  if (processHandle.exitCode !== 0) {
    logSystemStep("dashboard-runtime", `error failed_launch=${command}`)
    throw new Error(stderr.trim() || `failed to launch command: ${command}`)
  }

  if (stderr.trim().length > 0) {
    logSystemStep("dashboard-runtime", `error launch_stderr=${stderr.trim()}`)
    throw new Error(stderr.trim())
  }

  const pid = Number.parseInt(stdout.trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    logSystemStep("dashboard-runtime", `error invalid_pid=${command}`)
    throw new Error(`failed to capture pid for command: ${command}`)
  }

  logSystemStep(
    "dashboard-runtime",
    `exit detached_pid=${pid} command=${command}`,
  )

  return pid
}

async function ensureDashboardBuilt(forceRebuild = false): Promise<void> {
  if (!forceRebuild && existsSync(dashboardDistDir)) {
    logSystemStep("dashboard-runtime", "exit dashboard_build=reused")
    return
  }

  logSystemStep("dashboard-runtime", "start dashboard_build")
  runChecked([
    "bun",
    "run",
    "--filter",
    "@agent-infrastructure/dashboard-app",
    "build",
  ])
  logSystemStep("dashboard-runtime", "exit dashboard_build=completed")
}

async function startDashboardServer(
  config: DashboardRuntimeConfig,
): Promise<number> {
  const accessApiBaseUrl =
    config.accessApiBaseUrl?.trim() ||
    readBootstrapContextValue("dashboardAccessApiBaseUrl")
  const enrollmentSecret =
    config.enrollmentSecret?.trim() ||
    readOptionalFile(
      process.env.DASHBOARD_ENROLLMENT_SECRET_PATH?.trim() ||
        `${process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"}/dashboard-enrollment-secret`,
    )

  const command = ["bun", dashboardServerEntry].map(shellQuote).join(" ")

  logSystemStep(
    "dashboard-runtime",
    `start dashboard_server port=${config.port}`,
  )
  return spawnDetached(command, dashboardLogPath, {
    DASHBOARD_PORT: String(config.port),
    MANAGER_INTERNAL_URL: config.managerUrl,
    DASHBOARD_ACCESS_API_BASE_URL: accessApiBaseUrl,
    DASHBOARD_ENROLLMENT_SECRET: enrollmentSecret,
  })
}

async function waitForUrlInLog(
  logPath: string,
  source: string,
  timeoutMs: number,
  pattern: RegExp,
): Promise<string> {
  const attempts = Math.ceil(timeoutMs / 500)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const log = readFileSync(logPath, "utf8")
      const match = log.match(pattern)
      if (match?.[0]) {
        return match[0]
      }
    } catch {}

    await Bun.sleep(500)
  }

  logSystemStep("dashboard-runtime", `error ${source}_no_url`)
  throw new Error(`${source} did not return a public URL in time`)
}

function ensureNamedTunnelConfigFile(
  config: NamedTunnelConfig,
  port: number,
): void {
  writeFileSync(
    config.configPath,
    [
      `tunnel: ${config.tunnelId}`,
      "ingress:",
      `  - hostname: "${config.hostname}"`,
      `    service: http://127.0.0.1:${port}`,
      "  - service: http_status:404",
      "",
    ].join("\n"),
    { mode: 0o600 },
  )
}

async function startNamedTunnel(port: number): Promise<{
  pid: number
  url: string
  tunnelId: string
  tunnelName: string
  hostname: string
}> {
  const config = getNamedTunnelConfig()
  if (!config) {
    throw new Error("named tunnel config is not available")
  }
  if (!cloudflareTunnelToken) {
    throw new Error("cloudflare tunnel token is not configured")
  }
  ensureNamedTunnelConfigFile(config, port)

  const command = [
    "cloudflared",
    "tunnel",
    "--config",
    config.configPath,
    "run",
  ]
    .map(shellQuote)
    .join(" ")

  const pid = await spawnDetached(command, cloudflaredLogPath, {
    TUNNEL_TOKEN: cloudflareTunnelToken,
  })
  const url = `https://${config.hostname}`
  await waitForPublicDashboardReady(url, 20, 1000)

  return {
    pid,
    url,
    tunnelId: config.tunnelId,
    tunnelName: config.tunnelName,
    hostname: config.hostname,
  }
}

async function startCloudflared(
  port: number,
): Promise<{ pid: number; url: string }> {
  const command = ["cloudflared", "tunnel", "--url", `http://127.0.0.1:${port}`]
    .map(shellQuote)
    .join(" ")

  const pid = await spawnDetached(command, cloudflaredLogPath)
  const url = await waitForUrlInLog(
    cloudflaredLogPath,
    "cloudflared",
    20_000,
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
  )

  try {
    await waitForPublicDashboardReady(url, 20, 1000)
  } catch {
    await terminatePids([pid], "dashboard-runtime")
    throw new Error(`cloudflared public URL did not become ready: ${url}`)
  }

  return {
    pid,
    url,
  }
}

async function startLocalhostRun(
  port: number,
): Promise<{ pid: number; url: string }> {
  const command = ["bun", localhostRunTunnelEntry, "--port", String(port)]
    .map(shellQuote)
    .join(" ")
  const pid = await spawnDetachedSession(command, localhostRunLogPath)

  const url = await waitForUrlInLog(
    localhostRunLogPath,
    "localhost_run",
    25_000,
    /https:\/\/[a-z0-9-]+\.lhr\.life/i,
  )

  try {
    await waitForPublicDashboardReady(url, 10, 1000)
  } catch {
    await terminatePids([pid], "dashboard-runtime")
    throw new Error(`localhost.run public URL did not become ready: ${url}`)
  }

  return {
    pid,
    url,
  }
}

async function startTemporaryTunnel(port: number): Promise<{
  pid: number
  url: string
  provider: "cloudflared" | "localhost-run"
  logPath: string
  cloudflaredMode?: "quick" | "named"
  namedTunnelId?: string
  namedTunnelName?: string
  namedTunnelHostnameBase?: string
}> {
  await terminatePids(listTunnelPids(), "dashboard-runtime")

  if (getNamedTunnelConfig()) {
    const tunnel = await startNamedTunnel(port)
    return {
      pid: tunnel.pid,
      url: tunnel.url,
      provider: "cloudflared",
      logPath: cloudflaredLogPath,
      cloudflaredMode: "named",
      namedTunnelId: tunnel.tunnelId,
      namedTunnelName: tunnel.tunnelName,
      namedTunnelHostnameBase: tunnel.hostname,
    }
  }

  try {
    const tunnel = await startCloudflared(port)
    return {
      pid: tunnel.pid,
      url: tunnel.url,
      provider: "cloudflared",
      logPath: cloudflaredLogPath,
      cloudflaredMode: "quick",
    }
  } catch (error) {
    logSystemStep(
      "dashboard-runtime",
      `warn cloudflared_start_failed detail=${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const tunnel = await startLocalhostRun(port)
  logSystemStep(
    "dashboard-runtime",
    `exit fallback_tunnel_provider=localhost-run public_url=${tunnel.url}`,
  )
  return {
    pid: tunnel.pid,
    url: tunnel.url,
    provider: "localhost-run",
    logPath: localhostRunLogPath,
  }
}

export async function ensureDashboardRuntime(
  config: DashboardRuntimeConfig,
): Promise<DashboardRuntimeState> {
  logSystemStep(
    "dashboard-runtime",
    `setup.start port=${config.port} cloudflared=${config.useCloudflared}`,
  )
  mkdirSync(runtimeDir, { recursive: true })

  const currentState =
    readRuntimeState() ?? (await recoverDashboardRuntimeState(config))
  const dashboardRunning = await isExpectedProcess(
    currentState?.dashboardPid,
    /packages\/dashboard\/src\/server\.ts/,
  )
  const discoveredDashboardPid = dashboardRunning
    ? (currentState?.dashboardPid ?? 0)
    : (discoverPidByPattern(/packages\/dashboard\/src\/server\.ts/) ?? 0)
  const tunnelPid = (await isExpectedProcess(
    getRuntimeTunnelPid(currentState),
    getTunnelCommandPattern(
      getRuntimeTunnelProvider(currentState),
      config.port,
      currentState,
    ),
  ))
    ? getRuntimeTunnelPid(currentState)
    : discoverPidByPattern(
        getTunnelCommandPattern(
          getRuntimeTunnelProvider(currentState),
          config.port,
          currentState,
        ),
      )
  const _cloudflaredRunning = Boolean(tunnelPid)
  const dashboardHealthy = await isDashboardHealthy(config.port)
  const publicDashboardReady =
    config.useCloudflared && typeof currentState?.publicUrl === "string"
      ? await isPublicDashboardReady(currentState.publicUrl)
      : false

  const canReuseDashboard =
    currentState &&
    (dashboardRunning || dashboardHealthy) &&
    (!config.useCloudflared ||
      (publicDashboardReady &&
        typeof currentState.publicUrl === "string" &&
        currentState.publicUrl.trim().length > 0))

  if (canReuseDashboard) {
    logSystemStep("dashboard-runtime", "exit runtime=reused-current-state")
    const normalizedState: DashboardRuntimeState =
      tunnelPid && tunnelPid !== getRuntimeTunnelPid(currentState)
        ? {
            ...currentState,
            tunnelPid,
            cloudflaredPid:
              getRuntimeTunnelProvider(currentState) === "cloudflared"
                ? tunnelPid
                : undefined,
          }
        : currentState
    writeRuntimeState(normalizedState)
    return normalizedState
  }

  const recoveredState = await recoverDashboardRuntimeState(config)
  if (recoveredState) {
    logSystemStep("dashboard-runtime", "exit runtime=recovered-state")
    writeRuntimeState(recoveredState)
    return recoveredState
  }

  clearRuntimeState()

  await ensureDashboardBuilt(config.forceRebuild === true)

  const dashboardPid = dashboardHealthy
    ? dashboardRunning
      ? (currentState?.dashboardPid as number)
      : discoveredDashboardPid
    : await startDashboardServer(config)

  await waitForHealth(config.port)

  let nextState: DashboardRuntimeState = {
    dashboardPid,
    dashboardLogPath,
    localUrl: `http://127.0.0.1:${config.port}`,
  }

  if (!config.useCloudflared) {
    logSystemStep("dashboard-runtime", "setup.complete local_only=true")
    writeRuntimeState(nextState)
    return nextState
  }

  if (currentState?.publicUrl && publicDashboardReady) {
    nextState = {
      ...nextState,
      tunnelPid: tunnelPid ?? undefined,
      tunnelLogPath:
        getRuntimeTunnelLogPath(currentState) ?? cloudflaredLogPath,
      tunnelProvider: getRuntimeTunnelProvider(currentState),
      cloudflaredPid:
        getRuntimeTunnelProvider(currentState) === "cloudflared"
          ? (tunnelPid ?? undefined)
          : undefined,
      cloudflaredLogPath:
        getRuntimeTunnelProvider(currentState) === "cloudflared"
          ? cloudflaredLogPath
          : undefined,
      cloudflaredMode: currentState.cloudflaredMode,
      publicUrl: currentState.publicUrl,
      tunnelCreatedAtMs: currentState.tunnelCreatedAtMs,
      lastTunnelReplaceAtMs: currentState.lastTunnelReplaceAtMs,
      namedTunnelId: currentState.namedTunnelId,
      namedTunnelName: currentState.namedTunnelName,
      namedTunnelHostnameBase: currentState.namedTunnelHostnameBase,
    }
    logSystemStep("dashboard-runtime", "exit cloudflared=reused")
    writeRuntimeState(nextState)
    return nextState
  }

  if (currentState?.publicUrl && tunnelPid) {
    try {
      await waitForPublicDashboardReady(currentState.publicUrl, 10, 1000)
      nextState = {
        ...nextState,
        tunnelPid,
        tunnelLogPath:
          getRuntimeTunnelLogPath(currentState) ?? cloudflaredLogPath,
        tunnelProvider: getRuntimeTunnelProvider(currentState),
        cloudflaredPid:
          getRuntimeTunnelProvider(currentState) === "cloudflared"
            ? tunnelPid
            : undefined,
        cloudflaredLogPath:
          getRuntimeTunnelProvider(currentState) === "cloudflared"
            ? cloudflaredLogPath
            : undefined,
        cloudflaredMode: currentState.cloudflaredMode,
        publicUrl: currentState.publicUrl,
        tunnelCreatedAtMs: currentState.tunnelCreatedAtMs,
        lastTunnelReplaceAtMs: currentState.lastTunnelReplaceAtMs,
        namedTunnelId: currentState.namedTunnelId,
        namedTunnelName: currentState.namedTunnelName,
        namedTunnelHostnameBase: currentState.namedTunnelHostnameBase,
      }
      logSystemStep(
        "dashboard-runtime",
        "exit tunnel=reused-after-local-restart",
      )
      writeRuntimeState(nextState)
      return nextState
    } catch {}
  }

  const tunnel = await startTemporaryTunnel(config.port)
  const tunnelCreatedAtMs = Date.now()
  nextState = {
    ...nextState,
    tunnelPid: tunnel.pid,
    tunnelLogPath: tunnel.logPath,
    tunnelProvider: tunnel.provider,
    cloudflaredPid: tunnel.provider === "cloudflared" ? tunnel.pid : undefined,
    cloudflaredLogPath:
      tunnel.provider === "cloudflared" ? cloudflaredLogPath : undefined,
    cloudflaredMode: tunnel.cloudflaredMode,
    publicUrl: tunnel.url,
    tunnelCreatedAtMs,
    lastTunnelReplaceAtMs: tunnelCreatedAtMs,
    namedTunnelId: tunnel.namedTunnelId,
    namedTunnelName: tunnel.namedTunnelName,
    namedTunnelHostnameBase: tunnel.namedTunnelHostnameBase,
  }
  logSystemStep("dashboard-runtime", `setup.complete public_url=${tunnel.url}`)
  writeRuntimeState(nextState)
  return nextState
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

async function pruneExpiredDashboardSessions(now = Date.now()): Promise<void> {
  const store = readSessionStore()
  const expired = store.sessions.filter((session) => session.expiresAtMs <= now)
  const active = store.sessions.filter((session) => session.expiresAtMs > now)
  if (expired.length > 0) {
    writeSessionStore({ sessions: active })
  }
}

export function countActiveDashboardSessions(now = Date.now()): number {
  return readSessionStore().sessions.filter(
    (session) => session.expiresAtMs > now,
  ).length
}

export function hasActiveDashboardSessions(now = Date.now()): boolean {
  return countActiveDashboardSessions(now) > 0
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function validateDashboardSessionToken(token: string): boolean {
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

export function exchangeDashboardSessionKey(sessionKey: string): {
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
  let matchedBootstrap = false
  let _matchedExpiry = 0

  for (const session of readSessionStore().sessions) {
    if (session.expiresAtMs <= currentTime) {
      continue
    }

    if (
      session.kind === "bootstrap" &&
      !session.usedAtMs &&
      session.tokenHash === bootstrapHash
    ) {
      matchedBootstrap = true
      _matchedExpiry = session.expiresAtMs
      nextStore.sessions.push({
        ...session,
        usedAtMs: currentTime,
      })
      continue
    }

    nextStore.sessions.push(session)
  }

  if (!matchedBootstrap) {
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

export function notifyDashboardLifecycleController(input?: {
  port?: number
  managerUrl?: string
  demandSeconds?: number
}): void {
  const currentTime = Date.now()
  const existing = readDashboardLifecycleRequest()
  const request: DashboardLifecycleRequest = {
    port: input?.port ?? existing?.port ?? 3000,
    managerUrl:
      input?.managerUrl ?? existing?.managerUrl ?? "http://127.0.0.1:8787",
    requestedAtMs: currentTime,
    keepAliveUntilMs:
      currentTime +
      Math.max(30_000, input?.demandSeconds ?? dashboardLifecycleDemandSeconds),
  }

  if (existing) {
    request.keepAliveUntilMs = Math.max(
      request.keepAliveUntilMs,
      existing.keepAliveUntilMs,
    )
  }

  writeDashboardLifecycleRequest(request)
  logSystemStep(
    "dashboard-lifecycle-controller",
    `notify port=${request.port} keep_alive_until_ms=${request.keepAliveUntilMs}`,
  )
}

export async function waitForDashboardLifecycleReady(input?: {
  port?: number
  timeoutMs?: number
}): Promise<DashboardRuntimeState> {
  const expectedPort = input?.port ?? 3000
  const timeoutMs = Math.max(5_000, input?.timeoutMs ?? 45_000)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const state = readRuntimeState()
    const tunnelPid = (await isExpectedProcess(
      getRuntimeTunnelPid(state),
      getTunnelCommandPattern(
        getRuntimeTunnelProvider(state),
        expectedPort,
        state,
      ),
    ))
      ? getRuntimeTunnelPid(state)
      : discoverPidByPattern(
          getTunnelCommandPattern(
            getRuntimeTunnelProvider(state),
            expectedPort,
            state,
          ),
        )
    if (
      state?.publicUrl &&
      tunnelPid &&
      getPortFromRuntimeState(state) === expectedPort &&
      (await isDashboardHealthy(expectedPort)) &&
      (await isPublicDashboardReady(state.publicUrl))
    ) {
      const normalizedState: DashboardRuntimeState =
        tunnelPid === getRuntimeTunnelPid(state)
          ? state
          : {
              ...state,
              tunnelPid,
              cloudflaredPid:
                getRuntimeTunnelProvider(state) === "cloudflared"
                  ? tunnelPid
                  : undefined,
            }
      if (normalizedState !== state) {
        writeRuntimeState(normalizedState)
      }
      return normalizedState
    }

    await Bun.sleep(1000)
  }

  throw new Error(
    "dashboard lifecycle controller did not make the dashboard ready in time",
  )
}

export async function stopDashboardRuntime(port?: number): Promise<void> {
  const currentState = readRuntimeState()
  const effectivePort = port ?? getPortFromRuntimeState(currentState)
  await terminateDashboardRuntimeProcesses(effectivePort)
  clearRuntimeState()
  logSystemStep("dashboard-runtime", `exit stopped port=${effectivePort}`)
}

export async function issueDashboardSession(input?: {
  port?: number
  managerUrl?: string
  ttlSeconds?: number
}): Promise<{
  token: string
  expiresAtMs: number
  localUrl: string
  publicUrl: string
  sessionUrl: string
  dashboardPid: number
  cloudflaredPid: number
}> {
  logSystemStep("dashboard-runtime", "start issue_dashboard_session")
  const port = input?.port ?? 3000
  notifyDashboardLifecycleController({
    port,
    managerUrl: input?.managerUrl ?? "http://127.0.0.1:8787",
  })
  const runtime = await waitForDashboardLifecycleReady({
    port,
    timeoutMs: 45_000,
  })

  const tunnelPid = runtime.tunnelPid ?? runtime.cloudflaredPid
  if (!runtime.publicUrl || !tunnelPid) {
    throw new Error("dashboard runtime did not produce a public URL")
  }

  const currentTime = Date.now()
  const ttlMs = Math.max(60, input?.ttlSeconds ?? 900) * 1000
  const token = randomBytes(32).toString("hex")
  const expiresAtMs = currentTime + ttlMs
  await pruneExpiredDashboardSessions(currentTime)
  const nextSessions = readSessionStore().sessions.filter(
    (session) => session.expiresAtMs > currentTime,
  )

  let sessionPublicUrl = runtime.publicUrl
  let sessionHostname: string | undefined
  if (runtime.cloudflaredMode === "named" && runtime.namedTunnelHostnameBase) {
    sessionHostname = runtime.namedTunnelHostnameBase
    sessionPublicUrl = `https://${runtime.namedTunnelHostnameBase}`
  }

  nextSessions.push({
    tokenHash: hashSessionToken(token),
    expiresAtMs,
    createdAtMs: currentTime,
    kind: "bootstrap",
    publicHostname: sessionHostname,
  })
  writeSessionStore({ sessions: nextSessions })

  const sessionUrl = `${sessionPublicUrl}/?sessionKey=${token}`
  logSystemStep(
    "dashboard-runtime",
    `exit issue_dashboard_session expires_at_ms=${expiresAtMs}`,
  )
  return {
    token,
    expiresAtMs,
    localUrl: runtime.localUrl,
    publicUrl: sessionPublicUrl,
    sessionUrl,
    dashboardPid: runtime.dashboardPid,
    cloudflaredPid: tunnelPid,
  }
}

export async function waitForPublicDashboardReady(
  publicUrl: string,
  maxAttempts = 30,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isPublicDashboardReady(publicUrl)) {
      return
    }
    await Bun.sleep(delayMs)
  }

  throw new Error("dashboard public URL did not become ready in time")
}

export function requestDashboardHelp(input: {
  reason?: string
  dashboardUrl?: string
  detail?: string
}): string {
  const payload = {
    at: new Date().toISOString(),
    reason: input.reason?.trim() || "dashboard-recovery-failed",
    dashboardUrl: input.dashboardUrl?.trim() || "",
    detail: input.detail?.trim() || "",
  }
  const incidentPath = writeDashboardHelpIncident(payload)
  logSystemStep(
    "dashboard-help",
    `requested reason=${payload.reason} dashboard_url=${payload.dashboardUrl || "unknown"} incident=${incidentPath}`,
  )
  return incidentPath
}

export async function runDashboardLifecycleController(input?: {
  port?: number
  managerUrl?: string
}): Promise<void> {
  const defaultPort = input?.port ?? 3000
  const defaultManagerUrl = input?.managerUrl ?? "http://127.0.0.1:8787"
  const pid = process.pid
  const lockPid = readDashboardLifecycleControllerLockPid()

  if (lockPid && lockPid !== pid && isPidRunning(lockPid)) {
    logSystemStep(
      "dashboard-lifecycle-controller",
      `exit lock_held_by=${lockPid}`,
    )
    return
  }

  ensureParentDir(dashboardLifecycleControllerLockPath)
  writeFileSync(dashboardLifecycleControllerLockPath, `${pid}\n`)

  let lastHelpAtMs = 0
  let publicFailureSinceMs: number | null = null
  let lastPublicCheckAtMs = 0
  try {
    logSystemStep(
      "dashboard-lifecycle-controller",
      `start pid=${pid} port=${defaultPort} manager_url=${defaultManagerUrl}`,
    )

    while (true) {
      const now = Date.now()
      await pruneExpiredDashboardSessions(now)
      const request = readDashboardLifecycleRequest()
      const currentState = readRuntimeState()
      const port =
        request?.port ?? getPortFromRuntimeState(currentState) ?? defaultPort
      const managerUrl = request?.managerUrl ?? defaultManagerUrl
      const hasDemand = Boolean(request && request.keepAliveUntilMs > now)
      const activeSessionCount = countActiveDashboardSessions(now)
      const active = hasDemand || activeSessionCount > 0

      if (active) {
        const state = readRuntimeState()
        const shouldCheckPublic =
          now - lastPublicCheckAtMs >= dashboardLifecycleHealthyRecheckMs ||
          publicFailureSinceMs !== null
        const status = await getDashboardRuntimeStatus(port, state, {
          checkPublic: shouldCheckPublic,
        })

        if (shouldCheckPublic) {
          lastPublicCheckAtMs = now
          if (status.publicReady) {
            publicFailureSinceMs = null
          } else if (
            state?.publicUrl &&
            status.dashboardHealthy &&
            status.tunnelRunning
          ) {
            publicFailureSinceMs ??= now
          } else {
            publicFailureSinceMs = null
          }
        }

        const runtimeMissing =
          !status.dashboardHealthy || !state?.publicUrl || !status.tunnelRunning
        const activeDemandConfirmedTunnelFailure =
          hasDemand &&
          Boolean(state?.publicUrl) &&
          status.dashboardHealthy &&
          shouldCheckPublic &&
          !status.publicReady
        const sustainedPublicFailure =
          publicFailureSinceMs !== null &&
          now - publicFailureSinceMs >= sustainedPublicFailureReplacementMs
        const tunnelReplacementCooldownSatisfied =
          now - getLastTunnelReplacementAttemptAtMs(state) >=
          quickTunnelReplacementCooldownMs

        if (
          !runtimeMissing &&
          !activeDemandConfirmedTunnelFailure &&
          (!sustainedPublicFailure || !tunnelReplacementCooldownSatisfied)
        ) {
          await Bun.sleep(dashboardLifecyclePollMs)
          continue
        }

        try {
          await ensureDashboardRuntime({
            port,
            managerUrl,
            useCloudflared: true,
          })
          publicFailureSinceMs = null
          lastPublicCheckAtMs = Date.now()
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : String(error)
          logSystemStep(
            "dashboard-lifecycle-controller",
            `error ensure_failed detail=${message}`,
          )
          if (now - lastHelpAtMs >= 60_000) {
            requestDashboardHelp({
              reason: "dashboard-lifecycle-controller-ensure-failed",
              dashboardUrl: currentState?.publicUrl,
              detail: message,
            })
            lastHelpAtMs = now
          }
        }
      } else {
        publicFailureSinceMs = null
        if (request && request.keepAliveUntilMs <= now) {
          clearDashboardLifecycleRequest()
        }

        if (
          currentState ||
          listTunnelPids().length > 0 ||
          discoverPidByPattern(/packages\/dashboard\/src\/server\.ts/)
        ) {
          await stopDashboardRuntime(port)
          logSystemStep(
            "dashboard-lifecycle-controller",
            `exit idle_stop port=${port}`,
          )
        }
      }

      await Bun.sleep(dashboardLifecyclePollMs)
    }
  } finally {
    const currentLockPid = readDashboardLifecycleControllerLockPid()
    if (currentLockPid === pid) {
      rmSync(dashboardLifecycleControllerLockPath, { force: true })
    }
  }
}

export async function recoverDashboardSession(input?: {
  port?: number
  managerUrl?: string
  ttlSeconds?: number
  reason?: string
}): Promise<{
  token: string
  expiresAtMs: number
  localUrl: string
  publicUrl: string
  sessionUrl: string
  dashboardPid: number
  cloudflaredPid: number
}> {
  const port = input?.port ?? 3000
  const reason = input?.reason?.trim() || "dashboard-unreachable"
  logSystemStep("dashboard-recovery", `start reason=${reason} port=${port}`)

  try {
    await terminateDashboardRuntimeProcesses(port)
    clearRuntimeState()
    const session = await issueDashboardSession({
      port,
      managerUrl: input?.managerUrl,
      ttlSeconds: input?.ttlSeconds,
    })
    logSystemStep(
      "dashboard-recovery",
      `exit public_url=${session.publicUrl} dashboard_pid=${session.dashboardPid} cloudflared_pid=${session.cloudflaredPid}`,
    )
    return session
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
    })
    logSystemStep("dashboard-recovery", `error incident=${incidentPath}`)
    throw error
  }
}
