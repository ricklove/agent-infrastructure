export type HealthSeverity = "blocking" | "warn" | "info" | string

export type HealthProfileParamMap = Record<string, string>

export type HealthRunLocation = {
  executor?: string
  workTarget?: string
  host?: string
  container?: string
  source?: string
  vantagePoint?: string
  command?: string
  providerType?: string
}

export type HealthProfileCheck = {
  id: string
  checkId: string
  title: string
  component?: string
  runLocation?: HealthRunLocation
  execution?: HealthRunLocation
  severity: HealthSeverity
  repairHint?: string
  params?: Record<string, string>
}

export type HealthProfile = {
  id: string
  title: string
  description?: string
  params?: HealthProfileParamMap
  runLocation?: HealthRunLocation
  checks: HealthProfileCheck[]
  sourcePath?: string
}

export type HealthProfileSummary = {
  id: string
  title: string
  description?: string
  runLocation?: HealthRunLocation
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
  kind: "component" | "service" | "dependency" | "check" | "provider-row" | string
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
