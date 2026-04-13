import { agentChatDashboardPlugin } from "@agent-infrastructure/agent-chat-server/plugin"
import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"

export const agentChatDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentChatDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./AgentChatScreen.js")).AgentChatScreen,
  }),
}

export const agentChatV2DashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentChatDashboardPlugin,
  id: "chat-v2",
  label: "Agent Chat v2",
  route: "/chat-v2",
  description: "Workspace-native chat v2 preview.",
  icon: "chat",
  loadScreen: async () => ({
    default: (await import("./AgentChatV2Screen.js")).AgentChatV2Screen,
  }),
}
