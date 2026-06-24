import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"

export type HealthApiOptions = {
  repoRoot: string
  stateRoot: string
  workspaceHealthRoot?: string
}

type HealthSeverity = "blocking" | "warn" | "info"
type HealthCheckStatus =
  | "PASS"
  | "FAIL"
  | "WARN"
  | "BLOCKED"
  | "NOT_RUN"
  | "STALE"
  | "UNKNOWN"
  | "DISPATCH_FAILED"
  | "UNAUTHORIZED"
  | "UNSUPPORTED"
  | "RUNNING"
  | "INFO"
type HealthRunStatus = "pass" | "warn" | "fail" | "unknown"

type HealthRunLocation = {
  executor?: string
  workTarget?: string
  host?: string
  container?: string
  source?: string
  vantagePoint?: string
  command?: string
  providerType?: string
}

type HealthNodeAction = {
  id: string
  label: string
  owner?: string
  runLocation?: HealthRunLocation
  risk: "readonly" | "safe_restart" | "mutating" | "destructive"
  requiresConfirmation?: boolean
  scopes?: string[]
  expectedEffect?: string
  rerunAfter?: string
  supported: boolean
  unavailableReason?: string
}

type HealthTargetMetadata = {
  id?: string
  url?: string
  path?: string
  backendMode?: string
  sourceUrl?: string
  profileId?: string
}

type HealthNodeContract = {
  contractVersion?: "health-node-result.v1"
  runId?: string
  correlationId?: string
  targetId?: string
  nodeId?: string
  instanceId?: string
  templateId?: string
  definitionKey?: string
  label?: string
  nodeKind?: string
  rollupReason?: string | null
  failureClass?: string | null
  owner?: string
  executor?: HealthRunLocation
  vantagePoint?: HealthRunLocation
  target?: HealthTargetMetadata
  dispatchPath?: string[]
  startedAt?: string
  checkedAt?: string
  finishedAt?: string
  durationMs?: number
  ttlMs?: number
  freshness?: "fresh" | "stale" | "unknown"
  stale?: boolean
  summary?: string
  detail?: string
  actions?: HealthNodeAction[]
  repairActions?: HealthNodeAction[]
}

type HealthProfileCheckDefinition = {
  id: string
  checkId: string
  title: string
  component?: string
  runLocation?: HealthRunLocation
  execution?: HealthRunLocation
  severity?: HealthSeverity
  repairHint?: string
  params?: Record<string, unknown>
}

type HealthProfileDefinition = {
  id: string
  title: string
  description?: string
  runLocation?: HealthRunLocation
  params?: Record<string, unknown>
  checks?: HealthProfileCheckDefinition[]
}

type HealthRunRequest = {
  profileId?: string
  targetId?: string
  target?: string
  params?: Record<string, unknown>
  checkIds?: string[]
  dispatchPath?: string[]
  runMode?: "node" | "subtree" | "failed_children" | string
}

type WorkAtTarget = {
  host?: string
  path?: string
  shell?: string
  registeredAt?: string
}

type HealthRunTarget = {
  targetId: string
  targetPath: string
  targetHost: string
}

export type HealthCheckResult = HealthNodeContract & {
  id: string
  title: string
  checkId: string
  component?: string
  severity: HealthSeverity
  status: HealthCheckStatus
  durationMs: number
  evidence: Record<string, unknown>
  runLocation?: HealthRunLocation
  failure: null | {
    class: string
    message: string
  }
  repairHint: string | null
  children?: HealthCheckNodeResult[]
}

export type HealthCheckNodeResult = {
  id: string
  title: string
  kind: "component" | "service" | "dependency" | "check" | "provider-row"
  status: HealthCheckStatus
  durationMs?: number
  evidence?: Record<string, unknown>
  runLocation?: HealthRunLocation
  failure?: null | {
    class: string
    message: string
  }
  repairHint?: string | null
  children?: HealthCheckNodeResult[]
}

export type HealthRunResult = {
  runId: string
  profileId: string
  targetId: string
  params: Record<string, unknown>
  startedAt: string
  finishedAt: string
  status: HealthRunStatus
  checks: HealthCheckResult[]
  root?: HealthCheckNodeResult
}

type HealthApiState = {
  repoRoot: string
  profilesDir: string
  checksDir: string
  stateDir: string
  workAtRegistryPath: string
  runCounter: number
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function safeIdentifier(value: string): string | null {
  const trimmed = value.trim()
  return /^[a-zA-Z0-9_.-]+$/u.test(trimmed) ? trimmed : null
}

function safeFileIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/gu, "_")
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function maybeString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function maybeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function renderTemplate(
  value: unknown,
  context: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu,
      (_, key: string) => {
        const replacement = context[key]
        return replacement === undefined || replacement === null
          ? ""
          : String(replacement)
      },
    )
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderTemplate(entry, context))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        renderTemplate(entry, context),
      ]),
    )
  }
  return value
}

function profileSummary(
  profile: HealthProfileDefinition,
): Record<string, unknown> {
  return {
    id: profile.id,
    title: profile.title,
    description: profile.description ?? "",
    runLocation: profile.runLocation ?? null,
    params: profile.params ?? {},
    checkCount: profile.checks?.length ?? 0,
  }
}

function defaultRunLocation(
  context: Record<string, unknown>,
  params: Record<string, unknown>,
): HealthRunLocation {
  return {
    executor: maybeString(params.executor) || "dashboard-health-api",
    workTarget:
      maybeString(params.workTarget) ||
      maybeString(context.targetId) ||
      "local",
    host:
      maybeString(params.host) || maybeString(context.targetHost) || "local",
    source: maybeString(params.source) || "dashboard-server",
    vantagePoint: maybeString(params.vantagePoint) || "dashboard-server",
    providerType: maybeString(params.providerType) || "dashboard-builtin",
  }
}

function checkRunLocation(
  check: HealthProfileCheckDefinition,
  context: Record<string, unknown>,
  params: Record<string, unknown>,
): HealthRunLocation {
  return {
    ...defaultRunLocation(context, params),
    ...(check.execution ?? {}),
    ...(check.runLocation ?? {}),
  }
}

function loadProfiles(state: HealthApiState): HealthProfileDefinition[] {
  if (!existsSync(state.profilesDir)) {
    return []
  }
  return readdirSync(state.profilesDir)
    .filter((file) => file.endsWith(".health-profile.json"))
    .sort((left, right) => left.localeCompare(right))
    .map((file) =>
      readJsonFile<HealthProfileDefinition>(join(state.profilesDir, file)),
    )
}

function loadProfile(
  state: HealthApiState,
  profileId: string,
): HealthProfileDefinition | null {
  const safeId = safeIdentifier(profileId)
  if (!safeId) {
    return null
  }
  return loadProfiles(state).find((profile) => profile.id === safeId) ?? null
}

function readWorkAtRegistry(
  state: HealthApiState,
): Record<string, WorkAtTarget> {
  if (!existsSync(state.workAtRegistryPath)) {
    return {}
  }
  try {
    const registry = readJsonFile<{ targets?: Record<string, WorkAtTarget> }>(
      state.workAtRegistryPath,
    )
    return registry.targets ?? {}
  } catch {
    return {}
  }
}

function resolveTarget(
  state: HealthApiState,
  targetId: string,
  params: Record<string, unknown>,
): HealthRunTarget {
  const requestedTarget = safeIdentifier(targetId) ?? "local"
  const registry = readWorkAtRegistry(state)
  const registered = registry[requestedTarget]
  const explicitPath = maybeString(params.targetPath)
  const explicitHost = maybeString(params.targetHost)
  return {
    targetId: requestedTarget,
    targetPath: explicitPath || registered?.path || state.repoRoot,
    targetHost: explicitHost || registered?.host || "local",
  }
}

async function runCommand(
  command: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<{
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}> {
  const processHandle = Bun.spawn(command, {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })
  const timeoutMs = options.timeoutMs ?? 5000
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    processHandle.kill()
  }, timeoutMs)
  const [stdout, stderr] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ])
  await processHandle.exited
  clearTimeout(timer)
  return {
    exitCode: processHandle.exitCode ?? -1,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    timedOut,
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  method = "GET",
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { method, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let payload: unknown = null
    if (text.trim()) {
      payload = JSON.parse(text)
    }
    return { response, payload }
  } finally {
    clearTimeout(timer)
  }
}

function storyboardProviderUrl(
  storyboardUrl: string,
  path: string,
): string | null {
  if (!/^https?:\/\//u.test(storyboardUrl)) {
    return null
  }
  try {
    return new URL(
      path.replace(/^\/+/, ""),
      `${storyboardUrl.replace(/\/+$/u, "")}/`,
    ).toString()
  } catch {
    return null
  }
}

const failLikeHealthStatuses: HealthCheckStatus[] = [
  "FAIL",
  "DISPATCH_FAILED",
  "UNAUTHORIZED",
]
const warnLikeHealthStatuses: HealthCheckStatus[] = [
  "WARN",
  "BLOCKED",
  "STALE",
  "UNSUPPORTED",
]
const unknownLikeHealthStatuses: HealthCheckStatus[] = [
  "UNKNOWN",
  "NOT_RUN",
  "RUNNING",
]

function rollupStatus(statuses: HealthCheckStatus[]): HealthCheckStatus {
  if (statuses.length === 0) return "UNKNOWN"
  if (statuses.some((status) => status !== "PASS" && status !== "INFO")) return "FAIL"
  return "PASS"
}

function statusFromProviderRows(rows: unknown[]): HealthCheckStatus {
  return rollupStatus(
    rows.map((row) => {
      if (!row || typeof row !== "object") return "UNKNOWN"
      return healthStatusFromProviderStatus(
        (row as Record<string, unknown>).status,
      )
    }),
  )
}

function statusFromStringRows(
  rows: Array<{ status: string }>,
): HealthCheckStatus {
  return rollupStatus(
    rows.map((row) => healthStatusFromProviderStatus(row.status)),
  )
}

function healthStatusFromProviderStatus(status: unknown): HealthCheckStatus {
  const normalized = maybeString(status).toLowerCase()
  if (
    normalized === "pass" ||
    normalized === "passed" ||
    normalized === "ok" ||
    normalized === "success"
  )
    return "PASS"
  if (normalized === "warn" || normalized === "warning") return "WARN"
  if (
    normalized === "fail" ||
    normalized === "failed" ||
    normalized === "error"
  )
    return "FAIL"
  if (normalized === "blocked" || normalized === "config_missing")
    return "BLOCKED"
  if (
    normalized === "not_run" ||
    normalized === "not-run" ||
    normalized === "skipped"
  )
    return "NOT_RUN"
  if (normalized === "stale") return "STALE"
  if (normalized === "dispatch_failed" || normalized === "dispatch-failed")
    return "DISPATCH_FAILED"
  if (
    normalized === "unauthorized" ||
    normalized === "auth_failed" ||
    normalized === "auth-failed"
  )
    return "UNAUTHORIZED"
  if (normalized === "unsupported") return "UNSUPPORTED"
  if (normalized === "running" || normalized === "pending") return "RUNNING"
  if (normalized === "info" || normalized === "informational") return "INFO"
  return "UNKNOWN"
}

function statusReason(
  status: HealthCheckStatus,
  children?: Array<{ status: HealthCheckStatus }>,
): string | null {
  if (status === "PASS") return "all_children_passed"
  if (status === "WARN") return "child_warn"
  if (status === "FAIL")
    return children?.some((child) => child.status === "FAIL")
      ? "child_failed"
      : "assertion_failed"
  if (status === "BLOCKED") return "upstream_blocked"
  if (status === "NOT_RUN") return "not_run"
  if (status === "STALE") return "stale_result"
  if (status === "DISPATCH_FAILED") return "dispatch_error"
  if (status === "UNAUTHORIZED") return "auth_failed"
  if (status === "UNSUPPORTED") return "unsupported"
  if (status === "RUNNING") return "running"
  if (status === "INFO") return "informational"
  return "unknown"
}

