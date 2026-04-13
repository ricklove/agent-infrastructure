import type { DashboardFeaturePlugin } from "@agent-infrastructure/dashboard-plugin"

export const agentChatDashboardPlugin: DashboardFeaturePlugin = {
  id: "chat",
  label: "Agent Chat",
  route: "/chat",
  description: "Workspace-native multi-session chat.",
  icon: "chat",
  screen: {
    getProps: ({ windowOrigin, windowWsOrigin }) => ({
      apiRootUrl: `${windowOrigin}/api/agent-chat`,
      wsRootUrl: `${windowWsOrigin}/ws/agent-chat`,
    }),
  },
  backend: {
    id: "agent-chat",
    apiBasePath: "/api/agent-chat",
    wsBasePath: "/ws/agent-chat",
    upstreamWsPath: "/api/agent-chat/ws",
    upstreamBaseUrlEnv: "AGENT_CHAT_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:8789",
    healthPath: "/api/agent-chat/health",
    startupPolicy: "always",
    startup: {
      kind: "bun-entry",
      entry: "packages/agent-chat-server/src/index.ts",
      logFileName: "agent-chat-server.log",
    },
  },
}
