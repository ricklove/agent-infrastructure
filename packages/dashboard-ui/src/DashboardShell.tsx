import type {
  DashboardFeatureIcon,
  DashboardFeatureId,
  DashboardFeatureUiPlugin,
} from "@agent-infrastructure/dashboard-plugin"
import {
  dashboardSessionFetch,
  isDashboardFeatureVisible,
  readDashboardPreferences,
  subscribeDashboardPreferences,
} from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import {
  type ComponentType,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react"
import { DashboardWindowLayer } from "./DashboardWindowLayer"
import { FloatingTicketWindows } from "./FloatingTicketWindows"
import {
  getDashboardFeaturePlugins,
  type DashboardHostRole,
} from "./feature-plugins"

type DashboardConfig = {
  ok: boolean
  accessAppUrl: string
  requiresSession: boolean
  hostRole: DashboardHostRole
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

type RuntimeReleaseRecord = {
  tag: string
  version: string | null
}

type RuntimeReleaseStatus = {
  ok: true
  currentVersion: string
  currentReleaseTag: string | null
  latestReleaseTag: string | null
  latestVersion: string | null
  updateAvailable: boolean
  recentReleaseTags: RuntimeReleaseRecord[]
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
  useRenderCounter("SwarmIcon")
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

function AdminIcon(props: { className?: string }) {
  useRenderCounter("AdminIcon")
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
      <path d="M12 3.75 19 6.8v4.8c0 4.2-2.7 8.1-7 9.65-4.3-1.55-7-5.45-7-9.65V6.8Z" />
      <path d="M9.5 12.25 11.25 14 14.75 10.5" />
    </svg>
  )
}

function ChatIcon(props: { className?: string }) {
  useRenderCounter("ChatIcon")
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
  useRenderCounter("GraphIcon")
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
  useRenderCounter("TerminalIcon")
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
  useRenderCounter("ProjectsIcon")
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

function DesignIcon(props: { className?: string }) {
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
      <path d="M4 18.5 10.5 12" />
      <path d="M8 5h9a2 2 0 0 1 2 2v9" />
      <path d="M5 8.5V5h3.5" />
      <path d="m13 4 7 7" />
      <path d="M5 19h4.5l8.8-8.8a1.8 1.8 0 0 0 0-2.5l-2-2a1.8 1.8 0 0 0-2.5 0L5 14.5Z" />
    </svg>
  )
}

function DebugIcon(props: { className?: string }) {
  useRenderCounter("DebugIcon")
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
      <path d="M4 5.5h16" />
      <path d="M4 18.5h16" />
      <rect x="5" y="7" width="9" height="9" rx="1.8" />
      <path d="M17 8v7" />
      <path d="M15 11.5h4" />
    </svg>
  )
}

function SettingsIcon(props: { className?: string }) {
  useRenderCounter("SettingsIcon")
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
      <circle cx="12" cy="12" r="2.75" />
      <path d="M19.1 15a1 1 0 0 0 .2 1.1l.1.1a1.25 1.25 0 0 1 0 1.8l-.6.6a1.25 1.25 0 0 1-1.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.25 1.25 0 0 1-1.25 1.25h-.9A1.25 1.25 0 0 1 10.9 20v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.25 1.25 0 0 1-1.8 0l-.6-.6a1.25 1.25 0 0 1 0-1.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4A1.25 1.25 0 0 1 2.75 13.9V13A1.25 1.25 0 0 1 4 11.75h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.25 1.25 0 0 1 0-1.8l.6-.6a1.25 1.25 0 0 1 1.8 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4A1.25 1.25 0 0 1 10.1 2.75H11A1.25 1.25 0 0 1 12.25 4v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.25 1.25 0 0 1 1.8 0l.6.6a1.25 1.25 0 0 1 0 1.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20A1.25 1.25 0 0 1 21.25 10v.9A1.25 1.25 0 0 1 20 12.15h-.2a1 1 0 0 0-.9.6" />
    </svg>
  )
}

