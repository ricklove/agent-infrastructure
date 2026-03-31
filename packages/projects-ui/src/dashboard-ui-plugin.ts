import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { projectsDashboardPlugin } from "@agent-infrastructure/projects-server/plugin"

export const projectsDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...projectsDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./ProjectsScreen.js")).ProjectsScreen,
  }),
}
