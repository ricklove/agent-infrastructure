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
}

function parseStatus(value: unknown): RunTargetHealthStatus {
  return value === "pass" || value === "warn" || value === "fail" || value === "unknown"
    ? value
    : "unknown"
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

export function runTargetHealthApiPath(storyboardUrl: string, path: string, runTargetId?: string) {
  const target = new URL(path.replace(/^\/+/, ""), `${storyboardUrl.replace(/\/+$/u, "")}/`)
  if (runTargetId) target.searchParams.set("runTargetId", runTargetId)
  return target.toString()
}
