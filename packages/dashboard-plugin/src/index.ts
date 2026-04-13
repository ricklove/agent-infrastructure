export type DashboardFeatureId =
  | "admin"
  | "swarm"
  | "workbench"
  | "chat"
  | "chat-v2"
  | "graph"
  | "terminal"
  | "projects"
  | "design"
  | "debug"
  | "settings"

export type DashboardFeatureIcon =
  | "admin"
  | "swarm"
  | "chat"
  | "graph"
  | "terminal"
  | "projects"
  | "design"
  | "debug"
  | "settings"

export type DashboardScreenModule = {
  default: unknown
}

export type DashboardFeatureScreenContext = {
  windowOrigin: string
  windowWsOrigin: string
}

export type DashboardFeatureScreenOptions = {
  props?: Record<string, unknown>
  getProps?: (context: DashboardFeatureScreenContext) => Record<string, unknown>
}

export type DashboardFeatureStartupDefinition = {
  kind: "bun-entry"
  entry: string
  logFileName?: string
}

export type DashboardFeatureBackendStartupPolicy = "lazy" | "always"

export type DashboardFeatureBackendDefinition = {
  id: string
  apiBasePath?: string
  wsBasePath?: string
  upstreamWsPath?: string
  upstreamBaseUrlEnv?: string
  defaultBaseUrl?: string
  healthPath: string
  startupPolicy: DashboardFeatureBackendStartupPolicy
  startup?: DashboardFeatureStartupDefinition
}

export type DashboardFeaturePlugin = {
  id: DashboardFeatureId
  label: string
  route: `/${string}`
  description: string
  icon: DashboardFeatureIcon
  screen?: DashboardFeatureScreenOptions
  backend?: DashboardFeatureBackendDefinition
}

export type DashboardFeatureUiPlugin = DashboardFeaturePlugin & {
  loadScreen: () => Promise<DashboardScreenModule>
}

export {
  type DashboardComposerKeyEvent,
  type DashboardEnterStyle,
  type DashboardPreferences,
  type DashboardVisibilityMode,
  dashboardBasicFeatureIds,
  dashboardEnterStyleHint,
  dashboardEnterStyleShortLabel,
  dashboardFeatureOrder,
  isDashboardFeatureVisible,
  isDashboardSendShortcut,
  readDashboardPreferences,
  subscribeDashboardPreferences,
  writeDashboardPreferences,
} from "./preferences.js"
export {
  buildCanonicalDashboardReleaseTag,
  buildCanonicalDashboardVersion,
  type CanonicalDashboardReleaseParts,
  canonicalDashboardVersionFromTag,
  fallbackDashboardVersion,
  formatUtcDashboardReleaseDate,
  nextCanonicalDashboardReleaseTag,
  parseCanonicalDashboardReleaseTag,
} from "./release-version.js"

export {
  createDashboardSessionHeaders,
  dashboardSessionAuthorizationHeaderValue,
  dashboardSessionDebugLog,
  dashboardSessionFetch,
  dashboardSessionWebSocketProtocols,
  readDashboardSessionToken,
} from "./session-client.js"
