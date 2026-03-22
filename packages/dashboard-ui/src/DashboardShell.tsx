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

type DashboardGatewayStatusMessage = {
  type: "dashboard_status"
  ok: boolean
  backendVersion: string
  timestamp: string
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

export function DashboardShell({ appVersion = "dashboard-unknown" }: { appVersion?: string }) {
  const AgentGraphFeatureScreen = useMemo(
    () =>
      lazy(() =>
        import("@agent-infrastructure/agent-graph-ui").then((module) => ({
          default: function DashboardAgentGraphScreen() {
            return (
              <module.AgentGraphScreen
                appVersion={appVersion}
                apiRootUrl={`${window.location.origin}/api/agent-graph`}
                wsRootUrl={`${window.location.origin.replace(/^http/, "ws")}/ws/agent-graph`}
              />
            )
          },
        })),
      ),
    [appVersion],
  )
  const featureDefinitions: FeatureDefinition[] = useMemo(
    () => [
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
    ],
    [AgentGraphFeatureScreen],
  )
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
  const [gatewayConnectionStatus, setGatewayConnectionStatus] = useState<
    "connecting" | "ready" | "error" | "idle"
  >("idle")
  const [gatewayBackendVersion, setGatewayBackendVersion] = useState("--")
  const [copiedStatus, setCopiedStatus] = useState(false)

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
    if (initializing) {
      return
    }

    const sessionToken = readStoredSessionToken().trim()
    if (config?.requiresSession && !sessionToken) {
      setGatewayConnectionStatus("idle")
      setGatewayBackendVersion("--")
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null

    const connect = () => {
      if (disposed) {
        return
      }

      setGatewayConnectionStatus("connecting")
      const wsUrl = new URL(
        `${window.location.origin.replace(/^http/, "ws")}/ws/dashboard-status`,
      )
      if (sessionToken) {
        wsUrl.searchParams.set("sessionToken", sessionToken)
      }

      socket = new WebSocket(wsUrl.toString())
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as DashboardGatewayStatusMessage
          if (payload.type === "dashboard_status") {
            setGatewayBackendVersion(payload.backendVersion)
            setGatewayConnectionStatus("ready")
          }
        } catch {
          setGatewayConnectionStatus("error")
        }
      })
      socket.addEventListener("error", () => {
        setGatewayConnectionStatus("error")
      })
      socket.addEventListener("close", () => {
        if (disposed) {
          return
        }
        setGatewayConnectionStatus("error")
        reconnectTimer = window.setTimeout(connect, 1200)
      })
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      socket?.close()
    }
  }, [config?.requiresSession, initializing])

  const gatewayConnectionTone =
    gatewayConnectionStatus === "ready"
      ? "text-emerald-300"
      : gatewayConnectionStatus === "error"
        ? "text-rose-300"
        : gatewayConnectionStatus === "connecting"
          ? "text-amber-200"
          : "text-stone-400"
  const backendVersionMismatch =
    gatewayBackendVersion !== "--" && gatewayBackendVersion !== appVersion

  function copyStatusLabel() {
    const parts = [`Version: ${appVersion}`]
    if (backendVersionMismatch) {
      parts.push(`Backend: ${gatewayBackendVersion}`)
    }
    parts.push(`WS: ${gatewayConnectionStatus}`)
    void navigator.clipboard.writeText(parts.join(" | "))
    setCopiedStatus(true)
    window.setTimeout(() => setCopiedStatus(false), 1200)
  }

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
        <div className="group relative">
          <button
            type="button"
            onClick={copyStatusLabel}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-[11px] font-semibold tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/15"
            title="Copy dashboard status"
          >
            AI
          </button>
          <div className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-0 z-50 hidden min-w-[17rem] rounded-2xl border border-stone-800/90 bg-stone-950/95 px-3 py-3 text-xs text-stone-300 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur group-hover:block">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone-500">Version</span>
                <span className="font-medium text-stone-100">{appVersion}</span>
              </div>
              {backendVersionMismatch ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-stone-500">Backend</span>
                  <span className="font-medium text-rose-300">
                    {gatewayBackendVersion}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone-500">WS</span>
                <span className={gatewayConnectionTone}>{gatewayConnectionStatus}</span>
              </div>
              <div className="border-t border-stone-800 pt-1.5 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                {copiedStatus ? "Copied" : "Click to copy"}
              </div>
            </div>
          </div>
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

      <div className="relative flex min-w-0 flex-1 flex-col">
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
        <div className="pointer-events-none absolute right-4 top-4 z-50 flex max-w-[32rem] flex-col items-end gap-2">
          {initializing ? (
            <div className="rounded-xl border border-white/10 bg-[#0d131c]/90 px-3 py-2 text-xs text-slate-300 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur">
              Initializing dashboard shell...
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur">
              {error}
            </div>
          ) : null}
          {accessMessage ? (
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur">
              {accessMessage}
            </div>
          ) : null}
          {authRequired && config?.accessAppUrl ? (
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-50 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur">
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
      </div>
    </div>
  )
}
