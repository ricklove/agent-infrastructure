import { agentChatDashboardUiPlugin } from "@agent-infrastructure/agent-chat-ui/ui-plugin"
import { agentChatWorkbenchNodeType } from "@agent-infrastructure/agent-chat-ui/workbench-node"
import { agentGraphDashboardUiPlugin } from "@agent-infrastructure/agent-graph-ui/ui-plugin"
import { agentSwarmDashboardUiPlugin } from "@agent-infrastructure/agent-swarm-ui/ui-plugin"
import { agentWorkbenchDashboardUiPlugin } from "@agent-infrastructure/agent-workbench-ui/ui-plugin"
import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardTerminalUiPlugin } from "@agent-infrastructure/dashboard-terminal-ui/ui-plugin"
import { floatingWindowDebugDashboardUiPlugin } from "@agent-infrastructure/floating-window-debug-ui/ui-plugin"
import { projectsDashboardUiPlugin } from "@agent-infrastructure/projects-ui/ui-plugin"
import { uiDesignCanvasDashboardUiPlugin } from "@agent-infrastructure/ui-design-canvas-ui/ui-plugin"

const composedWorkbenchDashboardUiPlugin: DashboardFeatureUiPlugin = {
  ...agentWorkbenchDashboardUiPlugin,
  screen: {
    ...(agentWorkbenchDashboardUiPlugin.screen ?? {}),
    getProps: (context) => ({
      ...(agentWorkbenchDashboardUiPlugin.screen?.getProps?.(context) ??
        agentWorkbenchDashboardUiPlugin.screen?.props ??
        {}),
      nodeTypeDefinitions: [agentChatWorkbenchNodeType],
    }),
  },
}

export const dashboardFeaturePlugins: DashboardFeatureUiPlugin[] = [
  agentSwarmDashboardUiPlugin,
  composedWorkbenchDashboardUiPlugin,
  uiDesignCanvasDashboardUiPlugin,
  floatingWindowDebugDashboardUiPlugin,
  projectsDashboardUiPlugin,
  agentChatDashboardUiPlugin,
  agentGraphDashboardUiPlugin,
  dashboardTerminalUiPlugin,
]
