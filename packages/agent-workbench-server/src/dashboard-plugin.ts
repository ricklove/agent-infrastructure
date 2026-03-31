import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const agentWorkbenchDashboardPlugin: DashboardFeaturePlugin = {
  id: "workbench",
  label: "Workbench",
  route: "/workbench",
  description: "Minimal React Flow workbench with persisted text nodes.",
  icon: "graph",
  screen: {
    getProps: ({ windowOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/agent-workbench`,
    }),
  },
  backend: {
    id: "agent-workbench",
    apiBasePath: "/api/agent-workbench",
    defaultBaseUrl: "http://127.0.0.1:8792",
    healthPath: "/api/agent-workbench/health",
    startupPolicy: "lazy",
    startup: {
      kind: "bun-entry",
      entry: "packages/agent-workbench-server/src/index.ts",
      logFileName: "agent-workbench-runtime.log",
    },
  },
}
