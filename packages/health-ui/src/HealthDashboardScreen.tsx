import { useEffect, useMemo, useState } from "react"
import type {
  HealthCheckNodeResult,
  HealthCheckResult,
  HealthProfile,
  HealthProfileSummary,
  HealthRunResult,
  HealthRunStatus,
} from "./types.js"

type HealthDashboardScreenProps = {
  apiRootUrl?: string
}

type ProfileState = {
  profile: HealthProfile
  summary: HealthProfileSummary
  latest?: HealthRunResult | null
  loadingLatest?: boolean
  running?: boolean
  error?: string | null
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; profiles: ProfileState[] }
  | { status: "error"; message: string }

const statusOrder = {
  FAIL: 0,
  DISPATCH_FAILED: 0,
  UNAUTHORIZED: 0,
  BLOCKED: 1,
  WARN: 2,
  STALE: 2,
  UNKNOWN: 3,
  NOT_RUN: 3,
  UNSUPPORTED: 3,
  RUNNING: 4,
  INFO: 5,
  PASS: 6,
} as const
const statusGlyph = {
  PASS: "●",
  WARN: "▲",
  FAIL: "■",
  BLOCKED: "◆",
  NOT_RUN: "○",
  STALE: "◷",
  UNKNOWN: "○",
  DISPATCH_FAILED: "■",
  UNAUTHORIZED: "■",
  UNSUPPORTED: "◇",
  RUNNING: "◌",
  INFO: "●",
} as const
const childStatusGlyph = {
  pass: "●",
  warn: "▲",
  fail: "■",
  blocked: "◆",
  not_run: "○",
  stale: "◷",
  unknown: "○",
  dispatch_failed: "■",
  unauthorized: "■",
  unsupported: "◇",
  running: "◌",
  info: "●",
} as const

function queryParam(name: string) {
  if (typeof window === "undefined") return ""
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? ""
}

function profileParams(
  profile: HealthProfile,
  overrides: Record<string, string>,
) {
  return {
    ...(profile.params ?? {}),
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value.trim()),
    ),
  }
}

function resultStatus(result?: HealthRunResult | null) {
  if (!result) return "UNKNOWN" as const
  if (
    result.checks.some(
      (check) =>
        check.status === "FAIL" ||
        check.status === "DISPATCH_FAILED" ||
        check.status === "UNAUTHORIZED",
    )
  )
    return "FAIL" as const
  if (
    result.checks.some(
      (check) =>
        check.status === "BLOCKED" ||
        check.status === "WARN" ||
        check.status === "STALE",
    )
  )
    return "WARN" as const
  if (
    result.checks.some(
      (check) =>
        check.status === "UNKNOWN" ||
        check.status === "NOT_RUN" ||
        check.status === "UNSUPPORTED" ||
        check.status === "RUNNING",
    )
  )
    return "UNKNOWN" as const
  return "PASS" as const
}

function statusClassName(status: keyof typeof statusGlyph) {
  switch (status) {
    case "PASS":
      return "border-emerald-200 bg-emerald-50 text-emerald-800"
    case "WARN":
      return "border-amber-200 bg-amber-50 text-amber-900"
    case "FAIL":
      return "border-rose-200 bg-rose-50 text-rose-800"
    default:
      return "border-slate-200 bg-slate-50 text-slate-600"
  }
}

function runStatusClassName(status: HealthRunStatus | "none") {
  if (status === "pass")
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "fail") return "border-rose-200 bg-rose-50 text-rose-800"
  if (status === "unknown") return "border-slate-200 bg-slate-50 text-slate-700"
  return "border-slate-200 bg-white text-slate-500"
}

function childStatusClassName(status: string) {
  if (status === "pass" || status === "info")
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "warn" || status === "stale" || status === "blocked")
    return "border-amber-200 bg-amber-50 text-amber-900"
  if (
    status === "fail" ||
    status === "dispatch_failed" ||
    status === "unauthorized"
  )
    return "border-rose-200 bg-rose-50 text-rose-800"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

