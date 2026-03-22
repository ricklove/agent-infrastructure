import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin";
import { agentGraphDashboardPlugin } from "./dashboard-plugin";

export const agentGraphDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentGraphDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./components/AgentGraphScreen.js")).AgentGraphScreen,
  }),
};
