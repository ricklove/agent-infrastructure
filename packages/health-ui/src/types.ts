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

export type HealthCheckDefinition = {
  id: string
  title: string
  description?: string
  execution?: Record<string, unknown>
  timeoutMs?: number
  sourcePath?: string
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
