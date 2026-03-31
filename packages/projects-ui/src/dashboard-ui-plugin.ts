import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { projectsDashboardPlugin } from "./dashboard-plugin.js"

export const projectsDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...projectsDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./ProjectsScreen.js")).ProjectsScreen,
  }),
}
