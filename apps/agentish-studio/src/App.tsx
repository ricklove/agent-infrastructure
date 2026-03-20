import { AgentGraphScreen } from "@agent-infrastructure/agent-graph-ui";
import { AGENT_GRAPH_APP_VERSION } from "./app-version";

export function App() {
  return (
    <AgentGraphScreen
      appVersion={AGENT_GRAPH_APP_VERSION}
      serverOrigin={import.meta.env.VITE_AGENT_GRAPH_SERVER_ORIGIN ?? "http://localhost:8788"}
    />
  );
}
