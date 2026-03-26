import { DASHBOARD_APP_VERSION } from "virtual:dashboard-app-version"
import { DashboardShell } from "@agent-infrastructure/dashboard-ui"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"

export function App() {
  useRenderCounter("App")
  return <DashboardShell appVersion={DASHBOARD_APP_VERSION} />
}
