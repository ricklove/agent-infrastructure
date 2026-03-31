type DashboardSessionStorage = {
  getItem(key: string): string | null
}

type DashboardSessionWindow = {
  sessionStorage?: DashboardSessionStorage
}

type HeadersForEachLike = {
  forEach(callback: (value: string, key: string) => void): void
}

type DashboardSessionFetchInit = {
  headers?: unknown
}

const dashboardSessionStorageKey = "agent-infrastructure.dashboard.session"

function sessionStorage(): DashboardSessionStorage | undefined {
  return (globalThis as { window?: DashboardSessionWindow }).window
    ?.sessionStorage
}

function isHeadersForEachLike(value: unknown): value is HeadersForEachLike {
  return Boolean(
    value &&
      typeof value === "object" &&
      "forEach" in value &&
      typeof (value as { forEach?: unknown }).forEach === "function",
  )
}

export function readDashboardSessionToken(): string {
  return sessionStorage()?.getItem(dashboardSessionStorageKey)?.trim() ?? ""
}

export function dashboardSessionAuthorizationHeaderValue(): string {
  const sessionToken = readDashboardSessionToken()
  return sessionToken ? `Bearer ${sessionToken}` : ""
}

export function dashboardSessionWebSocketProtocols(prefix: string): string[] {
  const sessionToken = readDashboardSessionToken()
  if (!sessionToken) {
    return []
  }
  return [`${prefix}${sessionToken}`]
}

export function createDashboardSessionHeaders(
  initHeaders?: unknown,
): Record<string, string> {
  let headers: Record<string, string>
  if (Array.isArray(initHeaders)) {
    headers = Object.fromEntries(initHeaders)
  } else if (isHeadersForEachLike(initHeaders)) {
    headers = {}
    initHeaders.forEach((value, key) => {
      headers[key] = value
    })
  } else {
    headers = { ...((initHeaders as Record<string, string> | undefined) ?? {}) }
  }

  const authorization = dashboardSessionAuthorizationHeaderValue()
  if (authorization) {
    headers.Authorization = authorization
  }
  return headers
}

export async function dashboardSessionFetch(
  input: string,
  init?: DashboardSessionFetchInit,
): Promise<unknown> {
  const fetchFn = (
    globalThis as {
      fetch?: (
        input: string,
        init?: DashboardSessionFetchInit,
      ) => Promise<unknown>
    }
  ).fetch
  if (typeof fetchFn !== "function") {
    throw new Error("Fetch is unavailable in this runtime")
  }
  return fetchFn(input, {
    ...init,
    headers: createDashboardSessionHeaders(init?.headers),
  })
}
