# `@agent-infrastructure/swarm-manager`

Manager-side Bun runtime for:

- worker health ingestion over WebSocket
- live in-memory worker state
- SQLite-backed raw metrics and rollups
- worker-side telemetry agent code used during EC2 bootstrap
- 1 Hz worker and container CPU/RAM monitoring over the swarm private network

## Commands

```bash
bun run check
bun run run:manager
bun run run:worker-agent
```