function runStatusToTreeStatus(status?: HealthRunStatus | "none") {
  if (status === "pass") return "PASS" as const
  if (status === "fail") return "FAIL" as const
  return "UNKNOWN" as const
}

function compactTime(value?: string) {
  if (!value) return "never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function locationLabel(value: unknown) {
  if (!value || typeof value !== "object") return "—"
  const record = value as Record<string, unknown>
  const parts = [
    record.vantagePoint,
    record.workTarget,
    record.host,
    record.container,
    record.executor,
  ]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}

function rowRunLocation(record: Record<string, unknown>) {
  return locationLabel(
    record.runLocation ?? record.execution ?? record.evidence,
  )
}

function healthViewHref(profileId: string, params: Record<string, unknown>) {
  const search = new URLSearchParams({ profileId })
  const storyboardUrl =
    typeof params.storyboardUrl === "string" ? params.storyboardUrl : ""
  if (storyboardUrl) search.set("storyboardUrl", storyboardUrl)
  return `/health?${search.toString()}`
}

function ContractMetadata({
  node,
}: {
  node: HealthCheckResult | HealthCheckNodeResult
}) {
  const candidateFields: Array<[string, unknown]> = [
    ["contract", node.contractVersion],
    ["kind", node.nodeKind],
    ["template", node.templateId],
    ["definition", node.definitionKey],
    ["owner", node.owner],
    ["target", node.target?.id ?? node.targetId],
    ["profile", node.target?.profileId],
    ["rollup", node.rollupReason],
    ["failure class", node.failureClass],
    ["correlation", node.correlationId],
    ["dispatch", node.dispatchPath?.join(" › ")],
  ]
  const fields = candidateFields.filter(
    ([, value]) =>
      value !== undefined && value !== null && String(value).trim(),
  )
  if (fields.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {fields.map(([label, value]) => (
        <span
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600"
          key={label}
          title={String(value)}
        >
          <span className="font-semibold text-slate-500">{label}:</span>{" "}
          <span className="font-mono">{String(value)}</span>
        </span>
      ))}
    </div>
  )
}

function EvidencePreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-950 p-3 text-[11px] leading-4 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function ProviderRows({ evidence }: { evidence: Record<string, unknown> }) {
  const rows = Array.isArray(evidence.providerRows) ? evidence.providerRows : []
  if (rows.length === 0) return null
  return (
    <div className="mt-2 overflow-auto rounded border border-slate-200">
      <table className="w-full border-collapse text-[11px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">Provider row</th>
            <th className="px-2 py-1 text-left">Status</th>
            <th className="px-2 py-1 text-left">Detail</th>
            <th className="px-2 py-1 text-left">Vantage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const record =
              row && typeof row === "object"
                ? (row as Record<string, unknown>)
                : {}
            const status = normalizeHealthStatus(
              record.status,
            ).toUpperCase() as keyof typeof statusGlyph
            return (
              <tr
                className="border-t border-slate-100"
                key={`${record.key ?? index}`}
              >
                <td className="px-2 py-1 font-mono text-slate-700">
                  {String(record.key ?? index)}
                </td>
                <td className="px-2 py-1">
                  <span
                    className={`rounded border px-1.5 py-0.5 ${statusClassName(statusGlyph[status] ? status : "UNKNOWN")}`}
                  >
                    {String(record.status ?? "unknown")}
                  </span>
                </td>
                <td className="px-2 py-1 text-slate-600">
                  {String(record.detail ?? record.label ?? "")}
                </td>
                <td className="px-2 py-1 text-slate-500">
                  {rowRunLocation(record)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function normalizeHealthStatus(value: unknown) {
  const normalized = String(value ?? "unknown").toLowerCase()
  if (
    normalized === "pass" ||
    normalized === "passed" ||
    normalized === "ok" ||
    normalized === "success"
  )
    return "pass" as const
  if (normalized === "warn" || normalized === "warning") return "warn" as const
  if (
    normalized === "fail" ||
    normalized === "failed" ||
    normalized === "error"
  )
    return "fail" as const
  if (normalized === "blocked" || normalized === "config_missing")
    return "blocked" as const
  if (
    normalized === "not_run" ||
    normalized === "not-run" ||
    normalized === "skipped"
  )
    return "not_run" as const
  if (normalized === "stale") return "stale" as const
  if (normalized === "dispatch_failed" || normalized === "dispatch-failed")
    return "dispatch_failed" as const
  if (
    normalized === "unauthorized" ||
    normalized === "auth_failed" ||
    normalized === "auth-failed"
  )
    return "unauthorized" as const
  if (normalized === "unsupported") return "unsupported" as const
  if (normalized === "running" || normalized === "pending")
    return "running" as const
  if (normalized === "info" || normalized === "informational")
    return "info" as const
  return "unknown" as const
}

function rollupChildStatus(rows: Array<Record<string, unknown>>) {
  const statuses = rows.map((record) => normalizeHealthStatus(record.status))
  if (
    statuses.includes("fail") ||
    statuses.includes("dispatch_failed") ||
    statuses.includes("unauthorized")
  )
    return "fail" as const
  if (
    statuses.includes("warn") ||
    statuses.includes("stale") ||
    statuses.includes("blocked")
  )
    return "warn" as const
  if (
    statuses.length === 0 ||
    statuses.includes("unknown") ||
    statuses.includes("not_run") ||
    statuses.includes("unsupported") ||
    statuses.includes("running")
  )
    return "unknown" as const
  return "pass" as const
}

function nodeStatusClass(status: string) {
  return childStatusClassName(status.toLowerCase())
}

function normalizeNodeStatus(status: string) {
  const normalized = status.toLowerCase()
  return normalized in childStatusGlyph
    ? (normalized as keyof typeof childStatusGlyph)
    : "unknown"
}

function HealthNodeRows({
  nodes,
  depth = 2,
}: {
  nodes: HealthCheckNodeResult[]
  depth?: number
}) {
  return (
    <div className="border-t border-slate-100 bg-white">
      {nodes.map((node) => {
        const status = normalizeNodeStatus(node.status)
        const childCount = node.children?.length ?? 0
        const prefix = depth <= 2 ? "└" : "↳"
        return (
          <div
            className="border-b border-slate-100 last:border-b-0"
            key={`${depth}:${node.id}`}
          >
            <div
              className={`grid w-full grid-cols-[1.6rem_7rem_1fr_7rem_6rem] items-center gap-2 px-2 py-1 text-[11px] ${node.kind === "component" ? "bg-slate-50 font-semibold" : "bg-white"}`}
              style={{ paddingLeft: `${Math.min(depth, 5) * 0.65 + 0.5}rem` }}
            >
              <span className="flex items-center justify-center text-slate-400">
                {prefix}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${nodeStatusClass(status)}`}
              >
                {childStatusGlyph[status]} {status.toUpperCase()}
              </span>
              <span
                className="min-w-0 truncate text-slate-800"
                title={node.dispatchPath?.join(" › ") ?? node.title}
              >
                {node.kind === "component" ? "Group: " : ""}
                {node.title}
              </span>
              <span
                className="truncate text-slate-500"
                title={locationLabel(node.runLocation)}
              >
                {locationLabel(node.runLocation)}
              </span>
              <span className="truncate text-right text-slate-500">
                {childCount > 0 ? `${childCount} children` : node.kind}
              </span>
            </div>
            {childCount > 0 ? (
              <HealthNodeRows
                depth={Math.min(depth + 1, 6)}
                nodes={node.children ?? []}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function providerRowsToNodes(rows: unknown[]): HealthCheckNodeResult[] {
  const records = rows.map((row) =>
    row && typeof row === "object" ? (row as Record<string, unknown>) : {},
  )
  const groups = records.reduce((acc, record) => {
    const group = String(
      record.group ?? record.component ?? "provider row details",
    )
    const existing = acc.get(group) ?? []
    existing.push(record)
    acc.set(group, existing)
    return acc
  }, new Map<string, Array<Record<string, unknown>>>())
  return Array.from(groups.entries()).map(([group, groupRows]) => ({
    id: group,
    title: group,
    kind: "component",
    status: rollupChildStatus(
      groupRows,
    ).toUpperCase() as HealthCheckNodeResult["status"],
    runLocation: groupRows[0]
      ?.runLocation as HealthCheckNodeResult["runLocation"],
    children: groupRows.map((record, index) => ({
      id: String(record.key ?? index),
      title: String(record.key ?? record.label ?? index),
      kind: "provider-row",
      status: normalizeHealthStatus(
        record.status,
      ).toUpperCase() as HealthCheckNodeResult["status"],
      runLocation: record.runLocation as HealthCheckNodeResult["runLocation"],
      evidence: record.evidence as Record<string, unknown>,
    })),
  }))
}

function ProviderTreeChildren({ check }: { check: HealthCheckResult }) {
  const rows = Array.isArray(check.evidence.providerRows)
    ? check.evidence.providerRows
    : []
  const children =
    check.children && check.children.length > 0
      ? check.children
      : providerRowsToNodes(rows)
  if (children.length === 0) return null
  return <HealthNodeRows nodes={children} />
}

function TreeRollupRow({
  status,
  title,
  meta,
  depth,
  count,
  last,
}: {
  status: keyof typeof statusGlyph
  title: string
  meta?: string
  depth: 0 | 1
  count?: string | number
  last?: string
}) {
  return (
    <div
      className={`grid grid-cols-[1.6rem_7rem_1fr_7rem_6rem] items-center gap-2 border-b border-slate-100 px-2 py-1 text-xs ${depth === 0 ? "bg-slate-100 font-semibold" : "bg-slate-50"}`}
    >
      <span
        className={`text-center ${status === "PASS" ? "text-emerald-600" : status === "FAIL" ? "text-rose-600" : status === "WARN" ? "text-amber-600" : "text-slate-500"}`}
      >
        {depth === 0 ? statusGlyph[status] : "└"}
      </span>
      <span
        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusClassName(status)}`}
      >
        {status}
      </span>
      <span className="min-w-0 truncate" title={title}>
        <span>{title}</span>
        {meta ? (
          <span className="ml-1 font-mono text-[10px] font-normal text-slate-500">
            {meta}
          </span>
        ) : null}
      </span>
      <span className="truncate text-slate-500">{count ?? ""}</span>
      <span className="truncate text-right text-slate-500">{last ?? ""}</span>
    </div>
  )
}

function CheckResultRow({ check }: { check: HealthCheckResult }) {
  const [open, setOpen] = useState(check.status !== "PASS")
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button
        className="grid w-full grid-cols-[1.6rem_7rem_1fr_7rem_6rem] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          className={`text-center ${check.status === "PASS" ? "text-emerald-600" : check.status === "FAIL" ? "text-rose-600" : check.status === "WARN" ? "text-amber-600" : "text-slate-500"}`}
        >
          ├ {statusGlyph[check.status]}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusClassName(check.status)}`}
        >
          {check.status}
        </span>
        <span
          className="min-w-0 truncate font-medium text-slate-800"
          title={check.title}
        >
          {check.title}
        </span>
        <span
          className="truncate text-[11px] text-slate-500"
          title={locationLabel(check.runLocation)}
        >
          {locationLabel(check.runLocation)}
        </span>
        <span className="text-right text-[11px] text-slate-500">
          {check.durationMs} ms
        </span>
      </button>
      <ProviderTreeChildren check={check} />
      {open ? (
        <div className="space-y-2 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {check.failure ? (
            <div className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-800">
              {check.failure.class}: {check.failure.message}
            </div>
          ) : null}
          {check.repairHint ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
              Repair hint: {check.repairHint}
            </div>
          ) : null}
          <ContractMetadata node={check} />
          <ProviderRows evidence={check.evidence} />
          <EvidencePreview value={check.evidence} />
        </div>
      ) : null}
    </div>
  )
}

function HealthTreeChecks({
  checks,
  pendingChecks,
}: {
  checks?: HealthCheckResult[]
  pendingChecks?: HealthProfile["checks"]
}) {
  const renderedChecks = checks ?? []
  const pending = pendingChecks ?? []
  if (renderedChecks.length > 0) {
    const groups = renderedChecks.reduce((acc, check) => {
      const group = check.component ?? "local checks"
      const existing = acc.get(group) ?? []
      existing.push(check)
      acc.set(group, existing)
      return acc
    }, new Map<string, HealthCheckResult[]>())
    return (
      <>
        {Array.from(groups.entries()).map(([group, groupChecks]) => {
          const groupStatus = resultStatus({
            checks: groupChecks,
          } as HealthRunResult)
          return (
            <div
              className="border-t border-slate-100 first:border-t-0"
              key={group}
            >
              <TreeRollupRow
                count={`${groupChecks.length} checks`}
                depth={1}
                last="component"
                meta=""
                status={groupStatus}
                title={`Target/group/component: ${group}`}
              />
              {groupChecks.map((check) => (
                <CheckResultRow check={check} key={check.id} />
              ))}
            </div>
          )
        })}
      </>
    )
  }
  return (
    <>
      {pending.map((check) => (
        <div
          className="grid grid-cols-[1.6rem_7rem_1fr_7rem_6rem] items-center gap-2 px-2 py-1.5 text-xs"
          key={check.id}
        >
          <span className="text-center text-slate-400">├ ○</span>
          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
            PENDING
          </span>
          <span>
            {check.component ? `${check.component}: ` : ""}
            {check.title}
          </span>
          <span
            className="truncate text-slate-500"
            title={locationLabel(check.runLocation ?? check.execution)}
          >
            {locationLabel(check.runLocation ?? check.execution)}
          </span>
          <span />
        </div>
      ))}
    </>
  )
}

export function HealthDashboardScreen({
  apiRootUrl = "/api/health",
}: HealthDashboardScreenProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [selectedProfileId, setSelectedProfileId] = useState(
    queryParam("profileId"),
  )
  const storyboardUrl = queryParam("storyboardUrl")

  async function loadProfiles() {
    setState({ status: "loading" })
    try {
      const response = await fetch(`${apiRootUrl}/profiles`)
      if (!response.ok)
        throw new Error(`Health API returned HTTP ${response.status}`)
      const payload = (await response.json()) as {
        ok: boolean
        profiles: HealthProfileSummary[]
      }
      if (!payload.ok) throw new Error("Health API returned ok=false")
      const profiles = await Promise.all(
        payload.profiles.map(async (summary) => {
          const definitionResponse = await fetch(
            `${apiRootUrl}/profiles/${encodeURIComponent(summary.id)}`,
          )
          if (!definitionResponse.ok)
            throw new Error(
              `Profile ${summary.id} returned HTTP ${definitionResponse.status}`,
            )
          const definitionPayload = (await definitionResponse.json()) as {
            ok: boolean
            profile: HealthProfile
          }
          let latest: HealthRunResult | null = null
          const latestResponse = await fetch(
            `${apiRootUrl}/latest?profileId=${encodeURIComponent(summary.id)}`,
          )
          if (latestResponse.ok) {
            const latestPayload = (await latestResponse.json()) as {
              ok: boolean
              result: HealthRunResult
            }
            latest = latestPayload.ok ? latestPayload.result : null
          }
          return { summary, profile: definitionPayload.profile, latest }
        }),
      )
      setState({ status: "ready", profiles })
      setSelectedProfileId(
        (current) => current || profiles[0]?.profile.id || "",
      )
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  useEffect(() => {
    void loadProfiles()
  }, [apiRootUrl])

  async function runProfile(profileId: string) {
    if (state.status !== "ready") return
    const item = state.profiles.find((entry) => entry.profile.id === profileId)
    if (!item) return
    const overrides: Record<string, string> = [
      "storyboard_source_health",
      "bc_storyboard_dev_dashboard_staging_backend",
      "bc_storyboard_dev_dashboard_docker_backend",
    ].includes(profileId)
      ? { storyboardUrl }
      : {}
    setState({
      status: "ready",
      profiles: state.profiles.map((entry) =>
        entry.profile.id === profileId
          ? { ...entry, running: true, error: null }
          : entry,
      ),
    })
    try {
      const response = await fetch(`${apiRootUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          targetId: "local",
          params: profileParams(item.profile, overrides),
        }),
      })
      const payload = (await response.json()) as {
        ok: boolean
        result?: HealthRunResult
        error?: string
      }
      if (!response.ok || !payload.ok || !payload.result)
        throw new Error(
          payload.error ?? `Health run returned HTTP ${response.status}`,
        )
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              profiles: current.profiles.map((entry) =>
                entry.profile.id === profileId
                  ? { ...entry, latest: payload.result, running: false }
                  : entry,
              ),
            }
          : current,
      )
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              profiles: current.profiles.map((entry) =>
                entry.profile.id === profileId
                  ? {
                      ...entry,
                      running: false,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  : entry,
              ),
            }
          : current,
      )
    }
  }

  const selected = useMemo(() => {
    if (state.status !== "ready") return null
    return (
      state.profiles.find((entry) => entry.profile.id === selectedProfileId) ??
      state.profiles[0] ??
      null
    )
  }, [selectedProfileId, state])

  if (state.status === "loading")
    return (
      <main className="h-full min-h-0 overflow-y-auto bg-slate-50 p-4 text-slate-800">
        Loading health dashboard…
      </main>
    )
  if (state.status === "error")
    return (
      <main className="h-full min-h-0 overflow-y-auto bg-slate-50 p-4 text-rose-800">
        Health Dashboard failed: {state.message}
      </main>
    )

  const sortedProfiles = [...state.profiles].sort(
    (left, right) =>
      statusOrder[resultStatus(left.latest)] -
        statusOrder[resultStatus(right.latest)] ||
      left.profile.id.localeCompare(right.profile.id),
  )

  return (
    <main
      className="h-full min-h-0 overflow-y-auto bg-slate-50 p-3 text-slate-900"
      data-health-dashboard-scroll-root="true"
    >
      <header className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
        <div>
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
            Dashboard feature plugin
          </p>
          <h1 className="m-0 text-xl font-semibold">Health Dashboard</h1>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          Dense profile → target → check hierarchy. Expand one row for evidence
          and repair hints.
        </div>
      </header>

      <div className="grid grid-cols-[minmax(22rem,30rem)_1fr] gap-3">
        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="grid grid-cols-[1.5rem_5rem_1fr_4rem_5rem] gap-1 border-b border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            <span></span>
            <span>Status</span>
            <span>Profile / target</span>
            <span>Checks</span>
            <span>Last</span>
          </div>
          {sortedProfiles.map((entry) => {
            const status = resultStatus(entry.latest)
            const selectedRow = entry.profile.id === selected?.profile.id
            return (
              <button
                className={`grid w-full grid-cols-[1.5rem_5rem_1fr_4rem_5rem] items-center gap-1 border-b border-slate-100 px-2 py-1 text-left text-xs hover:bg-blue-50 ${selectedRow ? "bg-blue-50" : "bg-white"}`}
                key={entry.profile.id}
                onClick={() => setSelectedProfileId(entry.profile.id)}
                type="button"
              >
                <span
                  className={
                    status === "PASS"
                      ? "text-emerald-600"
                      : status === "FAIL"
                        ? "text-rose-600"
                        : status === "WARN"
                          ? "text-amber-600"
                          : "text-slate-500"
                  }
                >
                  {statusGlyph[status]}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusClassName(status)}`}
                >
                  {status}
                </span>
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{entry.profile.title}</span>
                  <span className="ml-1 font-mono text-[10px] text-slate-500">
                    {entry.profile.id}
                  </span>
                </span>
                <span className="text-slate-500">
                  {entry.summary.checkCount}
                </span>
                <span className="truncate text-slate-500">
                  {compactTime(entry.latest?.finishedAt)}
                </span>
              </button>
            )
          })}
        </section>

        <section className="min-w-0 rounded border border-slate-200 bg-white">
          {selected ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-2 py-1 text-xs font-bold ${runStatusClassName(selected.latest?.status ?? "none")}`}
                    >
                      {selected.latest?.status ?? "not run"}
                    </span>
                    <h2 className="m-0 truncate text-base font-semibold">
                      {selected.profile.title}
                    </h2>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      {selected.profile.id}
                    </code>
                  </div>
                  {selected.profile.description ? (
                    <p className="m-0 mt-1 text-xs text-slate-500">
                      {selected.profile.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-blue-700"
                    href={healthViewHref(
                      selected.profile.id,
                      selected.latest?.params ?? selected.profile.params ?? {},
                    )}
                  >
                    Filtered link
                  </a>
                  <button
                    className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50"
                    disabled={!!selected.running}
                    onClick={() => void runProfile(selected.profile.id)}
                    type="button"
                  >
                    {selected.running ? "Running…" : "Run profile"}
                  </button>
                </div>
              </div>
              {selected.error ? (
                <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {selected.error}
                </div>
              ) : null}
              <div className="grid grid-cols-4 gap-2 border-b border-slate-100 px-3 py-2 text-xs">
                <div>
                  <span className="text-slate-500">Target</span>
                  <div className="font-mono text-[11px]">
                    {selected.latest?.targetId ?? "local"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Last checked</span>
                  <div>{selected.latest?.finishedAt ?? "never"}</div>
                </div>
                <div>
                  <span className="text-slate-500">Source URL</span>
                  <div
                    className="truncate font-mono text-[11px]"
                    title={String(
                      selected.latest?.params.storyboardUrl ??
                        selected.profile.params?.storyboardUrl ??
                        "",
                    )}
                  >
                    {String(
                      selected.latest?.params.storyboardUrl ??
                        selected.profile.params?.storyboardUrl ??
                        "—",
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Rows</span>
                  <div>
                    {selected.latest?.checks.length ??
                      selected.profile.checks.length}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[1.6rem_7rem_1fr_7rem_6rem] gap-2 border-b border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <span></span>
                <span>Status</span>
                <span>Health tree</span>
                <span>Vantage</span>
                <span>Last/ms</span>
              </div>
              <div
                className="divide-y divide-slate-100"
                data-health-tree="profile-target-check-provider"
              >
                <TreeRollupRow
                  count={`${selected.latest?.checks.length ?? selected.profile.checks.length} checks`}
                  depth={0}
                  last={compactTime(selected.latest?.finishedAt)}
                  meta={selected.profile.id}
                  status={resultStatus(selected.latest)}
                  title={`Profile: ${selected.profile.title}`}
                />
                <TreeRollupRow
                  count="target"
                  depth={1}
                  last={selected.latest?.targetId ?? "local"}
                  meta={String(
                    selected.latest?.params.storyboardUrl ??
                      selected.profile.params?.storyboardUrl ??
                      selected.profile.sourcePath ??
                      "",
                  )}
                  status={runStatusToTreeStatus(
                    selected.latest?.status ?? "none",
                  )}
                  title={`Target/group: ${selected.latest?.targetId ?? "local"}`}
                />
                <HealthTreeChecks
                  checks={selected.latest?.checks}
                  pendingChecks={selected.profile.checks}
                />
              </div>
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-500">
              No health profiles found.
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
