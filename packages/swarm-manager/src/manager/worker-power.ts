import { existsSync, readFileSync } from "node:fs"
import { DEFAULT_BOOTSTRAP_CONTEXT_PATH } from "../paths.js"

type Action = "hibernate" | "wake"

type BootstrapContext = {
  region?: string
  swarmSharedToken?: string
}

type Ec2InstanceState = {
  instanceId: string
  privateIp: string
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

function positionalArgs(args: string[]): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value.startsWith("--")) {
      index += 1
      continue
    }
    values.push(value)
  }
  return values
}

function loadBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as BootstrapContext
  } catch {
    return {}
  }
}

function nowMs(): number {
  return Date.now()
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function runCommand(command: string[]): CommandResult {
  const result = Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: process.env,
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

function runChecked(command: string[]): string {
  const result = runCommand(command)

  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim()
    if (stderr.length > 0) {
      console.error(stderr)
    }
    throw new Error(`command failed: ${command.join(" ")}`)
  }

  return result.stdout
}

async function postLifecycleEvent(
  sharedToken: string,
  worker: Ec2InstanceState,
  eventType: string,
  eventTsMs: number,
  details: Record<string, unknown> = {},
): Promise<void> {
  const response = await fetch("http://127.0.0.1:8787/workers/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-swarm-token": sharedToken,
    },
    body: JSON.stringify({
      workerId: worker.instanceId,
      instanceId: worker.instanceId,
      privateIp: worker.privateIp,
      nodeRole: "worker",
      eventType,
      eventTsMs,
      details,
    }),
  })

  if (!response.ok) {
    throw new Error(`failed to record ${eventType}: ${response.status}`)
  }
}

function listInstances(
  region: string,
  instanceIds: string[],
): Ec2InstanceState[] {
  const output = runChecked([
    "aws",
    "ec2",
    "describe-instances",
    "--region",
    region,
    "--instance-ids",
    ...instanceIds,
    "--query",
    "Reservations[].Instances[].{instanceId:InstanceId,privateIp:PrivateIpAddress}",
    "--output",
    "json",
  ])

  return JSON.parse(output) as Ec2InstanceState[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const action = optionalOne(argv, "action") as Action | undefined
  if (!action || !["hibernate", "wake"].includes(action)) {
    throw new Error("expected --action hibernate|wake")
  }

  const instanceIds = positionalArgs(argv)
  if (instanceIds.length === 0) {
    throw new Error("at least one worker instance id is required")
  }

  const bootstrapContextPath =
    optionalOne(argv, "bootstrap-context") ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH
  const bootstrapContext = loadBootstrapContext(bootstrapContextPath)
  const region =
    optionalOne(argv, "region") ?? bootstrapContext.region?.trim() ?? ""
  const sharedToken =
    optionalOne(argv, "shared-token") ??
    bootstrapContext.swarmSharedToken?.trim() ??
    ""

  if (!region) {
    throw new Error("region is required")
  }

  if (!sharedToken) {
    throw new Error("shared token is required")
  }

  const workers = listInstances(region, instanceIds)
  if (workers.length !== instanceIds.length) {
    throw new Error("failed to resolve all worker instance ids")
  }

  const requestedAtMs = nowMs()
  const requestedEventType =
    action === "hibernate" ? "hibernate_requested" : "wakeup_requested"
  const completedEventType = action === "hibernate" ? "hibernated" : "wakeup"

  for (const worker of workers) {
    await postLifecycleEvent(
      sharedToken,
      worker,
      requestedEventType,
      requestedAtMs,
    )
  }

  if (action === "hibernate") {
    const deadline = nowMs() + 10 * 60 * 1000
    let retryCount = 0
    while (true) {
      const result = runCommand([
        "aws",
        "ec2",
        "stop-instances",
        "--region",
        region,
        "--hibernate",
        "--instance-ids",
        ...instanceIds,
      ])
      if (result.exitCode === 0) {
        const acceptedAtMs = nowMs()
        for (const worker of workers) {
          await postLifecycleEvent(
            sharedToken,
            worker,
            "hibernating",
            acceptedAtMs,
            {
              retryCount,
            },
          )
        }
        break
      }

      const stderr = result.stderr.trim()
      if (
        stderr.includes("is not ready to hibernate yet") &&
        nowMs() < deadline
      ) {
        retryCount += 1
        await sleep(15000)
        continue
      }

      if (stderr.length > 0) {
        console.error(stderr)
      }
      throw new Error(
        `command failed: aws ec2 stop-instances --region ${region} --hibernate --instance-ids ${instanceIds.join(" ")}`,
      )
    }
    runChecked([
      "aws",
      "ec2",
      "wait",
      "instance-stopped",
      "--region",
      region,
      "--instance-ids",
      ...instanceIds,
    ])
  } else {
    runChecked([
      "aws",
      "ec2",
      "start-instances",
      "--region",
      region,
      "--instance-ids",
      ...instanceIds,
    ])
    runChecked([
      "aws",
      "ec2",
      "wait",
      "instance-running",
      "--region",
      region,
      "--instance-ids",
      ...instanceIds,
    ])
  }

  const completedAtMs = nowMs()
  const elapsedSeconds = Math.max(
    0,
    Math.round((completedAtMs - requestedAtMs) / 1000),
  )

  for (const worker of workers) {
    await postLifecycleEvent(
      sharedToken,
      worker,
      completedEventType,
      completedAtMs,
      {
        elapsedSeconds,
      },
    )
  }

  console.log(
    JSON.stringify({
      ok: true,
      action,
      instanceIds,
      requestedAtMs,
      completedAtMs,
      elapsedSeconds,
    }),
  )
}

await main()
