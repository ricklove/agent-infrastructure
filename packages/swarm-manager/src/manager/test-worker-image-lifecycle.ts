import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_DIR,
} from "../paths.js"
import { getWorkerImageProfile } from "./worker-image-profiles.js"

type BootstrapContext = {
  region?: string
  managerPrivateIp?: string
  swarmSharedToken?: string
}

type WorkerLifecycleEventType =
  | "launch_request_started"
  | "launch_requested"
  | "create"
  | "container_start_requested"
  | "container_started"
  | "launch"
  | "ec2_running"
  | "instance_status_ok"
  | "cloud_init_started"
  | "packages_install_started"
  | "packages_install_completed"
  | "bun_install_started"
  | "bun_install_completed"
  | "docker_enable_started"
  | "bootstrap_started"
  | "runtime_download_started"
  | "runtime_download_completed"
  | "repo_update_started"
  | "repo_update_completed"
  | "docker_ready"
  | "service_bun_install_started"
  | "service_bun_install_completed"
  | "service_process_started"
  | "service_ready"
  | "telemetry_service_start_requested"
  | "telemetry_process_started"
  | "telemetry_connect_started"
  | "telemetry_started"
  | "running"
  | "connected"
  | "stale"
  | "disconnected"
  | "zombie"
  | "hibernate_requested"
  | "hibernating"
  | "hibernated"
  | "wakeup_requested"
  | "wakeup"
  | "shutdown_requested"
  | "shutdown"
  | "terminated"

type WorkerEvent = {
  workerId: string
  instanceId: string
  privateIp: string
  nodeRole: "manager" | "worker"
  eventType: WorkerLifecycleEventType
  eventTsMs: number
  details: Record<string, unknown> | null
}

type ServiceRecord = {
  namespace: string
  serviceName: string
  instanceId: string
  workerId: string
  workerPrivateIp: string
  hostPort: number
  containerPort: number
  protocol: string
  healthy: boolean
  updatedAtMs: number
}

type LaunchWorkerResult = {
  Instances: Array<{
    InstanceId: string
    PrivateIpAddress: string
    ImageId: string
  }>
}

type SsmInvocationResult = {
  Status: string
  Stdout: string
  Stderr: string
}

type BenchmarkConfig = {
  runtimeDir: string
  bootstrapContextPath: string
  region: string
  managerPrivateIp: string
  sharedToken: string
  profile: string
  workflow: string
  imageId?: string
  build: boolean
  promote: boolean
  instanceType: string
  cleanup: boolean
  namespace: string
  serviceName: string
  serviceInstanceId: string
  benchmarkImage: string
  containerPort: number
}

function optionalOne(args: string[], flag: string): string | undefined {
  const index = args.indexOf(`--${flag}`)
  if (index === -1) {
    return undefined
  }

  const next = args[index + 1]
  if (!next || next.startsWith("--")) {
    return undefined
  }

  return next
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as BootstrapContext
  } catch {
    return {}
  }
}

function runChecked(
  command: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
): string {
  const result = Bun.spawnSync(command, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "inherit",
  })

  if (result.exitCode !== 0) {
    throw new Error(`command failed: ${command.join(" ")}`)
  }

  return result.stdout.toString("utf8").trim()
}

function runCheckedJson<T>(
  command: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
): T {
  const output = runChecked(command, cwd, extraEnv)
  return JSON.parse(output) as T
}

