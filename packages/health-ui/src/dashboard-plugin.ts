import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const healthDashboardPlugin: DashboardFeaturePlugin = {
  id: "health",
  label: "Health",
  route: "/health",
  description: "Universal health profile and check definition dashboard.",
  icon: "graph",
  screen: {
    getProps: ({ windowOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/health-dashboard`,
    }),
  },
  backend: {
    id: "health-dashboard",
    apiBasePath: "/api/health-dashboard",
    defaultBaseUrl: "http://127.0.0.1:8796",
    healthPath: "/api/health-dashboard/health",
    startupPolicy: "lazy",
    startup: {
      kind: "bun-entry",
      entry: "packages/health-ui/src/server.ts",
      logFileName: "health-dashboard-server.log",
    },
  },
}
