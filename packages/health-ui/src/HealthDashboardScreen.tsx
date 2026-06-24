import { useEffect, useState } from "react"
import type {
  HealthCheckNodeResult,
  HealthCheckResult,
  HealthProfile,
  HealthProfileSummary,
  HealthRunResult,
  HealthRunStatus,
  HealthNodeAction,
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
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-900"
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
  if (status === "warn") return "WARN" as const
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

type HealthTreeNode = {
  id: string
  title: string
  status: keyof typeof statusGlyph
  checkedAt?: string
  summary?: string
  freshness?: string
  meta?: string
  evidence?: unknown
  failure?: HealthCheckResult["failure"] | HealthCheckNodeResult["failure"]
  repairHint?: string | null
  raw?: HealthCheckResult | HealthCheckNodeResult | HealthProfile
  actions?: HealthNodeAction[]
  profileId: string
  targetId: string
  checkIds: string[]
  parentOwnedBy?: string
  disabledReason?: string
  children: HealthTreeNode[]
}

type NodeRunMode = "node" | "subtree" | "failed_children"

function statusFromLower(status: string): keyof typeof statusGlyph {
  switch (normalizeHealthStatus(status)) {
    case "pass":
    case "info":
      return "PASS"
    case "warn":
      return "WARN"
    case "fail":
      return "FAIL"
    case "blocked":
      return "BLOCKED"
    case "not_run":
      return "NOT_RUN"
    case "stale":
      return "STALE"
    case "dispatch_failed":
      return "DISPATCH_FAILED"
    case "unauthorized":
      return "UNAUTHORIZED"
    case "unsupported":
      return "UNSUPPORTED"
    case "running":
      return "RUNNING"
    default:
      return "UNKNOWN"
  }
}

function childStatusToTreeStatus(status: string): keyof typeof statusGlyph {
  return statusFromLower(status)
}

function descendantNodes(node: HealthTreeNode): HealthTreeNode[] {
  return node.children.flatMap((child) => [child, ...descendantNodes(child)])
}

function uniqueCheckIds(nodes: HealthTreeNode[]) {
  return Array.from(
    new Set(nodes.flatMap((node) => node.checkIds).filter(Boolean)),
  )
}

function failedCheckIds(node: HealthTreeNode) {
  return uniqueCheckIds(
    [node, ...descendantNodes(node)].filter((candidate) =>
      [
        "FAIL",
        "WARN",
        "BLOCKED",
        "STALE",
        "DISPATCH_FAILED",
        "UNAUTHORIZED",
      ].includes(candidate.status),
    ),
  )
}

function nodeTooltip(node: HealthTreeNode) {
  return [
    node.title,
    `status: ${node.status}`,
    node.summary ? `summary: ${node.summary}` : "",
    node.freshness ? `freshness: ${node.freshness}` : "",
    node.parentOwnedBy
      ? `dispatch: delegated to parent ${node.parentOwnedBy}`
      : "",
    node.checkedAt ? `checked: ${node.checkedAt}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function checkNodeFromResult(
  check: HealthCheckResult,
  profileId: string,
  targetId: string,
): HealthTreeNode {
  const providerRows = Array.isArray(check.evidence.providerRows)
    ? providerRowsToNodes(check.evidence.providerRows)
    : []
  const childResults =
    check.children && check.children.length > 0 ? check.children : providerRows
  return {
    id: `check:${profileId}:${check.id}`,
    title: check.title,
    status: check.status,
    checkedAt: check.finishedAt ?? check.checkedAt,
    freshness: check.freshness ?? (check.stale ? "stale" : "fresh"),
    summary:
      check.summary ?? check.failure?.message ?? check.repairHint ?? undefined,
    meta: check.component ?? check.checkId,
    evidence: check.evidence,
    failure: check.failure,
    repairHint: check.repairHint,
    raw: check,
    profileId,
    targetId,
    checkIds: [check.id],
    children: childResults.map((child) =>
      childNodeFromResult(child, profileId, targetId, check.id, check.id),
    ),
  }
}

function childNodeFromResult(
  child: HealthCheckNodeResult,
  profileId: string,
  targetId: string,
  parentId: string,
  ownerCheckId: string,
): HealthTreeNode {
  return {
    id: `node:${profileId}:${parentId}:${child.id}`,
    title: child.title,
    status: childStatusToTreeStatus(child.status),
    checkedAt: child.finishedAt ?? child.checkedAt,
    freshness: child.freshness ?? (child.stale ? "stale" : undefined),
    summary:
      child.summary ?? child.failure?.message ?? child.repairHint ?? undefined,
    meta: child.kind,
    evidence: child.evidence,
    failure: child.failure,
    repairHint: child.repairHint,
    raw: child,
    profileId,
    targetId,
    checkIds: [ownerCheckId],
    parentOwnedBy: ownerCheckId,
    children: (child.children ?? []).map((grandchild) =>
      childNodeFromResult(
        grandchild,
        profileId,
        targetId,
        `${parentId}:${child.id}`,
        ownerCheckId,
      ),
    ),
  }
}

function pendingCheckNode(
  check: HealthProfile["checks"][number],
  profileId: string,
  targetId: string,
): HealthTreeNode {
  return {
    id: `pending:${profileId}:${check.id}`,
    title: check.title,
    status: "NOT_RUN",
    summary:
      check.repairHint ??
      "Pending health check; run the parent profile/check for evidence.",
    meta: check.component ?? check.checkId,
    repairHint: check.repairHint,
    raw: check as unknown as HealthProfile,
    profileId,
    targetId,
    checkIds: [check.id],
    children: [],
  }
}

function profileTreeNode(entry: ProfileState): HealthTreeNode {
  const latest = entry.latest
  const targetId = latest?.targetId ?? "local"
  const checkChildren = latest?.checks.length
    ? latest.checks.map((check) =>
        checkNodeFromResult(check, entry.profile.id, targetId),
      )
    : entry.profile.checks.map((check) =>
        pendingCheckNode(check, entry.profile.id, targetId),
      )
  const allCheckIds = entry.profile.checks.map((check) => check.id)
  const targetNode: HealthTreeNode = {
    id: `target:${entry.profile.id}:${targetId}`,
    title: `Target: ${targetId}`,
    status: runStatusToTreeStatus(latest?.status ?? "none"),
    checkedAt: latest?.finishedAt,
    freshness: latest ? "fresh" : "not run",
    summary: `${checkChildren.length} health checks`,
    meta: String(
      latest?.params.storyboardUrl ??
        entry.profile.params?.storyboardUrl ??
        entry.profile.sourcePath ??
        "",
    ),
    evidence: latest?.params,
    profileId: entry.profile.id,
    targetId,
    checkIds: allCheckIds,
    children: checkChildren,
  }
  return {
    id: `profile:${entry.profile.id}`,
    title: entry.profile.title,
    status: resultStatus(latest),
    checkedAt: latest?.finishedAt,
    freshness: latest ? "fresh" : "not run",
    summary: entry.profile.description ?? `${entry.summary.checkCount} checks`,
    meta: entry.profile.id,
    raw: entry.profile,
    profileId: entry.profile.id,
    targetId,
    checkIds: allCheckIds,
    disabledReason:
      allCheckIds.length === 0 ? "Profile has no runnable checks" : undefined,
    children: [targetNode],
  }
}

function InlineNodeDetails({ node }: { node: HealthTreeNode }) {
  const hasDetails =
    !!node.failure ||
    !!node.repairHint ||
    !!node.meta ||
    node.evidence !== undefined ||
    !!node.parentOwnedBy
  if (!hasDetails) return null
  return (
    <div className="ml-8 space-y-2 border-l border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      {node.meta ? (
        <div className="font-mono text-[11px] text-slate-500">{node.meta}</div>
      ) : null}
      {node.parentOwnedBy ? (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-blue-900">
          Dispatch is parent-owned: this subnode reruns parent check{" "}
          <code>{node.parentOwnedBy}</code> instead of bypassing the owning
          health runner.
        </div>
      ) : null}
      {node.failure ? (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-800">
          {node.failure.class}: {node.failure.message}
        </div>
      ) : null}
      {node.repairHint ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
          Repair hint: {node.repairHint}
        </div>
      ) : null}
      {node.raw && "contractVersion" in node.raw ? (
        <ContractMetadata
          node={node.raw as HealthCheckResult | HealthCheckNodeResult}
        />
      ) : null}
      {node.evidence !== undefined ? (
        <EvidencePreview value={node.evidence} />
      ) : null}
    </div>
  )
}

function RunControl({
  label,
  mode,
  title,
  disabledReason,
  running,
  onRun,
}: {
  label: string
  mode: NodeRunMode
  title: string
  disabledReason?: string
  running: boolean
  onRun: () => void
}) {
  const disabled = running || !!disabledReason
  return (
    <button
      className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
      data-run-mode={mode}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        if (!disabled) onRun()
      }}
      title={running ? "Run in progress" : (disabledReason ?? title)}
      type="button"
    >
      {running ? "Running…" : label}
    </button>
  )
}

function NodeRunControls({
  node,
  running,
  runNode,
}: {
  node: HealthTreeNode
  running: boolean
  runNode: (node: HealthTreeNode, mode: NodeRunMode) => void
}) {
  const descendants = descendantNodes(node)
  const hasChildren = node.children.length > 0
  const failedIds = failedCheckIds(node)
  const disabledReason = node.disabledReason
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-1"
      data-health-run-controls={node.id}
    >
      <RunControl
        disabledReason={disabledReason}
        label="Run"
        mode="node"
        onRun={() => runNode(node, "node")}
        running={running}
        title="Run this node through its owning parent dispatcher"
      />
      <RunControl
        disabledReason={
          disabledReason ??
          (!hasChildren
            ? "UNSUPPORTED: leaf node has no child subtree"
            : undefined)
        }
        label="Run subtree"
        mode="subtree"
        onRun={() => runNode(node, "subtree")}
        running={running}
        title={`Run branch/subtree (${descendants.length} descendants) through delegated ownership`}
      />
      <RunControl
        disabledReason={
          disabledReason ??
          (failedIds.length === 0
            ? "NOT_RUN: no failed children in latest result"
            : undefined)
        }
        label="Run failed"
        mode="failed_children"
        onRun={() => runNode(node, "failed_children")}
        running={running}
        title={`Run failed children (${failedIds.length}) through owning parent dispatch`}
      />
    </span>
  )
}

function HealthTreeNodeRow({
  node,
  depth,
  expandedIds,
  toggleExpanded,
  runningNodeIds,
  runNode,
}: {
  node: HealthTreeNode
  depth: number
  expandedIds: Set<string>
  toggleExpanded: (id: string) => void
  runningNodeIds: Set<string>
  runNode: (node: HealthTreeNode, mode: NodeRunMode) => void
}) {
  const expanded = expandedIds.has(node.id)
  const descendants = descendantNodes(node)
  const isLeaf = node.children.length === 0
  return (
    <div
      className="border-b border-slate-100 last:border-b-0"
      data-health-node-id={node.id}
    >
      <div
        className="block w-full px-2 py-1.5 text-left hover:bg-blue-50"
        style={{ paddingLeft: `${Math.min(depth, 8) * 1.15 + 0.5}rem` }}
        title={nodeTooltip(node)}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <button
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.title}`}
            className="w-4 shrink-0 rounded text-center text-slate-500 hover:bg-white hover:text-blue-700"
            onClick={(event) => {
              event.stopPropagation()
              toggleExpanded(node.id)
            }}
            type="button"
          >
            {isLeaf ? "•" : expanded ? "▾" : "▸"}
          </button>
          <span
            className={`${node.status === "PASS" ? "text-emerald-600" : node.status === "FAIL" || node.status === "DISPATCH_FAILED" || node.status === "UNAUTHORIZED" ? "text-rose-600" : node.status === "WARN" || node.status === "BLOCKED" || node.status === "STALE" ? "text-amber-600" : "text-slate-500"}`}
          >
            {statusGlyph[node.status]}
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusClassName(node.status)}`}
          >
            {node.status}
          </span>
          <span
            className="min-w-0 flex-1 select-text truncate font-semibold text-slate-800"
            title={node.title}
          >
            {node.title}
          </span>
          <span className="shrink-0 truncate text-[11px] text-slate-500">
            {compactTime(node.checkedAt)} · {node.freshness ?? "unknown"}
          </span>
          <NodeRunControls
            node={node}
            running={runningNodeIds.has(node.id)}
            runNode={runNode}
          />
        </div>
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1 pl-6">
          {descendants.length > 0 ? (
            descendants.map((descendant) => (
              <button
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-bold ${statusClassName(descendant.status)}`}
                key={descendant.id}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleExpanded(descendant.id)
                }}
                title={nodeTooltip(descendant)}
                type="button"
              >
                {statusGlyph[descendant.status]}
              </button>
            ))
          ) : (
            <span className="select-text text-[11px] text-slate-400">
              leaf — use expander for evidence/log/repair metadata
            </span>
          )}
        </div>
      </div>
      {expanded && isLeaf ? <InlineNodeDetails node={node} /> : null}
      {expanded && !isLeaf ? (
        <div>
          {node.children.map((child) => (
            <HealthTreeNodeRow
              depth={depth + 1}
              expandedIds={expandedIds}
              key={child.id}
              node={child}
              runningNodeIds={runningNodeIds}
              runNode={runNode}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function HealthDashboardScreen({
  apiRootUrl = "/api/health",
}: HealthDashboardScreenProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const initialProfileId = queryParam("profileId")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialProfileId ? [`profile:${initialProfileId}`] : []),
  )
  const [runningNodeIds, setRunningNodeIds] = useState<Set<string>>(
    () => new Set(),
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

  async function runNode(node: HealthTreeNode, mode: NodeRunMode) {
    if (state.status !== "ready") return
    const item = state.profiles.find(
      (entry) => entry.profile.id === node.profileId,
    )
    if (!item) return
    const subtreeIds = uniqueCheckIds([node, ...descendantNodes(node)])
    const checkIds =
      mode === "failed_children" ? failedCheckIds(node) : subtreeIds
    if (checkIds.length === 0) return
    const overrides: Record<string, string> = [
      "storyboard_source_health",
      "bc_storyboard_dev_dashboard_staging_backend",
      "bc_storyboard_dev_dashboard_docker_backend",
    ].includes(node.profileId)
      ? { storyboardUrl }
      : {}
    setRunningNodeIds((current) => new Set(current).add(node.id))
    setState({
      status: "ready",
      profiles: state.profiles.map((entry) =>
        entry.profile.id === node.profileId
          ? { ...entry, running: true, error: null }
          : entry,
      ),
    })
    try {
      const response = await fetch(`${apiRootUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: node.profileId,
          targetId: node.targetId || "local",
          checkIds,
          runMode: mode,
          dispatchPath: [node.profileId, node.targetId || "local", node.id],
          params: {
            ...profileParams(item.profile, overrides),
            requestedNodeId: node.id,
            requestedActionId: mode,
          },
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
              profiles: current.profiles.map((entry) => {
                if (entry.profile.id !== node.profileId) return entry
                const incoming = payload.result as HealthRunResult
                const allProfileChecks = entry.profile.checks.map(
                  (check) => check.id,
                )
                const fullRun = checkIds.length === allProfileChecks.length
                const prior = entry.latest
                const mergedChecks =
                  fullRun || !prior
                    ? incoming.checks
                    : [
                        ...incoming.checks,
                        ...prior.checks.filter(
                          (check) => !checkIds.includes(check.id),
                        ),
                      ]
                const mergedLatest: HealthRunResult =
                  fullRun || !prior
                    ? incoming
                    : {
                        ...prior,
                        checks: mergedChecks,
                        finishedAt: incoming.finishedAt,
                        startedAt: incoming.startedAt,
                        status: resultStatus({
                          checks: mergedChecks,
                        } as HealthRunResult).toLowerCase() as HealthRunStatus,
                      }
                return { ...entry, latest: mergedLatest, running: false }
              }),
            }
          : current,
      )
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              profiles: current.profiles.map((entry) =>
                entry.profile.id === node.profileId
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
    } finally {
      setRunningNodeIds((current) => {
        const next = new Set(current)
        next.delete(node.id)
        return next
      })
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
  const profileNodes = sortedProfiles.map(profileTreeNode)

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
          Single expandable health tree. Each row is a compact card with
          depth-first descendant indicators; hover for summary, click an
          indicator to expand that subcheck.
        </div>
      </header>

      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
          Health profiles / HealthTargets
        </div>
        <div
          className="divide-y divide-slate-100"
          data-health-tree="single-expandable-profile-tree"
        >
          {profileNodes.map((node) => (
            <HealthTreeNodeRow
              depth={0}
              expandedIds={expandedIds}
              key={node.id}
              node={node}
              runningNodeIds={runningNodeIds}
              runNode={runNode}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      </section>
    </main>
  )
}
