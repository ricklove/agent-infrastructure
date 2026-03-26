import { agentChatDashboardUiPlugin } from "@agent-infrastructure/agent-chat-ui/ui-plugin"
import { agentGraphDashboardUiPlugin } from "@agent-infrastructure/agent-graph-ui/ui-plugin"
import { agentSwarmDashboardUiPlugin } from "@agent-infrastructure/agent-swarm-ui/ui-plugin"
import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardTerminalUiPlugin } from "@agent-infrastructure/dashboard-terminal-ui/ui-plugin"
import { projectsDashboardUiPlugin } from "@agent-infrastructure/projects-ui/ui-plugin"
import { uiDesignCanvasDashboardUiPlugin } from "@agent-infrastructure/ui-design-canvas-ui/ui-plugin"

export const dashboardFeaturePlugins: DashboardFeatureUiPlugin[] = [
  agentSwarmDashboardUiPlugin,
  uiDesignCanvasDashboardUiPlugin,
  projectsDashboardUiPlugin,
  agentChatDashboardUiPlugin,
  agentGraphDashboardUiPlugin,
  dashboardTerminalUiPlugin,
]
