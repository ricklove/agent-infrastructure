import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { agentSwarmDashboardPlugin } from "./dashboard-plugin"

export const agentSwarmDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentSwarmDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./AgentSwarmScreen.js")).AgentSwarmScreen,
  }),
}
