import { agentChatDashboardPlugin } from "@agent-infrastructure/agent-chat-server/plugin"
import { agentGraphDashboardPlugin } from "@agent-infrastructure/agent-graph-ui/plugin"
import { agentSwarmDashboardPlugin } from "@agent-infrastructure/agent-swarm-ui/plugin"
import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"
import { dashboardTerminalPlugin } from "@agent-infrastructure/dashboard-terminal-ui/plugin"
import { floatingWindowDebugDashboardPlugin } from "@agent-infrastructure/floating-window-debug-ui/plugin"
import { projectsDashboardPlugin } from "@agent-infrastructure/projects-server/plugin"
import { uiDesignCanvasDashboardPlugin } from "@agent-infrastructure/ui-design-canvas-ui/plugin"

export const dashboardFeaturePlugins: DashboardFeaturePlugin[] = [
  agentSwarmDashboardPlugin,
  uiDesignCanvasDashboardPlugin,
  floatingWindowDebugDashboardPlugin,
  projectsDashboardPlugin,
  agentChatDashboardPlugin,
  agentGraphDashboardPlugin,
  dashboardTerminalPlugin,
]
