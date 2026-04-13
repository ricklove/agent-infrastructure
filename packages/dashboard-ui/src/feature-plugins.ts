import {
  agentChatDashboardUiPlugin,
  agentChatV2DashboardUiPlugin,
} from "@agent-infrastructure/agent-chat-ui/ui-plugin"
import { agentChatWorkbenchNodeType } from "@agent-infrastructure/agent-chat-ui/workbench-node"
import { agentGraphDashboardUiPlugin } from "@agent-infrastructure/agent-graph-ui/ui-plugin"
import { agentSwarmDashboardUiPlugin } from "@agent-infrastructure/agent-swarm-ui/ui-plugin"
import { agentWorkbenchDashboardUiPlugin } from "@agent-infrastructure/agent-workbench-ui/ui-plugin"
import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardSettingsDashboardUiPlugin } from "@agent-infrastructure/dashboard-settings-ui/ui-plugin"
import { dashboardTerminalUiPlugin } from "@agent-infrastructure/dashboard-terminal-ui/ui-plugin"
import { floatingWindowDebugDashboardUiPlugin } from "@agent-infrastructure/floating-window-debug-ui/ui-plugin"
import { projectsDashboardUiPlugin } from "@agent-infrastructure/projects-ui/ui-plugin"
import { stackAdminDashboardUiPlugin } from "@agent-infrastructure/stack-admin-ui/ui-plugin"
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

export type DashboardHostRole = "manager" | "admin"

const managerDashboardFeaturePlugins: DashboardFeatureUiPlugin[] = [
  agentChatDashboardUiPlugin,
  agentChatV2DashboardUiPlugin,
  agentSwarmDashboardUiPlugin,
  composedWorkbenchDashboardUiPlugin,
  uiDesignCanvasDashboardUiPlugin,
  floatingWindowDebugDashboardUiPlugin,
  agentGraphDashboardUiPlugin,
  dashboardTerminalUiPlugin,
  projectsDashboardUiPlugin,
  dashboardSettingsDashboardUiPlugin,
]

const adminDashboardFeaturePlugins: DashboardFeatureUiPlugin[] = [
  stackAdminDashboardUiPlugin,
  projectsDashboardUiPlugin,
  agentChatDashboardUiPlugin,
  agentChatV2DashboardUiPlugin,
  dashboardTerminalUiPlugin,
]

export function getDashboardFeaturePlugins(
  hostRole: DashboardHostRole,
): DashboardFeatureUiPlugin[] {
  return hostRole === "admin"
    ? adminDashboardFeaturePlugins
    : managerDashboardFeaturePlugins
}

export const dashboardFeaturePlugins = getDashboardFeaturePlugins("manager")
