export const dashboardSessionStorageKey =
  "agent-infrastructure.dashboard.session"

export function readDashboardSessionToken(): string {
  if (typeof window === "undefined") {
    return ""
  }
  return window.sessionStorage.getItem(dashboardSessionStorageKey) ?? ""
}

export function readDashboardSessionAuthorizationHeader(): string {
  const sessionToken = readDashboardSessionToken().trim()
  return sessionToken ? `Bearer ${sessionToken}` : ""
}

export async function dashboardSessionFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers)
  const authorization = readDashboardSessionAuthorizationHeader()

  if (authorization) {
    headers.set("Authorization", authorization)
  }

  return fetch(path, {
    ...init,
    headers,
  })
}
