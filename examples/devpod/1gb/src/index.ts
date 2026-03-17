const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const serviceName = process.env.SERVICE_NAME ?? "devpod-example-1gb";
const memoryProfileMb = Number.parseInt(process.env.MEMORY_PROFILE_MB ?? "1024", 10);
const swarmNamespace = process.env.SWARM_NAMESPACE ?? "root";
const swarmServiceName = process.env.SWARM_SERVICE_NAME ?? serviceName;
const swarmInstanceId = process.env.SWARM_INSTANCE_ID ?? `${swarmServiceName}-local`;
const swarmManagerUrl = process.env.SWARM_MANAGER_URL ?? "http://127.0.0.1:8787";
const swarmFallbackNamespace = process.env.SWARM_FALLBACK_NAMESPACE ?? "root";
const startedAt = Date.now();

type ResolvedEndpoint = {
  host: string;
  port: number;
  protocol: string;
  healthy: boolean;
};

async function resolveService(
  dependencyName: string,
  exactNamespace?: string,
): Promise<Response> {
  const encodedServiceName = encodeURIComponent(dependencyName);
  const targetUrl = exactNamespace
    ? `${swarmManagerUrl}/services/resolve/${encodeURIComponent(exactNamespace)}/${encodedServiceName}`
    : `${swarmManagerUrl}/services/resolve/${encodedServiceName}?callerNamespace=${encodeURIComponent(swarmNamespace)}&fallbackNamespace=${encodeURIComponent(swarmFallbackNamespace)}`;

  const response = await fetch(targetUrl);
  const payload = (await response.json()) as
    | {
        endpoint: ResolvedEndpoint;
        instances: unknown[];
        resolvedNamespace: string;
      }
    | { error: string };

  if (!response.ok) {
    return Response.json(
      {
        ok: false,
        dependencyName,
        namespace: exactNamespace ?? swarmNamespace,
        error: "error" in payload ? payload.error : "service resolution failed",
      },
      { status: response.status },
    );
  }

  return Response.json({
    ok: true,
    dependencyName,
    namespace: swarmNamespace,
    resolvedNamespace: payload.resolvedNamespace,
    endpoint: payload.endpoint,
    instances: payload.instances,
  });
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: serviceName,
        memoryProfileMb,
        namespace: swarmNamespace,
        swarmServiceName,
        swarmInstanceId,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      });
    }

    if (url.pathname === "/identity") {
      return Response.json({
        ok: true,
        namespace: swarmNamespace,
        serviceName: swarmServiceName,
        instanceId: swarmInstanceId,
        managerUrl: swarmManagerUrl,
        fallbackNamespace: swarmFallbackNamespace,
      });
    }

    if (url.pathname.startsWith("/resolve/")) {
      const dependencyName = decodeURIComponent(
        url.pathname.slice("/resolve/".length),
      );
      const exactNamespace = url.searchParams.get("namespace") ?? undefined;

      if (!dependencyName) {
        return Response.json(
          {
            ok: false,
            error: "dependency name is required",
          },
          { status: 400 },
        );
      }

      return resolveService(dependencyName, exactNamespace);
    }

    if (url.pathname === "/") {
      return Response.json({
        service: serviceName,
        memoryProfileMb,
        namespace: swarmNamespace,
        endpoints: ["/", "/health", "/identity", "/resolve/:service"],
      });
    }

    return Response.json(
      {
        ok: false,
        message: "Not found",
      },
      { status: 404 },
    );
  },
});

console.log(`listening on http://0.0.0.0:${server.port}`);
