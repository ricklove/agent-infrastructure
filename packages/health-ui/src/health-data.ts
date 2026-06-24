import { existsSync, readFileSync, readdirSync } from "node:fs"
import { basename, join, relative, resolve } from "node:path"
import type {
  HealthCheckDefinition,
  HealthDashboardPayload,
  HealthProfile,
  HealthProfileCheck,
} from "./types.js"

const healthRoot = "workspace/health"
const profileSuffix = ".health-profile.json"
const checkSuffix = ".health-check.json"

type JsonRecord = Record<string, unknown>

function readJsonFile(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" ? entry : String(entry ?? ""),
    ]),
  )
}

function normalizeProfileCheck(value: unknown): HealthProfileCheck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const record = value as JsonRecord
  const id = stringValue(record.id)
  const checkId = stringValue(record.checkId)
  if (!id || !checkId) {
    return null
  }
  return {
    id,
    checkId,
    title: stringValue(record.title, id),
    severity: stringValue(record.severity, "info"),
    repairHint: stringValue(record.repairHint) || undefined,
    params: stringRecord(record.params),
  }
}

function sourcePath(repoRoot: string, path: string): string {
  return relative(repoRoot, path)
}

function loadProfiles(repoRoot: string): HealthProfile[] {
  const profilesRoot = resolve(repoRoot, healthRoot, "profiles")
  if (!existsSync(profilesRoot)) {
    return []
  }
  return readdirSync(profilesRoot)
    .filter((name) => name.endsWith(profileSuffix))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const path = join(profilesRoot, name)
      const json = readJsonFile(path)
      const id = stringValue(json.id, basename(name, profileSuffix))
      const checks = Array.isArray(json.checks)
        ? json.checks.map(normalizeProfileCheck).filter((check) => check !== null)
        : []
      return {
        id,
        title: stringValue(json.title, id),
        description: stringValue(json.description) || undefined,
        params: stringRecord(json.params),
        checks,
        sourcePath: sourcePath(repoRoot, path),
      }
    })
}

function loadCheckDefinitions(repoRoot: string): HealthCheckDefinition[] {
  const checksRoot = resolve(repoRoot, healthRoot, "checks")
  if (!existsSync(checksRoot)) {
    return []
  }
  return readdirSync(checksRoot)
    .filter((name) => name.endsWith(checkSuffix))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const path = join(checksRoot, name)
      const json = readJsonFile(path)
      const id = stringValue(json.id, basename(name, checkSuffix))
      const timeoutMs =
        typeof json.timeoutMs === "number" && Number.isFinite(json.timeoutMs)
          ? json.timeoutMs
          : undefined
      return {
        id,
        title: stringValue(json.title, id),
        description: stringValue(json.description) || undefined,
        execution:
          json.execution && typeof json.execution === "object"
            ? (json.execution as Record<string, unknown>)
            : undefined,
        timeoutMs,
        sourcePath: sourcePath(repoRoot, path),
      }
    })
}

export function loadHealthDashboardPayload(
  repoRoot = process.cwd(),
): HealthDashboardPayload {
  const resolvedRoot = resolve(repoRoot)
  return {
    profiles: loadProfiles(resolvedRoot),
    checkDefinitions: loadCheckDefinitions(resolvedRoot),
    context: {
      repoRoot: resolvedRoot,
      profilesRoot: resolve(resolvedRoot, healthRoot, "profiles"),
      checksRoot: resolve(resolvedRoot, healthRoot, "checks"),
      generatedAt: new Date().toISOString(),
    },
  }
}
