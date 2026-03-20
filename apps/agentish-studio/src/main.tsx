import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AGENT_GRAPH_APP_VERSION } from "virtual:agent-graph-app-version";
import "./styles.css";

console.log("[agent-graph] version", AGENT_GRAPH_APP_VERSION);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
