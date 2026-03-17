const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const serviceName = process.env.SERVICE_NAME ?? "devpod-example-1gb";
const memoryProfileMb = Number.parseInt(process.env.MEMORY_PROFILE_MB ?? "1024", 10);
const startedAt = Date.now();

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: serviceName,
        memoryProfileMb,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        service: serviceName,
        memoryProfileMb,
        endpoints: ["/", "/health"],
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
