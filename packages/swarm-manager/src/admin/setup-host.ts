import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { writeResolvedRuntimeState } from "../host-runtime-target/write-runtime-current.js"
import {
  DEFAULT_AGENT_HOME,
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_DIR,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSPACE_DIR,
} from "../paths.js"

const SYSTEM_EVENT_LOG_PATH =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() ||
  "/home/ec2-user/state/logs/system-events.log"

type BootstrapContext = Record<string, unknown> & {
  adminCompatPort?: number
  dashboardEnrollmentSecret?: string
  dashboardEnrollmentSecretSecretName?: string
  dashboardAccessApiBaseUrl?: string
  cloudflareZoneName?: string
  cloudflareTunnelId?: string
  cloudflareTunnelName?: string
  cloudflareHostnameBase?: string
}

type SetupHostConfig = {
  runtimeDir: string
  stateDir: string
  workspaceDir: string
  hostRoot: string
  bootstrapContextPath: string
}

function logStep(message: string): void {
  const line = `[${new Date().toISOString()}:setup-admin-host] ${message}`
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

function getSecretString(secretName?: string): string {
  const trimmed = secretName?.trim()
  if (!trimmed) {
    return ""
  }

  return commandOutput([
    "aws",
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    trimmed,
    "--query",
    "SecretString",
    "--output",
    "text",
  ])
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

function adminCompatServiceUnit(hostRoot: string): string {
  return `[Unit]
Description=Agent admin compatibility API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
ExecStart=/usr/bin/env bash ${hostRoot}/scripts/run-admin-compat.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`
}

function adminControllerServiceUnit(hostRoot: string): string {
  return `[Unit]
Description=Agent admin dashboard controller
After=network-online.target agent-admin-compat.service
Wants=network-online.target agent-admin-compat.service

[Service]
Type=simple
User=ec2-user
ExecStart=/usr/bin/env bash ${hostRoot}/scripts/run-manager-controller.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2))
  logStep(
    `setup.start runtimeDir=${config.runtimeDir} stateDir=${config.stateDir}`,
  )
  mkdirSync(config.runtimeDir, { recursive: true })
  mkdirSync(config.stateDir, { recursive: true })
  mkdirSync(config.workspaceDir, { recursive: true })

  process.env.AGENT_HOME =
    process.env.AGENT_HOME?.trim() ||
    config.runtimeDir.replace(/\/runtime$/, "") ||
    DEFAULT_AGENT_HOME

  const bootstrapContext = readBootstrapContext(config.bootstrapContextPath)
  const dashboardEnrollmentSecretPath = `${config.stateDir}/dashboard-enrollment-secret`
  const adminEnvPath = `${config.stateDir}/agent-admin.env`
  const dashboardControllerEnvPath = `${config.stateDir}/agent-swarm-monitor.env`
  const adminCompatPort = Number(bootstrapContext.adminCompatPort ?? 8787)
  const dashboardEnrollmentSecret =
    (typeof bootstrapContext.dashboardEnrollmentSecret === "string"
      ? bootstrapContext.dashboardEnrollmentSecret
      : "") ||
    getSecretString(
      typeof bootstrapContext.dashboardEnrollmentSecretSecretName === "string"
        ? bootstrapContext.dashboardEnrollmentSecretSecretName
        : "",
    )

  writeFileSync(
    dashboardEnrollmentSecretPath,
    dashboardEnrollmentSecret.endsWith("\n")
      ? dashboardEnrollmentSecret
      : `${dashboardEnrollmentSecret}\n`,
    { mode: 0o600 },
  )

  writeFileSync(
    adminEnvPath,
    `AGENT_HOME=${process.env.AGENT_HOME}
AGENT_RUNTIME_DIR=${config.runtimeDir}
AGENT_STATE_DIR=${config.stateDir}
AGENT_WORKSPACE_DIR=${config.workspaceDir}
ADMIN_COMPAT_PORT=${Number.isInteger(adminCompatPort) && adminCompatPort > 0 ? adminCompatPort : 8787}
DASHBOARD_ENROLLMENT_SECRET_PATH=${dashboardEnrollmentSecretPath}
`,
    { mode: 0o600 },
  )

  writeFileSync(
    dashboardControllerEnvPath,
    `AGENT_HOME=${process.env.AGENT_HOME}
AGENT_RUNTIME_DIR=${config.runtimeDir}
AGENT_STATE_DIR=${config.stateDir}
AGENT_WORKSPACE_DIR=${config.workspaceDir}
MANAGER_WS_PORT=${Number.isInteger(adminCompatPort) && adminCompatPort > 0 ? adminCompatPort : 8787}
SWARM_BOOTSTRAP_CONTEXT_PATH=${config.bootstrapContextPath}
DASHBOARD_ENROLLMENT_SECRET_PATH=${dashboardEnrollmentSecretPath}
DASHBOARD_ACCESS_API_BASE_URL=${typeof bootstrapContext.dashboardAccessApiBaseUrl === "string" ? bootstrapContext.dashboardAccessApiBaseUrl : ""}
CLOUDFLARED_ZONE_NAME=${typeof bootstrapContext.cloudflareZoneName === "string" ? bootstrapContext.cloudflareZoneName : ""}
CLOUDFLARED_TUNNEL_ID=${typeof bootstrapContext.cloudflareTunnelId === "string" ? bootstrapContext.cloudflareTunnelId : ""}
CLOUDFLARED_TUNNEL_NAME=${typeof bootstrapContext.cloudflareTunnelName === "string" ? bootstrapContext.cloudflareTunnelName : ""}
CLOUDFLARED_HOSTNAME_BASE=${typeof bootstrapContext.cloudflareHostnameBase === "string" ? bootstrapContext.cloudflareHostnameBase : ""}
`,
    { mode: 0o600 },
  )

  writeFileSync(
    "/etc/systemd/system/agent-admin-compat.service",
    adminCompatServiceUnit(config.hostRoot),
  )
  logStep("wrote /etc/systemd/system/agent-admin-compat.service")
  writeFileSync(
    "/etc/systemd/system/agent-manager-controller.service",
    adminControllerServiceUnit(config.hostRoot),
  )
  logStep("wrote /etc/systemd/system/agent-manager-controller.service")

  runChecked([
    "chown",
    "-R",
    "ec2-user:ec2-user",
    config.runtimeDir,
    config.stateDir,
    config.workspaceDir,
  ])
  runChecked(["systemctl", "daemon-reload"])
  runChecked(["systemctl", "enable", "--now", "agent-admin-compat.service"])
  runChecked(["systemctl", "enable", "--now", "agent-manager-controller.service"])
  writeResolvedRuntimeState({
    runtimeDir: config.runtimeDir,
    stateDir: config.stateDir,
    requestedRole: "admin",
    bootstrapContextPath: config.bootstrapContextPath,
    setupStatus: "succeeded",
  })
  logStep("setup.complete")

  console.log(
    JSON.stringify({
      ok: true,
      role: "admin",
      runtimeDir: config.runtimeDir,
      stateDir: config.stateDir,
      workspaceDir: config.workspaceDir,
      hostRoot: config.hostRoot,
    }),
  )
}

await main()
