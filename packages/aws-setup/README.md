# `@agent-infrastructure/aws-setup`

AWS CDK app that provisions:

- A dedicated VPC for the agent swarm
- One manager EC2 instance with SSM access and permissions to launch and manage swarm workers
- One worker IAM role that can be passed to launched EC2 instances
- Security groups and a public subnet for the swarm
- Bun-based monitoring on the manager plus worker telemetry agents over private IPs

## Commands

```bash
bun install
bun run synth
bun run deploy
bun run destroy
```

Before the first deploy in a target AWS account and region:

```bash
bunx cdk bootstrap aws://ACCOUNT_ID/REGION
```

## Context values

You can override the defaults at synth or deploy time:

```bash
cd packages/aws-setup
bunx cdk synth \
  -c managerInstanceType=t3.medium \
  -c workerInstanceType=t3.small \
  -c swarmMaxSize=20
```

Defaults:

- `managerInstanceType=t3.medium`
- `workerInstanceType=t3.small`
- `swarmMaxSize=12`

## Result

The manager instance is created in a public subnet with no inbound rules and is intended to be accessed through outbound-only tooling such as `cloudflared` or AWS Systems Manager Session Manager.

Each deployed manager uses three primary directories under `/home/ec2-user`: `runtime` for the checked-out runtime and helper scripts, `state` for bootstrap metadata, tokens, manifests, env files, SQLite, and session state, and `workspace` for checked-out repos and build workspaces. The launch helper lives at `/home/ec2-user/runtime/launch-worker.sh`, the bootstrap context at `/home/ec2-user/state/bootstrap-context.json`, and worker runtime releases are tracked in `/home/ec2-user/state/worker-runtime-release.json`. Systemd remains the boot-time supervisor, but its unit files are intentionally minimal and start wrapper scripts in `/home/ec2-user/runtime`; service configuration is loaded from `/home/ec2-user/state` rather than `/etc`. Launched workers follow the same layout, install Docker automatically, start a Bun telemetry agent, and are intended to be used as remote Docker hosts. The inline IAM policy on the manager role is scoped so it can only pass the worker role and only manage instances tagged for this swarm.

The default VPC layout is intentionally simple and EC2-only from a billed-resource perspective: one AZ, public subnets, no NAT gateway, no managed VPN, and no load balancer.

## How They Are Protected

Public subnets only provide an internet route. They do not expose the instances by themselves.

- The manager security group has no inbound internet rules.
- The worker security group has no inbound internet rules.
- Workers accept traffic from the manager security group and from other workers in the same swarm.
- The manager also accepts traffic from swarm workers, so services running on different machines can communicate over private IPs inside the VPC.
- All nodes can still initiate outbound internet connections.

The intended east-west traffic path is the private VPC address space. A browser or frontend on one worker can call services on other workers or on the manager using their private IPs.

## Monitoring

The manager runs a Bun WebSocket server on the private network and stores worker/container CPU and RAM samples in local SQLite using WAL mode. Workers connect over their private IP path and send telemetry every second.

Default retention:

- Raw 1-second samples for 7 days
- 1-minute rollups for 30 days
- 1-hour rollups for 365 days

## Destroy

Do not use raw `cdk destroy` if the manager has launched worker instances.

Use:

```bash
bun run destroy
```

That command terminates all EC2 instances tagged as swarm workers for this stack, waits for them to finish terminating, and then runs `cdk destroy --force` for the stack.
