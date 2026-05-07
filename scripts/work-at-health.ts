import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

type CheckSeverity = "info" | "warn" | "error" | "blocking"

type ExecutionKind = "local" | "work-at"

type RawHealthCheck = {
  id?: unknown
  title?: unknown
  description?: unknown
  execution?: {
    kind?: unknown
    workTargetParam?: unknown
  }
  command?: unknown
  timeoutMs?: unknown
}

type WorkspaceHealthCheck = {
  id: string
  title: string
  description: string
  execution: {
    kind: ExecutionKind
    workTargetParam: string | null
  }
  command: string[]
  timeoutMs: number
}

type RawProfileBinding = {
  id?: unknown
  checkId?: unknown
  title?: unknown
  severity?: unknown
  params?: unknown
}

type RawHealthProfile = {
  id?: unknown
  title?: unknown
  description?: unknown
  params?: unknown
  checks?: unknown
}

type WorkspaceHealthProfileBinding = {
  id: string
  checkId: string
  title: string | null
  severity: CheckSeverity
  params: Record<string, string>
}

type WorkspaceHealthProfile = {
  id: string
  title: string
  description: string
  params: Record<string, string>
  checks: WorkspaceHealthProfileBinding[]
}

type WorkspaceHealthFinding = {
  id: string
  checkId: string
  title: string
  severity: CheckSeverity
  status: "healthy" | "unhealthy"
  executionKind: ExecutionKind
  command: string[]
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
}

type WorkspaceHealthReport = {
  profileId: string
  profileTitle: string
  workspaceHealthRoot: string
  generatedAt: string
  status: "healthy" | "unhealthy"
  findingCount: number
  failureCount: number
  findings: WorkspaceHealthFinding[]
}

type RunWorkspaceHealthOptions = {
  profileId: string
  paramOverrides?: Record<string, string>
  workspaceHealthRoot?: string
  workAtBin?: string
}

type CliOptions = RunWorkspaceHealthOptions & {
  json: boolean
}

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_WORK_AT_BIN =
  process.env.WORKSPACE_HEALTH_WORK_AT_BIN?.trim() || "work-at"
const DEFAULT_WORKSPACE_HEALTH_ROOT = resolve(import.meta.dir, "../workspace/health")

function usage(exitCode = 1): never {
  console.log(`Usage: bun ./scripts/work-at-health.ts --profile <name> [options]

Options:
  --profile <name>              Health profile id to run
  --param <key=value>           Override one profile parameter
  --workspace-health-root <dir> Override workspace health definition root
  --work-at-bin <path>          Override work-at executable
  --json                        Emit JSON only
  -h, --help                    Show this help
`)
  process.exit(exitCode)
}

