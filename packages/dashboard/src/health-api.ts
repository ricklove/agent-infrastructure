import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export type HealthApiOptions = {
  repoRoot: string
  stateRoot: string
}

type HealthSeverity = "blocking" | "warn" | "info"
type HealthCheckStatus = "PASS" | "FAIL" | "WARN" | "UNKNOWN"
type HealthRunStatus = "pass" | "fail" | "unknown"

type HealthProfileCheckDefinition = {
  id: string
  checkId: string
  title: string
  severity?: HealthSeverity
  repairHint?: string
  params?: Record<string, unknown>
}

type HealthProfileDefinition = {
  id: string
  title: string
  description?: string
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
  severity: HealthSeverity
  status: HealthCheckStatus
  durationMs: number
  evidence: Record<string, unknown>
  failure: null | {
    class: string
    message: string
  }
  repairHint: string | null
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
    params: profile.params ?? {},
    checkCount: profile.checks?.length ?? 0,
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
  try {
    const partial = await evaluateBuiltinCheck(state, check, context, renderedParams)
    return {
      id: check.id,
      title: check.title,
      checkId: check.checkId,
      severity,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      repairHint: check.repairHint ?? null,
      ...partial,
    }
  } catch (error) {
    return {
      id: check.id,
      title: check.title,
      checkId: check.checkId,
      severity,
      status: "UNKNOWN",
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      evidence: {},
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
