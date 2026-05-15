import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { storyboardDashboardPlugin } from "./dashboard-plugin"

export const storyboardDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...storyboardDashboardPlugin,
  loadScreen: async () => ({
    default: (await import("./StoryboardScreen.js")).StoryboardScreen,
  }),
}
