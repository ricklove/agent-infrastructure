import { useEffect, useMemo, useState } from "react"

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

export function AgentSwarmScreen() {
  const [health, setHealth] = useState<DashboardHealth | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [error, setError] = useState("")
  const [authMessage, setAuthMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const [healthResponse, workersResponse, servicesResponse] =
          await Promise.all([
            apiFetch("/api/health"),
            apiFetch("/api/workers"),
            apiFetch("/api/services"),
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

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 px-8 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
          Agent Swarm
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Manager dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          This is the first real feature mounted inside the new shell. It still
          talks to the current dashboard backend while the shared gateway and
          namespaced routes are introduced in later increments.
        </p>
      </div>

      <div className="space-y-6 p-8">
        {health?.error ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {health.error}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        {authMessage ? (
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
            {authMessage}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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
              className="rounded-3xl border border-white/10 bg-white/5 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {item.label}
              </p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-white">
                {item.value}
              </p>
            </article>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 className="text-lg font-medium text-white">Fleet</h2>
              <p className="mt-2 text-sm text-slate-400">
                Live worker state from the current manager dashboard API.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Node</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">CPU</th>
                    <th className="px-6 py-4">Memory</th>
                    <th className="px-6 py-4">Heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {workers.length === 0 ? (
                    <tr>
                      <td className="px-6 py-8 text-slate-400" colSpan={6}>
                        No workers are currently connected.
                      </td>
                    </tr>
                  ) : (
                    workers.map((worker) => (
                      <tr key={worker.workerId} className="align-top">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-white">
                              {worker.workerId}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {worker.instanceId}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          {worker.nodeRole}
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-200">
                            {worker.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          {worker.lastMetrics
                            ? `${worker.lastMetrics.cpuPercent.toFixed(1)}%`
                            : "--"}
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          {worker.lastMetrics
                            ? `${formatBytes(worker.lastMetrics.memoryUsedBytes)} / ${formatBytes(worker.lastMetrics.memoryTotalBytes)}`
                            : "--"}
                        </td>
                        <td className="px-6 py-4 text-slate-400">
                          {formatTimestamp(worker.lastHeartbeatAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 className="text-lg font-medium text-white">Registry</h2>
              <p className="mt-2 text-sm text-slate-400">
                Registered services currently exposed by the manager.
              </p>
            </div>
            <div className="space-y-3 p-6">
              {services.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                  No services are currently registered.
                </div>
              ) : (
                services.map((service) => (
                  <article
                    key={`${service.namespace}/${service.serviceName}/${service.instanceId}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">
                          {service.namespace}/{service.serviceName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {service.instanceId}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-200">
                        {service.healthy ? "healthy" : "unhealthy"}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm text-slate-300">
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

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-medium text-white">
              Current Backend Shape
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This feature still uses the existing dashboard routes:
              <code className="ml-2 rounded bg-white/5 px-2 py-1 text-slate-200">
                /api/health
              </code>
              ,
              <code className="ml-2 rounded bg-white/5 px-2 py-1 text-slate-200">
                /api/workers
              </code>
              , and
              <code className="ml-2 rounded bg-white/5 px-2 py-1 text-slate-200">
                /api/services
              </code>
              .
            </p>
          </article>
          <article className="rounded-3xl border border-dashed border-emerald-400/35 bg-emerald-400/5 p-6">
            <h2 className="text-lg font-medium text-emerald-50">
              Next Increment
            </h2>
            <p className="mt-3 text-sm leading-6 text-emerald-50/80">
              Move this feature behind namespaced shell routes and a shared Bun
              gateway so the frontend can target `/api/agent-swarm/*` and
              `/ws/agent-swarm/*` without knowing where the actual manager
              service is running.
            </p>
          </article>
        </section>
      </div>
    </div>
  )
}