function fail(message: string): never {
  throw new Error(message)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function asRecord(
  value: unknown,
  fieldName: string,
  path: string,
): Record<string, string> {
  if (value == null) {
    return {}
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    fail(`Invalid ${fieldName} in ${path}`)
  }
  const entries = Object.entries(value as Record<string, unknown>)
  return Object.fromEntries(
    entries.map(([key, rawValue]) => {
      if (typeof rawValue !== "string") {
        fail(`Invalid ${fieldName}.${key} in ${path}`)
      }
      return [key, rawValue]
    }),
  )
}

function parseSeverity(
  value: unknown,
  path: string,
  fieldName: string,
): CheckSeverity {
  if (
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "blocking"
  ) {
    return value
  }
  fail(`Invalid ${fieldName} in ${path}`)
}

function parseHealthCheck(path: string): WorkspaceHealthCheck {
  const raw = readJson<RawHealthCheck>(path)
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  const description =
    typeof raw.description === "string" ? raw.description.trim() : ""
  const kind = raw.execution?.kind
  const workTargetParam =
    typeof raw.execution?.workTargetParam === "string"
      ? raw.execution.workTargetParam.trim()
      : ""

  if (!id || !title || !description) {
    fail(`Invalid health check metadata in ${path}`)
  }
  if (kind !== "local" && kind !== "work-at") {
    fail(`Invalid execution.kind in ${path}`)
  }
  if (
    !Array.isArray(raw.command) ||
    raw.command.some((part) => typeof part !== "string")
  ) {
    fail(`Invalid command in ${path}`)
  }
  if (kind === "work-at" && !workTargetParam) {
    fail(`Missing execution.workTargetParam in ${path}`)
  }

  return {
    id,
    title,
    description,
    execution: {
      kind,
      workTargetParam: kind === "work-at" ? workTargetParam : null,
    },
    command: raw.command.map((part) => part.trim()),
    timeoutMs:
      typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
        ? Math.max(100, Math.trunc(raw.timeoutMs))
        : DEFAULT_TIMEOUT_MS,
  }
}

function parseHealthProfile(path: string): WorkspaceHealthProfile {
  const raw = readJson<RawHealthProfile>(path)
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  const description =
    typeof raw.description === "string" ? raw.description.trim() : ""

  if (!id || !title || !description) {
    fail(`Invalid health profile metadata in ${path}`)
  }
  if (!Array.isArray(raw.checks)) {
    fail(`Invalid checks in ${path}`)
  }

  return {
    id,
    title,
    description,
    params: asRecord(raw.params, "params", path),
    checks: raw.checks.map((entry, index) => {
      const value = entry as RawProfileBinding
      const checkId =
        typeof value.checkId === "string" ? value.checkId.trim() : ""
      const bindingId = typeof value.id === "string" ? value.id.trim() : ""
      if (!checkId || !bindingId) {
        fail(`Invalid checks[${index}] binding in ${path}`)
      }
      return {
        id: bindingId,
        checkId,
        title: typeof value.title === "string" ? value.title.trim() : null,
        severity: parseSeverity(
          value.severity,
          path,
          `checks[${index}].severity`,
        ),
        params: asRecord(value.params, `checks[${index}].params`, path),
      }
    }),
  }
}

function loadChecks(checkDir: string): Map<string, WorkspaceHealthCheck> {
  const result = new Map<string, WorkspaceHealthCheck>()
  if (!existsSync(checkDir)) {
    fail(`Health check directory does not exist: ${checkDir}`)
  }

  for (const entry of readdirSync(checkDir).sort()) {
    if (!entry.endsWith(".health-check.json")) {
      continue
    }
    const path = join(checkDir, entry)
    const check = parseHealthCheck(path)
    result.set(check.id, check)
  }

  return result
}

function loadProfiles(profileDir: string): Map<string, WorkspaceHealthProfile> {
  const result = new Map<string, WorkspaceHealthProfile>()
  if (!existsSync(profileDir)) {
    fail(`Health profile directory does not exist: ${profileDir}`)
  }

  for (const entry of readdirSync(profileDir).sort()) {
    if (!entry.endsWith(".health-profile.json")) {
      continue
    }
    const path = join(profileDir, entry)
    const profile = parseHealthProfile(path)
    result.set(profile.id, profile)
  }

  return result
}

function parseArgs(argv: string[]): CliOptions {
  let profileId = ""
  let workspaceHealthRoot = ""
  let workAtBin = ""
  let json = false
  const paramOverrides: Record<string, string> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    switch (token) {
      case "--profile":
        profileId = argv[index + 1]?.trim() || ""
        index += 1
        break
      case "--workspace-health-root":
        workspaceHealthRoot = argv[index + 1]?.trim() || ""
        index += 1
        break
      case "--work-at-bin":
        workAtBin = argv[index + 1]?.trim() || ""
        index += 1
        break
      case "--param": {
        const rawPair = argv[index + 1]?.trim() || ""
        const equalsIndex = rawPair.indexOf("=")
        if (equalsIndex <= 0) {
          fail(`Invalid --param value: ${rawPair}`)
        }
        const key = rawPair.slice(0, equalsIndex).trim()
        const value = rawPair.slice(equalsIndex + 1)
        if (!key) {
          fail(`Invalid --param value: ${rawPair}`)
        }
        paramOverrides[key] = value
        index += 1
        break
      }
      case "--json":
        json = true
        break
      case "-h":
      case "--help":
        usage(0)
        break
      default:
        fail(`Unknown argument: ${token}`)
    }
  }

  if (!profileId) {
    usage()
  }

  return {
    profileId,
    paramOverrides,
    workspaceHealthRoot: workspaceHealthRoot || DEFAULT_WORKSPACE_HEALTH_ROOT,
    workAtBin: workAtBin || DEFAULT_WORK_AT_BIN,
    json,
  }
}

