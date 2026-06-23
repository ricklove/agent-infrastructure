import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export type HealthApiOptions = {
  repoRoot: string
  stateRoot: string
}

type HealthSeverity = "blocking" | "warn" | "info"
type HealthCheckStatus = "PASS" | "FAIL" | "WARN" | "UNKNOWN"
type HealthRunStatus = "pass" | "fail" | "unknown"

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

export type HealthCheckResult = {
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

function renderTemplate(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_, key: string) => {
      const replacement = context[key]
      return replacement === undefined || replacement === null ? "" : String(replacement)
    })
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

function profileSummary(profile: HealthProfileDefinition): Record<string, unknown> {
  return {
    id: profile.id,
    title: profile.title,
    description: profile.description ?? "",
    runLocation: profile.runLocation ?? null,
    params: profile.params ?? {},
    checkCount: profile.checks?.length ?? 0,
  }
}

function defaultRunLocation(context: Record<string, unknown>, params: Record<string, unknown>): HealthRunLocation {
  return {
    executor: maybeString(params.executor) || "dashboard-health-api",
    workTarget: maybeString(params.workTarget) || maybeString(context.targetId) || "local",
    host: maybeString(params.host) || maybeString(context.targetHost) || "local",
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
    .map((file) => readJsonFile<HealthProfileDefinition>(join(state.profilesDir, file)))
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

function readWorkAtRegistry(state: HealthApiState): Record<string, WorkAtTarget> {
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
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
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

function storyboardProviderUrl(storyboardUrl: string, path: string): string | null {
  if (!/^https?:\/\//u.test(storyboardUrl)) {
    return null
  }
  try {
    return new URL(path.replace(/^\/+/, ""), `${storyboardUrl.replace(/\/+$/u, "")}/`).toString()
  } catch {
    return null
  }
}

function statusFromProviderRows(rows: unknown[]): HealthCheckStatus {
  const statuses = rows.map((row) => {
    if (!row || typeof row !== "object") return "unknown"
    const value = (row as Record<string, unknown>).status
    return typeof value === "string" ? value.toLowerCase() : "unknown"
  })
  if (statuses.includes("fail")) return "FAIL"
  if (statuses.includes("warn")) return "WARN"
  if (statuses.length === 0 || statuses.includes("unknown")) return "UNKNOWN"
  return "PASS"
}

function statusFromStringRows(rows: Array<{ status: string }>): HealthCheckStatus {
  return statusFromProviderRows(rows)
}

function healthStatusFromProviderStatus(status: unknown): HealthCheckStatus {
  const normalized = maybeString(status).toLowerCase()
  if (normalized === "pass") return "PASS"
  if (normalized === "warn") return "WARN"
  if (normalized === "fail") return "FAIL"
  return "UNKNOWN"
}

function rollupNodeStatus(children: HealthCheckNodeResult[]): HealthCheckStatus {
  const statuses = children.map((child) => child.status)
  if (statuses.includes("FAIL")) return "FAIL"
  if (statuses.includes("WARN")) return "WARN"
  if (statuses.length === 0 || statuses.includes("UNKNOWN")) return "UNKNOWN"
  return "PASS"
}

function providerRowsToChildTree(rows: Array<Record<string, unknown>>): HealthCheckNodeResult[] {
  const groups = rows.reduce((acc, row) => {
    const group = String(row.group ?? row.component ?? "provider row details")
    const existing = acc.get(group) ?? []
    existing.push(row)
    acc.set(group, existing)
    return acc
  }, new Map<string, Array<Record<string, unknown>>>())

  return Array.from(groups.entries()).map(([group, groupRows]) => {
    const children = groupRows.map((row): HealthCheckNodeResult => {
      const status = healthStatusFromProviderStatus(row.status)
      return {
        id: String(row.key ?? row.id ?? row.label ?? group),
        title: String(row.label ?? row.key ?? row.id ?? group),
        kind: "provider-row",
        status,
        evidence: {
          dispatchPath: [group, String(row.key ?? row.id ?? row.label ?? "provider-row")],
          owner: row.owner ?? null,
          actionTarget: row.action_target ?? row.actionTarget ?? null,
          detail: row.detail ?? null,
          ...(row.evidence && typeof row.evidence === "object" ? row.evidence as Record<string, unknown> : {}),
        },
        runLocation: row.runLocation && typeof row.runLocation === "object" ? row.runLocation as HealthRunLocation : coldStartRunLocation(group),
        failure: status === "FAIL" ? failure("child_check_failed", String(row.detail ?? row.label ?? row.key ?? "provider row failed")) : null,
        repairHint: maybeString(row.repairHint) || null,
      }
    })
    const status = rollupNodeStatus(children)
    return {
      id: safeFileIdentifier(group),
      title: group,
      kind: "component" as const,
      status,
      evidence: {
        dispatchModel: "delegated-parent-dispatch.v1",
        dispatchPath: [group],
        childCount: children.length,
      },
      runLocation: coldStartRunLocation(group),
      failure: status === "FAIL" ? failure("child_failure", `${group} has failing children`) : null,
      repairHint: "Run or repair the failing child checks owned by this component; no generic fake repair action is exposed.",
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

function addProviderRow(
  rows: Array<Record<string, unknown>>,
  row: {
    key: string
    label: string
    group: string
    status: "pass" | "warn" | "fail" | "unknown"
    detail: string
    owner?: string
    kind?: string
    runLocation?: HealthRunLocation
    evidence?: Record<string, unknown>
  },
): void {
  rows.push({ owner: "ddev-storyboard", kind: "cold-start", runLocation: row.runLocation ?? coldStartRunLocation(row.group), ...row })
}

function coldStartRunLocation(group: string): HealthRunLocation {
  if (group === "bc-frontend staging runtime") {
    return {
      executor: "dashboard-health-api",
      workTarget: "bc-fullstack/frontend",
      host: "10.0.0.239:8086",
      source: "BaseConnect frontend staging runtime",
      vantagePoint: "ddev worker -> bc-frontend service",
      providerType: "http-probe",
    }
  }
  if (group === "bc-storyboard source/provider health") {
    return {
      executor: "dashboard-health-api",
      workTarget: "bc-storyboard/access-server",
      host: "10.0.0.239:8898",
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
    host: "10.0.0.239:8898",
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

async function textFromUrl(url: string, timeoutMs: number): Promise<{ status: number | null; text: string; error: string }> {
  try {
    const response = await fetchWithTimeout(url, timeoutMs)
    return { status: response.status, text: await response.text(), error: "" }
  } catch (error) {
    return { status: null, text: "", error: error instanceof Error ? error.message : String(error) }
  }
}

async function jsonFromUrl(url: string, timeoutMs: number, init: RequestInit = {}): Promise<{ status: number | null; payload: unknown; error: string }> {
  try {
    const { response, payload } = await fetchJsonWithTimeout(url, timeoutMs, init)
    return { status: response.status, payload, error: "" }
  } catch (error) {
    return { status: null, payload: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function detectStagingBackendMarker(frontendUrl: string, timeoutMs: number): Promise<{ present: boolean; urls: string[]; marker: string }> {
  const root = await textFromUrl(frontendUrl, timeoutMs)
  if (!httpStatusIsOk(root.status)) return { present: false, urls: [], marker: root.error || `HTTP ${root.status}` }
  if (root.text.includes("api-staging.baseconnect-app.com") || /staging/iu.test(root.text)) {
    return { present: true, urls: [frontendUrl], marker: "root-html" }
  }
  const scriptPaths = Array.from(root.text.matchAll(/src="([^"]+\.js)"/gu)).map((match) => match[1]).slice(0, 8)
  const foundUrls: string[] = []
  for (const scriptPath of scriptPaths) {
    const scriptUrl = new URL(scriptPath, `${frontendUrl.replace(/\/+$/u, "/")}`).toString()
    const script = await textFromUrl(scriptUrl, timeoutMs)
    if (httpStatusIsOk(script.status) && (script.text.includes("api-staging.baseconnect-app.com") || /staging/iu.test(script.text))) {
      foundUrls.push(scriptUrl)
    }
  }
  return { present: foundUrls.length > 0, urls: foundUrls, marker: foundUrls.length > 0 ? "bundle-staging-marker" : "missing" }
}

function providerSummary(payload: unknown): Record<string, unknown> {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const sourceTargets = Array.isArray(record.sourceTargets) ? record.sourceTargets : []
  const sourceTarget = sourceTargets[0] && typeof sourceTargets[0] === "object"
    ? (sourceTargets[0] as Record<string, unknown>)
    : {}
  const evidence = sourceTarget.evidence && typeof sourceTarget.evidence === "object"
    ? (sourceTarget.evidence as Record<string, unknown>)
    : {}
  return {
    provider: record.provider ?? null,
    storyboard: record.storyboard ?? null,
    sourceTargets,
    runTargets: Array.isArray(record.runTargets) ? record.runTargets : [],
    definitions: Array.isArray(record.definitions) ? record.definitions : [],
    repairActions: Array.isArray(record.repairActions) ? record.repairActions : [],
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
): Promise<Omit<HealthCheckResult, "id" | "title" | "checkId" | "severity" | "repairHint" | "durationMs">> {
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
            evidence: { stdout: result.stdout, stderr: result.stderr, targetId },
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
      const result = await runCommand(["bash", "-lc", `command -v -- ${commandName}`], {
        cwd: state.repoRoot,
        timeoutMs: 3000,
      })
      return result.exitCode === 0
        ? {
            status: "PASS",
            evidence: { commandName, path: result.stdout },
            failure: null,
          }
        : {
            status: "FAIL",
            evidence: { commandName, stderr: result.stderr },
            failure: failure("command_missing", `${commandName} is not available`),
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
      const expectedStatusPrefix = maybeString(params.expectedStatusPrefix) || "2"
      const mustContain = maybeString(params.mustContain)
      if (!/^https?:\/\//u.test(url) || !/^(GET|HEAD)$/u.test(method)) {
        return {
          status: "UNKNOWN",
          evidence: { url, method },
          failure: failure("invalid_check_params", "url/method are invalid"),
        }
      }
      try {
        const response = await fetchWithTimeout(url, timeoutSeconds * 1000, method)
        const text = method === "HEAD" ? "" : await response.text()
        const statusMatches = String(response.status).startsWith(expectedStatusPrefix)
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
          failure: failure("invalid_check_params", "processPattern is required"),
        }
      }
      const result = await runCommand(["pgrep", "-af", processPattern], {
        cwd: state.repoRoot,
        timeoutMs: 3000,
      })
      return result.exitCode === 0
        ? {
            status: "PASS",
            evidence: { processPattern, matches: result.stdout.split(/\r?\n/u).slice(0, 5) },
            failure: null,
          }
        : {
            status: "FAIL",
            evidence: { processPattern, stderr: result.stderr },
            failure: failure("process_not_found", "matching process is not active"),
          }
    }

    case "storyboard_health_provider": {
      const storyboardUrl = maybeString(params.storyboardUrl)
      const providerUrl = storyboardProviderUrl(storyboardUrl, "health-provider")
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 5)
      if (!providerUrl) {
        return {
          status: "UNKNOWN",
          evidence: { storyboardUrl },
          failure: failure("invalid_check_params", "storyboardUrl must be an http(s) storyboard access URL"),
        }
      }
      try {
        const { response, payload } = await fetchJsonWithTimeout(providerUrl, timeoutSeconds * 1000)
        const ok = response.status >= 200 && response.status < 400 && !!(payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === true)
        return ok
          ? {
              status: "PASS",
              evidence: { sourceUrl: storyboardUrl, providerUrl, httpStatus: response.status, ...providerSummary(payload) },
              failure: null,
            }
          : {
              status: "FAIL",
              evidence: { sourceUrl: storyboardUrl, providerUrl, httpStatus: response.status, payload },
              failure: failure("storyboard_provider_unhealthy", "Storyboard health provider did not return ok: true"),
            }
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { sourceUrl: storyboardUrl, providerUrl },
          failure: failure("storyboard_provider_request_failed", error instanceof Error ? error.message : String(error)),
        }
      }
    }

    case "storyboard_run_target_health_check_all": {
      const storyboardUrl = maybeString(params.storyboardUrl)
      const runTargetId = maybeString(params.runTargetId) || "baseconnect-frontend-web"
      const checkAllUrl = storyboardProviderUrl(storyboardUrl, "run-target-health/check-all")
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 20)
      if (!checkAllUrl) {
        return {
          status: "UNKNOWN",
          evidence: { storyboardUrl, runTargetId },
          failure: failure("invalid_check_params", "storyboardUrl must be an http(s) storyboard access URL"),
        }
      }
      try {
        const { response, payload } = await fetchJsonWithTimeout(checkAllUrl, timeoutSeconds * 1000, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storyboardUrl, runTargetId }),
        })
        const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
        const rows = Array.isArray(record.checks) ? record.checks : []
        const status = statusFromProviderRows(rows)
        const ok = response.status >= 200 && response.status < 400 && status !== "FAIL"
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
                  pass: rows.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).status === "pass").length,
                  warn: rows.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).status === "warn").length,
                  fail: rows.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).status === "fail").length,
                  unknown: rows.filter((row) => !row || typeof row !== "object" || !["pass", "warn", "fail"].includes(String((row as Record<string, unknown>).status))).length,
                },
                providerRows: rows,
              },
              failure: null,
            }
          : {
              status: "FAIL",
              evidence: { sourceUrl: storyboardUrl, checkAllUrl, runTargetId, httpStatus: response.status, payload },
              failure: failure("storyboard_provider_rows_failed", "One or more Storyboard provider health rows failed"),
            }
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { sourceUrl: storyboardUrl, checkAllUrl, runTargetId },
          failure: failure("storyboard_check_all_request_failed", error instanceof Error ? error.message : String(error)),
        }
      }
    }

    case "storyboard_cold_start_dev_dashboard_staging_backend": {
      const storyboardUrl = maybeString(params.storyboardUrl) || "http://10.0.0.239:8898/onboarding"
      const frontendUrl = maybeString(params.frontendUrl) || "http://10.0.0.239:8086"
      const localDashboardUrl = maybeString(params.localDashboardUrl) || "http://127.0.0.1:3300"
      const publicDashboardUrl = maybeString(params.publicDashboardUrl) || localDashboardUrl
      const viteUrl = maybeString(params.viteUrl) || "http://127.0.0.1:5173"
      const runTargetId = maybeString(params.runTargetId) || "baseconnect-frontend-web"
      const timeoutSeconds = maybeNumber(params.timeoutSeconds, 8)
      const timeoutMs = timeoutSeconds * 1000
      const expectedMinimumPassCount = maybeNumber(params.expectedMinimumPassCount, 27)
      const routePath = "/storyboard/debug/storyboardEditor/remote-storyboard/"
      const encodedSource = new URLSearchParams({ storyboardUrl }).toString()
      const providerRows: Array<Record<string, unknown>> = []

      const sourceMdUrl = storyboardProviderUrl(storyboardUrl, "storyboard.md") ?? ""
      const sourceJsonUrl = storyboardProviderUrl(storyboardUrl, "storyboard.json") ?? ""
      const runTargetHealthUrl = storyboardProviderUrl(storyboardUrl, "run-target-health") ?? ""
      const checkAllUrl = storyboardProviderUrl(storyboardUrl, "run-target-health/check-all") ?? ""
      const localRemoteStoryboardUrl = `${localDashboardUrl.replace(/\/+$/u, "")}${routePath}?${encodedSource}`
      const publicRemoteStoryboardUrl = `${publicDashboardUrl.replace(/\/+$/u, "")}${routePath}?${encodedSource}`

      const sourceMd = sourceMdUrl ? await textFromUrl(sourceMdUrl, timeoutMs) : { status: null, text: "", error: "invalid storyboardUrl" }
      addProviderRow(providerRows, {
        key: "source-storyboard-md-200",
        label: "source storyboard.md 200",
        group: "bc-storyboard source/provider health",
        status: httpStatusIsOk(sourceMd.status) ? "pass" : "fail",
        detail: httpStatusIsOk(sourceMd.status) ? `HTTP ${sourceMd.status}` : sourceMd.error || `HTTP ${sourceMd.status}`,
        evidence: { url: sourceMdUrl, httpStatus: sourceMd.status },
      })

      const sourceJson = sourceJsonUrl ? await jsonFromUrl(sourceJsonUrl, timeoutMs) : { status: null, payload: null, error: "invalid storyboardUrl" }
      const document = sourceJson.payload && typeof sourceJson.payload === "object" ? sourceJson.payload as Record<string, unknown> : {}
      const stories = Array.isArray(document.stories) ? document.stories : []
      const storyCount = stories.length
      const frameCount = stories.reduce((total, story) => total + (story && typeof story === "object" ? countStoryboardFrames(story as Record<string, unknown>) : 0), 0)
      addProviderRow(providerRows, {
        key: "source-storyboard-json-200",
        label: "source storyboard.json 200",
        group: "bc-storyboard source/provider health",
        status: httpStatusIsOk(sourceJson.status) ? "pass" : "fail",
        detail: httpStatusIsOk(sourceJson.status) ? `HTTP ${sourceJson.status}; stories=${storyCount}; frames=${frameCount}` : sourceJson.error || `HTTP ${sourceJson.status}`,
        evidence: { url: sourceJsonUrl, httpStatus: sourceJson.status, storyCount, frameCount },
      })

      const healthPayload = runTargetHealthUrl ? await jsonFromUrl(runTargetHealthUrl, timeoutMs) : { status: null, payload: null, error: "invalid storyboardUrl" }
      addProviderRow(providerRows, {
        key: "run-target-health-200",
        label: "run-target-health 200",
        group: "fast health/check-all summary",
        status: httpStatusIsOk(healthPayload.status) ? "pass" : "fail",
        detail: httpStatusIsOk(healthPayload.status) ? `HTTP ${healthPayload.status}` : healthPayload.error || `HTTP ${healthPayload.status}`,
        evidence: { url: runTargetHealthUrl, httpStatus: healthPayload.status },
      })

      const checkAllPayload = checkAllUrl ? await jsonFromUrl(checkAllUrl, timeoutMs, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyboardUrl, runTargetId }),
      }) : { status: null, payload: null, error: "invalid storyboardUrl" }
      const checkAllRecord = checkAllPayload.payload && typeof checkAllPayload.payload === "object" ? checkAllPayload.payload as Record<string, unknown> : {}
      const checkAllRows = Array.isArray(checkAllRecord.checks) ? checkAllRecord.checks : []
      const passCount = checkAllRows.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).status === "pass").length
      const warnCount = checkAllRows.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).status === "warn").length
      const failCount = checkAllRows.filter((row) => row && typeof row === "object" && (row as Record<string, unknown>).status === "fail").length
      addProviderRow(providerRows, {
        key: "check-all-pass-fail-summary",
        label: "check-all pass/fail summary",
        group: "fast health/check-all summary",
        status: httpStatusIsOk(checkAllPayload.status) && failCount === 0 && passCount >= expectedMinimumPassCount ? "pass" : "fail",
        detail: `HTTP ${checkAllPayload.status}; pass=${passCount}; warn=${warnCount}; fail=${failCount}; expected_min_pass=${expectedMinimumPassCount}`,
        evidence: { url: checkAllUrl, httpStatus: checkAllPayload.status, passCount, warnCount, failCount, expectedMinimumPassCount, summary: checkAllRecord.summary ?? null },
      })

      for (const path of ["/", "/login", "/user-verification"]) {
        const url = `${frontendUrl.replace(/\/+$/u, "")}${path}`
        const response = await textFromUrl(url, timeoutMs)
        addProviderRow(providerRows, {
          key: `bc-frontend${path === "/" ? "-root" : path.replace(/\//gu, "-")}-200`,
          label: `bc-frontend ${path} 200`,
          group: "bc-frontend staging runtime",
          status: httpStatusIsOk(response.status) ? "pass" : "fail",
          detail: httpStatusIsOk(response.status) ? `HTTP ${response.status}` : response.error || `HTTP ${response.status}`,
          evidence: { url, httpStatus: response.status },
        })
      }
      const stagingMarker = await detectStagingBackendMarker(frontendUrl, timeoutMs)
      addProviderRow(providerRows, {
        key: "bc-frontend-staging-backend-marker-present",
        label: "staging backend marker present",
        group: "bc-frontend staging runtime",
        status: stagingMarker.present ? "pass" : "fail",
        detail: stagingMarker.present ? stagingMarker.marker : "api-staging/baseconnect staging marker missing from frontend bundle",
        evidence: { frontendUrl, marker: stagingMarker.marker, urls: stagingMarker.urls },
      })

      for (const [key, label, url] of [
        ["ddev-dashboard-gateway-200", "ddev dashboard gateway 200", localDashboardUrl],
        ["ddev-dashboard-vite-200", "ddev dashboard Vite 200", viteUrl],
        ["ddev-dashboard-public-route-200", "ddev dashboard public route 200", publicRemoteStoryboardUrl],
        ["ddev-dashboard-remote-storyboard-route-200", "remote-storyboard route 200", localRemoteStoryboardUrl],
      ] as const) {
        const response = await textFromUrl(url, timeoutMs)
        addProviderRow(providerRows, {
          key,
          label,
          group: "ddev dashboard/tunnel/remote-storyboard route",
          status: httpStatusIsOk(response.status) ? "pass" : "fail",
          detail: httpStatusIsOk(response.status) ? `HTTP ${response.status}` : response.error || `HTTP ${response.status}`,
          evidence: { url, httpStatus: response.status },
        })
      }

      const status = statusFromStringRows(providerRows.map((row) => ({ status: maybeString(row.status) || "unknown" })))
      const children = providerRowsToChildTree(providerRows)
      return {
        status,
        children,
        evidence: {
          dispatchModel: "delegated-parent-dispatch.v1",
          dispatchPath: ["bc-storyboard on dev dashboard with staging backend"],
          childDispatchSemantics: "dashboard health API dispatches only direct component parents; component/provider parents own and return their child rows recursively",
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
            unknown: providerRows.filter((row) => !["pass", "warn", "fail"].includes(String(row.status))).length,
          },
          checkAllCounts: { pass: passCount, warn: warnCount, fail: failCount, expectedMinimumPassCount },
          providerRows,
          children,
        },
        failure: status === "PASS" ? null : failure("cold_start_health_failed", "One or more DEV Storyboard + BaseConnect onboarding health children failed"),
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
  const renderedParams = renderTemplate(check.params ?? {}, baseContext) as Record<
    string,
    unknown
  >
  const context = {
    ...baseContext,
    ...renderedParams,
  }
  const runLocation = checkRunLocation(check, context, renderedParams)
  try {
    const partial = await evaluateBuiltinCheck(state, check, context, renderedParams)
    return {
      id: check.id,
      title: check.title,
      checkId: check.checkId,
      component: check.component,
      severity,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      repairHint: check.repairHint ?? null,
      runLocation,
      ...partial,
      evidence: {
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
  if (checks.some((check) => check.severity === "blocking" && check.status === "FAIL")) {
    return "fail"
  }
  if (checks.some((check) => check.status === "UNKNOWN")) {
    return "unknown"
  }
  if (checks.some((check) => check.status === "FAIL")) {
    return "unknown"
  }
  return "pass"
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
): Promise<HealthRunResult | Response> {
  const profileId = maybeString(requestBody.profileId)
  const profile = loadProfile(state, profileId)
  if (!profile) {
    return jsonResponse({ ok: false, error: "unknown profileId" }, 404)
  }

  const startedAt = new Date().toISOString()
  const runId = `health_${Date.now()}_${++state.runCounter}`
  const requestParams = requestBody.params && typeof requestBody.params === "object"
    ? requestBody.params
    : {}
  const target = resolveTarget(
    state,
    maybeString(requestBody.targetId) || maybeString(requestBody.target) || "local",
    requestParams,
  )
  const baseContext = {
    ...(profile.params ?? {}),
    ...requestParams,
    targetId: target.targetId,
    workTarget: target.targetId,
    targetPath: target.targetPath,
    targetHost: target.targetHost,
    repoRoot: state.repoRoot,
    stateRoot: dirname(state.stateDir),
  }
  const renderedBaseContext = renderTemplate(baseContext, baseContext) as Record<
    string,
    unknown
  >

  const checks: HealthCheckResult[] = []
  for (const check of profile.checks ?? []) {
    checks.push(await evaluateCheck(state, check, renderedBaseContext))
  }
  const finishedAt = new Date().toISOString()
  const result: HealthRunResult = {
    runId,
    profileId: profile.id,
    targetId: target.targetId,
    params: renderedBaseContext,
    startedAt,
    finishedAt,
    status: runStatusFromChecks(checks),
    checks,
  }
  persistRun(state, result)
  return result
}

async function parseRequestBody(request: Request): Promise<HealthRunRequest | null> {
  try {
    return (await request.json()) as HealthRunRequest
  } catch {
    return null
  }
}

export function createHealthApi(options: HealthApiOptions): {
  handle: (request: Request) => Promise<Response | null>
} {
  const state: HealthApiState = {
    repoRoot: options.repoRoot,
    profilesDir: resolve(options.repoRoot, "workspace/health/profiles"),
    checksDir: resolve(options.repoRoot, "workspace/health/checks"),
    stateDir: resolve(options.stateRoot, "health"),
    workAtRegistryPath: resolve(options.stateRoot, "work-at/registry.json"),
    runCounter: 0,
  }

  return {
    async handle(request: Request): Promise<Response | null> {
      const url = new URL(request.url)
      if (url.pathname === "/api/health/profiles" && request.method === "GET") {
        const profiles = loadProfiles(state)
        return jsonResponse({ ok: true, profiles: profiles.map(profileSummary) })
      }

      const profileMatch = /^\/api\/health\/profiles\/([^/]+)$/u.exec(url.pathname)
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
          return jsonResponse({ ok: false, error: "profileId is required" }, 400)
        }
        const result = await runProfile(state, body)
        return result instanceof Response ? result : jsonResponse({ ok: true, result }, 202)
      }

      if (url.pathname === "/api/health/latest" && request.method === "GET") {
        const profileId = url.searchParams.get("profileId")?.trim() ?? ""
        if (!profileId) {
          return jsonResponse({ ok: false, error: "profileId is required" }, 400)
        }
        const path = latestPath(state, profileId)
        if (!existsSync(path)) {
          return jsonResponse({ ok: false, error: "no result for profileId" }, 404)
        }
        return jsonResponse({ ok: true, result: readJsonFile<HealthRunResult>(path) })
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
