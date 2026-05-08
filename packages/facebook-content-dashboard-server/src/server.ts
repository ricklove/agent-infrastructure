import { buildSnapshotResponse, loadContentDashboardSnapshot } from "./snapshot-loader.js"

const port = Number.parseInt(
  process.env.FACEBOOK_CONTENT_DASHBOARD_PORT ?? "8796",
  10,
)

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

Bun.serve({
  port,
  idleTimeout: 30,
  fetch(request) {
    const url = new URL(request.url)

    if (request.method !== "GET") {
      return jsonResponse({ ok: false, error: "method not allowed" }, 405)
    }

    if (url.pathname === "/api/facebook-content-dashboard/health") {
      const loaded = loadContentDashboardSnapshot()
      return jsonResponse({
        ok: true,
        feature: "facebook-content-dashboard",
        mode: loaded.mode,
        source: loaded.source,
      })
    }

    if (url.pathname === "/api/facebook-content-dashboard/snapshot") {
      return jsonResponse(buildSnapshotResponse())
    }

    return jsonResponse({ ok: false, error: "not found" }, 404)
  },
})
