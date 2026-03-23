import { useEffect, useMemo, useRef, useState } from "react"

type DashboardHealth = {
  ok: boolean
  dashboard?: {
    port: number
  }
  manager?: {
    ok: boolean
    connectedWorkers: number
    staleWorkers: number
  }
  error?: string
}

type Worker = {
  workerId: string
  instanceId: string
  privateIp: string
  nodeRole: "manager" | "worker"
  status: string
  lastHeartbeatAt: number
  lastMetrics: {
    cpuPercent: number
    memoryUsedBytes: number
    memoryTotalBytes: number
    memoryPercent: number
    containerCount: number
  } | null
}

type WorkersResponse = {
  workers: Worker[]
}

type TimelineHostSample = {
  tsMs: number
  cpuPercent: number
  memoryPercent: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  containerCount: number
}

type TimelineProcessSample = {
  tsMs: number
  ranking: "cpu" | "memory"
  rank: number
  pid: number
  comm: string
  state: string
  cpuPercent: number
  rssBytes: number
}

type WorkerTimelineResponse = {
  ok: boolean
  workerId: string
  sinceTsMs: number
  hostSamples: TimelineHostSample[]
  processSamples: TimelineProcessSample[]
}

type Service = {
  namespace: string
  serviceName: string
  instanceId: string
  workerId: string
  workerPrivateIp: string
  hostPort: number
  containerPort: number
  protocol: string
  healthy: boolean
  updatedAtMs: number
}

type ServicesResponse = {
  ok: boolean
  rootNamespace: string
  services: Service[]
}

const sessionStorageKey = "agent-infrastructure.dashboard.session"

export type AgentSwarmScreenProps = {
  apiRootUrl?: string
}

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? ""
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const sessionToken = readStoredSessionToken()

  if (sessionToken) {
    headers.set("x-dashboard-session", sessionToken)
  }

  return fetch(path, {
    ...init,
    headers,
  })
}

function featurePath(apiRootUrl: string, pathname: string): string {
  const trimmedRoot = apiRootUrl.replace(/\/+$/, "")
  const trimmedPath = pathname.replace(/^\/+/, "")
  return `${trimmedRoot}/${trimmedPath}`
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let index = 0

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }

  if (minutes < 24 * 60) {
    const hours = minutes / 60
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
  }

  const days = minutes / (24 * 60)
  if (days < 30) {
    return Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`
  }

  if (days < 365) {
    const months = days / 30
    return Number.isInteger(months)
      ? `${months}mo`
      : `${months.toFixed(1)}mo`
  }

  const years = days / 365
  return Number.isInteger(years) ? `${years}y` : `${years.toFixed(1)}y`
}

type ChartLayout = {
  width: number
  height: number
  padLeft: number
  padRight: number
  padTop: number
  padBottom: number
}

function createChartLayout(width: number): ChartLayout {
  return {
    width,
    height: 180,
    padLeft: 42,
    padRight: 10,
    padTop: 10,
    padBottom: 22,
  }
}

const defaultChartLayout = createChartLayout(820)

function chartInnerWidth(layout: ChartLayout): number {
  return layout.width - layout.padLeft - layout.padRight
}

function chartInnerHeight(layout: ChartLayout): number {
  return layout.height - layout.padTop - layout.padBottom
}

function linePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ""
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")
}

function buildSeriesPath(
  values: number[],
  maxValue: number,
  layout: ChartLayout,
): string {
  if (values.length === 0 || maxValue <= 0) {
    return ""
  }

  const lastIndex = Math.max(values.length - 1, 1)
  const innerWidth = chartInnerWidth(layout)
  const innerHeight = chartInnerHeight(layout)
  const points = values.map((value, index) => ({
    x: layout.padLeft + (index / lastIndex) * innerWidth,
    y:
      layout.padTop +
      innerHeight -
      (Math.max(value, 0) / maxValue) * innerHeight,
  }))

  return linePath(points)
}

function guideLineY(value: number, maxValue: number, layout: ChartLayout): number {
  const innerHeight = chartInnerHeight(layout)
  return (
    layout.padTop +
    innerHeight -
    (Math.max(value, 0) / Math.max(maxValue, 1)) * innerHeight
  )
}

function formatAxisValue(value: number, suffix: "%" | "memory"): string {
  if (suffix === "%") {
    return `${Math.round(value)}%`
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`
  }

  return `${Math.round(value)} MB`
}

