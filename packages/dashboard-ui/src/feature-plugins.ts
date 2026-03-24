import type { DashboardFeatureUiPlugin } from "@agent-infrastructure/dashboard-plugin";
import { agentChatDashboardUiPlugin } from "@agent-infrastructure/agent-chat-ui/ui-plugin";
import { agentGraphDashboardUiPlugin } from "@agent-infrastructure/agent-graph-ui/ui-plugin";
import { agentSwarmDashboardUiPlugin } from "@agent-infrastructure/agent-swarm-ui/ui-plugin";
import { dashboardTerminalUiPlugin } from "@agent-infrastructure/dashboard-terminal-ui/ui-plugin";

export const dashboardFeaturePlugins: DashboardFeatureUiPlugin[] = [
  agentSwarmDashboardUiPlugin,
  agentChatDashboardUiPlugin,
  agentGraphDashboardUiPlugin,
  dashboardTerminalUiPlugin,
];
