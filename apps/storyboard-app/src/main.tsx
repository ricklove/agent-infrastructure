import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles.css"

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Missing root element")
}

document.documentElement.style.margin = "0"
document.documentElement.style.height = "100%"
document.body.style.margin = "0"
document.body.style.height = "100%"

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
