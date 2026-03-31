import { AGENT_GRAPH_APP_VERSION } from "virtual:agent-graph-app-version"
import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles.css"

console.log("[agent-graph] version", AGENT_GRAPH_APP_VERSION)

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Agent graph root element was not found.")
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