function parseArgs(argv: string[]): BenchmarkConfig {
  const bootstrapContextPath =
    optionalOne(argv, "bootstrap-context") ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH
  const bootstrapContext = readBootstrapContext(bootstrapContextPath)
  const runtimeDir = optionalOne(argv, "runtime-dir") ?? DEFAULT_RUNTIME_DIR
  const region =
    optionalOne(argv, "region") ?? bootstrapContext.region?.trim() ?? ""
  const managerPrivateIp =
    optionalOne(argv, "manager-private-ip") ??
    bootstrapContext.managerPrivateIp?.trim() ??
    ""
  const sharedToken =
    optionalOne(argv, "shared-token") ??
    bootstrapContext.swarmSharedToken?.trim() ??
    ""

  if (!region) {
    throw new Error("region is required")
  }
  if (!managerPrivateIp) {
    throw new Error("manager private ip is required")
  }
  if (!sharedToken) {
    throw new Error("shared token is required")
  }

  return {
    runtimeDir,
    bootstrapContextPath,
    region,
    managerPrivateIp,
    sharedToken,
    profile: optionalOne(argv, "profile") ?? "bun-worker",
    workflow: optionalOne(argv, "workflow") ?? "bun-worker",
    imageId: optionalOne(argv, "image-id"),
    build: hasFlag(argv, "build"),
    promote: hasFlag(argv, "promote"),
    instanceType: optionalOne(argv, "instance-type") ?? "t3.small",
    cleanup: !hasFlag(argv, "keep-worker"),
    namespace: optionalOne(argv, "namespace") ?? "bench",
    serviceName: optionalOne(argv, "service-name") ?? "repo-runner",
    serviceInstanceId:
      optionalOne(argv, "service-instance-id") ?? "repo-runner-1",
    benchmarkImage:
      optionalOne(argv, "benchmark-image") ??
      "agent-swarm/bun-repo-runner:latest",
    containerPort: Number.parseInt(
      optionalOne(argv, "container-port") ?? "3000",
      10,
    ),
  }
}

async function fetchManagerJson<T>(path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:8787${path}`)
  if (!response.ok) {
    throw new Error(`manager request failed for ${path}: ${response.status}`)
  }
  return (await response.json()) as T
}

async function listWorkerEvents(workerId: string): Promise<WorkerEvent[]> {
  const response = await fetchManagerJson<{ ok: true; events: WorkerEvent[] }>(
    `/workers/events?workerId=${encodeURIComponent(workerId)}&limit=400`,
  )
  return response.events
}

async function waitForEvents(
  workerId: string,
  requiredEventTypes: WorkerLifecycleEventType[],
  timeoutMs: number,
): Promise<WorkerEvent[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = await listWorkerEvents(workerId)
    const types = new Set(events.map((event) => event.eventType))
    if (requiredEventTypes.every((eventType) => types.has(eventType))) {
      return events
    }
    await sleep(3000)
  }

  throw new Error(
    `timed out waiting for events: ${requiredEventTypes.join(", ")}`,
  )
}

async function waitForEventAfter(
  workerId: string,
  eventType: WorkerLifecycleEventType,
  afterTsMs: number,
  timeoutMs: number,
): Promise<WorkerEvent> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = await listWorkerEvents(workerId)
    const match = [...events]
      .reverse()
      .find(
        (event) =>
          event.eventType === eventType && event.eventTsMs >= afterTsMs,
      )
    if (match) {
      return match
    }
    await sleep(3000)
  }

  throw new Error(`timed out waiting for ${eventType} after ${afterTsMs}`)
}

async function waitForServiceHealth(
  workerPrivateIp: string,
  hostPort: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://${workerPrivateIp}:${hostPort}/health`,
      )
      if (response.ok) {
        return
      }
    } catch {
      // retry
    }
    await sleep(3000)
  }

  throw new Error(
    `timed out waiting for service health on ${workerPrivateIp}:${hostPort}`,
  )
}

function awsRegionEnv(region: string): Record<string, string> {
  return {
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
  }
}

