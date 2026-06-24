import { loadHealthDashboardPayload } from "./health-data.js"

const port = Number.parseInt(process.env.HEALTH_DASHBOARD_PORT ?? "8796", 10)
const repoRoot = process.env.HEALTH_DASHBOARD_REPO_ROOT?.trim() || process.cwd()

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  })
}

function notFound(pathname: string): Response {
  return jsonResponse({ ok: false, error: `No health dashboard route for ${pathname}` }, { status: 404 })
}

Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/api/health-dashboard/health") {
      return jsonResponse({ ok: true, service: "health-dashboard", repoRoot })
    }
    if (request.method === "GET" && url.pathname === "/api/health-dashboard/profiles") {
      return jsonResponse(loadHealthDashboardPayload(repoRoot))
    }
    return notFound(url.pathname)
  },
})

console.log(`Health dashboard API listening on http://127.0.0.1:${port}`)
