import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";

export const agentSwarmDashboardPlugin: DashboardFeaturePlugin = {
  id: "swarm",
  label: "Agent Swarm",
  route: "/swarm",
  description: "Manager, fleet, registry, and access operations.",
  icon: "swarm",
  screen: {
    getProps: ({ windowOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/agent-swarm`,
    }),
  },
  backend: {
    id: "agent-swarm",
    apiBasePath: "/api/agent-swarm",
    upstreamBaseUrlEnv: "MANAGER_INTERNAL_URL",
    defaultBaseUrl: "http://127.0.0.1:8787",
    healthPath: "/health",
  },
};
