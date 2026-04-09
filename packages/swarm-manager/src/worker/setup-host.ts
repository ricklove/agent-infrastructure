import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { writeResolvedRuntimeState } from "../host-runtime-target/write-runtime-current.js"
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_DIR,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSPACE_DIR,
} from "../paths.js"

const SYSTEM_EVENT_LOG_PATH =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() ||
  "/home/ec2-user/state/logs/system-events.log"

type BootstrapContext = Record<string, unknown> & {
  managerMonitorPort?: number
  managerPrivateIp?: string
  swarmSharedToken?: string
}

type SetupHostConfig = {
  runtimeDir: string
  stateDir: string
  workspaceDir: string
  hostRoot: string
  bootstrapContextPath: string
}

function logStep(message: string): void {
  const line = `[${new Date().toISOString()}:setup-worker-host] ${message}`
  mkdirSync("/home/ec2-user/state/logs", { recursive: true })
  appendFileSync(SYSTEM_EVENT_LOG_PATH, `${line}\n`)
  console.error(line)
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

function runChecked(command: string[]): void {
  logStep(`run ${command.join(" ")}`)
  const result = Bun.spawnSync(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  })

  if (result.exitCode !== 0) {
    throw new Error(`command failed: ${command.join(" ")}`)
  }
}

function commandOutput(command: string[]): string {
  const result = Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.toString("utf8").trim() ||
        `command failed: ${command.join(" ")}`,
    )
  }

  return result.stdout.toString("utf8").trim()
}

function parseArgs(argv: string[]): SetupHostConfig {
  return {
    runtimeDir: optionalOne(argv, "runtime-dir") ?? DEFAULT_RUNTIME_DIR,
    stateDir: optionalOne(argv, "state-dir") ?? DEFAULT_STATE_DIR,
    workspaceDir: optionalOne(argv, "workspace-dir") ?? DEFAULT_WORKSPACE_DIR,
    hostRoot: optionalOne(argv, "host-root") ?? DEFAULT_RUNTIME_DIR,
    bootstrapContextPath:
      optionalOne(argv, "bootstrap-context") ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  }
}

function readBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    throw new Error(`bootstrap context not found: ${path}`)
  }

  return JSON.parse(readFileSync(path, "utf8")) as BootstrapContext
}

function fetchInstanceMetadata(path: string, token: string): string {
  return commandOutput([
    "curl",
    "-s",
    "-H",
    `X-aws-ec2-metadata-token: ${token}`,
    `http://169.254.169.254/latest/meta-data/${path}`,
  ])
}

function workerServiceUnit(hostRoot: string): string {
  return `[Unit]
Description=Agent swarm worker telemetry
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=ec2-user
ExecStart=/usr/bin/env bash ${hostRoot}/scripts/run-worker-monitor.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2))
  mkdirSync(config.runtimeDir, { recursive: true })
  mkdirSync(config.stateDir, { recursive: true })
  mkdirSync(config.workspaceDir, { recursive: true })

  const bootstrapContext = readBootstrapContext(config.bootstrapContextPath)
  const managerMonitorPort = Number(bootstrapContext.managerMonitorPort ?? 8787)
  const managerPrivateIp =
    typeof bootstrapContext.managerPrivateIp === "string"
      ? bootstrapContext.managerPrivateIp
      : ""
  const swarmSharedToken =
    typeof bootstrapContext.swarmSharedToken === "string"
      ? bootstrapContext.swarmSharedToken
      : ""

  if (!managerPrivateIp || !swarmSharedToken) {
    throw new Error(
      "worker bootstrap context missing managerPrivateIp or swarmSharedToken",
    )
  }

  const metadataToken = commandOutput([
    "curl",
    "-X",
    "PUT",
    "-s",
    "http://169.254.169.254/latest/api/token",
    "-H",
    "X-aws-ec2-metadata-token-ttl-seconds: 21600",
  ])
  const instanceId = fetchInstanceMetadata("instance-id", metadataToken)
  const privateIp = fetchInstanceMetadata("local-ipv4", metadataToken)

  writeFileSync(
    `${config.stateDir}/agent-swarm-worker-monitor.env`,
    `MONITOR_MANAGER_URL=ws://${managerPrivateIp}:${managerMonitorPort}/workers/stream
MONITOR_SHARED_TOKEN=${swarmSharedToken}
MONITOR_RECONNECT_DELAY_MS=1000
`,
    { mode: 0o600 },
  )

  writeFileSync(
    "/etc/systemd/system/agent-swarm-worker-monitor.service",
    workerServiceUnit(config.hostRoot),
  )
  writeFileSync(
    `${config.stateDir}/worker-runtime.json`,
    `${JSON.stringify({ instanceId, privateIp }, null, 2)}\n`,
  )

  runChecked([
    "chown",
    "-R",
    "ec2-user:ec2-user",
    config.runtimeDir,
    config.stateDir,
    config.workspaceDir,
  ])
  runChecked(["systemctl", "daemon-reload"])
  runChecked([
    "systemctl",
    "enable",
    "--now",
    "agent-swarm-worker-monitor.service",
  ])
  writeResolvedRuntimeState({
    runtimeDir: config.runtimeDir,
    stateDir: config.stateDir,
    requestedRole: "worker",
    bootstrapContextPath: config.bootstrapContextPath,
    setupStatus: "succeeded",
  })

  console.log(
    JSON.stringify({ ok: true, role: "worker", instanceId, privateIp }),
  )
}

await main()
