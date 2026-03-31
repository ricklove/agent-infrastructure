import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { agentWorkbenchDashboardPlugin } from "./dashboard-plugin"

export const agentWorkbenchDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentWorkbenchDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./AgentWorkbenchScreen.js")).AgentWorkbenchScreen,
  }),
}
