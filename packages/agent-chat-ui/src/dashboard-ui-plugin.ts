import { agentChatDashboardPlugin } from "@agent-infrastructure/agent-chat-server/plugin"
import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"

export const agentChatDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentChatDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./AgentChatScreen.js")).AgentChatScreen,
  }),
}
