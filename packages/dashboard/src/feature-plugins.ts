import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";
import { agentChatDashboardPlugin } from "@agent-infrastructure/agent-chat-ui/plugin";
import { agentGraphDashboardPlugin } from "@agent-infrastructure/agent-graph-ui/plugin";
import { agentSwarmDashboardPlugin } from "@agent-infrastructure/agent-swarm-ui/plugin";
import { dashboardTerminalPlugin } from "@agent-infrastructure/dashboard-terminal-ui/plugin";
import { projectsDashboardPlugin } from "@agent-infrastructure/projects-ui/plugin";

export const dashboardFeaturePlugins: DashboardFeaturePlugin[] = [
  agentSwarmDashboardPlugin,
  projectsDashboardPlugin,
  agentChatDashboardPlugin,
  agentGraphDashboardPlugin,
  dashboardTerminalPlugin,
];
