import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { healthDashboardPlugin } from "./dashboard-plugin"

export const healthDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...healthDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./HealthDashboardScreen.js")).HealthDashboardScreen,
  }),
}
