# Agent Infrastructure

This repository is a Bun monorepo for infrastructure used to run agent systems.

## Packages

- `packages/aws-setup`: AWS CDK app that creates a manager EC2 instance plus the IAM and network primitives needed to launch and control a dedicated swarm of worker EC2 instances, using only EC2-backed runtime infrastructure.
- `packages/swarm-manager`: Bun-based manager and worker monitoring runtime for WebSocket health ingestion, live state, and SQLite-backed metrics retention.

## Quick start

```bash
bun install
bun run synth:aws-setup
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
