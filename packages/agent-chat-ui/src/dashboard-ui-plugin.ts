import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin";
import { agentChatDashboardPlugin } from "./dashboard-plugin";

export const agentChatDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentChatDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./AgentChatScreen.js")).AgentChatScreen,
  }),
};