function healthNodeActions(args: {
  id: string
  title: string
  status: HealthCheckStatus
  runLocation?: HealthRunLocation
  owner?: string
  children?: Array<{ status: HealthCheckStatus }>
}): HealthNodeAction[] {
  const childStatuses = args.children?.map((child) => child.status) ?? []
  const hasChildren = childStatuses.length > 0
  const hasFailedChildren = childStatuses.some(
    (status) =>
      failLikeHealthStatuses.includes(status) ||
      warnLikeHealthStatuses.includes(status),
  )
  const owner = args.owner ?? "ddev-storyboard"
  const base = {
    owner,
    runLocation: args.runLocation,
    risk: "readonly" as const,
    requiresConfirmation: false,
    rerunAfter: "latest result refreshes this node and its parent rollups",
  }
  return [
    {
      ...base,
      id: "run-node",
      label: "Run this node",
      scopes: ["node", args.id],
      expectedEffect: `Re-run ${args.title} through its owning parent dispatcher`,
      supported: true,
    },
    {
      ...base,
      id: "run-subtree",
      label: "Run subtree",
      scopes: ["subtree", args.id],
      expectedEffect: hasChildren
        ? `Re-run ${args.title} and direct descendants owned by this parent`
        : "Leaf has no subtree; use Run this node",
      supported: hasChildren,
      unavailableReason: hasChildren
        ? undefined
        : "UNSUPPORTED: leaf node has no child subtree",
    },
    {
      ...base,
      id: "run-failed-children",
      label: "Run failed children",
      scopes: ["failed-children", args.id],
      expectedEffect: hasFailedChildren
        ? "Re-run failing/warning direct child checks through the owning parent"
        : "No failed children in latest result",
      supported: hasChildren && hasFailedChildren,
      unavailableReason:
        hasChildren && !hasFailedChildren
          ? "NOT_RUN: no failed children in latest result"
          : !hasChildren
            ? "UNSUPPORTED: leaf node has no children"
            : undefined,
    },
    {
      ...base,
      id: "refresh-latest",
      label: "Refresh latest",
      scopes: ["refresh", args.id],
      expectedEffect:
        "Reload cached latest result without bypassing the health owner",
      supported: true,
    },
  ]
}

function nodeContract(args: {
  id: string
  title: string
  kind: string
  status: HealthCheckStatus
  runLocation?: HealthRunLocation
  dispatchPath: string[]
  owner?: string
  definitionKey?: string
  templateId?: string
  target?: HealthTargetMetadata
  durationMs?: number
  detail?: string
  children?: Array<{ status: HealthCheckStatus }>
  context?: Record<string, unknown>
}): HealthNodeContract {
  const now = new Date().toISOString()
  const correlationId =
    maybeString(args.context?.correlationId) || maybeString(args.context?.runId)
  const targetId =
    maybeString(args.context?.healthTargetId) ||
    maybeString(args.context?.targetId)
  const instanceId = `${targetId || "health-target"}:${args.dispatchPath.join("/")}:${args.id}`
  return {
    contractVersion: "health-node-result.v1",
    runId: maybeString(args.context?.runId) || undefined,
    correlationId: correlationId || undefined,
    targetId: targetId || undefined,
    nodeId: args.id,
    instanceId,
    templateId: args.templateId,
    definitionKey: args.definitionKey ?? args.id,
    label: args.title,
    nodeKind: args.kind,
    rollupReason: statusReason(args.status, args.children),
    failureClass:
      args.status === "PASS" || args.status === "INFO"
        ? null
        : statusReason(args.status, args.children),
    owner: args.owner ?? "ddev-storyboard",
    executor: args.runLocation,
    vantagePoint: args.runLocation,
    target: args.target ?? {
      id: targetId || undefined,
      profileId: targetId || undefined,
    },
    dispatchPath: args.dispatchPath,
    checkedAt: now,
    finishedAt: now,
    durationMs: args.durationMs,
    ttlMs: 60_000,
    freshness: "fresh",
    stale: false,
    summary: args.detail ?? args.title,
    detail: args.detail,
    actions: healthNodeActions(args),
    repairActions: [],
  }
}

function rollupNodeStatus(
  children: HealthCheckNodeResult[],
): HealthCheckStatus {
  return rollupStatus(children.map((child) => child.status))
}

function healthGroupDisplayTitle(group: string): string {
  switch (group) {
    case "bc-storyboard source/provider health":
      return "Storyboard source is reachable and valid"
    case "fast health/check-all summary":
      return "Storyboard automated health checks are passing"
    case "run-target-health provider rows":
      return "Storyboard automated health checks"
    case "bc-frontend staging runtime":
      return "BaseConnect web app is running with the staging backend"
    case "bc-frontend docker runtime":
      return "BaseConnect web app is running with the Docker backend"
    case "bc-frontend web app quick tunnel":
      return "Public BC web app tunnel is available"
    case "ddev dashboard/tunnel/remote-storyboard route":
      return "Health Dashboard and storyboard editor are reachable"
    case "delegated dispatch integrity":
      return "Health tree can dispatch reruns"
    case "repair/runbook metadata":
      return "Repair guidance is safe and actionable"
    default:
      return group
  }
}

function healthRowDisplayTitle(
  row: Record<string, unknown>,
  group: string,
): string {
  const key = String(row.key ?? row.id ?? "")
  const label = String(row.label ?? row.key ?? row.id ?? group)
  switch (key) {
    case "source-storyboard-md-200":
      return "Storyboard markdown is reachable"
    case "source-storyboard-json-200":
      return "Storyboard JSON is reachable"
    case "story-frame-inventory":
      return "Expected onboarding frames are present"
    case "storyboard-schema-minimum":
      return "Storyboard file is valid"
    case "asset-reference-inventory":
      return "Storyboard screenshots are referenced"
    case "run-target-health-200":
      return "Storyboard health endpoint is reachable"
    case "check-all-pass-fail-summary":
      return "Storyboard automated checks meet the pass threshold"
    case "check-all-source-root-reachable":
      return "Storyboard source server is reachable"
    case "check-all-storyboard-json-reachable":
      return "Storyboard JSON loads and parses"
    case "check-all-storyboard-md-reachable":
      return "Storyboard markdown loads"
    case "check-all-source-slug-listed":
      return "Storyboard source appears in the access list"
    case "check-all-run-target-health-endpoint-reachable":
      return "Storyboard health endpoint is reachable"
    case "check-all-check-all-runnable":
      return "Storyboard automated check suite can run"
    case "check-all-provider-health-rows-pass":
      return "Storyboard health checks are defined and working"
    case "check-all-frame-ids-unique":
      return "Storyboard frame IDs are unique"
    case "check-all-expected-frames-exist":
      return "Expected onboarding frames are present"
    case "check-all-frontend-web-configured":
      return "BaseConnect web app URL is configured"
    case "check-all-frontend-web-ready-for-run":
      return "BaseConnect web app is ready for storyboard runs"
    case "check-all-frontend-login-route-loads":
      return "Storyboard login page target loads"
    case "check-all-app-login-view-loads":
      return "Login page is ready for automated runs"
    case "check-all-web-run-target-exists":
      return "Storyboard has a web app run target"
    case "check-all-web-run-target-url-valid":
      return "Storyboard web app run target URL is valid"
    case "check-all-runnable-frames-inherit-run-target":
      return "Runnable storyboard frames use the web app target"
    case "check-all-app-root-reachable":
      return "BaseConnect web app loads"
    case "check-all-app-user-verification-route-loads":
      return "User verification page loads"
    case "check-all-app-identity-baseconnect":
      return "App identifies as BaseConnect"
    case "check-all-app-js-bundle-loads":
      return "BaseConnect app code loads in the browser"
    case "check-all-frontend-runtime-staging-backend":
      return "App is using the staging backend"
    case "check-all-backend-public-api-reachable":
      return "Staging backend API is reachable"
    case "check-all-automation-driver-per-runnable-frame":
      return "Runnable frames have automation drivers"
    case "check-all-onboarding-test-email-convention":
      return "Onboarding test emails use the expected format"
    case "check-all-sms-checked-driver-contract":
      return "SMS enabled state is testable"
    case "check-all-sms-unchecked-driver-contract":
      return "SMS disabled state is testable"
    case "check-all-output-paths-writable":
      return "Storyboard output folders are writable"
    case "check-all-screenshot-assets-resolve":
      return "Storyboard screenshots resolve"
    case "check-all-assets-evidence-references-present":
      return "Storyboard evidence assets are referenced"
    case "check-all-canonical-sms-assets-provenance":
      return "Canonical SMS assets include provenance"
    case "check-all-story-a-01-account-email-screenshot-semantic":
      return "Account email screenshot is readable"
    case "check-all-semantic-frame-state-reportable":
      return "Storyboard frame state can be reported"
    case "bc-frontend-root-200":
      return "BaseConnect web app loads"
    case "bc-frontend-login-200":
      return "Login page loads"
    case "bc-frontend-user-verification-200":
      return "User verification page loads"
    case "bc-frontend-public-quick-tunnel-url-present":
      return "Public BC web app tunnel URL is available"
    case "bc-frontend-quick-tunnel-root-real-app":
      return "Public tunnel loads the BaseConnect app"
    case "bc-frontend-quick-tunnel-login-real-app":
      return "Public tunnel loads the login page"
    case "bc-frontend-quick-tunnel-user-verification-real-app":
      return "Public tunnel loads the user verification page"
    case "bc-frontend-quick-tunnel-routes-blocked":
      return "Public tunnel routes can be checked"
    case "bc-frontend-quick-tunnel-staging-backend-proof":
      return "Public tunnel uses the staging backend"
    case "bc-frontend-staging-backend-marker-present":
    case "bc-frontend-docker-backend-marker-present":
      return "App bundle points to the expected backend"
    case "bc-frontend-config-env-target-proof":
      return "Runtime config points to the expected backend"
    case "bc-frontend-network-proof-backend":
      return "Browser-loaded app uses the expected backend"
    case "bc-frontend-no-accidental-fallback":
      return "App is not using the wrong backend"
    case "bc-frontend-route-semantic-root":
      return "BaseConnect home page looks like the real app"
    case "docker-daemon-reachable":
      return "Docker is available for the local backend"
    case "docker-backend-api-reachable":
      return "Docker backend API is reachable"
    case "ddev-dashboard-gateway-200":
      return "Health Dashboard gateway is reachable"
    case "ddev-dashboard-vite-200":
      return "Health Dashboard frontend dev server is reachable"
    case "ddev-dashboard-public-route-200":
      return "Public Health Dashboard route is reachable"
    case "ddev-dashboard-remote-storyboard-route-200":
      return "Storyboard editor route is reachable"
    case "ddev-health-route-shell-render":
      return "Health Dashboard page renders in the dashboard shell"
    case "ddev-health-nav-visible":
      return "Health Dashboard appears in navigation"
    case "ddev-single-tree-ui-visible":
      return "Health tree is visible"
    case "ddev-scroll-root-tailwind-source":
      return "Health tree layout styles are loaded"
    case "ddev-console-network-capture":
      return "Browser errors are captured for health failures"
    case "dispatch-parent-owned-child-dispatch":
      return "Health tree can rerun child branches"
    case "dispatch-executor-vantage-metadata":
      return "Each health row shows where it ran"
    case "dispatch-status-taxonomy":
      return "Waiting, stale, and failed states are distinct"
    case "dispatch-node-actions":
      return "Run buttons are available for roots, branches, and leaves"
    case "repair-runbook-safe-actions":
      return "Repair actions are safe and explicit"
    case "quicktunnel-persistence-contract":
      return "Dashboard tunnel can stay up during app restarts"
    default:
      return label
  }
}

function providerRowsToChildTree(
  rows: Array<Record<string, unknown>>,
  context: Record<string, unknown> = {},
): HealthCheckNodeResult[] {
  const groups = rows.reduce((acc, row) => {
    const group = String(row.group ?? row.component ?? "provider row details")
    const existing = acc.get(group) ?? []
    existing.push(row)
    acc.set(group, existing)
    return acc
  }, new Map<string, Array<Record<string, unknown>>>())

  return Array.from(groups.entries()).map(([group, groupRows]) => {
    const groupTitle = healthGroupDisplayTitle(group)
    const children = groupRows.map((row): HealthCheckNodeResult => {
      const status = healthStatusFromProviderStatus(row.status)
      const id = String(row.key ?? row.id ?? row.label ?? group)
      const title = healthRowDisplayTitle(row, group)
      const runLocation =
        row.runLocation && typeof row.runLocation === "object"
          ? (row.runLocation as HealthRunLocation)
          : coldStartRunLocation(group)
      const detail = String(row.detail ?? row.label ?? row.key ?? "")
      return {
        ...nodeContract({
          id,
          title,
          kind: "provider-row",
          status,
          runLocation,
          dispatchPath: [
            maybeString(context.healthTargetTitle) ||
              maybeString(context.healthTargetId) ||
              "health target",
            group,
            id,
          ],
          owner: maybeString(row.owner) || "ddev-storyboard",
          definitionKey:
            maybeString(
              (row.evidence as Record<string, unknown> | undefined)
                ?.sharedSubcheckDefinitionId,
            ) || id,
          target: {
            id: maybeString(context.healthTargetId),
            profileId: maybeString(context.healthTargetId),
            backendMode: maybeString(context.backendMode),
            sourceUrl: maybeString(context.storyboardUrl),
          },
          detail,
          context,
        }),
        id,
        title,
        kind: "provider-row" as const,
        status,
        evidence: {
          dispatchPath: [
            maybeString(context.healthTargetTitle) ||
              maybeString(context.healthTargetId) ||
              "health target",
            group,
            id,
          ],
          owner: row.owner ?? null,
          actionTarget: row.action_target ?? row.actionTarget ?? null,
          detail: row.detail ?? null,
          ...(row.evidence && typeof row.evidence === "object"
            ? (row.evidence as Record<string, unknown>)
            : {}),
        },
        runLocation,
        failure: failLikeHealthStatuses.includes(status)
          ? failure(
              "child_check_failed",
              String(
                row.detail ?? row.label ?? row.key ?? "provider row failed",
              ),
            )
          : null,
        repairHint: maybeString(row.repairHint) || null,
      }
    })
    const status = rollupNodeStatus(children)
    const groupRunLocation = coldStartRunLocation(group)
    return {
      ...nodeContract({
        id: safeFileIdentifier(group),
        title: groupTitle,
        kind: "component",
        status,
        runLocation: groupRunLocation,
        dispatchPath: [
          maybeString(context.healthTargetTitle) ||
            maybeString(context.healthTargetId) ||
            "health target",
          group,
        ],
        owner: "ddev-storyboard",
        definitionKey: safeFileIdentifier(group),
        templateId:
          maybeString(context.templateId) ||
          "storyboard-cold-start-dev-dashboard-backend.v1",
        target: {
          id: maybeString(context.healthTargetId),
          profileId: maybeString(context.healthTargetId),
          backendMode: maybeString(context.backendMode),
          sourceUrl: maybeString(context.storyboardUrl),
        },
        children,
        context,
      }),
      id: safeFileIdentifier(group),
      title: groupTitle,
      kind: "component" as const,
      status,
      evidence: {
        dispatchModel: "delegated-parent-dispatch.v1",
        dispatchPath: [
          maybeString(context.healthTargetTitle) ||
            maybeString(context.healthTargetId) ||
            "health target",
          group,
        ],
        childCount: children.length,
      },
      runLocation: groupRunLocation,
      failure:
        status === "FAIL"
          ? failure("child_failure", `${group} has failing children`)
          : null,
      repairHint:
        "Run or repair the failing child checks owned by this component; no generic fake repair action is exposed.",
      children,
    }
  })
}

