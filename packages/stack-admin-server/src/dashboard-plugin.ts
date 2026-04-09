import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const stackAdminDashboardPlugin: DashboardFeaturePlugin = {
  id: "admin",
  label: "Admin",
  route: "/admin",
  description: "Cross-stack administration surface for stack discovery and repair.",
  icon: "admin",
}
