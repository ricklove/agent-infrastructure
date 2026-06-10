export type RunTargetHealthStatus = "pass" | "warn" | "fail" | "unknown"

export function normalizeWebRunTargetUrl(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed[0] === "{" && trimmed[trimmed.length - 1] === "}") {
    try {
      const parsed = JSON.parse(trimmed) as { kind?: unknown; url?: unknown }
      if (parsed?.kind === "web" && typeof parsed.url === "string") {
        return parsed.url.trim()
      }
    } catch {
      // Fall through to returning the original string; URL validation happens at the caller.
    }
  }
  return trimmed
}


export type RunTargetConfigStatus = "missing" | "invalid" | "configured" | "unknown"

export type RunTargetConfigField = {
  key: string
  label?: string
  type?: string
  required?: boolean
  value?: unknown
  status?: RunTargetConfigStatus
  detail?: string
  owner?: string
  suggestedAction?: string
  readOnly?: boolean
}

export type RunTargetProviderTarget = {
  id: string
  name?: string
  label?: string
  kind?: string
  type?: string
  owner?: string
  sourceProvider?: string
  description?: string
  aliases?: string[]
  configFields: RunTargetConfigField[]
  healthCheckKeys: string[]
}

export type RunTargetHealthCheck = {
  key: string
  status: RunTargetHealthStatus
  label?: string
  detail?: string
  owner?: string
  evidence?: unknown
  suggestedAction?: string
}

export type RunTargetHealthPayload = {
  ok?: boolean
  storyboard?: string
  runTargetId?: string
  owner?: string
  checks?: unknown
  check?: unknown
  results?: unknown
  message?: string
  unsupported?: boolean
  unavailable?: boolean
  target?: unknown
  runTargets?: unknown
  targets?: unknown
}

function parseStatus(value: unknown): RunTargetHealthStatus {
  return value === "pass" || value === "warn" || value === "fail" || value === "unknown"
    ? value
    : "unknown"
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function parseConfigStatus(value: unknown): RunTargetConfigStatus {
  return value === "missing" || value === "invalid" || value === "configured" || value === "unknown"
    ? value
    : "unknown"
}

function normalizeConfigField(input: unknown): RunTargetConfigField | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const key = optionalString(record.key)
  if (!key) return null
  return {
    key,
    ...(optionalString(record.label) ? { label: optionalString(record.label) } : {}),
    ...(optionalString(record.type) ? { type: optionalString(record.type) } : {}),
    ...(typeof record.required === "boolean" ? { required: record.required } : {}),
    ...("value" in record ? { value: record.value } : {}),
    ...("status" in record ? { status: parseConfigStatus(record.status) } : {}),
    ...(optionalString(record.detail) ? { detail: optionalString(record.detail) } : {}),
    ...(optionalString(record.owner) ? { owner: optionalString(record.owner) } : {}),
    ...(optionalString(record.suggestedAction) ? { suggestedAction: optionalString(record.suggestedAction) } : {}),
    ...(typeof record.readOnly === "boolean" ? { readOnly: record.readOnly } : {}),
  }
}

function normalizeStringList(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === "string" && !!entry.trim()).map((entry) => entry.trim()) : []
}

function normalizeConfigFields(input: unknown): RunTargetConfigField[] {
  return Array.isArray(input) ? input.map(normalizeConfigField).filter((field): field is RunTargetConfigField => !!field) : []
}

function normalizeRunTargetRecord(input: unknown): RunTargetProviderTarget | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const id = optionalString(record.id) ?? optionalString(record.key)
  if (!id) return null
  return {
    id,
    ...(optionalString(record.name) ? { name: optionalString(record.name) } : {}),
    ...(optionalString(record.label) ? { label: optionalString(record.label) } : {}),
    ...(optionalString(record.kind) ? { kind: optionalString(record.kind) } : {}),
    ...(optionalString(record.type) ? { type: optionalString(record.type) } : {}),
    ...(optionalString(record.owner) ? { owner: optionalString(record.owner) } : {}),
    ...(optionalString(record.sourceProvider) ? { sourceProvider: optionalString(record.sourceProvider) } : {}),
    ...(optionalString(record.description) ? { description: optionalString(record.description) } : {}),
    aliases: normalizeStringList(record.aliases),
    configFields: normalizeConfigFields(record.configFields ?? record.config ?? record.fields),
    healthCheckKeys: normalizeStringList(record.healthCheckKeys ?? record.checkKeys ?? record.checks),
  }
}

export function normalizeRunTargets(payload: unknown): RunTargetProviderTarget[] {
  if (!payload || typeof payload !== "object") return []
  const record = payload as RunTargetHealthPayload
  const runTargets = Array.isArray(record.runTargets) ? record.runTargets : Array.isArray(record.targets) ? record.targets : []
  const normalized = runTargets.map(normalizeRunTargetRecord).filter((target): target is RunTargetProviderTarget => !!target)
  if (normalized.length > 0) return normalized
  const single = normalizeRunTargetRecord(record.target)
  return single ? [single] : []
}

export function normalizeRunTarget(payload: unknown): RunTargetProviderTarget | null {
  return normalizeRunTargets(payload)[0] ?? null
}

export function runTargetDisplayName(target: RunTargetProviderTarget | undefined | null) {
  return target?.name ?? target?.label ?? target?.id ?? "Run target"
}

function normalizeCheck(input: unknown): RunTargetHealthCheck | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const key = typeof record.key === "string" ? record.key.trim() : ""
  if (!key) return null
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : undefined
  const detail = typeof record.detail === "string" && record.detail.trim() ? record.detail.trim() : undefined
  const owner = typeof record.owner === "string" && record.owner.trim() ? record.owner.trim() : undefined
  const suggestedAction =
    typeof record.suggestedAction === "string" && record.suggestedAction.trim()
      ? record.suggestedAction.trim()
      : undefined
  return {
    key,
    status: parseStatus(record.status),
    ...(label ? { label } : {}),
    ...(detail ? { detail } : {}),
    ...(owner ? { owner } : {}),
    ...("evidence" in record ? { evidence: record.evidence } : {}),
    ...(suggestedAction ? { suggestedAction } : {}),
  }
}

function normalizeCheckList(input: unknown): RunTargetHealthCheck[] {
  if (!Array.isArray(input)) return []
  return input.map(normalizeCheck).filter((check): check is RunTargetHealthCheck => !!check)
}

export function normalizeRunTargetHealthChecks(payload: unknown): RunTargetHealthCheck[] {
  if (!payload || typeof payload !== "object") return []
  const record = payload as RunTargetHealthPayload
  const checks = normalizeCheckList(record.checks)
  if (checks.length > 0) return checks
  const results = normalizeCheckList(record.results)
  if (results.length > 0) return results
  const single = normalizeCheck(record.check)
  return single ? [single] : []
}

export function runTargetHealthSummary(checks: RunTargetHealthCheck[]) {
  const counts: Record<RunTargetHealthStatus, number> = { pass: 0, warn: 0, fail: 0, unknown: 0 }
  for (const check of checks) {
    counts[check.status] += 1
  }
  return counts
}

export function runTargetProviderApiPath(storyboardUrl: string, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${storyboardUrl.replace(/\/+$/u, "")}/`).toString()
}

export function runTargetHealthApiPath(storyboardUrl: string, path: string, runTargetId?: string) {
  const target = new URL(path.replace(/^\/+/, ""), `${storyboardUrl.replace(/\/+$/u, "")}/`)
  if (runTargetId) target.searchParams.set("runTargetId", runTargetId)
  return target.toString()
}
