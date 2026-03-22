import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin";
import { agentChatDashboardPlugin } from "@agent-infrastructure/agent-chat-ui/plugin";
import { agentGraphDashboardPlugin } from "@agent-infrastructure/agent-graph-ui/plugin";
import { agentSwarmDashboardPlugin } from "@agent-infrastructure/agent-swarm-ui/plugin";

export const dashboardFeaturePlugins: DashboardFeaturePlugin[] = [
  agentSwarmDashboardPlugin,
  agentChatDashboardPlugin,
  agentGraphDashboardPlugin,
];
