export type HealthSeverity = "blocking" | "warn" | "info" | string

export type HealthProfileParamMap = Record<string, string>

export type HealthProfileCheck = {
  id: string
  checkId: string
  title: string
  severity: HealthSeverity
  repairHint?: string
  params?: Record<string, string>
}

export type HealthProfile = {
  id: string
  title: string
  description?: string
  params?: HealthProfileParamMap
  checks: HealthProfileCheck[]
  sourcePath?: string
}

export type HealthProfileSummary = {
  id: string
  title: string
  description?: string
  params?: Record<string, unknown>
  checkCount: number
}

export type HealthCheckDefinition = {
  id: string
  title: string
  description?: string
  execution?: Record<string, unknown>
  timeoutMs?: number
  sourcePath?: string
}

export type HealthCheckStatus = "PASS" | "FAIL" | "WARN" | "UNKNOWN"
export type HealthRunStatus = "pass" | "fail" | "unknown"

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

export type HealthDashboardPayload = {
  profiles: HealthProfile[]
  checkDefinitions: HealthCheckDefinition[]
  context: {
    repoRoot: string
    profilesRoot: string
    checksRoot: string
    generatedAt: string
  }
}
