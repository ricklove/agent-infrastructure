import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const agentGraphDashboardPlugin: DashboardFeaturePlugin = {
  id: "graph",
  label: "Agent Graph",
  route: "/graph",
  description: "Graph exploration and editing.",
  icon: "graph",
  screen: {
    getProps: ({ windowOrigin, windowWsOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/agent-graph`,
      wsRootUrl: `${windowWsOrigin}/ws/agent-graph`,
    }),
  },
  backend: {
    id: "agent-graph",
    apiBasePath: "/api/agent-graph",
    wsBasePath: "/ws/agent-graph",
    upstreamWsPath: "/api/agent-graph/ws",
    upstreamBaseUrlEnv: "AGENT_GRAPH_SERVER_URL",
    defaultBaseUrl: "http://127.0.0.1:8788",
    healthPath: "/api/agent-graph/workspace",
    startupPolicy: "lazy",
    startup: {
      kind: "bun-entry",
      entry: "packages/agent-graph-server/src/index.ts",
      logFileName: "agent-graph-server.log",
    },
  },
}
