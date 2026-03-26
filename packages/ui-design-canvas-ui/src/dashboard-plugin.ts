import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";

export const uiDesignCanvasDashboardPlugin: DashboardFeaturePlugin = {
  id: "design",
  label: "UI Design",
  route: "/design",
  description: "Rapid human and AI design exploration with prompts, variants, and sketch feedback.",
  icon: "design",
};
