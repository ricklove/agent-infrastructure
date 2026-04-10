import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const dashboardSettingsDashboardPlugin: DashboardFeaturePlugin = {
  id: "settings",
  label: "Settings",
  route: "/settings",
  description:
    "Control dashboard visibility mode and shared message composer keyboard behavior.",
  icon: "settings",
}
