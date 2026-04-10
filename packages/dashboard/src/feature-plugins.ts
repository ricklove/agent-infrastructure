import { agentChatDashboardPlugin } from "@agent-infrastructure/agent-chat-server/plugin"
import { agentGraphDashboardPlugin } from "@agent-infrastructure/agent-graph-ui/plugin"
import { agentSwarmDashboardPlugin } from "@agent-infrastructure/agent-swarm-ui/plugin"
import { agentWorkbenchDashboardPlugin } from "@agent-infrastructure/agent-workbench-server/plugin"
import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardSettingsDashboardPlugin } from "@agent-infrastructure/dashboard-settings-ui/plugin"
import { dashboardTerminalPlugin } from "@agent-infrastructure/dashboard-terminal-ui/plugin"
import { floatingWindowDebugDashboardPlugin } from "@agent-infrastructure/floating-window-debug-ui/plugin"
import { projectsDashboardPlugin } from "@agent-infrastructure/projects-server/plugin"
import { stackAdminDashboardPlugin } from "@agent-infrastructure/stack-admin-server/plugin"
import { uiDesignCanvasDashboardPlugin } from "@agent-infrastructure/ui-design-canvas-ui/plugin"

export type DashboardHostRole = "manager" | "admin"

const managerDashboardFeaturePlugins: DashboardFeaturePlugin[] = [
  agentChatDashboardPlugin,
  agentSwarmDashboardPlugin,
  agentWorkbenchDashboardPlugin,
  uiDesignCanvasDashboardPlugin,
  floatingWindowDebugDashboardPlugin,
  agentGraphDashboardPlugin,
  dashboardTerminalPlugin,
  projectsDashboardPlugin,
  dashboardSettingsDashboardPlugin,
]

const adminDashboardFeaturePlugins: DashboardFeaturePlugin[] = [
  stackAdminDashboardPlugin,
  projectsDashboardPlugin,
  agentChatDashboardPlugin,
  dashboardTerminalPlugin,
]

export function getDashboardFeaturePlugins(
  hostRole: DashboardHostRole,
): DashboardFeaturePlugin[] {
  return hostRole === "admin"
    ? adminDashboardFeaturePlugins
    : managerDashboardFeaturePlugins
}

export const dashboardFeaturePlugins = getDashboardFeaturePlugins("manager")
