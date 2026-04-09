type AdminCompatHealth = {
  ok: boolean
  connectedWorkers: number
  staleWorkers: number
  hostRole: "admin"
}

const port = Number.parseInt(process.env.ADMIN_COMPAT_PORT ?? "8787", 10)
const hostname = process.env.ADMIN_COMPAT_HOST?.trim() || "127.0.0.1"

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("invalid ADMIN_COMPAT_PORT")
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

const health: AdminCompatHealth = {
  ok: true,
  connectedWorkers: 0,
  staleWorkers: 0,
  hostRole: "admin",
}

const emptyWorkers = { workers: [] as unknown[] }
const emptyTimeline = {
  ok: true,
  workerId: "admin-host",
  sinceTsMs: Date.now(),
  untilTsMs: Date.now(),
  hostSamples: [] as unknown[],
  processSamples: [] as unknown[],
}
const emptyEvents = { ok: true, events: [] as unknown[] }
const emptyServices = {
  ok: true,
  rootNamespace: "admin",
  services: [] as unknown[],
}

const server = Bun.serve({
  hostname,
  port,
  fetch(request) {
    const url = new URL(request.url)
    switch (url.pathname) {
      case "/health":
      case "/api/health":
      case "/api/agent-swarm/health":
        return json(health)
      case "/workers":
      case "/api/workers":
      case "/api/agent-swarm/workers":
        return json(emptyWorkers)
      case "/workers/timeline":
      case "/api/workers/timeline":
      case "/api/agent-swarm/workers/timeline":
        return json(emptyTimeline)
      case "/workers/events":
      case "/api/workers/events":
      case "/api/agent-swarm/workers/events":
        return json(emptyEvents)
      case "/services":
      case "/api/services":
        return json(emptyServices)
      default:
        return json({ ok: false, error: "not found" }, 404)
    }
  },
})

console.log(
  JSON.stringify({
    ok: true,
    port: server.port,
    hostname,
    role: "admin-compat",
  }),
)
