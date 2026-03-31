import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardTerminalPlugin } from "./dashboard-plugin"

export const dashboardTerminalUiPlugin: DashboardFeatureUiPlugin = {
  ...dashboardTerminalPlugin,
  loadScreen: async () => ({
    default: (await import("./DashboardTerminalScreen.js"))
      .DashboardTerminalScreen,
  }),
}
