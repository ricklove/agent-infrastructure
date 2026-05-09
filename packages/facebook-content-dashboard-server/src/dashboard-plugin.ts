import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const facebookContentDashboardPlugin: DashboardFeaturePlugin = {
  id: "content-creation",
  label: "Content Creation",
  route: "/content-creation",
  description:
    "Rank source posts, generate derivatives, and schedule Facebook Page publishing.",
  icon: "content",
  screen: {
    getProps: ({ windowOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/facebook-content-dashboard`,
    }),
  },
  backend: {
    id: "facebook-content-dashboard",
    apiBasePath: "/api/facebook-content-dashboard",
    defaultBaseUrl: "http://127.0.0.1:8796",
    healthPath: "/api/facebook-content-dashboard/health",
    startupPolicy: "lazy",
    startup: {
      kind: "bun-entry",
      entry: "packages/facebook-content-dashboard-server/src/server.ts",
      logFileName: "facebook-content-dashboard-server.log",
    },
  },
}