function CopyIcon(props: { className?: string }) {
  useRenderCounter("CopyIcon")
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
  useRenderCounter("MenuIcon")
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

function featureIdFromPath(
  pathname: string,
  plugins: DashboardFeatureUiPlugin[],
): FeatureId {
  return (
    plugins.find((plugin) => plugin.route === pathname)?.id ??
    plugins[0]?.id ??
    "chat"
  )
}

const featureIconMap: Record<
  DashboardFeatureIcon,
  (props: { className?: string }) => JSX.Element
> = {
  admin: AdminIcon,
  swarm: SwarmIcon,
  design: DesignIcon,
  debug: DebugIcon,
  projects: ProjectsIcon,
  chat: ChatIcon,
  graph: GraphIcon,
  terminal: TerminalIcon,
  settings: SettingsIcon,
}

export function DashboardShell({
  appVersion = "dashboard-unknown",
}: {
  appVersion?: string
}) {
  useRenderCounter("DashboardShell")
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
  const [runtimeReleaseStatus, setRuntimeReleaseStatus] =
    useState<RuntimeReleaseStatus | null>(null)
  const [runtimeReleaseError, setRuntimeReleaseError] = useState("")
  const [runtimeDeployNotice, setRuntimeDeployNotice] = useState("")
  const [runtimeDeployPending, setRuntimeDeployPending] = useState(false)
  const [mobileFeatureMenuOpen, setMobileFeatureMenuOpen] = useState(false)
  const [featureStatuses, setFeatureStatuses] = useState<
    Partial<Record<FeatureId, FeatureStatusItem[]>>
  >({})
  const [dashboardPreferences, setDashboardPreferences] = useState(() =>
    readDashboardPreferences(),
  )
  const hostRole = config?.hostRole ?? "manager"
  const dashboardPlugins = useMemo(
    () => getDashboardFeaturePlugins(hostRole),
    [hostRole],
  )
  const featureDefinitions: FeatureDefinition[] = useMemo(
    () =>
      dashboardPlugins.map((plugin) => ({
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
    [appVersion, dashboardPlugins],
  )
  const [activeFeatureId, setActiveFeatureId] = useState<FeatureId>(() =>
    featureIdFromPath(window.location.pathname, getDashboardFeaturePlugins("manager")),
  )
  const [loadedFeatureIds, setLoadedFeatureIds] = useState<FeatureId[]>([
    featureIdFromPath(window.location.pathname, getDashboardFeaturePlugins("manager")),
  ])
  const visibilityMode =
    hostRole === "manager" ? dashboardPreferences.dashboardMode : "advanced"
  const visibleFeatureDefinitions = useMemo(
    () =>
      featureDefinitions.filter((feature) =>
        isDashboardFeatureVisible(feature.id, visibilityMode),
      ),
    [featureDefinitions, visibilityMode],
  )

  const activeFeature = useMemo(
    () =>
      visibleFeatureDefinitions.find((feature) => feature.id === activeFeatureId) ??
      visibleFeatureDefinitions[0] ??
      featureDefinitions[0],
    [activeFeatureId, featureDefinitions, visibleFeatureDefinitions],
  )

  useEffect(() => {
    return subscribeDashboardPreferences(() => {
      setDashboardPreferences(readDashboardPreferences())
    })
  }, [])

  useEffect(() => {
    function handlePopState() {
      setActiveFeatureId(
        featureIdFromPath(window.location.pathname, visibleFeatureDefinitions),
      )
    }

    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [visibleFeatureDefinitions])

  useEffect(() => {
    const defaultFeature = visibleFeatureDefinitions[0] ?? featureDefinitions[0]
    if (!defaultFeature) {
      return
    }

    const currentPath = window.location.pathname
    const matchedFeature = visibleFeatureDefinitions.find(
      (feature) => feature.route === currentPath,
    )

    if (!matchedFeature || currentPath === "/") {
      const nextUrl = new URL(window.location.href)
      nextUrl.pathname = defaultFeature.route
      window.history.replaceState({}, "", nextUrl.toString())
      setActiveFeatureId(defaultFeature.id)
      return
    }

    setActiveFeatureId(matchedFeature.id)
  }, [featureDefinitions, visibleFeatureDefinitions])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dashboard-active-feature-change", {
        detail: { featureId: activeFeatureId },
      }),
    )
  }, [activeFeatureId, visibleFeatureDefinitions])

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
    if (runtimeReleaseStatus?.latestReleaseTag) {
      parts.push(
        runtimeReleaseStatus.updateAvailable
          ? `Latest: ${runtimeReleaseStatus.latestReleaseTag}`
          : "Latest: current",
      )
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
      currentValue.includes(activeFeatureId) ||
      !visibleFeatureDefinitions.some((feature) => feature.id === activeFeatureId)
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
    if (!versionPopupOpen) {
      return
    }

    let cancelled = false

    async function loadRuntimeReleaseStatus() {
      try {
        setRuntimeReleaseError("")
        const response = (await dashboardSessionFetch(
          "/api/runtime-release",
        )) as Response
        if (!response.ok) {
          throw new Error("failed to load runtime release status")
        }

        const payload = (await response.json()) as RuntimeReleaseStatus
        if (!cancelled) {
          setRuntimeReleaseStatus(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setRuntimeReleaseError(
            nextError instanceof Error
              ? nextError.message
              : "failed to load runtime release status",
          )
        }
      }
    }

    void loadRuntimeReleaseStatus()
    return () => {
      cancelled = true
    }
  }, [versionPopupOpen])

  async function deployLatestRelease() {
    try {
      setRuntimeDeployPending(true)
      setRuntimeDeployNotice("")
      setRuntimeReleaseError("")
      const response = (await dashboardSessionFetch(
        "/api/runtime-release/deploy",
        {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ target: "latest" }),
        },
      )) as Response
      if (!response.ok && response.status !== 202) {
        throw new Error("failed to request latest release deploy")
      }

      setRuntimeDeployNotice(
        "Latest release deploy requested. The dashboard may disconnect while the manager restarts.",
      )
    } catch (nextError) {
      setRuntimeReleaseError(
        nextError instanceof Error
          ? nextError.message
          : "failed to request latest release deploy",
      )
    } finally {
      setRuntimeDeployPending(false)
    }
  }

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
          currentUrl.searchParams.delete("sessionKey")
          window.history.replaceState({}, "", currentUrl.toString())

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

  function navigateToFeature(featureId: FeatureId, replace = false) {
    const nextFeature =
      visibleFeatureDefinitions.find((feature) => feature.id === featureId) ??
      featureDefinitions.find((feature) => feature.id === featureId) ??
      visibleFeatureDefinitions[0] ??
      featureDefinitions[0]

    if (!nextFeature) {
      return
    }

    if (window.location.pathname !== nextFeature.route) {
      if (replace) {
        window.history.replaceState({}, "", nextFeature.route)
      } else {
        window.history.pushState({}, "", nextFeature.route)
      }
    }

    setActiveFeatureId(nextFeature.id)
    setMobileFeatureMenuOpen(false)
  }

  useEffect(() => {
    if (visibleFeatureDefinitions.some((feature) => feature.id === activeFeatureId)) {
      return
    }

    const fallbackFeature = visibleFeatureDefinitions[0] ?? featureDefinitions[0]
    if (!fallbackFeature) {
      return
    }

    navigateToFeature(fallbackFeature.id, true)
  }, [activeFeatureId, featureDefinitions, visibleFeatureDefinitions])

  const canRenderFeatures =
    !initializing &&
    (!config?.requiresSession || Boolean(readStoredSessionToken()))

  return (
    <DashboardWindowLayer>
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
            "fixed inset-y-0 left-0 z-40 flex w-14 shrink-0 flex-col items-center gap-3 overflow-visible border-r border-white/10 bg-[#0a0f17] px-1.5 py-2 transition-transform md:relative md:z-30 md:translate-x-0",
            mobileFeatureMenuOpen
              ? "translate-x-0 pointer-events-auto"
              : "-translate-x-full pointer-events-none md:pointer-events-auto",
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
                "pointer-events-auto absolute left-full top-0 z-[70] ml-2 min-w-[17rem] select-text rounded-2xl border border-stone-800/90 bg-stone-950/95 px-3 py-3 text-xs text-stone-300 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur",
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
                  <span className="font-medium text-stone-100">
                    {appVersion}
                  </span>
                </div>
                {backendVersionMismatch ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-stone-500">Backend</span>
                    <span className="font-medium text-rose-300">
                      {gatewayBackendVersion}
                    </span>
                  </div>
                ) : null}
                {runtimeReleaseStatus?.latestReleaseTag ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-stone-500">Latest</span>
                    <span
                      className={
                        runtimeReleaseStatus.updateAvailable
                          ? "font-medium text-amber-100"
                          : "font-medium text-emerald-200"
                      }
                    >
                      {runtimeReleaseStatus.updateAvailable
                        ? runtimeReleaseStatus.latestReleaseTag
                        : "current"}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-stone-500">WS</span>
                  <span className={gatewayConnectionTone}>
                    {gatewayConnectionStatus}
                  </span>
                </div>
                {runtimeReleaseStatus?.updateAvailable ? (
                  <button
                    type="button"
                    onClick={() => void deployLatestRelease()}
                    disabled={runtimeDeployPending}
                    className="mt-1 inline-flex items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runtimeDeployPending ? "Updating..." : "Update"}
                  </button>
                ) : null}
                {runtimeDeployNotice ? (
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[11px] leading-5 text-cyan-100">
                    {runtimeDeployNotice}
                  </div>
                ) : null}
                {runtimeReleaseError ? (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] leading-5 text-rose-100">
                    {runtimeReleaseError}
                  </div>
                ) : null}
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
                          <span
                            className={toneClassForFeatureStatus(item.tone)}
                          >
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
            {visibleFeatureDefinitions.map((feature) => {
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
              title={
                mobileFeatureMenuOpen ? "Close Main Menu" : "Open Main Menu"
              }
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
                      visibleFeatureDefinitions.find(
                        (candidate) => candidate.id === featureId,
                      ) ?? featureDefinitions.find(
                        (candidate) => candidate.id === featureId,
                      ) ?? visibleFeatureDefinitions[0] ?? featureDefinitions[0]
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
        <FloatingTicketWindows apiRootUrl="/api/agent-chat" />
      </div>
    </DashboardWindowLayer>
  )
}
