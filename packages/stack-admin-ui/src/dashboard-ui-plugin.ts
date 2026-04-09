import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { stackAdminDashboardPlugin } from "@agent-infrastructure/stack-admin-server/plugin"

export const stackAdminDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...stackAdminDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./StackAdminScreen.js")).StackAdminScreen,
  }),
}
