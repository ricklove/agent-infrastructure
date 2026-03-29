import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { floatingWindowDebugDashboardPlugin } from "./dashboard-plugin"

export const floatingWindowDebugDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...floatingWindowDebugDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./FloatingWindowDebugScreen.js")).FloatingWindowDebugScreen,
  }),
}
