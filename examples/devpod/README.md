## DevPod Examples

These examples are simple Bun + TypeScript services that expose:

- `GET /health`
- `GET /`
- `GET /identity`
- `GET /resolve/<service>`

Each example has its own Dockerfile and a declared memory profile:

- `1gb`: `1024 MB`
- `2gb`: `2048 MB`
- `4gb`: `4096 MB`

Build one locally:

```bash
cd examples/devpod/1gb
docker build -t devpod-example-1gb .
docker run --rm -p 3000:3000 devpod-example-1gb
```

Then check:

```bash
curl http://127.0.0.1:3000/health
```

## Swarm identity

Each image reads these optional environment variables:

- `SWARM_NAMESPACE`
- `SWARM_SERVICE_NAME`
- `SWARM_INSTANCE_ID`
- `SWARM_MANAGER_URL`
- `SWARM_FALLBACK_NAMESPACE`

`GET /resolve/<service>` asks the manager registry to resolve that logical name.
By default it resolves relative to `SWARM_NAMESPACE` and falls back to `root`.

Example:

```bash
curl "http://127.0.0.1:3000/resolve/backend"
curl "http://127.0.0.1:3000/resolve/backend?namespace=team-b"
```
