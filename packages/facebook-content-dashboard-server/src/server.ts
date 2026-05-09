import { buildSnapshotResponse, loadContentDashboardSnapshot } from "./snapshot-loader.js"
import { generateImageDraft, generateTextDrafts } from "./generation-provider.js"
import { extname, resolve } from "node:path"

const port = Number.parseInt(
  process.env.FACEBOOK_CONTENT_DASHBOARD_PORT ?? "8796",
  10,
)

const allowedMediaRoots = [
  "/home/ec2-user/workspace/tmp/brightdata-facebook-eval-100/images",
  "/home/ec2-user/workspace/tmp/content-creation-generated",
]

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function contentTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg"
  }
  if (ext === ".png") {
    return "image/png"
  }
  if (ext === ".webp") {
    return "image/webp"
  }
  return "application/octet-stream"
}

function isAllowedMediaPath(path: string): boolean {
  const resolved = resolve(path)
  return allowedMediaRoots.some((root) => resolved.startsWith(`${resolve(root)}/`))
}

Bun.serve({
  port,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/api/facebook-content-dashboard/health") {
      const loaded = loadContentDashboardSnapshot()
      return jsonResponse({
        ok: true,
        feature: "facebook-content-dashboard",
        mode: loaded.mode,
        source: loaded.source,
      })
    }

    if (request.method === "GET" && url.pathname === "/api/facebook-content-dashboard/snapshot") {
      return jsonResponse(buildSnapshotResponse())
    }

    if (request.method === "GET" && url.pathname === "/api/facebook-content-dashboard/media") {
      const path = url.searchParams.get("path")
      if (!path || !isAllowedMediaPath(path)) {
        return jsonResponse({ ok: false, error: "invalid media path" }, 400)
      }

      const file = Bun.file(path)
      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": contentTypeForPath(path),
          "Cache-Control": "public, max-age=3600",
        },
      })
    }

    if (request.method === "POST" && url.pathname === "/api/facebook-content-dashboard/generate-text") {
      return jsonResponse(await generateTextDrafts((await request.json()) as any))
    }

    if (request.method === "POST" && url.pathname === "/api/facebook-content-dashboard/generate-image") {
      return jsonResponse(await generateImageDraft((await request.json()) as any))
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse({ ok: false, error: "method not allowed" }, 405)
    }

    return jsonResponse({ ok: false, error: "not found" }, 404)
  },
})