function runSsmShell(
  region: string,
  instanceId: string,
  commands: string[],
): SsmInvocationResult {
  const commandId = runChecked(
    [
      "aws",
      "ssm",
      "send-command",
      "--region",
      region,
      "--instance-ids",
      instanceId,
      "--document-name",
      "AWS-RunShellScript",
      "--parameters",
      JSON.stringify({ commands }),
      "--query",
      "Command.CommandId",
      "--output",
      "text",
    ],
    undefined,
    awsRegionEnv(region),
  ).trim()

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = runCheckedJson<{
      Status: string
      StandardOutputContent: string
      StandardErrorContent: string
    }>(
      [
        "aws",
        "ssm",
        "get-command-invocation",
        "--region",
        region,
        "--command-id",
        commandId,
        "--instance-id",
        instanceId,
        "--query",
        "{Status:Status,StandardOutputContent:StandardOutputContent,StandardErrorContent:StandardErrorContent}",
        "--output",
        "json",
      ],
      undefined,
      awsRegionEnv(region),
    )

    if (!["Pending", "InProgress", "Delayed"].includes(result.Status)) {
      return {
        Status: result.Status,
        Stdout: result.StandardOutputContent,
        Stderr: result.StandardErrorContent,
      }
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000)
  }

  throw new Error(`timed out waiting for SSM command on ${instanceId}`)
}

function launchWorker(
  config: BenchmarkConfig,
  imageId: string,
): {
  instanceId: string
  privateIp: string
} {
  const launchResult = runCheckedJson<LaunchWorkerResult>(
    [
      "bash",
      join(config.runtimeDir, "scripts/launch-worker.sh"),
      "--instance-type",
      config.instanceType,
      "--image-id",
      imageId,
    ],
    config.runtimeDir,
  )

  const instance = launchResult.Instances[0]
  if (!instance?.InstanceId || !instance.PrivateIpAddress) {
    throw new Error("worker launch did not return instance metadata")
  }

  return {
    instanceId: instance.InstanceId,
    privateIp: instance.PrivateIpAddress,
  }
}

function terminateWorker(region: string, instanceId: string): void {
  runChecked(
    [
      "aws",
      "ec2",
      "terminate-instances",
      "--region",
      region,
      "--instance-ids",
      instanceId,
    ],
    undefined,
    awsRegionEnv(region),
  )
}

async function getServiceRecord(
  namespace: string,
  serviceName: string,
  instanceId: string,
): Promise<ServiceRecord> {
  const response = await fetchManagerJson<{
    ok: true
    rootNamespace: string
    services: ServiceRecord[]
  }>("/services")
  const service = response.services.find(
    (entry) =>
      entry.namespace === namespace &&
      entry.serviceName === serviceName &&
      entry.instanceId === instanceId,
  )
  if (!service) {
    throw new Error(
      `service record not found for ${namespace}/${serviceName}/${instanceId}`,
    )
  }
  return service
}

function findFirstEvent(
  events: WorkerEvent[],
  eventType: WorkerLifecycleEventType,
  predicate?: (event: WorkerEvent) => boolean,
): WorkerEvent | undefined {
  return [...events]
    .sort((left, right) => left.eventTsMs - right.eventTsMs)
    .find(
      (event) =>
        event.eventType === eventType && (!predicate || predicate(event)),
    )
}

function findFirstEventAfter(
  events: WorkerEvent[],
  eventType: WorkerLifecycleEventType,
  afterTsMs: number,
  predicate?: (event: WorkerEvent) => boolean,
): WorkerEvent | undefined {
  return [...events]
    .sort((left, right) => left.eventTsMs - right.eventTsMs)
    .find(
      (event) =>
        event.eventTsMs >= afterTsMs &&
        event.eventType === eventType &&
        (!predicate || predicate(event)),
    )
}

function durationMs(start?: WorkerEvent, end?: WorkerEvent): number | null {
  if (!start || !end) {
    return null
  }
  return Math.max(0, end.eventTsMs - start.eventTsMs)
}

