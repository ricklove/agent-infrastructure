import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";

export const dashboardTerminalPlugin: DashboardFeaturePlugin = {
  id: "terminal",
  label: "Terminal",
  route: "/terminal",
  description: "Browser-based interactive terminal for workspace shell access.",
  icon: "terminal",
  screen: {
    getProps: ({ windowOrigin, windowWsOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/dashboard-terminal`,
      wsRootUrl: `${windowWsOrigin}/ws/dashboard-terminal`,
    }),
  },
  backend: {
    id: "dashboard-terminal",
    apiBasePath: "/api/dashboard-terminal",
    wsBasePath: "/ws/dashboard-terminal",
    upstreamWsPath: "/api/dashboard-terminal/ws",
    defaultBaseUrl: "http://127.0.0.1:8790",
    healthPath: "/api/dashboard-terminal/health",
    startupPolicy: "lazy",
    startup: {
      kind: "bun-entry",
      entry: "packages/dashboard-terminal-server/src/index.ts",
      logFileName: "dashboard-terminal-server.log",
    },
  },
};
