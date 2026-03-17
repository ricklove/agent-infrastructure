# `@agent-infrastructure/swarm-manager`

Manager-side Bun runtime for:

- worker health ingestion over WebSocket
- live in-memory worker state
- SQLite-backed raw metrics and rollups
- namespaced service discovery with `root` fallback
- per-worker host port leases for colocated containers
- worker-side telemetry agent code used during EC2 bootstrap
- 1 Hz worker and container CPU/RAM monitoring over the swarm private network

## Commands

```bash
bun run check
bun run test
bun run run:manager
bun run run:launch-service -- --manager-url http://127.0.0.1:8787 --token TOKEN --worker-id worker-a --worker-private-ip 10.0.0.21 --namespace team-a --service-name backend --image devpod-example-1gb --container-port 3000
bun run run:worker-agent
```

## Service discovery

The manager exposes a private-network HTTP API for service registration and
resolution.

- `POST /ports/lease`: allocate or reuse a host port on a worker
- `POST /ports/release`: release a worker host port lease
- `POST /services/register`: register `namespace + serviceName` to a worker endpoint
- `POST /services/release`: remove a registered service instance
- `GET /services`: list current service registrations
- `GET /services/resolve/<service>?callerNamespace=<ns>`: resolve relative to the caller namespace, then fall back to `root`
- `GET /services/resolve/<namespace>/<service>`: resolve an exact fully qualified service name

Mutating routes require `x-swarm-token: $SWARM_SHARED_TOKEN`.

Example relative lookup behavior:

- caller namespace `team-a` asks for `backend`
- manager tries `team-a/backend`
- if not found, manager tries `root/backend`

## Launch helper

`run:launch-service` is a manager-side helper that:

- allocates a host port from the manager registry
- starts a Docker container on the target Docker host
- injects swarm identity env vars into the container
- registers the resulting endpoint with the manager

Supported flags:

- `--manager-url`
- `--token`
- `--worker-id`
- `--worker-private-ip`
- `--namespace`
- `--service-name`
- `--image`
- `--container-port`
- `--instance-id`
- `--container-name`
- `--protocol`
- `--fallback-namespace`
- `--docker-host`
- `--env KEY=VALUE` repeated as needed

## Local test coverage

`bun run test` currently covers:

- local worker-agent connectivity to the real manager process
- service registration and namespace-aware resolution
- per-worker port lease uniqueness and reuse
