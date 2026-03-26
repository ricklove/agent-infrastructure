import { DASHBOARD_APP_VERSION } from "virtual:dashboard-app-version"
import { DashboardShell } from "@agent-infrastructure/dashboard-ui"

export function App() {
  return <DashboardShell appVersion={DASHBOARD_APP_VERSION} />
}
