import { Suspense, lazy, useEffect, useMemo, useState } from "react"

const AgentSwarmScreen = lazy(() =>
  import("@agent-infrastructure/agent-swarm-ui").then((module) => ({
    default: module.AgentSwarmScreen,
  })),
)

const AgentChatScreen = lazy(() =>
  import("@agent-infrastructure/agent-chat-ui").then((module) => ({
    default: module.AgentChatScreen,
  })),
)

const AgentGraphScreen = lazy(() =>
  import("./AgentGraphPlaceholder").then((module) => ({
    default: module.AgentGraphPlaceholder,
  })),
)

type DashboardConfig = {
  ok: boolean
  accessAppUrl: string
  requiresSession: boolean
}

type SessionExchangeResponse = {
  ok: boolean
  sessionToken: string
  expiresAtMs: number
}

type FeatureId = "swarm" | "chat" | "graph"

type FeatureDefinition = {
  id: FeatureId
  label: string
  shortLabel: string
  href: string
  description: string
  component: React.LazyExoticComponent<() => JSX.Element>
}

const sessionStorageKey = "agent-infrastructure.dashboard.session"

const featureDefinitions: FeatureDefinition[] = [
  {
    id: "swarm",
    label: "Agent Swarm",
    shortLabel: "SW",
    href: "/swarm",
    description: "Manager, fleet, registry, and access operations.",
    component: AgentSwarmScreen,
  },
  {
    id: "chat",
    label: "Agent Chat",
    shortLabel: "CH",
    href: "/chat",
    description: "Multi-session chat will live here.",
    component: AgentChatScreen,
  },
  {
    id: "graph",
    label: "Agent Graph",
    shortLabel: "GR",
    href: "/graph",
    description: "Graph exploration and editing.",
    component: AgentGraphScreen,
  },
]

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? ""
}

function featureIdFromPath(pathname: string): FeatureId {
  if (pathname === "/chat") {
    return "chat"
  }

  if (pathname === "/graph") {
    return "graph"
  }

  return "swarm"
}

export function DashboardShell() {
  const [activeFeatureId, setActiveFeatureId] = useState<FeatureId>(() =>
    featureIdFromPath(window.location.pathname),
  )
  const [loadedFeatureIds, setLoadedFeatureIds] = useState<FeatureId[]>([
    featureIdFromPath(window.location.pathname),
  ])
  const [config, setConfig] = useState<DashboardConfig | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState("")
  const [accessMessage, setAccessMessage] = useState("")
  const [authRequired, setAuthRequired] = useState(false)

  const activeFeature = useMemo(
    () =>
      featureDefinitions.find((feature) => feature.id === activeFeatureId) ??
      featureDefinitions[0],
    [activeFeatureId],
  )

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/swarm")
      setActiveFeatureId("swarm")
    }

    function handlePopState() {
      setActiveFeatureId(featureIdFromPath(window.location.pathname))
    }

    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [])

  useEffect(() => {
    setLoadedFeatureIds((currentValue) =>
      currentValue.includes(activeFeatureId)
        ? currentValue
        : [...currentValue, activeFeatureId],
    )
  }, [activeFeatureId])

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      try {
        const configResponse = await fetch("/api/config")
        if (!configResponse.ok) {
          throw new Error("failed to load dashboard config")
        }

        const nextConfig = (await configResponse.json()) as DashboardConfig
        if (cancelled) {
          return
        }

        setConfig(nextConfig)

        const currentUrl = new URL(window.location.href)
        const bootstrapKey = currentUrl.searchParams.get("sessionKey")
        if (bootstrapKey) {
          const exchangeResponse = await fetch("/api/session/exchange", {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({ sessionKey: bootstrapKey }),
          })

          if (!exchangeResponse.ok) {
            throw new Error("failed to exchange dashboard session key")
          }

          const exchangePayload =
            (await exchangeResponse.json()) as SessionExchangeResponse
          window.sessionStorage.setItem(
            sessionStorageKey,
            exchangePayload.sessionToken,
          )
          currentUrl.searchParams.delete("sessionKey")
          window.history.replaceState({}, "", currentUrl.toString())
        }

        if (nextConfig.requiresSession && !readStoredSessionToken()) {
          setAuthRequired(true)
          setAccessMessage(
            "This dashboard requires a valid browser session. Open it from a fresh access link.",
          )
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "failed to initialize dashboard",
          )
        }
      } finally {
        if (!cancelled) {
          setInitializing(false)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [])

  function navigateToFeature(featureId: FeatureId) {
    const nextFeature =
      featureDefinitions.find((feature) => feature.id === featureId) ??
      featureDefinitions[0]

    if (window.location.pathname !== nextFeature.href) {
      window.history.pushState({}, "", nextFeature.href)
    }

    setActiveFeatureId(nextFeature.id)
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-20 shrink-0 flex-col items-center gap-4 border-r border-white/10 bg-slate-950/95 px-3 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-xs font-semibold tracking-[0.24em] text-emerald-200">
          AI
        </div>
        <nav className="mt-4 flex w-full flex-1 flex-col items-center gap-3">
          {featureDefinitions.map((feature) => {
            const isActive = feature.id === activeFeatureId

            return (
              <button
                key={feature.id}
                type="button"
                title={feature.label}
                onClick={() => {
                  navigateToFeature(feature.id)
                }}
                className={[
                  "group flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center transition",
                  isActive
                    ? "bg-white text-slate-950 shadow-lg shadow-cyan-950/40"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                <span className="text-xs font-semibold tracking-[0.22em]">
                  {feature.shortLabel}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em]">
                  {feature.id}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-slate-950/80 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Agent Infrastructure
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {activeFeature.label}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {activeFeature.description}
              </p>
            </div>
            {config?.accessAppUrl ? (
              <button
                type="button"
                onClick={() => {
                  window.location.href = config.accessAppUrl
                }}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                Auth Portal
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {initializing ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                Initializing dashboard shell...
              </div>
            ) : null}
            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
            {accessMessage ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
                {accessMessage}
              </div>
            ) : null}
            {authRequired && config?.accessAppUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">
                <span>Session access is required to use this dashboard.</span>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = config.accessAppUrl
                  }}
                  className="rounded-full border border-cyan-100/30 bg-cyan-50/10 px-4 py-2 font-medium text-cyan-50 transition hover:bg-cyan-50/20"
                >
                  Open Auth Page
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center p-10 text-sm text-slate-400">
                Loading feature...
              </div>
            }
          >
            {loadedFeatureIds.map((featureId) => {
              const feature =
                featureDefinitions.find(
                  (candidate) => candidate.id === featureId,
                ) ?? featureDefinitions[0]
              const FeatureComponent = feature.component

              return (
                <section
                  key={feature.id}
                  className={
                    feature.id === activeFeatureId ? "h-full" : "hidden h-full"
                  }
                >
                  <FeatureComponent />
                </section>
              )
            })}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
