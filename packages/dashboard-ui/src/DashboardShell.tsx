import { Suspense, lazy, useEffect, useMemo, useState } from "react"

const AgentSwarmScreen = lazy(() =>
  import("@agent-infrastructure/agent-swarm-ui").then((module) => ({
    default: function LazyAgentSwarmScreen() {
      return <module.AgentSwarmScreen apiRootUrl="/api/agent-swarm" />
    },
  })),
)

const AgentChatScreen = lazy(() =>
  import("@agent-infrastructure/agent-chat-ui").then((module) => ({
    default: module.AgentChatScreen,
  })),
)

const AgentGraphFeatureScreen = lazy(() =>
  import("@agent-infrastructure/agent-graph-ui").then((module) => ({
    default: function DashboardAgentGraphScreen() {
      return (
        <module.AgentGraphScreen
          appVersion="dashboard-shell"
          apiRootUrl={`${window.location.origin}/api/agent-graph`}
          wsRootUrl={`${window.location.origin.replace(/^http/, "ws")}/ws/agent-graph`}
        />
      )
    },
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
  href: string
  description: string
  component: React.LazyExoticComponent<() => JSX.Element>
  icon: (props: { className?: string }) => JSX.Element
}

const sessionStorageKey = "agent-infrastructure.dashboard.session"

function SwarmIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" />
      <rect x="9" y="13.5" width="6" height="6" rx="1.5" />
      <path d="M10.5 7.5h3M12 10.5v3" />
    </svg>
  )
}

function ChatIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15h-5l-3.5 3V15h-.5A2.5 2.5 0 0 1 5 12.5z" />
      <path d="M9 8.75h6M9 11.75h4" />
    </svg>
  )
}

function GraphIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="7.5" r="2.5" />
      <circle cx="12" cy="17" r="2.5" />
      <path d="m8.7 7.7 6 1.1M8 8.7l2.7 5.7M16.3 9.7l-2.6 4.8" />
    </svg>
  )
}

const featureDefinitions: FeatureDefinition[] = [
  {
    id: "swarm",
    label: "Agent Swarm",
    href: "/swarm",
    description: "Manager, fleet, registry, and access operations.",
    component: AgentSwarmScreen,
    icon: SwarmIcon,
  },
  {
    id: "chat",
    label: "Agent Chat",
    href: "/chat",
    description: "Multi-session chat will live here.",
    component: AgentChatScreen,
    icon: ChatIcon,
  },
  {
    id: "graph",
    label: "Agent Graph",
    href: "/graph",
    description: "Graph exploration and editing.",
    component: AgentGraphFeatureScreen,
    icon: GraphIcon,
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
      const nextUrl = new URL(window.location.href)
      nextUrl.pathname = "/swarm"
      window.history.replaceState({}, "", nextUrl.toString())
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

  const canRenderFeatures =
    !initializing &&
    (!config?.requiresSession || Boolean(readStoredSessionToken()))

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-white/10 bg-[#0a0f17] px-1.5 py-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-[11px] font-semibold tracking-[0.24em] text-emerald-200">
          AI
        </div>
        <nav className="mt-1 flex w-full flex-1 flex-col items-center gap-1.5">
          {featureDefinitions.map((feature) => {
            const isActive = feature.id === activeFeatureId
            const Icon = feature.icon

            return (
              <button
                key={feature.id}
                type="button"
                title={feature.label}
                onClick={() => {
                  navigateToFeature(feature.id)
                }}
                className={[
                  "group flex h-10 w-10 items-center justify-center rounded-xl transition",
                  isActive
                    ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/40"
                    : "text-slate-500 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" />
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-[#0d131c] px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold tracking-tight text-white">
                  {activeFeature.label}
                </h1>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
                  Agent Infrastructure
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {activeFeature.description}
              </p>
            </div>
            {config?.accessAppUrl ? (
              <button
                type="button"
                onClick={() => {
                  window.location.href = config.accessAppUrl
                }}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-100 transition hover:bg-white/10"
              >
                Auth Portal
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {initializing ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                Initializing dashboard shell...
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
                {error}
              </div>
            ) : null}
            {accessMessage ? (
              <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-50">
                {accessMessage}
              </div>
            ) : null}
            {authRequired && config?.accessAppUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-50">
                <span>Session access is required to use this dashboard.</span>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = config.accessAppUrl
                  }}
                  className="rounded-full border border-cyan-100/30 bg-cyan-50/10 px-3 py-1.5 font-medium uppercase tracking-[0.18em] text-cyan-50 transition hover:bg-cyan-50/20"
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
            {canRenderFeatures
              ? loadedFeatureIds.map((featureId) => {
                  const feature =
                    featureDefinitions.find(
                      (candidate) => candidate.id === featureId,
                    ) ?? featureDefinitions[0]
                  const FeatureComponent = feature.component

                  return (
                    <section
                      key={feature.id}
                      className={
                        feature.id === activeFeatureId
                          ? "h-full min-h-0"
                          : "hidden h-full"
                      }
                    >
                      <FeatureComponent />
                    </section>
                  )
                })
              : null}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
