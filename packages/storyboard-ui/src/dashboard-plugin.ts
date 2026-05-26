import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const storyboardDashboardPlugin: DashboardFeaturePlugin = {
  id: "storyboard",
  label: "Storyboard",
  route: "/storyboard",
  description: "Isolated storyboard workspace and debug fixtures.",
  icon: "design",
}
