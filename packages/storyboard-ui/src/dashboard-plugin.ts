import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const storyboardDashboardPlugin: DashboardFeaturePlugin = {
  id: "storyboard",
  label: "Storyboard",
  route: "/storyboard",
  description: "Isolated storyboard workspace and debug fixtures.",
  icon: "design",
  backend: {
    id: "storyboard",
    apiBasePath: "/api/storyboard",
    defaultBaseUrl: "http://127.0.0.1:8897",
    healthPath: "/api/storyboard/health",
    startupPolicy: "always",
    startup: {
      kind: "bun-entry",
      entry: "packages/storyboard-ui/src/server.ts",
      logFileName: "storyboard-server.log",
    },
  },
}
