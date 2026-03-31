import { AGENT_GRAPH_APP_VERSION } from "virtual:agent-graph-app-version"
import { AgentGraphScreen } from "@agent-infrastructure/agent-graph-ui"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"

export function App() {
  useRenderCounter("App")
  const serverOrigin =
    import.meta.env.VITE_AGENT_GRAPH_SERVER_ORIGIN ?? "http://localhost:8788"
  const wsServerOrigin = serverOrigin.replace(/^http/i, "ws")

  return (
    <AgentGraphScreen
      appVersion={AGENT_GRAPH_APP_VERSION}
      apiRootUrl={`${serverOrigin}/api/agent-graph`}
      wsRootUrl={`${wsServerOrigin}/api/agent-graph/ws`}
    />
  )
}
