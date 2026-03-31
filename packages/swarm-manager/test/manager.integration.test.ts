import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const testRoot = mkdtempSync(join(tmpdir(), "swarm-manager-test-"))
const managerPort = 8877
const sharedToken = "test-token"
const metricsDbPath = join(testRoot, "metrics.sqlite")
const workerUrl = `ws://127.0.0.1:${managerPort}/workers/stream`
const fakeZombieWorkerId = "i-zombie-worker"
const fakeZombieInventory = JSON.stringify([
  {
    instanceId: fakeZombieWorkerId,
    privateIp: "10.0.0.33",
    state: "running",
    launchTimeMs: Date.now() - 10 * 60 * 1000,
  },
])
const swarmManagerCwd =
  process.env.SWARM_MANAGER_TEST_CWD ??
  "/home/ec2-user/workspace/projects/agent-infrastructure/packages/swarm-manager"

let managerProcess: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null
const workerProcesses: Bun.Subprocess<"ignore", "pipe", "pipe">[] = []

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }

    await Bun.sleep(intervalMs)
  }

  throw new Error(`condition not met within ${timeoutMs}ms`)
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = (await response.json()) as T

  if (!response.ok) {
    throw new Error(`request failed for ${url} with status ${response.status}`)
  }

  return payload
}

function spawnWorkerAgent(
  workerId: string,
  instanceId: string,
  privateIp: string,
  nodeRole: "manager" | "worker" = "worker",
): void {
  const workerProcess = Bun.spawn(["bun", "run", "src/worker/agent.ts"], {
    cwd: swarmManagerCwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      MONITOR_MANAGER_URL: workerUrl,
      MONITOR_SHARED_TOKEN: sharedToken,
      MONITOR_WORKER_ID: workerId,
      MONITOR_INSTANCE_ID: instanceId,
      MONITOR_PRIVATE_IP: privateIp,
      MONITOR_NODE_ROLE: nodeRole,
    },
  })

  workerProcesses.push(workerProcess)
}

beforeAll(async () => {
  managerProcess = Bun.spawn(["bun", "run", "src/manager/server.ts"], {
    cwd: swarmManagerCwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      SWARM_SHARED_TOKEN: sharedToken,
      MANAGER_WS_PORT: String(managerPort),
      METRICS_DB_PATH: metricsDbPath,
      SWARM_EC2_INVENTORY_JSON: fakeZombieInventory,
      SWARM_EC2_INVENTORY_REFRESH_SECONDS: "1",
      SWARM_WORKER_ZOMBIE_THRESHOLD_SECONDS: "1",
    },
  })

  await waitFor(async () => {
    const response = await fetch(
      `http://127.0.0.1:${managerPort}/health`,
    ).catch(() => null)
    return response?.ok ?? false
  })
})

afterAll(async () => {
  for (const process of workerProcesses) {
    process.kill()
    await process.exited
  }

  if (managerProcess) {
    managerProcess.kill()
    await managerProcess.exited
  }

  rmSync(testRoot, { recursive: true, force: true })
})

