type DashboardSessionStorage = {
  getItem(key: string): string | null
}

declare const WebSocket: {
  prototype: {
    readyState: number
    send(data: string): void
    close(): void
    addEventListener(
      type: "open" | "close" | "error",
      listener: () => void,
    ): void
  }
  readonly CONNECTING: number
  readonly OPEN: number
  readonly CLOSING: number
  readonly CLOSED: number
  new (url: string, protocols?: string[]): {
    readyState: number
    send(data: string): void
    close(): void
    addEventListener(
      type: "open" | "close" | "error",
      listener: () => void,
    ): void
  }
}

type DashboardSessionWindow = {
  sessionStorage?: DashboardSessionStorage
  location?: {
    origin: string
    href: string
  }
  navigator?: {
    userAgent?: string
  }
}

type HeadersForEachLike = {
  forEach(callback: (value: string, key: string) => void): void
}

type DashboardSessionFetchInit = {
  method?: string
  body?: unknown
  headers?: unknown
}

const dashboardSessionStorageKey = "agent-infrastructure.dashboard.session"
const dashboardDebugLogWebSocketProtocolPrefix = "dashboard-session.v1."
type DashboardDebugSocket = InstanceType<typeof WebSocket>

let dashboardDebugSocket: DashboardDebugSocket | null = null
let dashboardDebugSocketUrl = ""
let dashboardDebugSocketProtocolsKey = ""
const dashboardDebugQueue: string[] = []

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

function windowLocationOrigin(): string {
  return (globalThis as { window?: DashboardSessionWindow }).window?.location
    ?.origin
    ? String(
        (globalThis as { window?: DashboardSessionWindow }).window?.location
          ?.origin,
      )
    : ""
}

function windowLocationHref(): string {
  return (globalThis as { window?: DashboardSessionWindow }).window?.location
    ?.href
    ? String(
        (globalThis as { window?: DashboardSessionWindow }).window?.location
          ?.href,
      )
    : ""
}

function windowUserAgent(): string {
  return (globalThis as { window?: DashboardSessionWindow }).window?.navigator
    ?.userAgent
    ? String(
        (globalThis as { window?: DashboardSessionWindow }).window?.navigator
          ?.userAgent,
      )
    : ""
}

function dashboardDebugLogSocketUrl(): string {
  const origin = windowLocationOrigin()
  if (!origin) {
    return ""
  }
  return `${origin.replace(/^http/, "ws")}/ws/debug-log`
}

function ensureDashboardDebugSocket(): DashboardDebugSocket | null {
  if (typeof WebSocket !== "function") {
    return null
  }

  const socketUrl = dashboardDebugLogSocketUrl()
  if (!socketUrl) {
    return null
  }

  const protocols = dashboardSessionWebSocketProtocols(
    dashboardDebugLogWebSocketProtocolPrefix,
  )
  const protocolsKey = protocols.join(",")

  if (
    dashboardDebugSocket &&
    dashboardDebugSocket.readyState <= WebSocket.OPEN &&
    dashboardDebugSocketUrl === socketUrl &&
    dashboardDebugSocketProtocolsKey === protocolsKey
  ) {
    return dashboardDebugSocket
  }

  try {
    dashboardDebugSocket?.close()
  } catch {}

  dashboardDebugSocketUrl = socketUrl
  dashboardDebugSocketProtocolsKey = protocolsKey
  dashboardDebugSocket =
    protocols.length > 0
      ? new WebSocket(socketUrl, protocols)
      : new WebSocket(socketUrl)

  dashboardDebugSocket.addEventListener("open", () => {
    while (dashboardDebugQueue.length > 0) {
      const nextPayload = dashboardDebugQueue.shift()
      if (nextPayload == null) {
        continue
      }
      try {
        dashboardDebugSocket?.send(nextPayload)
      } catch {
        dashboardDebugQueue.unshift(nextPayload)
        break
      }
    }
  })

  dashboardDebugSocket.addEventListener("close", () => {
    if (dashboardDebugSocket?.readyState === WebSocket.CLOSED) {
      dashboardDebugSocket = null
    }
  })

  dashboardDebugSocket.addEventListener("error", () => {
    try {
      dashboardDebugSocket?.close()
    } catch {}
    dashboardDebugSocket = null
  })

  return dashboardDebugSocket
}

export function dashboardSessionDebugLog(
  message: string,
  detail?: unknown,
): void {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    message,
    detail: detail ?? null,
    href: windowLocationHref(),
    userAgent: windowUserAgent(),
  })

  const socket = ensureDashboardDebugSocket()
  if (!socket) {
    return
  }

  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(payload)
      return
    } catch {}
  }

  dashboardDebugQueue.push(payload)
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
