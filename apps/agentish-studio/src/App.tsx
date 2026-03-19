import { AgentGraphScreen } from "@agent-infrastructure/agent-graph-ui";

export function App() {
  return <AgentGraphScreen serverOrigin={import.meta.env.VITE_AGENT_GRAPH_SERVER_ORIGIN ?? "http://localhost:8788"} />;
}
