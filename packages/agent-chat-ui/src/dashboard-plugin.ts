import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";

export const agentChatDashboardPlugin: DashboardFeaturePlugin = {
  id: "chat",
  label: "Agent Chat",
  route: "/chat",
  description: "Workspace-native multi-session chat.",
  icon: "chat",
};
