import type {
  DashboardFeatureIcon,
  DashboardFeatureId,
  DashboardFeatureUiPlugin,
} from "@agent-infrastructure/dashboard-plugin"
import {
  type ComponentType,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react"
import { dashboardFeaturePlugins } from "./feature-plugins"

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

type FeatureId = DashboardFeatureId

type FeatureDefinition = DashboardFeatureUiPlugin & {
  component: React.LazyExoticComponent<() => JSX.Element>
  iconComponent: (props: { className?: string }) => JSX.Element
}

type FeatureStatusItem = {
  label: string
  value: string
  tone?: "neutral" | "good" | "warn" | "bad"
}

type FeatureStatusDetail = {
  featureId: FeatureId
  items: FeatureStatusItem[]
}

const sessionStorageKey = "agent-infrastructure.dashboard.session"
const dashboardSessionWebSocketProtocolPrefix = "dashboard-session.v1."

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

function TerminalIcon(props: { className?: string }) {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  )
}

function ProjectsIcon(props: { className?: string }) {
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
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3A2.5 2.5 0 0 1 12 7.5v9A2.5 2.5 0 0 1 9.5 19h-3A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M12 8.5A2.5 2.5 0 0 1 14.5 6H18a2 2 0 0 1 2 2v7.5a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 12 15.5z" />
      <path d="M7 9h2M7 12h2M15 10h2M15 13h2" />
    </svg>
  )
}

