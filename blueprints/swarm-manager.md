# Swarm Manager

`blueprints/` is the system design source of truth.

This document summarizes the current intended responsibilities and capabilities of the swarm manager.

## Role

The swarm manager is the private control plane for the system. It owns worker lifecycle, runtime rollout, telemetry, service registration, and operational benchmarking.

It is not intended to be the public internet-facing entrypoint for normal users.

## Current Responsibilities

- Update its own runtime from git on the `development` branch.
- Publish the current worker runtime release bundle.
- Launch workers from a selected AMI and instance type.
- Tag launched workers with manager-defined metadata.
- Record worker lifecycle events.
- Track worker telemetry and fleet state.
- Detect stale and zombie workers.
- Hibernate workers.
- Wake workers.
- Terminate workers.
- Open the dashboard for trusted operator access.
- Build new worker images.
- Build worker images from real worker candidates.
- Promote worker image profiles to new AMI IDs.
- Run full worker lifecycle benchmarks.

## Worker Lifecycle Control

The manager can control a worker through these major phases:

1. Launch request.
2. EC2 running.
3. Worker bootstrap and telemetry connection.
4. Service launch on the worker.
5. Hibernate.
6. Wake.
7. Terminate.

The manager records lifecycle events for these phases so timing and failure behavior can be analyzed.

## Worker Image Build Model

Worker images are now built from normal worker candidates.

That means:

- the image source instance is launched through the normal worker path
- the image candidate is tagged as a worker plus image-candidate metadata
- the manager can observe it through the normal worker telemetry/fleet model
- the candidate is provisioned into the desired image state
- the candidate is snapshotted into a new AMI
- the candidate is then terminated

This is preferred over treating image creation as a separate opaque builder system.

## Bun Worker Benchmark Model

The manager can run a benchmark flow for the `bun-worker` profile:

1. Launch a fresh worker.
2. Start a Dockerized Bun service on that worker.
3. Measure cold startup timing.
4. Hibernate the worker.
5. Wake the worker.
6. Measure warm startup timing.
7. Clean up the worker automatically.

## Timings Currently Measured

The manager can currently measure:

- launch request to EC2 running
- time to worker running
- container start requested to container started
- time to first Bun service ready
- hibernate request to hibernated
- wake request to worker running again

## Current Gaps

These areas still need refinement:

- baked workers should avoid unnecessary runtime refresh work on first boot
- benchmark paths should distinguish immutable-image startup from mutable-runtime refresh startup
- builder/image-candidate state should become a clearer first-class dashboard concept

## Design Rule

The manager should own infrastructure lifecycle and benchmarking through a small number of manager commands.

Trusted operator access may use AWS SSM for bootstrap and recovery, but normal system operation should be manager-driven rather than manually orchestrated through repeated SSM steps.
