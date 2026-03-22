import { DashboardShell } from "@agent-infrastructure/dashboard-ui"
import { DASHBOARD_APP_VERSION } from "virtual:dashboard-app-version"

export function App() {
  return <DashboardShell appVersion={DASHBOARD_APP_VERSION} />
}
