# Agent Infrastructure

This repository is a Bun monorepo for infrastructure used to run agent systems.

The current filesystem layout for deployed and local manager-host usage is:

- `~/runtime`: checked-out runtime code
- `~/state`: bootstrap metadata, tokens, manifests, SQLite, and dashboard/session state
- `~/workspace`: checked-out repos and other working directories used by the system

## Packages

- `packages/aws-setup`: AWS CDK app that creates a manager EC2 instance plus the IAM and network primitives needed to launch and control a dedicated swarm of worker EC2 instances, using only EC2-backed runtime infrastructure.
- `packages/swarm-manager`: Bun-based manager and worker monitoring runtime for WebSocket health ingestion, live state, and SQLite-backed metrics retention.

## Quick start

```bash
bun install
bun run synth:aws-setup
bun run test:swarm-manager
bun run test:local-swarm
```

To deploy:

```bash
cd packages/aws-setup
bun run deploy
```

To destroy the stack safely after the manager has launched worker instances:

```bash
bun run destroy:aws-setup
```

Before the first deploy in an AWS account and region, bootstrap CDK for that environment:

```bash
cd packages/aws-setup
bunx cdk bootstrap aws://ACCOUNT_ID/REGION
```

The default AWS setup intentionally stays simple: one AZ, public subnets, no NAT gateway, no managed VPN, and inbound access controlled entirely by security groups. Swarm machines still communicate with each other over their private VPC IPs, so multi-service workloads can talk east-west without exposing public ports.

Launched workers also start a telemetry agent that maintains a WebSocket connection back to the manager over the private network and sends worker/container CPU and RAM metrics every second.

The manager also exposes a namespaced service registry for colocated workloads.
Services can register under keys such as `team-a/frontend` or `root/auth`, and
dependents can resolve a short name like `backend` relative to their own
namespace with optional fallback to `root`.

Local validation currently has two layers:

- `bun run test:swarm-manager`: manager integration tests for workers, registry resolution, and port leases
- `bun run test:local-swarm`: Docker-based smoke test for launch helper, injected container identity, and manager-side service resolution

## Example workloads

Simple Bun + TypeScript Dockerized example projects live under `examples/devpod`:

- `examples/devpod/1gb`
- `examples/devpod/2gb`
- `examples/devpod/4gb`

Each one exposes `GET /health` and reports its declared memory profile in the response body.