describe("manager integration", () => {
  test("worker agents connect and are reported by the manager", async () => {
    spawnWorkerAgent("worker-a", "i-worker-a", "10.0.0.21")
    spawnWorkerAgent("worker-b", "i-worker-b", "10.0.0.22")
    spawnWorkerAgent("i-manager", "i-manager", "10.0.0.10", "manager")

    await waitFor(async () => {
      const payload = await fetchJson<{
        workers: Array<{
          workerId: string
          status: string
          privateIp: string
          nodeRole: "manager" | "worker"
        }>
      }>(`http://127.0.0.1:${managerPort}/workers`)

      return (
        payload.workers.length >= 3 &&
        payload.workers.some(
          (worker) =>
            worker.workerId === "worker-a" &&
            worker.nodeRole === "worker" &&
            worker.status === "connected" &&
            worker.privateIp === "10.0.0.21",
        ) &&
        payload.workers.some(
          (worker) =>
            worker.workerId === "worker-b" &&
            worker.nodeRole === "worker" &&
            worker.status === "connected" &&
            worker.privateIp === "10.0.0.22",
        ) &&
        payload.workers.some(
          (worker) =>
            worker.workerId === "i-manager" &&
            worker.nodeRole === "manager" &&
            worker.status === "connected" &&
            worker.privateIp === "10.0.0.10",
        )
      )
    })

    await waitFor(async () => {
      const payload = await fetchJson<{
        workers: Array<{
          workerId: string
          lastMetrics: { containerCount: number } | null
        }>
      }>(`http://127.0.0.1:${managerPort}/workers`)

      return (
        payload.workers.filter(
          (worker) =>
            ["worker-a", "worker-b", "i-manager"].includes(worker.workerId) &&
            worker.lastMetrics !== null,
        ).length === 3
      )
    })

    const payload = await fetchJson<{
      workers: Array<{
        workerId: string
        status: string
        lastMetrics: { containerCount: number } | null
      }>
    }>(`http://127.0.0.1:${managerPort}/workers`)

    expect(payload.workers.length).toBeGreaterThanOrEqual(2)
  })

  test("service registry resolves same-namespace first and falls back to root", async () => {
    await fetchJson(`http://127.0.0.1:${managerPort}/services/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-swarm-token": sharedToken,
      },
      body: JSON.stringify({
        workerId: "worker-a",
        workerPrivateIp: "10.0.0.21",
        namespace: "root",
        serviceName: "auth",
        instanceId: "auth-root-1",
        hostPort: 20001,
        containerPort: 3000,
        protocol: "http",
      }),
    })

    await fetchJson(`http://127.0.0.1:${managerPort}/services/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-swarm-token": sharedToken,
      },
      body: JSON.stringify({
        workerId: "worker-b",
        workerPrivateIp: "10.0.0.22",
        namespace: "team-a",
        serviceName: "backend",
        instanceId: "backend-team-a-1",
        hostPort: 20002,
        containerPort: 3000,
        protocol: "http",
      }),
    })

    await fetchJson(`http://127.0.0.1:${managerPort}/services/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-swarm-token": sharedToken,
      },
      body: JSON.stringify({
        workerId: "worker-a",
        workerPrivateIp: "10.0.0.21",
        namespace: "team-b",
        serviceName: "backend",
        instanceId: "backend-team-b-1",
        hostPort: 20003,
        containerPort: 3000,
        protocol: "http",
      }),
    })

    const localBackend = await fetchJson<{
      resolvedNamespace: string
      endpoint: { host: string; port: number }
    }>(
      `http://127.0.0.1:${managerPort}/services/resolve/backend?callerNamespace=team-a`,
    )
    expect(localBackend.resolvedNamespace).toBe("team-a")
    expect(localBackend.endpoint.host).toBe("10.0.0.22")
    expect(localBackend.endpoint.port).toBe(20002)

    const otherNamespace = await fetchJson<{
      resolvedNamespace: string
      endpoint: { host: string; port: number }
    }>(
      `http://127.0.0.1:${managerPort}/services/resolve/backend?callerNamespace=team-b`,
    )
    expect(otherNamespace.resolvedNamespace).toBe("team-b")
    expect(otherNamespace.endpoint.host).toBe("10.0.0.21")
    expect(otherNamespace.endpoint.port).toBe(20003)

    const rootFallback = await fetchJson<{
      resolvedNamespace: string
      endpoint: { host: string; port: number }
    }>(
      `http://127.0.0.1:${managerPort}/services/resolve/auth?callerNamespace=team-a`,
    )
    expect(rootFallback.resolvedNamespace).toBe("root")
    expect(rootFallback.endpoint.host).toBe("10.0.0.21")
    expect(rootFallback.endpoint.port).toBe(20001)
  })

  test("port leases are unique per worker and reusable after release", async () => {
    const firstLease = await fetchJson<{ hostPort: number }>(
      `http://127.0.0.1:${managerPort}/ports/lease`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-swarm-token": sharedToken,
        },
        body: JSON.stringify({
          workerId: "worker-a",
          namespace: "team-a",
          serviceName: "frontend",
          instanceId: "frontend-1",
        }),
      },
    )

    const secondLease = await fetchJson<{ hostPort: number }>(
      `http://127.0.0.1:${managerPort}/ports/lease`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-swarm-token": sharedToken,
        },
        body: JSON.stringify({
          workerId: "worker-a",
          namespace: "team-a",
          serviceName: "browser",
          instanceId: "browser-1",
        }),
      },
    )

    expect(secondLease.hostPort).not.toBe(firstLease.hostPort)

    await fetchJson(`http://127.0.0.1:${managerPort}/ports/release`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-swarm-token": sharedToken,
      },
      body: JSON.stringify({
        workerId: "worker-a",
        hostPort: firstLease.hostPort,
      }),
    })

    const reusedLease = await fetchJson<{ hostPort: number }>(
      `http://127.0.0.1:${managerPort}/ports/lease`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-swarm-token": sharedToken,
        },
        body: JSON.stringify({
          workerId: "worker-a",
          namespace: "team-a",
          serviceName: "frontend",
          instanceId: "frontend-2",
        }),
      },
    )

    expect(reusedLease.hostPort).toBe(firstLease.hostPort)
  })

  test("worker lifecycle events can be recorded and queried", async () => {
    await fetchJson(`http://127.0.0.1:${managerPort}/workers/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-swarm-token": sharedToken,
      },
      body: JSON.stringify({
        workerId: "worker-a",
        instanceId: "i-worker-a",
        privateIp: "10.0.0.21",
        nodeRole: "worker",
        eventType: "hibernated",
        eventTsMs: Date.now(),
        details: {
          reason: "idle",
        },
      }),
    })

    const events = await fetchJson<{
      ok: boolean
      events: Array<{
        workerId: string
        eventType: string
        details: { reason?: string } | null
      }>
    }>(
      `http://127.0.0.1:${managerPort}/workers/events?workerId=worker-a&limit=20`,
    )

    expect(events.ok).toBe(true)
    expect(
      events.events.some(
        (event) =>
          event.workerId === "worker-a" &&
          event.eventType === "hibernated" &&
          event.details?.reason === "idle",
      ),
    ).toBe(true)
  })

  test("running EC2 workers without telemetry are marked zombie", async () => {
    await waitFor(async () => {
      const payload = await fetchJson<{
        workers: Array<{
          workerId: string
          status: string
          privateIp: string
          nodeRole: "manager" | "worker"
        }>
      }>(`http://127.0.0.1:${managerPort}/workers`)

      return payload.workers.some(
        (worker) =>
          worker.workerId === fakeZombieWorkerId &&
          worker.nodeRole === "worker" &&
          worker.status === "zombie" &&
          worker.privateIp === "10.0.0.33",
      )
    }, 5_000)

    const events = await fetchJson<{
      ok: boolean
      events: Array<{
        workerId: string
        eventType: string
        details: { reason?: string } | null
      }>
    }>(
      `http://127.0.0.1:${managerPort}/workers/events?workerId=${fakeZombieWorkerId}&limit=20`,
    )

    expect(events.ok).toBe(true)
    expect(
      events.events.some(
        (event) =>
          event.workerId === fakeZombieWorkerId &&
          event.eventType === "zombie" &&
          event.details?.reason === "running_without_telemetry",
      ),
    ).toBe(true)
  })
})
