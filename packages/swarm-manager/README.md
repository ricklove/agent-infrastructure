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
bun run run:manager
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