function interpolate(value: string, params: Record<string, string>): string {
  return value.replaceAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu, (_, rawKey) => {
    const key = String(rawKey)
    const resolved = params[key]
    if (resolved == null) {
      fail(`Missing parameter: ${key}`)
    }
    return resolved
  })
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(value)) {
    return value
  }
  return JSON.stringify(value)
}

function runCommand(
  command: string[],
  timeoutMs: number,
): {
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
} {
  const startedAt = Date.now()
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  })

  const durationMs = Date.now() - startedAt
  if (result.error && result.error.name === "ETIMEDOUT") {
    return {
      exitCode: null,
      stdout: result.stdout ?? "",
      stderr: (result.stderr ?? "") || `Timed out after ${timeoutMs}ms`,
      durationMs,
    }
  }
  if (result.error && result.status == null) {
    return {
      exitCode: null,
      stdout: result.stdout ?? "",
      stderr: result.error.message,
      durationMs,
    }
  }

  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs,
  }
}

export function runWorkspaceHealthProfile(
  options: RunWorkspaceHealthOptions,
): WorkspaceHealthReport {
  const workspaceHealthRoot =
    options.workspaceHealthRoot?.trim() || DEFAULT_WORKSPACE_HEALTH_ROOT
  const checks = loadChecks(join(workspaceHealthRoot, "checks"))
  const profiles = loadProfiles(join(workspaceHealthRoot, "profiles"))
  const profile = profiles.get(options.profileId)

  if (!profile) {
    fail(`Unknown workspace health profile: ${options.profileId}`)
  }

  const workAtBin = options.workAtBin?.trim() || DEFAULT_WORK_AT_BIN
  const baseParams: Record<string, string> = {
    workspaceHealthRoot,
    workspaceRoot: resolve(workspaceHealthRoot, "../.."),
    ...profile.params,
    ...(options.paramOverrides ?? {}),
  }

  const findings = profile.checks.map((binding) => {
    const check = checks.get(binding.checkId)
    if (!check) {
      fail(`Unknown health check ${binding.checkId} in profile ${profile.id}`)
    }

    const rawParams = {
      ...baseParams,
      ...binding.params,
    }
    const params = Object.fromEntries(
      Object.entries(rawParams).map(([key, value]) => [
        key,
        interpolate(value, rawParams),
      ]),
    )
    const resolvedCommand = check.command.map((part) =>
      interpolate(part, params),
    )
    const workTargetParam = check.execution.workTargetParam ?? ""
    const workTarget = params[workTargetParam]

    const command =
      check.execution.kind === "work-at"
        ? [
            workAtBin,
            workTarget ||
              fail(
                `Missing work-at target parameter ${workTargetParam} for ${binding.id}`,
              ),
            ...resolvedCommand,
          ]
        : resolvedCommand

    const result = runCommand(command, check.timeoutMs)
    return {
      id: binding.id,
      checkId: check.id,
      title: binding.title || check.title,
      severity: binding.severity,
      status:
        result.exitCode === 0 ? ("healthy" as const) : ("unhealthy" as const),
      executionKind: check.execution.kind,
      command,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      durationMs: result.durationMs,
    }
  })

  const failureCount = findings.filter(
    (finding) => finding.status === "unhealthy",
  ).length

  return {
    profileId: profile.id,
    profileTitle: profile.title,
    workspaceHealthRoot,
    generatedAt: new Date().toISOString(),
    status: failureCount > 0 ? "unhealthy" : "healthy",
    findingCount: findings.length,
    failureCount,
    findings,
  }
}

function printReport(report: WorkspaceHealthReport): void {
  console.log(
    `workspace-health ${report.profileId} ${report.status} (${report.findingCount} checks, ${report.failureCount} failing)`,
  )
  for (const finding of report.findings) {
    const prefix = finding.status === "healthy" ? "PASS" : "FAIL"
    const detail =
      finding.status === "healthy" ? finding.stdout : finding.stderr || finding.stdout
    console.log(`${prefix} [${finding.severity}] ${finding.id} :: ${finding.title}`)
    console.log(`  command: ${finding.command.map(quote).join(" ")}`)
    if (detail) {
      console.log(`  detail: ${detail}`)
    }
  }
}

if (import.meta.main) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const report = runWorkspaceHealthProfile(options)
    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      printReport(report)
    }
    process.exit(report.status === "healthy" ? 0 : 1)
  } catch (error) {
    console.error(
      `workspace-health: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}
