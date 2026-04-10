import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardSettingsDashboardPlugin } from "./dashboard-plugin"

export const dashboardSettingsDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...dashboardSettingsDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./DashboardSettingsScreen.js")).DashboardSettingsScreen,
  }),
}