function CopyIcon(props: { className?: string }) {
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
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function MenuIcon(props: { className?: string }) {
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
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? ""
}

function dashboardSessionWebSocketProtocols(sessionToken: string): string[] {
  const trimmed = sessionToken.trim()
  if (!trimmed) {
    return []
  }

  return [`${dashboardSessionWebSocketProtocolPrefix}${trimmed}`]
}

function featureIdFromPath(pathname: string): FeatureId {
  return (
    dashboardFeaturePlugins.find((plugin) => plugin.route === pathname)?.id ??
    "swarm"
  )
}

const featureIconMap: Record<
  DashboardFeatureIcon,
  (props: { className?: string }) => JSX.Element
> = {
  swarm: SwarmIcon,
  projects: ProjectsIcon,
  chat: ChatIcon,
  graph: GraphIcon,
  terminal: TerminalIcon,
}

export function DashboardShell({
  appVersion = "dashboard-unknown",
}: {
  appVersion?: string
}) {
  const featureDefinitions: FeatureDefinition[] = useMemo(
    () =>
      dashboardFeaturePlugins.map((plugin) => ({
        ...plugin,
        component: lazy(() =>
          plugin.loadScreen().then((module) => ({
            default: function DashboardFeaturePluginScreen() {
              const screenProps = plugin.screen?.getProps
                ? plugin.screen.getProps({
                    windowOrigin: window.location.origin,
                    windowWsOrigin: window.location.origin.replace(
                      /^http/,
                      "ws",
                    ),
                  })
                : (plugin.screen?.props ?? {})
              const Screen = module.default as ComponentType<
                Record<string, unknown>
              >
              return <Screen appVersion={appVersion} {...screenProps} />
            },
          })),
        ),
        iconComponent: featureIconMap[plugin.icon],
      })),
    [appVersion],
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
  const [versionPopupOpen, setVersionPopupOpen] = useState(false)
  const [mobileFeatureMenuOpen, setMobileFeatureMenuOpen] = useState(false)
  const [featureStatuses, setFeatureStatuses] = useState<
    Partial<Record<FeatureId, FeatureStatusItem[]>>
  >({})

  const activeFeature = useMemo(
    () =>
      featureDefinitions.find((feature) => feature.id === activeFeatureId) ??
      featureDefinitions[0],
    [activeFeatureId, featureDefinitions],
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
    function handleFeatureStatus(event: Event) {
      const detail = (event as CustomEvent<FeatureStatusDetail>).detail
      if (!detail?.featureId) {
        return
      }

      setFeatureStatuses((current) => ({
        ...current,
        [detail.featureId]: detail.items,
      }))
    }

    window.addEventListener(
      "dashboard-feature-status",
      handleFeatureStatus as EventListener,
    )
    return () => {
      window.removeEventListener(
        "dashboard-feature-status",
        handleFeatureStatus as EventListener,
      )
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
      const protocols = dashboardSessionWebSocketProtocols(sessionToken)
      socket =
        protocols.length > 0
          ? new WebSocket(wsUrl.toString(), protocols)
          : new WebSocket(wsUrl.toString())
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(
            String(event.data),
          ) as DashboardGatewayStatusMessage
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
  const aiButtonTone =
    gatewayConnectionStatus === "ready"
      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/20"
      : gatewayConnectionStatus === "error"
        ? "border-rose-400/40 bg-rose-400/15 text-rose-200 hover:bg-rose-400/20"
        : gatewayConnectionStatus === "connecting"
          ? "border-amber-300/40 bg-amber-300/15 text-amber-100 hover:bg-amber-300/20"
          : "border-stone-700/70 bg-stone-800/80 text-stone-300 hover:bg-stone-700/80"
  const backendVersionMismatch =
    gatewayBackendVersion !== "--" && gatewayBackendVersion !== appVersion
  const activeFeatureStatusItems = featureStatuses[activeFeatureId] ?? []

  function toneClassForFeatureStatus(tone: FeatureStatusItem["tone"]): string {
    if (tone === "good") {
      return "text-emerald-300"
    }
    if (tone === "warn") {
      return "text-amber-200"
    }
    if (tone === "bad") {
      return "text-rose-300"
    }
    return "text-stone-200"
  }

  function copyStatusLabel() {
    const parts = [`Version: ${appVersion}`]
    if (backendVersionMismatch) {
      parts.push(`Backend: ${gatewayBackendVersion}`)
    }
    parts.push(`WS: ${gatewayConnectionStatus}`)
    for (const item of activeFeatureStatusItems) {
      parts.push(`${activeFeature.label} ${item.label}: ${item.value}`)
    }
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
    if (!mobileFeatureMenuOpen) {
      setVersionPopupOpen(false)
    }
  }, [mobileFeatureMenuOpen])

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

    if (window.location.pathname !== nextFeature.route) {
      window.history.pushState({}, "", nextFeature.route)
    }

    setActiveFeatureId(nextFeature.id)
    setMobileFeatureMenuOpen(false)
  }

  const canRenderFeatures =
    !initializing &&
    (!config?.requiresSession || Boolean(readStoredSessionToken()))

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-950 text-slate-100">
      {mobileFeatureMenuOpen ? (
        <button
          type="button"
          aria-label="Close main menu"
          onClick={() => setMobileFeatureMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm md:hidden"
        />
      ) : null}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-14 shrink-0 flex-col items-center gap-3 border-r border-white/10 bg-[#0a0f17] px-1.5 py-2 transition-transform md:static md:z-auto md:translate-x-0",
          mobileFeatureMenuOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="group relative">
          <button
            type="button"
            onClick={() => setVersionPopupOpen((current) => !current)}
            className={[
              "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border text-[11px] font-semibold tracking-[0.24em] transition",
              aiButtonTone,
            ].join(" ")}
            title={`Version ${appVersion}`}
          >
            AI
          </button>
          <div
            className={[
              "pointer-events-auto absolute left-full top-0 z-50 ml-2 min-w-[17rem] select-text rounded-2xl border border-stone-800/90 bg-stone-950/95 px-3 py-3 text-xs text-stone-300 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur",
              versionPopupOpen ? "block" : "hidden group-hover:block",
            ].join(" ")}
          >
            <div
              className="absolute inset-y-0 -left-3 w-3"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={copyStatusLabel}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-700 text-stone-300 transition hover:bg-stone-800 hover:text-stone-100"
              title={copiedStatus ? "Copied" : "Copy status"}
            >
              <CopyIcon className="h-3.5 w-3.5" />
            </button>
            <div className="space-y-1.5 pr-8">
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
                <span className={gatewayConnectionTone}>
                  {gatewayConnectionStatus}
                </span>
              </div>
              {activeFeatureStatusItems.length > 0 ? (
                <div className="border-t border-stone-800 pt-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                    {activeFeature.label}
                  </div>
                  <div className="space-y-1.5">
                    {activeFeatureStatusItems.map((item) => (
                      <div
                        key={`${activeFeature.id}:${item.label}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-stone-500">{item.label}</span>
                        <span className={toneClassForFeatureStatus(item.tone)}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <nav className="mt-1 flex w-full flex-1 flex-col items-center gap-1.5">
          {featureDefinitions.map((feature) => {
            const isActive = feature.id === activeFeatureId
            const Icon = feature.iconComponent

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
        <div className="absolute left-3 top-3 z-20 md:hidden">
          <button
            type="button"
            aria-label={
              mobileFeatureMenuOpen ? "Close main menu" : "Open main menu"
            }
            title={mobileFeatureMenuOpen ? "Close Main Menu" : "Open Main Menu"}
            onClick={() => setMobileFeatureMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/85 text-slate-200 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur"
          >
            <MenuIcon className="h-4 w-4" />
          </button>
        </div>
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