function chartGuideValues(maxValue: number): [number, number, number] {
  return [maxValue, maxValue / 2, 0]
}

function formatTimeAxisLabel(timestamp: number, rangeMinutes: number): string {
  const date = new Date(timestamp)

  if (rangeMinutes <= 6 * 60) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
  }

  if (rangeMinutes <= 24 * 60) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  if (rangeMinutes <= 90 * 24 * 60) {
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })
  }

  return date.toLocaleDateString([], {
    month: "short",
    year: "numeric",
  })
}

const timelineRangeOptions = [
  15,
  30,
  60,
  180,
  720,
  1440,
  10080,
  43200,
  129600,
  262800,
  525600,
]

function colorForSeries(key: string): string {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 72%, 60%)`
}

function formatProcessSeriesLabel(sample: TimelineProcessSample): string {
  return `${sample.comm} (${sample.pid})`
}

export function AgentSwarmScreen({
  apiRootUrl = "/api/agent-swarm",
}: AgentSwarmScreenProps) {
  const [health, setHealth] = useState<DashboardHealth | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedWorkerId, setSelectedWorkerId] = useState("")
  const [timelineRangeMinutes, setTimelineRangeMinutes] = useState(30)
  const [timeline, setTimeline] = useState<WorkerTimelineResponse | null>(null)
  const [error, setError] = useState("")
  const [authMessage, setAuthMessage] = useState("")
  const [chartWidth, setChartWidth] = useState(defaultChartLayout.width)
  const chartMeasureRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const [healthResponse, workersResponse, servicesResponse] =
          await Promise.all([
            apiFetch(featurePath(apiRootUrl, "health")),
            apiFetch(featurePath(apiRootUrl, "workers")),
            apiFetch(featurePath(apiRootUrl, "services")),
          ])

        if (
          healthResponse.status === 401 ||
          workersResponse.status === 401 ||
          servicesResponse.status === 401
        ) {
          window.sessionStorage.removeItem(sessionStorageKey)
          setAuthMessage(
            "Dashboard access expired. Refresh from the auth portal to continue.",
          )
          return
        }

        if (!healthResponse.ok || !workersResponse.ok || !servicesResponse.ok) {
          throw new Error("failed to load swarm status")
        }

        const nextHealth = (await healthResponse.json()) as DashboardHealth
        const nextWorkers = (await workersResponse.json()) as WorkersResponse
        const nextServices = (await servicesResponse.json()) as ServicesResponse

        if (cancelled) {
          return
        }

        setHealth(nextHealth)
        setWorkers(nextWorkers.workers)
        setServices(nextServices.services)
        setAuthMessage("")
        setError("")
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "failed to refresh swarm data",
          )
        }
      }
    }

    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [apiRootUrl])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const apiReady = Boolean(health) && !error
    window.dispatchEvent(
      new CustomEvent("dashboard-feature-status", {
        detail: {
          featureId: "swarm",
          items: [
            {
              label: "API",
              value: apiReady ? "ready" : error ? "error" : "loading",
              tone: apiReady ? "good" : error ? "bad" : "warn",
            },
          ],
        },
      }),
    )
  }, [error, health])

  useEffect(() => {
    if (!selectedWorkerId && workers.length > 0) {
      setSelectedWorkerId(workers[0]?.workerId ?? "")
      return
    }

    if (
      selectedWorkerId &&
      !workers.some((worker) => worker.workerId === selectedWorkerId)
    ) {
      setSelectedWorkerId(workers[0]?.workerId ?? "")
    }
  }, [selectedWorkerId, workers])

  useEffect(() => {
    if (!selectedWorkerId) {
      setTimeline(null)
      return
    }

    let cancelled = false

    async function refreshTimeline() {
      try {
        const response = await apiFetch(
          featurePath(
            apiRootUrl,
            `workers/timeline?workerId=${encodeURIComponent(selectedWorkerId)}&rangeMinutes=${timelineRangeMinutes}`,
          ),
        )

        if (response.status === 401) {
          window.sessionStorage.removeItem(sessionStorageKey)
          setAuthMessage(
            "Dashboard access expired. Refresh from the auth portal to continue.",
          )
          return
        }

        if (!response.ok) {
          throw new Error("failed to load worker timeline")
        }

        const nextTimeline = (await response.json()) as WorkerTimelineResponse
        if (!cancelled) {
          setTimeline(nextTimeline)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "failed to load worker timeline",
          )
        }
      }
    }

    void refreshTimeline()
    const interval = window.setInterval(() => {
      void refreshTimeline()
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [apiRootUrl, selectedWorkerId, timelineRangeMinutes])

  useEffect(() => {
    const container = chartMeasureRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.max(
        Math.floor(entries[0]?.contentRect.width ?? defaultChartLayout.width),
        320,
      )
      setChartWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      )
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  const summary = useMemo(() => {
    const connectedWorkers = workers.filter(
      (worker) => worker.status === "connected",
    )
    const staleWorkers = workers.filter((worker) => worker.status === "stale")
    const managerNodes = workers.filter(
      (worker) => worker.nodeRole === "manager",
    )
    const workerNodes = workers.filter((worker) => worker.nodeRole === "worker")
    const healthyServices = services.filter((service) => service.healthy)

    return {
      connectedCount: connectedWorkers.length,
      staleCount: staleWorkers.length,
      managerCount: managerNodes.length,
      workerCount: workerNodes.length,
      healthyServiceCount: healthyServices.length,
    }
  }, [services, workers])

  const dashboardPortLabel = health?.dashboard?.port
    ? String(health.dashboard.port)
    : "--"

  const chartLayout = useMemo(() => createChartLayout(chartWidth), [chartWidth])

  const timelineCharts = useMemo(() => {
    const hostSamples = timeline?.hostSamples ?? []
    const processSamples = timeline?.processSamples ?? []

    const cpuPath = buildSeriesPath(
      hostSamples.map((sample) => sample.cpuPercent),
      100,
      chartLayout,
    )
    const memoryPath = buildSeriesPath(
      hostSamples.map((sample) => sample.memoryPercent),
      100,
      chartLayout,
    )

    function buildProcessRankingSeries(
      ranking: "cpu" | "memory",
      valueSelector: (sample: TimelineProcessSample) => number,
    ) {
      const rankingSamples = processSamples.filter(
        (sample) => sample.ranking === ranking,
      )
      const timestamps = Array.from(
        new Set(rankingSamples.map((sample) => sample.tsMs)),
      ).sort((left, right) => left - right)
      const seriesMap = new Map<
        string,
        {
          label: string
          color: string
          values: number[]
          maxValue: number
        }
      >()

      rankingSamples.forEach((sample) => {
        const key = `${sample.comm}:${sample.pid}`
        const timestampIndex = timestamps.indexOf(sample.tsMs)
        if (timestampIndex < 0) {
          return
        }

        const existing = seriesMap.get(key) ?? {
          label: formatProcessSeriesLabel(sample),
          color: colorForSeries(`${ranking}:${key}`),
          values: new Array(timestamps.length).fill(0),
          maxValue: 0,
        }
        const nextValue = valueSelector(sample)
        existing.values[timestampIndex] = nextValue
        existing.maxValue = Math.max(existing.maxValue, nextValue)
        seriesMap.set(key, existing)
      })

      const topSeries = Array.from(seriesMap.values())
        .sort((left, right) => right.maxValue - left.maxValue)
        .slice(0, 6)

      const maxValue =
        ranking === "cpu"
          ? Math.max(
              100,
              ...topSeries.flatMap((series) => series.values),
            )
          : Math.max(
              1,
              ...topSeries.flatMap((series) => series.values),
            )

      return {
        maxValue,
        lines: topSeries.map((series) => ({
          label: series.label,
          color: series.color,
          path: buildSeriesPath(series.values, maxValue, chartLayout),
          maxValue: series.maxValue,
        })),
      }
    }

    const cpuProcesses = buildProcessRankingSeries(
      "cpu",
      (sample) => sample.cpuPercent,
    )
    const memoryProcesses = buildProcessRankingSeries(
      "memory",
      (sample) => sample.rssBytes / (1024 * 1024),
    )

    return {
      layout: chartLayout,
      cpuPath,
      memoryPath,
      cpuProcesses,
      memoryProcesses,
      lastHostSample: hostSamples[hostSamples.length - 1] ?? null,
    }
  }, [chartLayout, timeline])

  const timelineAxisLabels = useMemo(() => {
    const startTsMs = timeline?.sinceTsMs ?? Date.now() - timelineRangeMinutes * 60 * 1000
    const endTsMs = startTsMs + timelineRangeMinutes * 60 * 1000
    const middleTsMs = startTsMs + (endTsMs - startTsMs) / 2

    return [
      { label: formatTimeAxisLabel(startTsMs, timelineRangeMinutes), x: chartLayout.padLeft, anchor: "start" as const },
      {
        label: formatTimeAxisLabel(middleTsMs, timelineRangeMinutes),
        x: chartLayout.padLeft + chartInnerWidth(chartLayout) / 2,
        anchor: "middle" as const,
      },
      {
        label: formatTimeAxisLabel(endTsMs, timelineRangeMinutes),
        x: chartLayout.width - chartLayout.padRight,
        anchor: "end" as const,
      },
    ]
  }, [chartLayout, timeline?.sinceTsMs, timelineRangeMinutes])

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="grid gap-3 border-b border-white/10 bg-[#0b1118] px-5 py-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
            Swarm Console
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Manager control surface
            </h2>
            <span className="text-sm text-slate-500">polling every 5s</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Live fleet state, service registry, and dashboard health backed by
            the current manager runtime.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "port", value: dashboardPortLabel },
            { label: "connected", value: String(summary.connectedCount) },
            { label: "services", value: String(services.length) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {health?.error ? (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
            {health.error}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}
        {authMessage ? (
          <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-50">
            {authMessage}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[
            {
              label: "Manager",
              value: health?.manager?.ok ? "Healthy" : "Unavailable",
            },
            {
              label: "Fleet Nodes",
              value: String(workers.length),
            },
            {
              label: "Worker Nodes",
              value: String(summary.workerCount),
            },
            {
              label: "Manager Nodes",
              value: String(summary.managerCount),
            },
            {
              label: "Connected",
              value: String(summary.connectedCount),
            },
            {
              label: "Healthy Services",
              value: String(summary.healthyServiceCount),
            },
          ].map((item) => (
            <article
              key={item.label}
              className="rounded-2xl border border-white/10 bg-[#111826] px-4 py-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {item.value}
              </p>
            </article>
          ))}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_380px]">
          <section className="rounded-2xl border border-white/10 bg-[#0f1724]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
                  Fleet
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  live worker inventory
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <span>{summary.managerCount} manager</span>
                <span className="text-slate-700">/</span>
                <span>{summary.workerCount} worker</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Node</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">CPU</th>
                    <th className="px-4 py-3">Memory</th>
                    <th className="px-4 py-3">Heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {workers.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-slate-400" colSpan={6}>
                        No workers are currently connected.
                      </td>
                    </tr>
                  ) : (
                    workers.map((worker) => (
                      <tr key={worker.workerId} className="align-top">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {worker.workerId}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {worker.instanceId}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {worker.nodeRole}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-200">
                            {worker.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {worker.lastMetrics
                            ? `${worker.lastMetrics.cpuPercent.toFixed(1)}%`
                            : "--"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {worker.lastMetrics
                            ? `${formatBytes(worker.lastMetrics.memoryUsedBytes)} / ${formatBytes(worker.lastMetrics.memoryTotalBytes)}`
                            : "--"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {formatTimestamp(worker.lastHeartbeatAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0f1724]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
                  Registry
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  active service endpoints
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
                {summary.healthyServiceCount}/{services.length} healthy
              </span>
            </div>
            <div className="space-y-2 p-4">
              {services.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                  No services are currently registered.
                </div>
              ) : (
                services.map((service) => (
                  <article
                    key={`${service.namespace}/${service.serviceName}/${service.instanceId}`}
                    className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {service.namespace}/{service.serviceName}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {service.instanceId}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-200">
                        {service.healthy ? "healthy" : "unhealthy"}
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-1.5 text-sm text-slate-300">
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Worker</dt>
                        <dd>{service.workerId}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Endpoint</dt>
                        <dd>
                          {service.workerPrivateIp}:{service.hostPort}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Protocol</dt>
                        <dd>{service.protocol}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Updated</dt>
                        <dd>{formatTimestamp(service.updatedAtMs)}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#0f1724]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
                Machine Timeline
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Host CPU and RAM with sparse top-process sampling.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                onChange={(event) => setSelectedWorkerId(event.target.value)}
                value={selectedWorkerId}
              >
                {workers.map((worker) => (
                  <option key={worker.workerId} value={worker.workerId}>
                    {worker.workerId}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                onChange={(event) =>
                  setTimelineRangeMinutes(Number(event.target.value))
                }
                value={timelineRangeMinutes}
              >
                {timelineRangeOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatRelativeMinutes(minutes)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedWorkerId ? (
            <div className="px-4 py-8 text-sm text-slate-400">
              No worker selected.
            </div>
          ) : !timeline ? (
            <div className="px-4 py-8 text-sm text-slate-400">
              Loading timeline…
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <article className="rounded-2xl border border-white/10 bg-[#111826] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Host Utilization
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      CPU and memory percent for {timeline.workerId}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>
                      CPU {timelineCharts.lastHostSample?.cpuPercent.toFixed(1) ?? "--"}%
                    </div>
                    <div>
                      RAM{" "}
                      {timelineCharts.lastHostSample?.memoryPercent.toFixed(1) ??
                        "--"}
                      %
                    </div>
                  </div>
                </div>
                <div ref={chartMeasureRef} className="mt-4">
                  <svg
                    className="block"
                    height={timelineCharts.layout.height}
                    viewBox={`0 0 ${timelineCharts.layout.width} ${timelineCharts.layout.height}`}
                    width={timelineCharts.layout.width}
                  >
                    <rect
                      fill="none"
                      height={chartInnerHeight(timelineCharts.layout)}
                      opacity="0.8"
                      rx="12"
                      ry="12"
                      stroke="rgba(148, 163, 184, 0.18)"
                      strokeWidth="1"
                      width={chartInnerWidth(timelineCharts.layout)}
                      x={timelineCharts.layout.padLeft}
                      y={timelineCharts.layout.padTop}
                    />
                    {chartGuideValues(100).map((value) => (
                      <g key={`host-guide-${value}`}>
                        <line
                          stroke={value === 100 ? "rgba(248, 250, 252, 0.30)" : "rgba(148, 163, 184, 0.18)"}
                          strokeDasharray={value === 100 ? undefined : "4 4"}
                          strokeWidth={value === 100 ? "1.2" : "1"}
                          x1={timelineCharts.layout.padLeft}
                          x2={timelineCharts.layout.width - timelineCharts.layout.padRight}
                          y1={guideLineY(value, 100, timelineCharts.layout)}
                          y2={guideLineY(value, 100, timelineCharts.layout)}
                        />
                        <text
                          fill="rgba(148, 163, 184, 0.9)"
                          fontSize="11"
                          textAnchor="end"
                          x={timelineCharts.layout.padLeft - 8}
                          y={guideLineY(value, 100, timelineCharts.layout) + 4}
                        >
                          {formatAxisValue(value, "%")}
                        </text>
                      </g>
                    ))}
                    <path
                      d={timelineCharts.memoryPath}
                      fill="none"
                      opacity="0.95"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                    />
                    <path
                      d={timelineCharts.cpuPath}
                      fill="none"
                      opacity="0.95"
                      stroke="#34d399"
                      strokeWidth="2.5"
                    />
                    {timelineAxisLabels.map((item) => (
                      <text
                        key={`host-axis-${item.anchor}-${item.label}`}
                        fill="rgba(148, 163, 184, 0.9)"
                        fontSize="11"
                        textAnchor={item.anchor}
                        x={item.x}
                        y={timelineCharts.layout.height - 4}
                      >
                        {item.label}
                      </text>
                    ))}
                  </svg>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    CPU
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    RAM
                  </span>
                </div>
              </article>

              {[
                {
                  title: "Top Process CPU",
                  subtitle: "Top CPU-ranked processes over time",
                  lines: timelineCharts.cpuProcesses.lines,
                  suffix: "%",
                },
                {
                  title: "Top Process Memory",
                  subtitle: "Top RSS-ranked processes over time",
                  lines: timelineCharts.memoryProcesses.lines,
                  suffix: " MB",
                },
              ].map((chart) => (
                <article
                  key={chart.title}
                  className="rounded-2xl border border-white/10 bg-[#111826] p-4"
                >
                  <h3 className="text-sm font-semibold text-white">{chart.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{chart.subtitle}</p>
                  <div className="mt-4 overflow-x-auto">
                    <svg
                      className="block"
                      height={timelineCharts.layout.height}
                      viewBox={`0 0 ${timelineCharts.layout.width} ${timelineCharts.layout.height}`}
                      width={timelineCharts.layout.width}
                    >
                      <rect
                        fill="none"
                        height={chartInnerHeight(timelineCharts.layout)}
                        opacity="0.8"
                        rx="12"
                        ry="12"
                        stroke="rgba(148, 163, 184, 0.18)"
                        strokeWidth="1"
                        width={chartInnerWidth(timelineCharts.layout)}
                        x={timelineCharts.layout.padLeft}
                        y={timelineCharts.layout.padTop}
                      />
                      {chartGuideValues(
                        chart.title === "Top Process CPU"
                          ? Math.max(chart.lines.reduce((maxValue, line) => Math.max(maxValue, line.maxValue), 100), 100)
                          : Math.max(chart.lines.reduce((maxValue, line) => Math.max(maxValue, line.maxValue), 1), 1),
                      ).map((value) => (
                        <g key={`${chart.title}-guide-${value}`}>
                          <line
                            stroke={value > 0 ? "rgba(148, 163, 184, 0.18)" : "rgba(248, 250, 252, 0.30)"}
                            strokeDasharray={value > 0 ? "4 4" : undefined}
                            strokeWidth={value > 0 ? "1" : "1.2"}
                            x1={timelineCharts.layout.padLeft}
                            x2={timelineCharts.layout.width - timelineCharts.layout.padRight}
                            y1={guideLineY(
                              value,
                              chart.title === "Top Process CPU"
                                ? timelineCharts.cpuProcesses.maxValue
                                : timelineCharts.memoryProcesses.maxValue,
                              timelineCharts.layout,
                            )}
                            y2={guideLineY(
                              value,
                              chart.title === "Top Process CPU"
                                ? timelineCharts.cpuProcesses.maxValue
                                : timelineCharts.memoryProcesses.maxValue,
                              timelineCharts.layout,
                            )}
                          />
                          <text
                            fill="rgba(148, 163, 184, 0.9)"
                            fontSize="11"
                            textAnchor="end"
                            x={timelineCharts.layout.padLeft - 8}
                            y={
                              guideLineY(
                                value,
                                chart.title === "Top Process CPU"
                                  ? timelineCharts.cpuProcesses.maxValue
                                  : timelineCharts.memoryProcesses.maxValue,
                                timelineCharts.layout,
                              ) + 4
                            }
                          >
                            {formatAxisValue(
                              value,
                              chart.title === "Top Process CPU" ? "%" : "memory",
                            )}
                          </text>
                        </g>
                      ))}
                      {chart.lines.map((line) => (
                        <path
                          key={line.label}
                          d={line.path}
                          fill="none"
                          opacity="0.95"
                          stroke={line.color}
                          strokeWidth="2.25"
                        />
                      ))}
                      {timelineAxisLabels.map((item) => (
                        <text
                          key={`${chart.title}-axis-${item.anchor}-${item.label}`}
                          fill="rgba(148, 163, 184, 0.9)"
                          fontSize="11"
                          textAnchor={item.anchor}
                          x={item.x}
                          y={timelineCharts.layout.height - 4}
                        >
                          {item.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {chart.lines.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        {timelineRangeMinutes > 7 * 24 * 60
                          ? "No process samples available for this window. Process history is currently retained for the recent crash-analysis window only."
                          : "No process samples yet for this window."}
                      </div>
                    ) : (
                      chart.lines.map((line) => (
                        <div
                          key={line.label}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: line.color }}
                            />
                            <span className="truncate">{line.label}</span>
                          </span>
                          <span className="shrink-0 text-slate-400">
                            {line.maxValue.toFixed(chart.suffix === "%" ? 1 : 0)}
                            {chart.suffix}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
