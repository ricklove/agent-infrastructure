import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const floatingWindowDebugDashboardPlugin: DashboardFeaturePlugin = {
  id: "debug",
  label: "Debug Lab",
  route: "/debug",
  description:
    "Exercise the shared floating-window host with shell-only fixtures, real content, and edge-case geometry.",
  icon: "debug",
}
