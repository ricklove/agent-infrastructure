import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { useEffect, useMemo, useState } from "react"

type StackAdminScreenProps = {
  apiRootUrl?: string
}

type ManagedStackRecord = {
  stackName: string
  stackStatus: string
  managerInstanceId: string
  managerPrivateIp: string
  dashboardAccessUrl: string
  dashboardHostname: string | null
  manager: {
    instanceState: string
    systemStatus: string | null
    instanceStatus: string | null
    ssmPingStatus: string | null
    lastSsmPingAt: string | null
  }
  dashboard: {
    reachable: boolean
    httpStatus: number | null
  }
}

type StackAdminResponse = {
  ok: boolean
  stacks: ManagedStackRecord[]
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Unknown"
  }
  return new Date(value).toLocaleString()
}

function statusTone(value: boolean | string | null): string {
  if (value === true || value === "ok" || value === "running" || value === "Online") {
    return "text-emerald-300"
  }
  if (value === false || value === "ConnectionLost") {
    return "text-rose-300"
  }
  if (value === "pending" || value === "stopping" || value === "stopped") {
    return "text-amber-200"
  }
  return "text-slate-300"
}

export function StackAdminScreen({
  apiRootUrl = "/api/stack-admin",
}: StackAdminScreenProps) {
  useRenderCounter("StackAdminScreen")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [stacks, setStacks] = useState<ManagedStackRecord[]>([])
  const stackCount = stacks.length

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError("")
        const response = (await dashboardSessionFetch(
          `${apiRootUrl}/stacks`,
        )) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as StackAdminResponse
        if (!cancelled) {
          setStacks(payload.stacks)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error ? nextError.message : String(nextError),
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [apiRootUrl])

  const summary = useMemo(() => {
    const running = stacks.filter(
      (stack) => stack.manager.instanceState === "running",
    ).length
    const reachable = stacks.filter((stack) => stack.dashboard.reachable).length
    const ssmOnline = stacks.filter(
      (stack) => stack.manager.ssmPingStatus === "Online",
    ).length

    return { running, reachable, ssmOnline }
  }, [stacks])

  return (
    <main className="h-full overflow-auto bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 px-6 py-8 md:px-10">
        <section className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.96)_42%,rgba(15,23,42,0.98))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200/80">
            Stack Admin
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Deployed manager stacks
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
            This surface inventories manager stacks, their manager-instance health,
            SSM reachability, and whether each public dashboard is currently reachable.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-slate-300">
            <span>{stackCount} stacks</span>
            <span>{summary.running} running</span>
            <span>{summary.ssmOnline} SSM online</span>
            <span>{summary.reachable} dashboards reachable</span>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-sm text-slate-300">
            Loading stack inventory…
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-5 text-sm text-rose-200">
            {error}
          </section>
        ) : null}

        {!loading && !error ? (
          <section className="grid gap-4">
            {stacks.map((stack) => (
              <article
                key={stack.stackName}
                className="rounded-2xl border border-white/10 bg-slate-900/75 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {stack.stackName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {stack.managerInstanceId} · {stack.managerPrivateIp}
                    </p>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">
                    CloudFormation {stack.stackStatus}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-white/8 bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Instance
                    </div>
                    <div
                      className={`mt-2 text-sm font-semibold ${statusTone(
                        stack.manager.instanceState,
                      )}`}
                    >
                      {stack.manager.instanceState}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      system: {stack.manager.systemStatus ?? "unknown"}
                    </div>
                    <div className="text-xs text-slate-400">
                      instance: {stack.manager.instanceStatus ?? "unknown"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      SSM
                    </div>
                    <div
                      className={`mt-2 text-sm font-semibold ${statusTone(
                        stack.manager.ssmPingStatus,
                      )}`}
                    >
                      {stack.manager.ssmPingStatus ?? "Unknown"}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      last ping: {formatTimestamp(stack.manager.lastSsmPingAt)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Dashboard
                    </div>
                    <div
                      className={`mt-2 text-sm font-semibold ${statusTone(
                        stack.dashboard.reachable,
                      )}`}
                    >
                      {stack.dashboard.reachable ? "Reachable" : "Unavailable"}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      HTTP {stack.dashboard.httpStatus ?? "n/a"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-slate-950/70 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Links
                    </div>
                    <div className="mt-2 flex flex-col gap-2 text-sm">
                      <a
                        className="text-emerald-300 hover:text-emerald-200"
                        href={stack.dashboardAccessUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Access URL
                      </a>
                      {stack.dashboardHostname ? (
                        <a
                          className="text-emerald-300 hover:text-emerald-200"
                          href={`https://${stack.dashboardHostname}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Dashboard host
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  )
}
