export type DashboardFeatureId =
  | "swarm"
  | "chat"
  | "graph"
  | "terminal"
  | "projects"
  | "design";

export type DashboardFeatureIcon =
  | "swarm"
  | "chat"
  | "graph"
  | "terminal"
  | "projects"
  | "design";

export type DashboardScreenModule = {
  default: unknown;
};

export type DashboardFeatureScreenContext = {
  windowOrigin: string;
  windowWsOrigin: string;
};

export type DashboardFeatureScreenOptions = {
  props?: Record<string, unknown>;
  getProps?: (context: DashboardFeatureScreenContext) => Record<string, unknown>;
};

export type DashboardFeatureStartupDefinition = {
  kind: "bun-entry";
  entry: string;
  logFileName?: string;
};

export type DashboardFeatureBackendStartupPolicy = "lazy" | "always";

export type DashboardFeatureBackendDefinition = {
  id: string;
  apiBasePath?: string;
  wsBasePath?: string;
  upstreamWsPath?: string;
  upstreamBaseUrlEnv?: string;
  defaultBaseUrl?: string;
  healthPath: string;
  startupPolicy: DashboardFeatureBackendStartupPolicy;
  startup?: DashboardFeatureStartupDefinition;
};

export type DashboardFeaturePlugin = {
  id: DashboardFeatureId;
  label: string;
  route: `/${string}`;
  description: string;
  icon: DashboardFeatureIcon;
  screen?: DashboardFeatureScreenOptions;
  backend?: DashboardFeatureBackendDefinition;
};

export type DashboardFeatureUiPlugin = DashboardFeaturePlugin & {
  loadScreen: () => Promise<DashboardScreenModule>;
};