async function maybeBuildImage(config: BenchmarkConfig): Promise<string> {
  if (config.imageId) {
    return config.imageId
  }

  if (config.build) {
    const result = runCheckedJson<{ imageId: string }>(
      [
        "bun",
        "run",
        join(
          config.runtimeDir,
          "packages/swarm-manager/src/manager/build-worker-image.ts",
        ),
        "--runtime-dir",
        config.runtimeDir,
        "--bootstrap-context",
        config.bootstrapContextPath,
        "--workflow",
        config.workflow,
        "--profile",
        config.profile,
        ...(config.promote ? ["--promote"] : []),
      ],
      config.runtimeDir,
    )
    return result.imageId
  }

  const profile = getWorkerImageProfile(config.profile)
  if (!profile) {
    throw new Error(
      `worker image profile ${config.profile} is not configured; pass --image-id or --build`,
    )
  }

  return profile.imageId
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2))
  const imageId = await maybeBuildImage(config)
  const managerUrl = `http://${config.managerPrivateIp}:8787`

  let worker: { instanceId: string; privateIp: string } | null = null
  try {
    worker = launchWorker(config, imageId)

    const _bootEvents = await waitForEvents(
      worker.instanceId,
      [
        "launch_request_started",
        "ec2_running",
        "cloud_init_started",
        "packages_install_completed",
        "bun_install_completed",
        "docker_ready",
        "runtime_download_completed",
        "telemetry_service_start_requested",
        "connected",
        "running",
      ],
      10 * 60 * 1000,
    )

    const benchmarkInvocation = runSsmShell(config.region, worker.instanceId, [
      "set -euo pipefail",
      "source /home/ec2-user/state/agent-swarm-worker-monitor.env",
      "export PATH=/opt/bun/bin:/usr/local/bin:/usr/bin:/bin",
      `docker image inspect ${config.benchmarkImage} >/dev/null`,
      `cd ${config.runtimeDir}/packages/swarm-manager`,
      [
        "bun run run:launch-service --",
        `--manager-url ${managerUrl}`,
        `--token "$MONITOR_SHARED_TOKEN"`,
        `--worker-id ${worker.instanceId}`,
        `--worker-private-ip ${worker.privateIp}`,
        `--namespace ${config.namespace}`,
        `--service-name ${config.serviceName}`,
        `--instance-id ${config.serviceInstanceId}`,
        `--image ${config.benchmarkImage}`,
        `--container-port ${config.containerPort}`,
      ].join(" "),
    ])

    if (benchmarkInvocation.Status !== "Success") {
      throw new Error(
        `benchmark service launch failed: ${benchmarkInvocation.Status}\n${benchmarkInvocation.Stdout}\n${benchmarkInvocation.Stderr}`,
      )
    }

    let lifecycleEvents = await waitForEvents(
      worker.instanceId,
      [
        "container_start_requested",
        "container_started",
        "repo_update_started",
        "repo_update_completed",
        "service_bun_install_started",
        "service_bun_install_completed",
        "service_process_started",
        "service_ready",
      ],
      5 * 60 * 1000,
    )

    const serviceRecord = await getServiceRecord(
      config.namespace,
      config.serviceName,
      config.serviceInstanceId,
    )
    await waitForServiceHealth(
      serviceRecord.workerPrivateIp,
      serviceRecord.hostPort,
      2 * 60 * 1000,
    )

    const hibernateResult = runCheckedJson<{
      ok: true
      requestedAtMs: number
      completedAtMs: number
      elapsedSeconds: number
    }>(
      [
        "bun",
        join(
          config.runtimeDir,
          "packages/swarm-manager/src/manager/worker-power.ts",
        ),
        "--action",
        "hibernate",
        "--bootstrap-context",
        config.bootstrapContextPath,
        worker.instanceId,
      ],
      config.runtimeDir,
    )

    await waitForEventAfter(
      worker.instanceId,
      "hibernated",
      hibernateResult.requestedAtMs,
      5 * 60 * 1000,
    )

    const wakeResult = runCheckedJson<{
      ok: true
      requestedAtMs: number
      completedAtMs: number
      elapsedSeconds: number
    }>(
      [
        "bun",
        join(
          config.runtimeDir,
          "packages/swarm-manager/src/manager/worker-power.ts",
        ),
        "--action",
        "wake",
        "--bootstrap-context",
        config.bootstrapContextPath,
        worker.instanceId,
      ],
      config.runtimeDir,
    )

    const postWakeRunning = await waitForEventAfter(
      worker.instanceId,
      "running",
      wakeResult.requestedAtMs,
      5 * 60 * 1000,
    )
    await waitForServiceHealth(
      serviceRecord.workerPrivateIp,
      serviceRecord.hostPort,
      2 * 60 * 1000,
    )

    lifecycleEvents = await listWorkerEvents(worker.instanceId)

    const firstEvent = lifecycleEvents.reduce<WorkerEvent | null>(
      (earliest, event) => {
        if (!earliest || event.eventTsMs < earliest.eventTsMs) {
          return event
        }
        return earliest
      },
      null,
    )
    const firstRunning = findFirstEvent(lifecycleEvents, "running")
    const ec2Running = findFirstEvent(lifecycleEvents, "ec2_running")
    const containerStartRequested = findFirstEvent(
      lifecycleEvents,
      "container_start_requested",
    )
    const containerStarted = findFirstEvent(
      lifecycleEvents,
      "container_started",
    )
    const repoUpdateStarted = findFirstEvent(
      lifecycleEvents,
      "repo_update_started",
    )
    const repoUpdateCompleted = findFirstEvent(
      lifecycleEvents,
      "repo_update_completed",
    )
    const serviceBunInstallStarted = findFirstEvent(
      lifecycleEvents,
      "service_bun_install_started",
    )
    const serviceBunInstallCompleted = findFirstEvent(
      lifecycleEvents,
      "service_bun_install_completed",
    )
    const serviceProcessStarted = findFirstEvent(
      lifecycleEvents,
      "service_process_started",
    )
    const serviceReady = findFirstEvent(lifecycleEvents, "service_ready")
    const wakeRequested = findFirstEventAfter(
      lifecycleEvents,
      "wakeup_requested",
      wakeResult.requestedAtMs,
    )
    const wakeEc2Running = findFirstEventAfter(
      lifecycleEvents,
      "wakeup",
      wakeResult.requestedAtMs,
    )

    console.log(
      JSON.stringify({
        ok: true,
        workflow: config.workflow,
        profile: config.profile,
        imageId,
        worker,
        service: serviceRecord,
        benchmarkInvocation,
        timingsMs: {
          timeToRunning: durationMs(firstEvent ?? undefined, firstRunning),
          launchRequestToEc2Running: durationMs(
            findFirstEvent(lifecycleEvents, "launch_request_started"),
            ec2Running,
          ),
          timeToServiceReady: durationMs(firstEvent ?? undefined, serviceReady),
          containerStartToContainerStarted: durationMs(
            containerStartRequested,
            containerStarted,
          ),
          containerStartToServiceReady: durationMs(
            containerStartRequested,
            serviceReady,
          ),
          repoUpdate: durationMs(repoUpdateStarted, repoUpdateCompleted),
          serviceBunInstall: durationMs(
            serviceBunInstallStarted,
            serviceBunInstallCompleted,
          ),
          serviceProcessToReady: durationMs(
            serviceProcessStarted,
            serviceReady,
          ),
          timeToWake: durationMs(wakeRequested, postWakeRunning),
          wakeRequestToEc2Running: durationMs(wakeRequested, wakeEc2Running),
          hibernateRequestToHibernated: hibernateResult.elapsedSeconds * 1000,
        },
        wakeResult,
        hibernateResult,
        lifecycleEvents,
      }),
    )
  } finally {
    if (config.cleanup && worker) {
      terminateWorker(config.region, worker.instanceId)
    }
  }
}

await main()
