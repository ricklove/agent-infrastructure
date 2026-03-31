import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const uiDesignCanvasDashboardPlugin: DashboardFeaturePlugin = {
  id: "design",
  label: "UI Design",
  route: "/design",
  description:
    "Rapid human and AI design exploration with prompts, variants, and sketch feedback.",
  icon: "design",
  screen: {
    getProps: ({ windowOrigin, windowWsOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/agent-chat`,
      wsRootUrl: `${windowWsOrigin}/ws/agent-chat`,
      defaultSessionDirectory:
        "/home/ec2-user/workspace/projects-worktrees/agent-infrastructure/feature-ui-design-canvas",
      defaultProcessBlueprintId: "discuss",
    }),
  },
}