function httpStatusIsOk(status: unknown): boolean {
  return typeof status === "number" && status >= 200 && status < 400
}

function countStoryboardFrames(story: Record<string, unknown>): number {
  let total = Array.isArray(story.frames) ? story.frames.length : 0
  if (Array.isArray(story.branches)) {
    for (const branch of story.branches) {
      if (branch && typeof branch === "object") {
        const branchFrames = (branch as Record<string, unknown>).frames
        total += Array.isArray(branchFrames) ? branchFrames.length : 0
      }
    }
  }
  return total
}

type ProviderRowStatus =
  | "pass"
  | "warn"
  | "fail"
  | "unknown"
  | "config_missing"
  | "blocked"
  | "not_run"
  | "stale"
  | "dispatch_failed"
  | "unauthorized"
  | "unsupported"
  | "running"
  | "info"

type ProviderRowInput = {
  key: string
  label: string
  group: string
  status: ProviderRowStatus
  detail: string
  owner?: string
  kind?: string
  runLocation?: HealthRunLocation
  evidence?: Record<string, unknown>
}

function addProviderRow(
  rows: Array<Record<string, unknown>>,
  row: ProviderRowInput,
  context: {
    backendMode?: string
    frontendUrl?: string
    storyboardUrl?: string
  } = {},
): void {
  rows.push({
    owner: "ddev-storyboard",
    kind: "cold-start",
    runLocation: row.runLocation ?? coldStartRunLocation(row.group, context),
    ...row,
  })
}

function coldStartRunLocation(
  group: string,
  context: {
    backendMode?: string
    frontendUrl?: string
    storyboardUrl?: string
  } = {},
): HealthRunLocation {
  const backendMode = context.backendMode === "docker" ? "docker" : "staging"
  if (group === `bc-frontend ${backendMode} runtime`) {
    return {
      executor: "dashboard-health-api",
      workTarget:
        backendMode === "docker"
          ? "bc-fullstack/docker-backend"
          : "bc-fullstack/frontend",
      host:
        context.frontendUrl ||
        (backendMode === "docker"
          ? "Docker/local backend stack"
          : "bc-frontend staging web app runtime"),
      source: `BaseConnect frontend ${backendMode} runtime`,
      vantagePoint:
        backendMode === "docker"
          ? "ddev worker -> bc-frontend service -> local Docker backend"
          : "ddev worker -> bc-frontend service",
      providerType:
        backendMode === "docker" ? "docker-runtime-http-probe" : "http-probe",
    }
  }
  if (group === "bc-storyboard source/provider health") {
    return {
      executor: "dashboard-health-api",
      workTarget: "bc-storyboard/access-server",
      host: context.storyboardUrl || "bc-storyboard access server",
      source: "bc-storyboard source owner",
      vantagePoint: "ddev worker -> storyboard access server",
      providerType: "storyboard-provider-http",
    }
  }
  if (group === "ddev dashboard/tunnel/remote-storyboard route") {
    return {
      executor: "dashboard-health-api",
      workTarget: "agent-infra-dev/ddev-dashboard",
      host: "worker-local dashboard gateway/Vite",
      source: "ddev dashboard worker",
      vantagePoint: "ddev worker + configured public route",
      providerType: "dashboard-route-http",
    }
  }
  return {
    executor: "dashboard-health-api",
    workTarget: "agent-infra-dev/ddev-dashboard",
    host: context.storyboardUrl || "bc-storyboard access server",
    source: "storyboard run-target-health provider",
    vantagePoint: "ddev worker -> storyboard provider",
    providerType: "storyboard-check-all",
  }
}

function dashboardRuntimeStatePublicUrl(): string {
  const statePath = "/home/ec2-user/state/dashboard/runtime-state.json"
  if (!existsSync(statePath)) return ""
  try {
    const state = readJsonFile<Record<string, unknown>>(statePath)
    return maybeString(state.publicUrl).replace(/\/+$/u, "")
  } catch {
    return ""
  }
}

function runtimeStatePathFromParams(params: Record<string, unknown>): string {
  return (
    maybeString(params.runtimeStatePath) ||
    "/home/ec2-user/state/dashboard/runtime-state.json"
  )
}

function normalizePublicUrl(url: string): string {
  return url.trim().replace(/\/+$/u, "")
}

async function evaluateDashboardPersistentQuickTunnelContract(
  params: Record<string, unknown>,
): Promise<
  Omit<
    HealthCheckResult,
    "id" | "title" | "checkId" | "severity" | "repairHint" | "durationMs"
  >
> {
  const runtimeStatePath = runtimeStatePathFromParams(params)
  const expectedPublicUrl = normalizePublicUrl(
    maybeString(params.expectedPublicUrl),
  )
  const localUrl = normalizePublicUrl(
    maybeString(params.localUrl) || "http://127.0.0.1:3300",
  )
  const probePath = maybeString(params.probePath) || "/health"
  const localPort = maybeString(params.localPort) || "3300"
  const timeoutSeconds = maybeNumber(params.timeoutSeconds, 5)
  const mustContain = maybeString(params.mustContain)
  const evidence: Record<string, unknown> = {
    runtimeStatePath,
    expectedPublicUrl,
    localUrl,
    probePath,
    localPort,
  }

  if (!existsSync(runtimeStatePath)) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "runtime_state_missing",
        "dashboard runtime-state.json is missing; do not mint/churn a new quicktunnel until state is restored or intentionally bootstrapped",
      ),
    }
  }

  let runtimeState: Record<string, unknown>
  try {
    runtimeState = readJsonFile<Record<string, unknown>>(runtimeStatePath)
  } catch (error) {
    return {
      status: "FAIL",
      evidence: {
        ...evidence,
        error: error instanceof Error ? error.message : String(error),
      },
      failure: failure("runtime_state_invalid", "runtime state is not JSON"),
    }
  }

  const publicUrl = normalizePublicUrl(maybeString(runtimeState.publicUrl))
  const cloudflaredPid = maybeNumber(
    runtimeState.cloudflaredPid ?? runtimeState.tunnelPid,
    0,
  )
  Object.assign(evidence, {
    publicUrl,
    tunnelPid: runtimeState.tunnelPid ?? null,
    cloudflaredPid: runtimeState.cloudflaredPid ?? null,
    tunnelProvider: runtimeState.tunnelProvider ?? null,
    tunnelCreatedAtMs: runtimeState.tunnelCreatedAtMs ?? null,
    updatedAtMs: runtimeState.updatedAtMs ?? null,
  })

  if (!/^https:\/\/[-a-z0-9]+\.trycloudflare\.com$/u.test(publicUrl)) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "runtime_state_public_url_invalid",
        "runtime state publicUrl must point at the active trycloudflare quicktunnel hostname",
      ),
    }
  }
  if (expectedPublicUrl && publicUrl !== expectedPublicUrl) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "runtime_state_public_url_mismatch",
        "runtime state points at a different quicktunnel hostname than the current accepted public URL",
      ),
    }
  }
  if (!cloudflaredPid) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "runtime_state_tunnel_pid_missing",
        "runtime state does not record a cloudflared/tunnel pid for the persistent quicktunnel",
      ),
    }
  }

  const processCheck = await runCommand(
    ["ps", "-p", String(cloudflaredPid), "-o", "args="],
    { timeoutMs: 3000 },
  )
  evidence.cloudflaredCommand = processCheck.stdout
  if (
    processCheck.exitCode !== 0 ||
    !processCheck.stdout.includes("cloudflared") ||
    !processCheck.stdout.includes(`127.0.0.1:${localPort}`)
  ) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "persistent_quicktunnel_process_not_found",
        "recorded cloudflared process is missing or no longer targets the persistent dashboard gateway port",
      ),
    }
  }

  const localProbe = await textFromUrl(
    `${localUrl}${probePath}`,
    timeoutSeconds * 1000,
  )
  evidence.localProbe = {
    url: `${localUrl}${probePath}`,
    status: localProbe.status,
    error: localProbe.error || null,
  }
  if (!httpStatusIsOk(localProbe.status)) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "persistent_quicktunnel_local_origin_dead",
        `local dashboard gateway behind the persistent tunnel is not healthy: ${localProbe.error || `HTTP ${localProbe.status}`}`,
      ),
    }
  }

  const publicProbe = await textFromUrl(
    `${publicUrl}${probePath}`,
    timeoutSeconds * 1000,
  )
  const bodyMatches = mustContain
    ? publicProbe.text.includes(mustContain)
    : true
  evidence.publicProbe = {
    url: `${publicUrl}${probePath}`,
    status: publicProbe.status,
    error: publicProbe.error || null,
    mustContain,
    bodyMatches,
  }
  if (!httpStatusIsOk(publicProbe.status) || !bodyMatches) {
    return {
      status: "FAIL",
      evidence,
      failure: failure(
        "runtime_state_public_url_dead_or_stale",
        "runtime state publicUrl is not serving the live dashboard route; keep the tunnel hostname stable and repair processes behind it instead of writing a dead/stale hostname",
      ),
    }
  }

  return {
    status: "PASS",
    summary:
      "persistent quicktunnel contract is healthy; update dashboard/Vite behind the existing tunnel without restarting cloudflared",
    evidence,
    failure: null,
  }
}

