import { dashboardSessionFetch, readDashboardSessionToken } from "@agent-infrastructure/dashboard-plugin"

export { projectsDashboardPlugin } from "@agent-infrastructure/projects-server/plugin"
export { readDashboardSessionToken }

export async function dashboardAuthorizedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return dashboardSessionFetch(path, init) as Promise<Response>
}
