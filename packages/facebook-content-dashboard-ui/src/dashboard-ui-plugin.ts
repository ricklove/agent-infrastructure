import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { facebookContentDashboardPlugin } from "./dashboard-plugin"

export const facebookContentDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...facebookContentDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./FacebookContentDashboardScreen.js"))
      .FacebookContentDashboardScreen,
  }),
}