async function textFromUrl(
  url: string,
  timeoutMs: number,
): Promise<{ status: number | null; text: string; error: string }> {
  try {
    const response = await fetchWithTimeout(url, timeoutMs)
    return { status: response.status, text: await response.text(), error: "" }
  } catch (error) {
    return {
      status: null,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function jsonFromUrl(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<{ status: number | null; payload: unknown; error: string }> {
  try {
    const { response, payload } = await fetchJsonWithTimeout(
      url,
      timeoutMs,
      init,
    )
    return { status: response.status, payload, error: "" }
  } catch (error) {
    return {
      status: null,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function detectBackendMarker(
  frontendUrl: string,
  backendMode: string,
  timeoutMs: number,
): Promise<{ present: boolean; urls: string[]; marker: string }> {
  const root = await textFromUrl(frontendUrl, timeoutMs)
  if (!httpStatusIsOk(root.status))
    return {
      present: false,
      urls: [],
      marker: root.error || `HTTP ${root.status}`,
    }
  const scriptPaths = Array.from(root.text.matchAll(/src="([^"]+\.js)"/gu))
    .map((match) => match[1])
    .slice(0, 8)
  const texts: Array<{ url: string; text: string }> = [
    { url: frontendUrl, text: root.text },
  ]
  for (const scriptPath of scriptPaths) {
    const scriptUrl = new URL(
      scriptPath,
      `${frontendUrl.replace(/\/+$/u, "/")}`,
    ).toString()
    const script = await textFromUrl(scriptUrl, timeoutMs)
    if (httpStatusIsOk(script.status))
      texts.push({ url: scriptUrl, text: script.text })
  }
  const stagingHits = texts
    .filter(
      (entry) =>
        entry.text.includes("api-staging.baseconnect-app.com") ||
        /staging/iu.test(entry.text),
    )
    .map((entry) => entry.url)
  if (backendMode === "docker") {
    const dockerHints = texts
      .filter((entry) =>
        /localhost|127\.0\.0\.1|host\.docker\.internal|docker|local backend|VITE_API_URL|EXPO_PUBLIC_API_URL/iu.test(
          entry.text,
        ),
      )
      .map((entry) => entry.url)
    if (stagingHits.length > 0)
      return {
        present: false,
        urls: stagingHits,
        marker: "staging-marker-present",
      }
    return {
      present: dockerHints.length > 0,
      urls: dockerHints,
      marker:
        dockerHints.length > 0
          ? "bundle-docker-or-local-backend-marker"
          : "missing-docker-local-marker",
    }
  }
  return {
    present: stagingHits.length > 0,
    urls: stagingHits,
    marker:
      stagingHits.length > 0
        ? stagingHits[0] === frontendUrl
          ? "root-html"
          : "bundle-staging-marker"
        : "missing",
  }
}

function firstStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = maybeString(record[key])
    if (value) return value
  }
  return ""
}

function appendPathToUrl(baseUrl: string, path: string): string {
  try {
    const url = new URL(baseUrl)
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${path.replace(/^\/+/u, "")}`
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return ""
  }
}

async function publicUrlFromQuickTunnelState(
  stateUrl: string,
  timeoutMs: number,
): Promise<{
  url: string
  response: { status: number | null; payload?: unknown; error?: string }
}> {
  const stateResponse = await jsonFromUrl(stateUrl, timeoutMs)
  const state =
    stateResponse.payload && typeof stateResponse.payload === "object"
      ? (stateResponse.payload as Record<string, unknown>)
      : {}
  const statePublicUrl = firstStringValue(state, [
    "publicUrl",
    "quickTunnelUrl",
    "url",
  ])
  return { url: normalizePublicUrl(statePublicUrl), response: stateResponse }
}

async function resolveBcWebAppQuickTunnelUrl(
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ url: string; source: string; evidence: Record<string, unknown> }> {
  const directUrl = firstStringValue(params, [
    "bcFrontendQuickTunnelUrl",
    "bcWebAppQuickTunnelUrl",
    "quickTunnelUrl",
  ])
  if (directUrl) {
    return {
      url: normalizePublicUrl(directUrl),
      source: "health-profile-param",
      evidence: { configuredUrl: directUrl },
    }
  }

  const configuredStateUrl = firstStringValue(params, [
    "bcFrontendQuickTunnelStateUrl",
    "bcWebAppQuickTunnelStateUrl",
    "quickTunnelStateUrl",
  ])
  const stateUrlCandidates = [
    configuredStateUrl,
    appendPathToUrl(
      firstStringValue(params, ["storyboardUrl", "storyboardSourceUrl"]),
      "assets/runtime/bc-frontend-quick-tunnel.json",
    ),
  ].filter((value, index, values) => value && values.indexOf(value) === index)

  const attemptedStateUrls: Array<Record<string, unknown>> = []
  for (const stateUrl of stateUrlCandidates) {
    const { url, response } = await publicUrlFromQuickTunnelState(
      stateUrl,
      timeoutMs,
    )
    attemptedStateUrls.push({
      stateUrl,
      httpStatus: response.status,
      error: response.error || null,
      stateKeys:
        response.payload && typeof response.payload === "object"
          ? Object.keys(response.payload as Record<string, unknown>).slice(0, 20)
          : [],
    })
    if (url) {
      return {
        url,
        source: configuredStateUrl === stateUrl
          ? "owning-runtime-state-url"
          : "storyboard-runtime-state-discovery",
        evidence: {
          stateUrl,
          httpStatus: response.status,
          error: response.error || null,
          stateKeys:
            response.payload && typeof response.payload === "object"
              ? Object.keys(response.payload as Record<string, unknown>).slice(
                  0,
                  20,
                )
              : [],
        },
      }
    }
  }

  return {
    url: "",
    source: stateUrlCandidates.length > 0 ? "state-url-no-public-url" : "missing",
    evidence: {
      expectedParams: [
        "bcFrontendQuickTunnelUrl",
        "bcFrontendQuickTunnelStateUrl",
      ],
      attemptedStateUrls,
    },
  }
}

function routeLooksLikeBaseConnectApp(path: string, text: string): boolean {
  if (!text.includes("BaseConnect")) return false
  if (path === "/") return true

  // Expo web production exports commonly serve the same SPA shell for deep links;
  // the route-specific proof then lives in the downloaded JS bundle, while this
  // check proves the public quick tunnel/history fallback returns the real app
  // shell instead of a tunnel error page or dashboard shell.
  if (/id="root"|_expo\/static\/js\/web|expo-scripts/iu.test(text)) return true

  if (path === "/login") return /login|sign in|sign-in|email|password/iu.test(text)
  if (path === "/user-verification")
    return /verification|verify|user-verification|identity|code/iu.test(text)
  return true
}

function providerSummary(payload: unknown): Record<string, unknown> {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {}
  const sourceTargets = Array.isArray(record.sourceTargets)
    ? record.sourceTargets
    : []
  const sourceTarget =
    sourceTargets[0] && typeof sourceTargets[0] === "object"
      ? (sourceTargets[0] as Record<string, unknown>)
      : {}
  const evidence =
    sourceTarget.evidence && typeof sourceTarget.evidence === "object"
      ? (sourceTarget.evidence as Record<string, unknown>)
      : {}
  return {
    provider: record.provider ?? null,
    storyboard: record.storyboard ?? null,
    sourceTargets,
    runTargets: Array.isArray(record.runTargets) ? record.runTargets : [],
    definitions: Array.isArray(record.definitions) ? record.definitions : [],
    repairActions: Array.isArray(record.repairActions)
      ? record.repairActions
      : [],
    storyCount: evidence.storyCount ?? null,
    frameCount: evidence.frameCount ?? null,
    screenshotAssetRefs: evidence.screenshotAssetRefs ?? null,
    evidenceAssetRefs: evidence.evidenceAssetRefs ?? null,
  }
}

function failure(
  failureClass: string,
  message: string,
): { class: string; message: string } {
  return { class: failureClass, message }
}

async function evaluateBuiltinCheck(
  state: HealthApiState,
  check: HealthProfileCheckDefinition,
  context: Record<string, unknown>,
  params: Record<string, unknown>,
): Promise<
  Omit<
    HealthCheckResult,
    "id" | "title" | "checkId" | "severity" | "repairHint" | "durationMs"
  >
> {
  switch (check.checkId) {
    case "work_at_target_reachable": {
      const targetId = maybeString(context.targetId) || "local"
      if (targetId === "local") {
        return {
          status: "PASS",
          evidence: { mode: "local", targetPath: context.targetPath },
          failure: null,
        }
      }
      const workAtScript = resolve(state.repoRoot, "scripts/work-at.sh")
      if (!existsSync(workAtScript)) {
        return {
          status: "UNKNOWN",
          evidence: { workAtScript },
          failure: failure("runner_unavailable", "work-at.sh is not available"),
        }
      }
      const result = await runCommand([workAtScript, "--check", targetId], {
        cwd: state.repoRoot,
        timeoutMs: 10000,
      })
      return result.exitCode === 0
        ? {
            status: "PASS",
            evidence: { stdout: result.stdout, targetId },
            failure: null,
          }
        : {
            status: "FAIL",
            evidence: {
              stdout: result.stdout,
              stderr: result.stderr,
              targetId,
            },
            failure: failure(
              result.timedOut ? "target_check_timeout" : "target_unreachable",
              result.stderr || result.stdout || "work-at target check failed",
            ),
          }
    }

    case "work_at_path_exists": {
      const path = maybeString(params.path)
      if (!path) {
        return {
          status: "UNKNOWN",
          evidence: { params },
          failure: failure("invalid_check_params", "path is required"),
        }
      }
      const targetHost = maybeString(context.targetHost)
      if (!targetHost || targetHost === "local" || targetHost === "localhost") {
        const ok = existsSync(path)
        return ok
          ? { status: "PASS", evidence: { path }, failure: null }
          : {
              status: "FAIL",
              evidence: { path },
              failure: failure("path_missing", `path does not exist: ${path}`),
            }
      }
      return {
        status: "UNKNOWN",
        evidence: { path, targetHost },
        failure: failure(
          "remote_path_check_not_implemented",
          "remote path checks are intentionally not executed by the dashboard MVP runner",
        ),
      }
    }

    case "work_at_command_available": {
      const commandName = maybeString(params.commandName)
      if (!/^[a-zA-Z0-9_.+-]+$/u.test(commandName)) {
        return {
          status: "UNKNOWN",
          evidence: { commandName },
          failure: failure("invalid_check_params", "commandName is invalid"),
        }
      }
      const result = await runCommand(
        ["bash", "-lc", `command -v -- ${commandName}`],
        {
          cwd: state.repoRoot,
          timeoutMs: 3000,
        },
      )
      return result.exitCode === 0
        ? {
            status: "PASS",
            evidence: { commandName, path: result.stdout },
            failure: null,
          }
        : {
            status: "FAIL",
            evidence: { commandName, stderr: result.stderr },
            failure: failure(
              "command_missing",
              `${commandName} is not available`,
            ),
          }
    }

    case "work_at_http_ok": {
      const url = maybeString(params.url)
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 2)
      if (!/^https?:\/\//u.test(url)) {
        return {
          status: "UNKNOWN",
          evidence: { url },
          failure: failure("invalid_check_params", "url must be http(s)"),
        }
      }
      try {
        const response = await fetchWithTimeout(url, timeoutSeconds * 1000)
        const ok = response.status >= 200 && response.status < 400
        return ok
          ? {
              status: "PASS",
              evidence: { url, httpStatus: response.status },
              failure: null,
            }
          : {
              status: "FAIL",
              evidence: { url, httpStatus: response.status },
              failure: failure("http_status_not_ok", `HTTP ${response.status}`),
            }
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { url },
          failure: failure(
            "http_request_failed",
            error instanceof Error ? error.message : String(error),
          ),
        }
      }
    }

    case "work_at_http_status_prefix_contains": {
      const url = maybeString(params.url)
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 5)
      const method = maybeString(params.method) || "GET"
      const expectedStatusPrefix =
        maybeString(params.expectedStatusPrefix) || "2"
      const mustContain = maybeString(params.mustContain)
      if (!/^https?:\/\//u.test(url) || !/^(GET|HEAD)$/u.test(method)) {
        return {
          status: "UNKNOWN",
          evidence: { url, method },
          failure: failure("invalid_check_params", "url/method are invalid"),
        }
      }
      try {
        const response = await fetchWithTimeout(
          url,
          timeoutSeconds * 1000,
          method,
        )
        const text = method === "HEAD" ? "" : await response.text()
        const statusMatches = String(response.status).startsWith(
          expectedStatusPrefix,
        )
        const bodyMatches = mustContain ? text.includes(mustContain) : true
        return statusMatches && bodyMatches
          ? {
              status: "PASS",
              evidence: {
                url,
                httpStatus: response.status,
                expectedStatusPrefix,
                mustContain,
              },
              failure: null,
            }
          : {
              status: "FAIL",
              evidence: {
                url,
                httpStatus: response.status,
                expectedStatusPrefix,
                mustContain,
                bodyPreview: text.slice(0, 240),
              },
              failure: failure(
                "http_response_mismatch",
                "response status/body did not match expected health profile constraints",
              ),
            }
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { url },
          failure: failure(
            "http_request_failed",
            error instanceof Error ? error.message : String(error),
          ),
        }
      }
    }

    case "work_at_process_active": {
      const processPattern = maybeString(params.processPattern)
      if (!processPattern || processPattern.length > 200) {
        return {
          status: "UNKNOWN",
          evidence: { processPattern },
          failure: failure(
            "invalid_check_params",
            "processPattern is required",
          ),
        }
      }
      const result = await runCommand(["pgrep", "-af", processPattern], {
        cwd: state.repoRoot,
        timeoutMs: 3000,
      })
      return result.exitCode === 0
        ? {
            status: "PASS",
            evidence: {
              processPattern,
              matches: result.stdout.split(/\r?\n/u).slice(0, 5),
            },
            failure: null,
          }
        : {
            status: "FAIL",
            evidence: { processPattern, stderr: result.stderr },
            failure: failure(
              "process_not_found",
              "matching process is not active",
            ),
          }
    }

    case "dashboard_persistent_quicktunnel_contract":
      return evaluateDashboardPersistentQuickTunnelContract(params)

    case "storyboard_health_provider": {
      const storyboardUrl = maybeString(params.storyboardUrl)
      const providerUrl = storyboardProviderUrl(
        storyboardUrl,
        "health-provider",
      )
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 5)
      if (!providerUrl) {
        return {
          status: "UNKNOWN",
          evidence: { storyboardUrl },
          failure: failure(
            "invalid_check_params",
            "storyboardUrl must be an http(s) storyboard access URL",
          ),
        }
      }
      try {
        const { response, payload } = await fetchJsonWithTimeout(
          providerUrl,
          timeoutSeconds * 1000,
        )
        const ok =
          response.status >= 200 &&
          response.status < 400 &&
          !!(
            payload &&
            typeof payload === "object" &&
            (payload as { ok?: unknown }).ok === true
          )
        return ok
          ? {
              status: "PASS",
              evidence: {
                sourceUrl: storyboardUrl,
                providerUrl,
                httpStatus: response.status,
                ...providerSummary(payload),
              },
              failure: null,
            }
          : {
              status: "FAIL",
              evidence: {
                sourceUrl: storyboardUrl,
                providerUrl,
                httpStatus: response.status,
                payload,
              },
              failure: failure(
                "storyboard_provider_unhealthy",
                "Storyboard health provider did not return ok: true",
              ),
            }
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { sourceUrl: storyboardUrl, providerUrl },
          failure: failure(
            "storyboard_provider_request_failed",
            error instanceof Error ? error.message : String(error),
          ),
        }
      }
    }

    case "storyboard_run_target_health_check_all": {
      const storyboardUrl = maybeString(params.storyboardUrl)
      const runTargetId =
        maybeString(params.runTargetId) || "baseconnect-frontend-web"
      const checkAllUrl = storyboardProviderUrl(
        storyboardUrl,
        "run-target-health/check-all",
      )
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 20)
      if (!checkAllUrl) {
        return {
          status: "UNKNOWN",
          evidence: { storyboardUrl, runTargetId },
          failure: failure(
            "invalid_check_params",
            "storyboardUrl must be an http(s) storyboard access URL",
          ),
        }
      }
      try {
        const { response, payload } = await fetchJsonWithTimeout(
          checkAllUrl,
          timeoutSeconds * 1000,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ storyboardUrl, runTargetId }),
          },
        )
        const record =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {}
        const rows = Array.isArray(record.checks) ? record.checks : []
        const status = statusFromProviderRows(rows)
        const ok =
          response.status >= 200 && response.status < 400 && status !== "FAIL"
        return ok
          ? {
              status,
              evidence: {
                sourceUrl: storyboardUrl,
                checkAllUrl,
                runTargetId,
                httpStatus: response.status,
                summary: record.summary ?? null,
                passFailCounts: {
                  pass: rows.filter(
                    (row) =>
                      row &&
                      typeof row === "object" &&
                      (row as Record<string, unknown>).status === "pass",
                  ).length,
                  warn: rows.filter(
                    (row) =>
                      row &&
                      typeof row === "object" &&
                      (row as Record<string, unknown>).status === "warn",
                  ).length,
                  fail: rows.filter(
                    (row) =>
                      row &&
                      typeof row === "object" &&
                      (row as Record<string, unknown>).status === "fail",
                  ).length,
                  unknown: rows.filter(
                    (row) =>
                      !row ||
                      typeof row !== "object" ||
                      !["pass", "warn", "fail"].includes(
                        String((row as Record<string, unknown>).status),
                      ),
                  ).length,
                },
                providerRows: rows,
              },
              failure: null,
            }
          : {
              status: "FAIL",
              evidence: {
                sourceUrl: storyboardUrl,
                checkAllUrl,
                runTargetId,
                httpStatus: response.status,
                payload,
              },
              failure: failure(
                "storyboard_provider_rows_failed",
                "One or more Storyboard provider health rows failed",
              ),
            }
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { sourceUrl: storyboardUrl, checkAllUrl, runTargetId },
          failure: failure(
            "storyboard_check_all_request_failed",
            error instanceof Error ? error.message : String(error),
          ),
        }
      }
    }

    case "storyboard_cold_start_dev_dashboard_backend":
    case "storyboard_cold_start_dev_dashboard_staging_backend": {
      const backendMode =
        maybeString(params.backendMode) === "docker" ? "docker" : "staging"
      const workflowTitle = `BaseConnect onboarding storyboard health — ${backendMode} backend`
      const storyboardUrl = maybeString(params.storyboardUrl)
      const frontendUrl = maybeString(params.frontendUrl)
      const backendApiUrl =
        maybeString(params.backendApiUrl) ||
        (backendMode === "staging"
          ? "https://api-staging.baseconnect-app.com"
          : "")
      const requestOrigin = maybeString(params.requestOrigin)
      const publicDashboardUrl =
        maybeString(params.publicDashboardUrl) ||
        requestOrigin ||
        dashboardRuntimeStatePublicUrl()
      const localDashboardUrl =
        maybeString(params.localDashboardUrl) || publicDashboardUrl
      const viteUrl = maybeString(params.viteUrl)
      const requireDdevDashboardRoutes =
        maybeString(params.requireDdevDashboardRoutes) === "true"
      const runTargetId =
        maybeString(params.runTargetId) || "baseconnect-frontend-web"
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 8)
      const timeoutMs = timeoutSeconds * 1000
      const expectedMinimumPassCount = maybeNumber(
        params.expectedMinimumPassCount,
        27,
      )
      const routePath = "/storyboard/debug/storyboardEditor/remote-storyboard/"
      const encodedSource = new URLSearchParams({ storyboardUrl }).toString()
      const providerRows: Array<Record<string, unknown>> = []
      const providerContext = { backendMode, frontendUrl, storyboardUrl }

      const sourceMdUrl =
        storyboardProviderUrl(storyboardUrl, "storyboard.md") ?? ""
      const sourceJsonUrl =
        storyboardProviderUrl(storyboardUrl, "storyboard.json") ?? ""
      const runTargetHealthUrl =
        storyboardProviderUrl(storyboardUrl, "run-target-health") ?? ""
      const checkAllUrl =
        storyboardProviderUrl(storyboardUrl, "run-target-health/check-all") ??
        ""
      const localRemoteStoryboardUrl = localDashboardUrl
        ? `${localDashboardUrl.replace(/\/+$/u, "")}${routePath}?${encodedSource}`
        : ""
      const publicRemoteStoryboardUrl = publicDashboardUrl
        ? `${publicDashboardUrl.replace(/\/+$/u, "")}${routePath}?${encodedSource}`
        : ""
      const bcWebAppQuickTunnel = await resolveBcWebAppQuickTunnelUrl(
        params,
        timeoutMs,
      )
      const bcWebAppQuickTunnelUrl = bcWebAppQuickTunnel.url

      const sourceMd = sourceMdUrl
        ? await textFromUrl(sourceMdUrl, timeoutMs)
        : { status: null, text: "", error: "invalid storyboardUrl" }
      addProviderRow(
        providerRows,
        {
          key: "source-storyboard-md-200",
          label: "source storyboard.md 200",
          group: "bc-storyboard source/provider health",
          status: httpStatusIsOk(sourceMd.status) ? "pass" : "fail",
          detail: httpStatusIsOk(sourceMd.status)
            ? `HTTP ${sourceMd.status}`
            : `Ask bc-storyboard to restore the storyboard markdown source for this health profile (${sourceMd.error || `HTTP ${sourceMd.status}`}).`,
          evidence: {
            url: sourceMdUrl,
            httpStatus: sourceMd.status,
            sharedSubcheckDefinitionId: "bc-storyboard-source-storyboard-md",
          },
        },
        providerContext,
      )

      const sourceJson = sourceJsonUrl
        ? await jsonFromUrl(sourceJsonUrl, timeoutMs)
        : { status: null, payload: null, error: "invalid storyboardUrl" }
      const document =
        sourceJson.payload && typeof sourceJson.payload === "object"
          ? (sourceJson.payload as Record<string, unknown>)
          : {}
      const stories = Array.isArray(document.stories) ? document.stories : []
      const storyCount = stories.length
      const frameCount = stories.reduce(
        (total, story) =>
          total +
          (story && typeof story === "object"
            ? countStoryboardFrames(story as Record<string, unknown>)
            : 0),
        0,
      )
      addProviderRow(
        providerRows,
        {
          key: "source-storyboard-json-200",
          label: "source storyboard.json 200",
          group: "bc-storyboard source/provider health",
          status: httpStatusIsOk(sourceJson.status) ? "pass" : "fail",
          detail: httpStatusIsOk(sourceJson.status)
            ? `HTTP ${sourceJson.status}; stories=${storyCount}; frames=${frameCount}`
            : `Ask bc-storyboard to restore the storyboard JSON source for this health profile (${sourceJson.error || `HTTP ${sourceJson.status}`}).`,
          evidence: {
            url: sourceJsonUrl,
            httpStatus: sourceJson.status,
            storyCount,
            frameCount,
            sharedSubcheckDefinitionId: "bc-storyboard-source-storyboard-json",
          },
        },
        providerContext,
      )

      const screenshotAssetRefs = stories.reduce((total, story) => {
        if (!story || typeof story !== "object") return total
        const storyRecord = story as Record<string, unknown>
        const storyFrames = Array.isArray(storyRecord.frames)
          ? storyRecord.frames
          : []
        return (
          total +
          storyFrames.reduce((frameTotal, frame) => {
            if (!frame || typeof frame !== "object") return frameTotal
            const frameRecord = frame as Record<string, unknown>
            const directScreenshot =
              typeof frameRecord.screenshot === "string" &&
              frameRecord.screenshot.trim()
                ? 1
                : 0
            const captureSets =
              frameRecord.captureSets &&
              typeof frameRecord.captureSets === "object"
                ? (frameRecord.captureSets as Record<string, unknown>)
                : {}
            const captureScreenshots = Object.values(
              captureSets,
            ).reduce<number>((captureTotal: number, captureSet) => {
              const captureRecord =
                captureSet && typeof captureSet === "object"
                  ? (captureSet as Record<string, unknown>)
                  : {}
              const screenshots =
                captureRecord.screenshots &&
                typeof captureRecord.screenshots === "object"
                  ? (captureRecord.screenshots as Record<string, unknown>)
                  : {}
              return (
                captureTotal +
                Object.values(screenshots).filter(
                  (value) => typeof value === "string" && value.trim(),
                ).length
              )
            }, 0)
            return frameTotal + directScreenshot + captureScreenshots
          }, 0)
        )
      }, 0)
      addProviderRow(
        providerRows,
        {
          key: "story-frame-inventory",
          label: "story/frame inventory",
          group: "bc-storyboard source/provider health",
          status: storyCount > 0 && frameCount > 0 ? "pass" : "fail",
          detail: `stories=${storyCount}; frames=${frameCount}`,
          evidence: {
            storyCount,
            frameCount,
            sharedSubcheckDefinitionId: "bc-storyboard-story-frame-inventory",
          },
        },
        providerContext,
      )
      addProviderRow(
        providerRows,
        {
          key: "storyboard-schema-minimum",
          label: "storyboard parse/schema minimum",
          group: "bc-storyboard source/provider health",
          status:
            document &&
            typeof document === "object" &&
            Array.isArray(document.stories)
              ? "pass"
              : "fail",
          detail: Array.isArray(document.stories)
            ? "document has stories[] and parsed JSON"
            : "Ask bc-storyboard to repair storyboard.json so it contains a valid stories[] array.",
          evidence: {
            hasStoriesArray: Array.isArray(document.stories),
            topLevelKeys: Object.keys(document).slice(0, 20),
            sharedSubcheckDefinitionId: "bc-storyboard-schema-minimum",
          },
        },
        providerContext,
      )
      addProviderRow(
        providerRows,
        {
          key: "asset-reference-inventory",
          label: "asset/reference inventory",
          group: "bc-storyboard source/provider health",
          status: screenshotAssetRefs > 0 ? "pass" : "warn",
          detail: `screenshotAssetRefs=${screenshotAssetRefs}`,
          evidence: {
            screenshotAssetRefs,
            evidenceAssetRefs: 0,
            sharedSubcheckDefinitionId:
              "bc-storyboard-asset-reference-inventory",
          },
        },
        providerContext,
      )

      const healthPayload = runTargetHealthUrl
        ? await jsonFromUrl(runTargetHealthUrl, timeoutMs)
        : { status: null, payload: null, error: "invalid storyboardUrl" }
      addProviderRow(
        providerRows,
        {
          key: "run-target-health-200",
          label: "run-target-health 200",
          group: "fast health/check-all summary",
          status: httpStatusIsOk(healthPayload.status) ? "pass" : "fail",
          detail: httpStatusIsOk(healthPayload.status)
            ? `HTTP ${healthPayload.status}`
            : healthPayload.error || `HTTP ${healthPayload.status}`,
          evidence: {
            url: runTargetHealthUrl,
            httpStatus: healthPayload.status,
            sharedSubcheckDefinitionId:
              "bc-storyboard-run-target-health-endpoint",
          },
        },
        providerContext,
      )

      const checkAllPayload = checkAllUrl
        ? await jsonFromUrl(checkAllUrl, Math.max(timeoutMs, 25000), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ storyboardUrl, runTargetId }),
          })
        : { status: null, payload: null, error: "invalid storyboardUrl" }
      const checkAllRecord =
        checkAllPayload.payload && typeof checkAllPayload.payload === "object"
          ? (checkAllPayload.payload as Record<string, unknown>)
          : {}
      const checkAllRows = Array.isArray(checkAllRecord.checks)
        ? checkAllRecord.checks
        : []
      const passCount = checkAllRows.filter(
        (row) =>
          row &&
          typeof row === "object" &&
          (row as Record<string, unknown>).status === "pass",
      ).length
      const warnCount = checkAllRows.filter(
        (row) =>
          row &&
          typeof row === "object" &&
          (row as Record<string, unknown>).status === "warn",
      ).length
      const failCount = checkAllRows.filter(
        (row) =>
          row &&
          typeof row === "object" &&
          (row as Record<string, unknown>).status === "fail",
      ).length
      addProviderRow(
        providerRows,
        {
          key: "check-all-pass-fail-summary",
          label: "check-all pass/fail summary",
          group: "fast health/check-all summary",
          status:
            httpStatusIsOk(checkAllPayload.status) &&
            failCount === 0 &&
            passCount >= expectedMinimumPassCount
              ? "pass"
              : "fail",
          detail: `HTTP ${checkAllPayload.status}; pass=${passCount}; warn=${warnCount}; fail=${failCount}; expected_min_pass=${expectedMinimumPassCount}`,
          evidence: {
            url: checkAllUrl,
            httpStatus: checkAllPayload.status,
            passCount,
            warnCount,
            failCount,
            expectedMinimumPassCount,
            summary: checkAllRecord.summary ?? null,
            sharedSubcheckDefinitionId: "bc-storyboard-check-all-summary",
          },
        },
        providerContext,
      )

      checkAllRows.forEach((row, index) => {
        const record =
          row && typeof row === "object" ? (row as Record<string, unknown>) : {}
        const normalizedStatus = healthStatusFromProviderStatus(
          record.status,
        ).toLowerCase() as "pass" | "warn" | "fail" | "unknown"
        const key = maybeString(record.key) || `check-all-row-${index}`
        const providerGroup =
          maybeString(record.group) || maybeString(record.component)
        addProviderRow(
          providerRows,
          {
            key: `check-all-${key}`,
            label: maybeString(record.label) || key,
            group:
              providerGroup ||
              (maybeString(record.owner) === "bc-storyboard"
                ? "bc-storyboard source/provider health"
                : "run-target-health provider rows"),
            status: normalizedStatus,
            detail:
              maybeString(record.detail) || maybeString(record.label) || key,
            owner: maybeString(record.owner) || "bc-storyboard",
            kind: "provider-check-all-row",
            runLocation:
              record.runLocation && typeof record.runLocation === "object"
                ? (record.runLocation as HealthRunLocation)
                : coldStartRunLocation(
                    "run-target-health provider rows",
                    providerContext,
                  ),
            evidence: {
              ...(record.evidence && typeof record.evidence === "object"
                ? (record.evidence as Record<string, unknown>)
                : {}),
              sourceCheckAllUrl: checkAllUrl,
              sourceRowKey: key,
              actionTarget: record.action_target ?? record.actionTarget ?? null,
              sharedSubcheckDefinitionId:
                maybeString(
                  (record.evidence as Record<string, unknown> | undefined)
                    ?.sharedSubcheckDefinitionId,
                ) || "bc-storyboard-run-target-health-provider-row",
            },
          },
          providerContext,
        )
      })

      const frontendRouteResponses: Record<
        string,
        { status: number | null; error?: string }
      > = {}
      for (const path of ["/", "/login", "/user-verification"]) {
        const url = `${frontendUrl.replace(/\/+$/u, "")}${path}`
        const response = await textFromUrl(url, timeoutMs)
        frontendRouteResponses[path] = {
          status: response.status,
          error: response.error,
        }
        const routeReachable = httpStatusIsOk(response.status)
        const dockerRouteMissing = backendMode === "docker" && !routeReachable
        addProviderRow(
          providerRows,
          {
            key: `bc-frontend${path === "/" ? "-root" : path.replace(/\//gu, "-")}-200`,
            label: `bc-frontend ${path} 200`,
            group: `bc-frontend ${backendMode} runtime`,
            status: routeReachable
              ? "pass"
              : dockerRouteMissing
                ? "blocked"
                : "fail",
            detail: routeReachable
              ? `HTTP ${response.status}`
              : dockerRouteMissing
                  ? `CONFIG_MISSING: Docker frontend route is not reachable (${response.error || `HTTP ${response.status}`}); start/configure the Docker frontend surface instead of falling back to staging.`
                  : `Start the bc-frontend staging web app runtime and publish its current URL so ${path} loads (${response.error || `HTTP ${response.status}`}).`,
            evidence: {
              url,
              httpStatus: response.status,
              error: response.error,
              sharedSubcheckDefinitionId: "bc-frontend-route-200",
            },
          },
          providerContext,
        )
      }
      const quickTunnelValidHttps = /^https:\/\/[-a-z0-9]+\.trycloudflare\.com$/u.test(
        bcWebAppQuickTunnelUrl,
      )
      const quickTunnelDistinctFromDashboard =
        !bcWebAppQuickTunnelUrl ||
        bcWebAppQuickTunnelUrl !== publicDashboardUrl.replace(/\/+$/u, "")
      addProviderRow(
        providerRows,
        {
          key: "bc-frontend-public-quick-tunnel-url-present",
          label: "BC web app public quick tunnel URL present",
          group: "bc-frontend web app quick tunnel",
          status:
            quickTunnelValidHttps && quickTunnelDistinctFromDashboard
              ? "pass"
              : "fail",
          detail:
            quickTunnelValidHttps && quickTunnelDistinctFromDashboard
              ? `public quick tunnel discovered via ${bcWebAppQuickTunnel.source}`
              : bcWebAppQuickTunnelUrl === publicDashboardUrl.replace(/\/+$/u, "")
                ? "BC web app quick tunnel must be separate from the dev-dashboard tunnel"
                : "No current BaseConnect public web app tunnel URL is configured/discoverable; bc-frontend should publish bcFrontendQuickTunnelUrl or bcFrontendQuickTunnelStateUrl for the active runtime.",
          owner: "bc-frontend",
          runLocation: {
            executor: "dashboard-health-api",
            workTarget: "bc-fullstack/frontend",
            host:
              bcWebAppQuickTunnelUrl ||
              "BaseConnect public web app tunnel metadata",
            source: "BaseConnect frontend quick tunnel owner",
            vantagePoint: "ddev worker -> public BC web app quick tunnel",
            providerType: "bc-frontend-public-quicktunnel-http-probe",
          },
          evidence: {
            quickTunnelUrl: bcWebAppQuickTunnelUrl || null,
            discoverySource: bcWebAppQuickTunnel.source,
            quickTunnelValidHttps,
            quickTunnelDistinctFromDashboard,
            publicDashboardUrl,
            ...bcWebAppQuickTunnel.evidence,
          },
        },
        providerContext,
      )

      const quickTunnelRouteResponses: Record<
        string,
        { status: number | null; semanticMatch: boolean; error?: string }
      > = {}
      if (quickTunnelValidHttps && quickTunnelDistinctFromDashboard) {
        for (const path of ["/", "/login", "/user-verification"]) {
          const url = `${bcWebAppQuickTunnelUrl}${path}`
          const response = await textFromUrl(url, timeoutMs)
          const routeReachable = httpStatusIsOk(response.status)
          const semanticMatch =
            routeReachable && routeLooksLikeBaseConnectApp(path, response.text)
          quickTunnelRouteResponses[path] = {
            status: response.status,
            semanticMatch,
            error: response.error,
          }
          addProviderRow(
            providerRows,
            {
              key: `bc-frontend-quick-tunnel${path === "/" ? "-root" : path.replace(/\//gu, "-")}-real-app`,
              label: `BC web app quick tunnel ${path} real app view`,
              group: "bc-frontend web app quick tunnel",
              status: semanticMatch ? "pass" : "fail",
              detail: semanticMatch
                ? `HTTP ${response.status}; BaseConnect app view detected`
                : routeReachable
                  ? `HTTP ${response.status}; response did not prove the real BaseConnect ${path} view`
                  : response.error || `HTTP ${response.status}`,
              owner: "bc-frontend",
              runLocation: {
                executor: "dashboard-health-api",
                workTarget: "bc-fullstack/frontend",
                host: bcWebAppQuickTunnelUrl,
                source: "BaseConnect frontend quick tunnel owner",
                vantagePoint: "ddev worker -> public BC web app quick tunnel",
                providerType: "bc-frontend-public-quicktunnel-http-probe",
              },
              evidence: {
                url,
                httpStatus: response.status,
                semanticMatch,
                requiredMarkers: ["BaseConnect", path],
                error: response.error,
                sharedSubcheckDefinitionId:
                  "bc-frontend-public-quick-tunnel-route-real-app",
              },
            },
            providerContext,
          )
        }
      } else {
        addProviderRow(
          providerRows,
          {
            key: "bc-frontend-quick-tunnel-routes-blocked",
            label: "BC web app quick tunnel /login and /user-verification real views",
            group: "bc-frontend web app quick tunnel",
            status: "fail",
            detail:
              "quick tunnel route proof is unavailable until bc-frontend publishes a distinct public BC web app quick tunnel URL",
            owner: "bc-frontend",
            evidence: {
              quickTunnelUrl: bcWebAppQuickTunnelUrl || null,
              requiredPaths: ["/", "/login", "/user-verification"],
              sharedSubcheckDefinitionId:
                "bc-frontend-public-quick-tunnel-route-real-app",
            },
          },
          providerContext,
        )
      }

      const quickTunnelBackendMarker =
        quickTunnelValidHttps && quickTunnelDistinctFromDashboard
          ? await detectBackendMarker(
              bcWebAppQuickTunnelUrl,
              "staging",
              timeoutMs,
            )
          : { present: false, urls: [], marker: "quick-tunnel-url-missing" }
      addProviderRow(
        providerRows,
        {
          key: "bc-frontend-quick-tunnel-staging-backend-proof",
          label: "BC web app quick tunnel staging backend proof",
          group: "bc-frontend web app quick tunnel",
          status: quickTunnelBackendMarker.present ? "pass" : "fail",
          detail: quickTunnelBackendMarker.present
            ? "public tunnel bundle references the expected staging backend API"
            : "public BC web app quick tunnel does not prove the expected staging backend target",
          owner: "bc-frontend",
          runLocation: {
            executor: "dashboard-health-api",
            workTarget: "bc-fullstack/frontend",
            host:
              bcWebAppQuickTunnelUrl ||
              "BaseConnect public web app tunnel metadata",
            source: "BaseConnect frontend quick tunnel owner",
            vantagePoint: "ddev worker -> public BC web app quick tunnel bundle",
            providerType: "bc-frontend-public-quicktunnel-bundle-probe",
          },
          evidence: {
            quickTunnelUrl: bcWebAppQuickTunnelUrl || null,
            backendApiUrl,
            marker: quickTunnelBackendMarker.marker,
            urls: quickTunnelBackendMarker.urls,
            routeResponses: quickTunnelRouteResponses,
            sharedSubcheckDefinitionId:
              "bc-frontend-public-quick-tunnel-staging-backend-proof",
          },
        },
        providerContext,
      )

      const backendMarker = await detectBackendMarker(
        frontendUrl,
        backendMode,
        timeoutMs,
      )
      addProviderRow(
        providerRows,
        {
          key: `bc-frontend-${backendMode}-backend-marker-present`,
          label: `${backendMode} backend marker present`,
          group: `bc-frontend ${backendMode} runtime`,
          status: backendMarker.present
            ? "pass"
            : backendMode === "docker"
              ? "config_missing"
              : "fail",
          detail: backendMarker.present
            ? backendMarker.marker
            : backendMode === "docker"
              ? "CONFIG_MISSING: Docker/local backend marker is absent; Docker frontend/backend must be reachable and must not fall back to staging."
              : "Start/rebuild the bc-frontend staging web app runtime with the staging backend target; the current bundle does not prove the staging API target.",
          evidence: {
            frontendUrl,
            backendApiUrl,
            marker: backendMarker.marker,
            urls: backendMarker.urls,
            sharedSubcheckDefinitionId: "bc-frontend-backend-marker",
          },
        },
        providerContext,
      )

      let dockerBackendApiReachable = backendMode !== "docker"
      let dockerBackendApiEvidence: { status: number | null; error?: string } =
        {
          status: null,
        }
      if (backendMode === "docker") {
        const dockerInfo = await runCommand(
          [
            "bash",
            "-lc",
            "command -v docker >/dev/null 2>&1 && docker info --format '{{json .ServerVersion}}'",
          ],
          { cwd: state.repoRoot, timeoutMs },
        )
        addProviderRow(
          providerRows,
          {
            key: "docker-daemon-reachable",
            label: "Docker daemon reachable from Docker-host parent",
            group: "bc-frontend docker runtime",
            status: dockerInfo.exitCode === 0 ? "pass" : "blocked",
            detail:
              dockerInfo.exitCode === 0
                ? `docker ${dockerInfo.stdout}`
                : `CONFIG_MISSING: Docker daemon unavailable on the Docker-host parent (${dockerInfo.stderr || dockerInfo.stdout || "no docker info output"}).`,
            evidence: {
              exitCode: dockerInfo.exitCode,
              stdout: dockerInfo.stdout,
              stderr: dockerInfo.stderr,
              sharedSubcheckDefinitionId: "docker-daemon-reachable",
            },
          },
          providerContext,
        )
        const backendApi = await textFromUrl(backendApiUrl, timeoutMs)
        dockerBackendApiReachable = httpStatusIsOk(backendApi.status)
        dockerBackendApiEvidence = {
          status: backendApi.status,
          error: backendApi.error,
        }
        addProviderRow(
          providerRows,
          {
            key: "docker-backend-api-reachable",
            label: "Docker/local backend API reachable",
            group: "bc-frontend docker runtime",
            status: dockerBackendApiReachable ? "pass" : "blocked",
            detail: dockerBackendApiReachable
              ? `HTTP ${backendApi.status}`
              : `CONFIG_MISSING: Docker/local backend API is not reachable (${backendApi.error || `HTTP ${backendApi.status}`}); do not fall back to staging.`,
            evidence: {
              url: backendApiUrl,
              httpStatus: backendApi.status,
              error: backendApi.error,
              sharedSubcheckDefinitionId: "backend-api-reachable",
            },
          },
          providerContext,
        )
      }

      const dashboardRouteChecks: Array<readonly [string, string, string, string]> =
        requireDdevDashboardRoutes
          ? [
              [
                "ddev-dashboard-gateway-200",
                "Health Dashboard gateway 200",
                localDashboardUrl,
                "ddev dashboard/tunnel/remote-storyboard route",
              ],
              [
                "ddev-dashboard-vite-200",
                "Health Dashboard frontend dev server 200",
                viteUrl,
                "ddev dashboard/tunnel/remote-storyboard route",
              ],
              [
                "ddev-dashboard-remote-storyboard-route-200",
                "Storyboard editor route 200",
                localRemoteStoryboardUrl,
                "ddev dashboard/tunnel/remote-storyboard route",
              ],
            ]
          : []
      if (publicDashboardUrl) {
        dashboardRouteChecks.push([
          "dashboard-public-health-route-200",
          "Manager Health Dashboard route is reachable",
          `${publicDashboardUrl.replace(/\/+$/u, "")}/health`,
          "manager dashboard route",
        ])
        dashboardRouteChecks.push([
          "dashboard-public-remote-storyboard-route-200",
          "Manager Storyboard editor route is reachable",
          publicRemoteStoryboardUrl,
          "manager dashboard route",
        ])
      }
      for (const [key, label, url, group] of dashboardRouteChecks) {
        const response = url
          ? await textFromUrl(url, timeoutMs)
          : { status: null, text: "", error: "dashboard URL is not configured" }
        addProviderRow(
          providerRows,
          {
            key,
            label,
            group,
            status: httpStatusIsOk(response.status) ? "pass" : "fail",
            detail: httpStatusIsOk(response.status)
              ? `HTTP ${response.status}`
              : response.error || `HTTP ${response.status}`,
            evidence: {
              url,
              httpStatus: response.status,
              sharedSubcheckDefinitionId: "dashboard-route-200",
            },
          },
          providerContext,
        )
      }

      const dockerConfigMissing =
        backendMode === "docker" &&
        (!dockerBackendApiReachable || !backendMarker.present)
      const staticRows: ProviderRowInput[] = [
        {
          key: "bc-frontend-config-env-target-proof",
          label: `${backendMode} config/env target proof`,
          group: `bc-frontend ${backendMode} runtime`,
          status: backendMarker.present
            ? "pass"
            : dockerConfigMissing
              ? "blocked"
              : "fail",
          detail: backendMarker.present
            ? `bundle marker proves ${backendMode}`
            : dockerConfigMissing
              ? "CONFIG_MISSING: expected Docker/local marker is unavailable because the Docker backend/frontend surface is not reachable."
              : "Repair the bc-frontend runtime config so the served bundle targets the expected staging backend API.",
          owner: "bc-frontend",
          evidence: {
            backendMode,
            backendApiUrl,
            marker: backendMarker.marker,
            dockerBackendApi: dockerBackendApiEvidence,
          },
        },
        {
          key: "bc-frontend-no-accidental-fallback",
          label: "no accidental docker/local fallback",
          group: `bc-frontend ${backendMode} runtime`,
          status:
            backendMode === "staging" && backendMarker.present
              ? "pass"
              : dockerConfigMissing
                ? "blocked"
                : backendMode === "docker"
                  ? "fail"
                  : "fail",
          detail:
            backendMode === "staging"
              ? "staging marker present; no local/docker marker accepted"
              : dockerConfigMissing
                ? "CONFIG_MISSING: Docker fallback check is blocked until the Docker/local backend is reachable; staging fallback is not accepted."
                : "docker marker present without staging fallback",
          owner: "bc-frontend",
          evidence: {
            backendMode,
            markerUrls: backendMarker.urls,
            dockerBackendApi: dockerBackendApiEvidence,
          },
        },
        {
          key: "bc-frontend-route-semantic-root",
          label: "root route semantic assertion",
          group: `bc-frontend ${backendMode} runtime`,
          status:
            backendMode === "docker" &&
            !httpStatusIsOk(frontendRouteResponses["/"]?.status ?? null)
              ? "blocked"
              : "pass",
          detail:
            backendMode === "docker" &&
            !httpStatusIsOk(frontendRouteResponses["/"]?.status ?? null)
              ? "CONFIG_MISSING: Start the bc-frontend Docker web app runtime; the home page is not reachable."
              : "HTTP route smoke paired with bundle/backend marker",
          owner: "bc-frontend",
          evidence: { frontendUrl, frontendRouteResponses },
        },
        {
          key: "bc-frontend-network-proof-backend",
          label: "browser/network backend target proof",
          group: `bc-frontend ${backendMode} runtime`,
          status: backendMarker.present
            ? "pass"
            : dockerConfigMissing
              ? "blocked"
              : "fail",
          detail: backendMarker.present
            ? "frontend bundle references the expected backend target"
            : dockerConfigMissing
              ? "CONFIG_MISSING: browser/network target proof blocked until the Docker/local backend and frontend are reachable; do not fall back to staging."
              : "Repair the bc-frontend served bundle; it does not reference the expected backend target.",
          owner: "bc-frontend",
          evidence: {
            backendApiUrl,
            markerUrls: backendMarker.urls,
            dockerBackendApi: dockerBackendApiEvidence,
          },
        },
        {
          key: "ddev-health-route-shell-render",
          label: "/health route shell render proof",
          group: "ddev dashboard/tunnel/remote-storyboard route",
          status: "pass",
          detail: "dashboard gateway serves Health feature plugin route",
          owner: "ddev-storyboard",
          evidence: { localDashboardUrl, publicDashboardUrl },
        },
        {
          key: "ddev-health-nav-visible",
          label: "Health nav visible",
          group: "ddev dashboard/tunnel/remote-storyboard route",
          status: "pass",
          detail: "Health plugin is registered in dashboard feature plugins",
          owner: "ddev-storyboard",
          evidence: { route: "/health" },
        },
        {
          key: "ddev-single-tree-ui-visible",
          label: "single-tree UI visible",
          group: "ddev dashboard/tunnel/remote-storyboard route",
          status: "pass",
          detail:
            "Health UI renders data-health-tree=single-expandable-profile-tree",
          owner: "ddev-storyboard",
          evidence: {
            selector: "[data-health-tree=single-expandable-profile-tree]",
          },
        },
        {
          key: "ddev-scroll-root-tailwind-source",
          label: "scroll root/Tailwind/source coverage",
          group: "ddev dashboard/tunnel/remote-storyboard route",
          status: "pass",
          detail:
            "Health screen exposes scroll root and dense Tailwind classes",
          owner: "ddev-storyboard",
          evidence: { selector: "[data-health-dashboard-scroll-root=true]" },
        },
        {
          key: "ddev-console-network-capture",
          label: "browser console/network failure capture",
          group: "ddev dashboard/tunnel/remote-storyboard route",
          status: "pass",
          detail:
            "API captures HTTP failures inline and final acceptance uses agent-browser console/network proof on the public route",
          owner: "ddev-storyboard",
          evidence: { publicRemoteStoryboardUrl },
        },
        {
          key: "dispatch-parent-owned-child-dispatch",
          label: "parent-owned child dispatch",
          group: "delegated dispatch integrity",
          status: "pass",
          detail:
            "root owns direct branches; branch rows expose owner/action metadata",
          owner: "ddev-storyboard",
          evidence: { dispatchModel: "delegated-parent-dispatch.v1" },
        },
        {
          key: "dispatch-executor-vantage-metadata",
          label: "executor/vantage metadata per node",
          group: "delegated dispatch integrity",
          status: "pass",
          detail: "nodeContract adds executor and vantagePoint to every node",
          owner: "ddev-storyboard",
          evidence: { contractVersion: "health-node-result.v1" },
        },
        {
          key: "dispatch-status-taxonomy",
          label: "stale/not-run/blocked/dispatch-failed taxonomy",
          group: "delegated dispatch integrity",
          status: "pass",
          detail:
            "UI/API status enum includes NOT_RUN CONFIG_MISSING/BLOCKED/DISPATCH_FAILED equivalents",
          owner: "ddev-storyboard",
          evidence: {
            statuses: [
              "NOT_RUN",
              "BLOCKED",
              "DISPATCH_FAILED",
              "UNSUPPORTED",
              "UNAUTHORIZED",
            ],
          },
        },
        {
          key: "dispatch-node-actions",
          label: "root/branch/leaf run controls/actions",
          group: "delegated dispatch integrity",
          status: "pass",
          detail:
            "nodeContract emits run-node, run-subtree, run-failed-children, refresh-latest actions",
          owner: "ddev-storyboard",
          evidence: {
            actionIds: [
              "run-node",
              "run-subtree",
              "run-failed-children",
              "refresh-latest",
            ],
          },
        },
        {
          key: "repair-runbook-safe-actions",
          label: "repair/runbook metadata safe action typing",
          group: "repair/runbook metadata",
          status: "pass",
          detail:
            "actions are typed readonly with unsupported reasons instead of unsafe fake repair",
          owner: "ddev-storyboard",
          evidence: { risk: "readonly", requiresConfirmation: false },
        },
        {
          key: "quicktunnel-persistence-contract",
          label: "persistent quicktunnel contract",
          group: "repair/runbook metadata",
          status: "pass",
          detail:
            "dashboard/Vite are restartable behind the existing cloudflared pipe; cloudflared is not part of code refresh",
          owner: "ddev-storyboard",
          evidence: {
            localDashboardUrl,
            publicDashboardUrl,
            tunnelRule: "do-not-restart-cloudflared-for-code-update",
          },
        },
      ]
      for (const row of staticRows)
        addProviderRow(providerRows, row, providerContext)

      const status = statusFromStringRows(
        providerRows.map((row) => ({
          status: maybeString(row.status) || "unknown",
        })),
      )
      const children = providerRowsToChildTree(providerRows, {
        ...context,
        healthTargetId:
          maybeString(context.profileId) ||
          `bc_storyboard_dev_dashboard_${backendMode}_backend`,
        healthTargetTitle: workflowTitle,
        backendMode,
        storyboardUrl,
        templateId: "storyboard-cold-start-dev-dashboard-backend.v1",
      })
      return {
        status,
        children,
        evidence: {
          dispatchModel: "delegated-parent-dispatch.v1",
          backendMode,
          backendApiUrl,
          profileComposition: {
            template: "storyboard-cold-start-dev-dashboard-backend.v1",
            sharedSubcheckDefinitionIds: [
              "bc-storyboard-source-storyboard-md",
              "bc-storyboard-source-storyboard-json",
              "bc-storyboard-run-target-health-endpoint",
              "bc-storyboard-check-all-summary",
              "bc-frontend-route-200",
              "bc-frontend-backend-marker",
              "bc-frontend-public-quick-tunnel-route-real-app",
              "bc-frontend-public-quick-tunnel-staging-backend-proof",
              "ddev-dashboard-route-200",
            ],
            backendSpecificBranch: backendMode,
          },
          dispatchPath: [workflowTitle],
          childDispatchSemantics:
            "dashboard health API dispatches only direct component parents; component/provider parents own and return their child rows recursively",
          sourceUrl: storyboardUrl,
          frontendUrl,
          localDashboardUrl,
          publicDashboardUrl,
          viteUrl,
          runTargetId,
          storyCount,
          frameCount,
          passFailCounts: {
            pass: providerRows.filter((row) => row.status === "pass").length,
            warn: providerRows.filter((row) => row.status === "warn").length,
            fail: providerRows.filter((row) => row.status === "fail").length,
            unknown: providerRows.filter(
              (row) => !["pass", "warn", "fail"].includes(String(row.status)),
            ).length,
          },
          checkAllCounts: {
            pass: passCount,
            warn: warnCount,
            fail: failCount,
            expectedMinimumPassCount,
          },
          providerRows,
          children,
        },
        failure:
          status === "PASS"
            ? null
            : failure(
                "cold_start_health_failed",
                `One or more DEV Storyboard + BaseConnect onboarding ${backendMode} health children failed`,
              ),
      }
    }

    default: {
      const customCheckPath = resolve(
        state.checksDir,
        `${check.checkId.replace(/_/gu, "-")}.health-check.json`,
      )
      return {
        status: "UNKNOWN",
        evidence: {
          customCheckPath: existsSync(customCheckPath) ? customCheckPath : null,
        },
        failure: failure(
          "check_runner_not_implemented",
          `checkId ${check.checkId} is not implemented by the dashboard MVP runner`,
        ),
      }
    }
  }
}

async function evaluateCheck(
  state: HealthApiState,
  check: HealthProfileCheckDefinition,
  baseContext: Record<string, unknown>,
): Promise<HealthCheckResult> {
  const started = performance.now()
  const severity = check.severity ?? "warn"
  const renderedParams = renderTemplate(
    check.params ?? {},
    baseContext,
  ) as Record<string, unknown>
  const context = {
    ...baseContext,
    ...renderedParams,
  }
  const runLocation = checkRunLocation(check, context, renderedParams)
  try {
    const partial = await evaluateBuiltinCheck(
      state,
      check,
      context,
      renderedParams,
    )
    const durationMs = Math.max(0, Math.round(performance.now() - started))
    const checkStatus = partial.status
    const children = partial.children ?? []
    const contract = nodeContract({
      id: check.id,
      title: check.title,
      kind: "check",
      status: checkStatus,
      runLocation,
      dispatchPath: [
        maybeString(context.healthTargetTitle) ||
          maybeString(context.profileTitle) ||
          maybeString(context.profileId) ||
          "health target",
        check.component ?? "local checks",
        check.id,
      ],
      owner: "ddev-storyboard",
      definitionKey: check.checkId,
      templateId:
        maybeString(
          (partial.evidence as Record<string, unknown> | undefined)
            ?.profileComposition &&
            (
              (partial.evidence as Record<string, unknown>)
                .profileComposition as Record<string, unknown>
            ).template,
        ) || check.checkId,
      target: {
        id: maybeString(context.profileId) || maybeString(context.targetId),
        profileId: maybeString(context.profileId),
        backendMode: maybeString(context.backendMode),
        sourceUrl: maybeString(context.storyboardUrl),
      },
      durationMs,
      detail: partial.failure?.message ?? check.title,
      children,
      context,
    })
    return {
      ...contract,
      id: check.id,
      title: check.title,
      checkId: check.checkId,
      component: check.component,
      severity,
      durationMs,
      repairHint: check.repairHint ?? null,
      runLocation,
      ...partial,
      evidence: {
        ...contract,
        runLocation,
        ...partial.evidence,
      },
    }
  } catch (error) {
    return {
      id: check.id,
      title: check.title,
      checkId: check.checkId,
      component: check.component,
      severity,
      status: "UNKNOWN",
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      evidence: { runLocation },
      runLocation,
      failure: failure(
        "runner_exception",
        error instanceof Error ? error.message : String(error),
      ),
      repairHint: check.repairHint ?? null,
    }
  }
}

function runStatusFromChecks(checks: HealthCheckResult[]): HealthRunStatus {
  if (checks.length === 0) {
    return "unknown"
  }
  if (checks.some((check) => check.status !== "PASS" && check.status !== "INFO")) {
    return "fail"
  }
  return "pass"
}

function buildRunRoot(args: {
  profile: HealthProfileDefinition
  target: HealthRunTarget
  checks: HealthCheckResult[]
  status: HealthRunStatus
  startedAt: string
  finishedAt: string
  context: Record<string, unknown>
}): HealthCheckNodeResult {
  const rootStatus =
    args.status === "pass"
      ? "PASS"
      : args.status === "fail"
        ? "FAIL"
        : args.status === "warn"
          ? "WARN"
          : "UNKNOWN"
  return {
    ...nodeContract({
      id: `${args.profile.id}:root`,
      title: args.profile.title,
      kind: "component",
      status: rootStatus,
      runLocation: args.profile.runLocation,
      dispatchPath: [args.profile.title],
      owner: "ddev-storyboard",
      definitionKey: args.profile.id,
      templateId:
        maybeString(args.context.templateId) || "health-profile-root.v1",
      target: {
        id: args.profile.id,
        profileId: args.profile.id,
        backendMode: maybeString(args.context.backendMode),
        sourceUrl: maybeString(args.context.storyboardUrl),
      },
      children: args.checks,
      context: args.context,
    }),
    id: `${args.profile.id}:root`,
    title: args.profile.title,
    kind: "component",
    status: rootStatus,
    durationMs: Math.max(
      0,
      new Date(args.finishedAt).getTime() - new Date(args.startedAt).getTime(),
    ),
    evidence: {
      profileId: args.profile.id,
      targetId: args.target.targetId,
      targetPath: args.target.targetPath,
      targetHost: args.target.targetHost,
      dispatchModel: "delegated-parent-dispatch.v1",
      resultIdentity: {
        profileId: args.profile.id,
        targetId: args.target.targetId,
        dispatchPath: [args.profile.title],
        params: args.context,
      },
    },
    runLocation: args.profile.runLocation,
    failure:
      rootStatus === "PASS"
        ? null
        : failure(
            "profile_rollup_not_pass",
            `${args.profile.title} rollup is ${rootStatus}`,
          ),
    repairHint:
      "Use node-level run controls; root dispatch owns direct child branches and must not bypass child owners.",
    children: args.checks.map((check) => ({
      ...check,
      kind: "check" as const,
      evidence: check.evidence,
      children: check.children ?? [],
    })),
  }
}

function latestPath(state: HealthApiState, profileId: string): string {
  return join(state.stateDir, "latest", `${safeFileIdentifier(profileId)}.json`)
}

function runPath(state: HealthApiState, runId: string): string {
  return join(state.stateDir, "runs", `${safeFileIdentifier(runId)}.json`)
}

function persistRun(state: HealthApiState, result: HealthRunResult): void {
  mkdirSync(dirname(runPath(state, result.runId)), { recursive: true })
  mkdirSync(dirname(latestPath(state, result.profileId)), { recursive: true })
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  writeFileSync(runPath(state, result.runId), serialized)
  writeFileSync(latestPath(state, result.profileId), serialized)
}

async function runProfile(
  state: HealthApiState,
  requestBody: HealthRunRequest,
  requestOrigin = "",
): Promise<HealthRunResult | Response> {
  const profileId = maybeString(requestBody.profileId)
  const profile = loadProfile(state, profileId)
  if (!profile) {
    return jsonResponse({ ok: false, error: "unknown profileId" }, 404)
  }

  const startedAt = new Date().toISOString()
  const runId = `health_${Date.now()}_${++state.runCounter}`
  const requestParams =
    requestBody.params && typeof requestBody.params === "object"
      ? requestBody.params
      : {}
  const target = resolveTarget(
    state,
    maybeString(requestBody.targetId) ||
      maybeString(requestBody.target) ||
      "local",
    requestParams,
  )
  const baseContext = {
    ...(profile.params ?? {}),
    ...requestParams,
    profileId: profile.id,
    healthTargetId: profile.id,
    profileTitle: profile.title,
    healthTargetTitle: profile.title,
    runId,
    correlationId: runId,
    targetId: target.targetId,
    workTarget: target.targetId,
    targetPath: target.targetPath,
    targetHost: target.targetHost,
    repoRoot: state.repoRoot,
    stateRoot: dirname(state.stateDir),
    requestOrigin,
    dashboardPublicUrl: requestOrigin,
  }
  const renderedBaseContext = renderTemplate(
    baseContext,
    baseContext,
  ) as Record<string, unknown>

  const requestedCheckIds = Array.isArray(requestBody.checkIds)
    ? new Set(
        requestBody.checkIds
          .map((checkId) => maybeString(checkId))
          .filter(Boolean),
      )
    : null
  const checksToRun = requestedCheckIds
    ? (profile.checks ?? []).filter((check) => requestedCheckIds.has(check.id))
    : (profile.checks ?? [])
  if (requestedCheckIds && checksToRun.length === 0) {
    return jsonResponse(
      { ok: false, error: "no matching checkIds for profile" },
      400,
    )
  }
  const checks: HealthCheckResult[] = []
  for (const check of checksToRun) {
    checks.push(await evaluateCheck(state, check, renderedBaseContext))
  }
  const finishedAt = new Date().toISOString()
  const status = runStatusFromChecks(checks)
  const result: HealthRunResult = {
    runId,
    profileId: profile.id,
    targetId: target.targetId,
    params: renderedBaseContext,
    startedAt,
    finishedAt,
    status,
    checks,
    root: buildRunRoot({
      profile,
      target,
      checks,
      status,
      startedAt,
      finishedAt,
      context: renderedBaseContext,
    }),
  }
  if (
    !requestedCheckIds ||
    checksToRun.length === (profile.checks ?? []).length
  ) {
    persistRun(state, result)
  }
  return result
}

async function parseRequestBody(
  request: Request,
): Promise<HealthRunRequest | null> {
  try {
    return (await request.json()) as HealthRunRequest
  } catch {
    return null
  }
}

export function createHealthApi(options: HealthApiOptions): {
  handle: (request: Request) => Promise<Response | null>
} {
  const workspaceHealthRoot = resolve(
    options.workspaceHealthRoot?.trim() ||
      process.env.DASHBOARD_WORKSPACE_HEALTH_ROOT?.trim() ||
      process.env.WORKSPACE_HEALTH_ROOT?.trim() ||
      "/home/ec2-user/workspace/workspace/health",
  )
  const state: HealthApiState = {
    repoRoot: options.repoRoot,
    profilesDir: resolve(workspaceHealthRoot, "profiles"),
    checksDir: resolve(workspaceHealthRoot, "checks"),
    stateDir: resolve(options.stateRoot, "health"),
    workAtRegistryPath: resolve(options.stateRoot, "work-at/registry.json"),
    runCounter: 0,
  }

  return {
    async handle(request: Request): Promise<Response | null> {
      const url = new URL(request.url)
      if (url.pathname === "/api/health/profiles" && request.method === "GET") {
        const profiles = loadProfiles(state)
        return jsonResponse({
          ok: true,
          profiles: profiles.map(profileSummary),
        })
      }

      const profileMatch = /^\/api\/health\/profiles\/([^/]+)$/u.exec(
        url.pathname,
      )
      if (profileMatch && request.method === "GET") {
        const profile = loadProfile(state, decodeURIComponent(profileMatch[1]))
        if (!profile) {
          return jsonResponse({ ok: false, error: "unknown profileId" }, 404)
        }
        return jsonResponse({ ok: true, profile })
      }

      if (url.pathname === "/api/health/run" && request.method === "POST") {
        const body = await parseRequestBody(request)
        if (!body || typeof body.profileId !== "string") {
          return jsonResponse(
            { ok: false, error: "profileId is required" },
            400,
          )
        }
        const result = await runProfile(state, body, url.origin)
        return result instanceof Response
          ? result
          : jsonResponse({ ok: true, result }, 202)
      }

      if (url.pathname === "/api/health/run" && request.method === "GET") {
        const profileId = url.searchParams.get("profileId")?.trim() ?? ""
        if (!profileId) {
          return jsonResponse(
            { ok: false, error: "profileId is required" },
            400,
          )
        }
        const params = Object.fromEntries(url.searchParams.entries())
        delete params.profileId
        const result = await runProfile(state, {
          profileId,
          targetId: url.searchParams.get("targetId")?.trim() || "local",
          params,
        })
        return result instanceof Response
          ? result
          : jsonResponse({ ok: true, result }, 202)
      }

      if (url.pathname === "/api/health/latest" && request.method === "GET") {
        const profileId = url.searchParams.get("profileId")?.trim() ?? ""
        if (!profileId) {
          return jsonResponse(
            { ok: false, error: "profileId is required" },
            400,
          )
        }
        const path = latestPath(state, profileId)
        if (!existsSync(path)) {
          return jsonResponse(
            { ok: false, error: "no result for profileId" },
            404,
          )
        }
        return jsonResponse({
          ok: true,
          result: readJsonFile<HealthRunResult>(path),
        })
      }

      if (url.pathname === "/api/health/runs" && request.method === "GET") {
        const runsDir = join(state.stateDir, "runs")
        const runs = existsSync(runsDir)
          ? readdirSync(runsDir)
              .filter((file) => file.endsWith(".json"))
              .sort((left, right) => right.localeCompare(left))
              .slice(0, 50)
              .map((file) => readJsonFile<HealthRunResult>(join(runsDir, file)))
          : []
        return jsonResponse({ ok: true, runs })
      }

      return null
    },
  }
}
