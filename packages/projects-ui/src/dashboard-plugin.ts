export { projectsDashboardPlugin } from "@agent-infrastructure/projects-server/plugin"


const dashboardSessionStorageKey = "agent-infrastructure.dashboard.session"

export function readDashboardSessionToken(): string {
  return window.sessionStorage.getItem(dashboardSessionStorageKey) ?? ""
}

export async function dashboardAuthorizedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  const sessionToken = readDashboardSessionToken().trim()
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`)
  }
  return fetch(path, {
    ...init,
    headers,
  })
}
