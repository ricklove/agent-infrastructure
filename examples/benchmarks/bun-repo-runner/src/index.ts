const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const startedAt = Date.now();
const swarmNamespace = process.env.SWARM_NAMESPACE ?? "root";
const swarmServiceName = process.env.SWARM_SERVICE_NAME ?? "bun-repo-runner";
const swarmInstanceId = process.env.SWARM_INSTANCE_ID ?? "bun-repo-runner-local";
const swarmManagerUrl = process.env.SWARM_MANAGER_URL ?? "http://127.0.0.1:8787";
const swarmManagerToken = process.env.SWARM_MANAGER_TOKEN ?? "";
const swarmWorkerId = process.env.SWARM_WORKER_ID ?? "";
const swarmWorkerPrivateIp = process.env.SWARM_WORKER_PRIVATE_IP ?? "";
const runnerRepoRef = process.env.RUNNER_REPO_REF ?? "development";
const runnerAppDir =
  process.env.RUNNER_APP_DIR ?? "examples/benchmarks/bun-repo-runner";

async function emitEvent(
  eventType: "service_ready",
  details: Record<string, unknown>,
): Promise<void> {
  if (!swarmManagerToken || !swarmWorkerId || !swarmWorkerPrivateIp) {
    return;
  }

  await fetch(`${swarmManagerUrl}/workers/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-swarm-token": swarmManagerToken,
    },
    body: JSON.stringify({
      workerId: swarmWorkerId,
      instanceId: swarmWorkerId,
      privateIp: swarmWorkerPrivateIp,
      nodeRole: "worker",
      eventType,
      eventTsMs: Date.now(),
      details: {
        namespace: swarmNamespace,
        serviceName: swarmServiceName,
        instanceId: swarmInstanceId,
        repoRef: runnerRepoRef,
        appDir: runnerAppDir,
        ...details,
      },
    }),
  }).catch(() => undefined);
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        namespace: swarmNamespace,
        serviceName: swarmServiceName,
        instanceId: swarmInstanceId,
        uptimeMs: Date.now() - startedAt,
        repoRef: runnerRepoRef,
        appDir: runnerAppDir,
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        ok: true,
        message: "bun repo runner benchmark",
        endpoints: ["/", "/health"],
      });
    }

    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  },
});

await emitEvent("service_ready", {
  port: server.port,
});

console.log(`bun repo runner benchmark listening on http://0.0.0.0:${server.port}`);

export {};
