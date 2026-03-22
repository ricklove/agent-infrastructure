import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_AGENT_HOME,
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_DIR,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSPACE_DIR,
} from "../paths.js";

type BootstrapContext = Record<string, unknown> & {
  managerMonitorPort?: number;
};

type SetupHostConfig = {
  runtimeDir: string;
  stateDir: string;
  workspaceDir: string;
  hostRoot: string;
  bootstrapContextPath: string;
  agentGithubConfigRoot: string;
};

function logStep(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function optionalOne(args: string[], flag: string): string | undefined {
  const index = args.findIndex((value) => value === `--${flag}`);
  if (index === -1) {
    return undefined;
  }

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }

  return next;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function runChecked(
  command: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
): void {
  logStep(`setup-host: run ${command.join(" ")}`);
  const result = Bun.spawnSync(command, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    logStep(`setup-host: command failed (${result.exitCode}) ${command.join(" ")}`);
    throw new Error(`command failed: ${command.join(" ")}`);
  }
}

function commandOutput(command: string[]): string {
  logStep(`setup-host: capture ${command.join(" ")}`);
  const result = Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.toString("utf8").trim() || `command failed: ${command.join(" ")}`,
    );
  }
  return result.stdout.toString("utf8").trim();
}

function parseArgs(argv: string[]): SetupHostConfig {
  return {
    runtimeDir: optionalOne(argv, "runtime-dir") ?? DEFAULT_RUNTIME_DIR,
    stateDir: optionalOne(argv, "state-dir") ?? DEFAULT_STATE_DIR,
    workspaceDir: optionalOne(argv, "workspace-dir") ?? DEFAULT_WORKSPACE_DIR,
    hostRoot: optionalOne(argv, "host-root") ?? DEFAULT_RUNTIME_DIR,
    bootstrapContextPath:
      optionalOne(argv, "bootstrap-context") ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH,
    agentGithubConfigRoot:
      optionalOne(argv, "agent-github-config-root") ??
      `${DEFAULT_AGENT_HOME}/.config/agent-github`,
  };
}

function readBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    throw new Error(`bootstrap context not found: ${path}`);
  }

  return JSON.parse(readFileSync(path, "utf8")) as BootstrapContext;
}

function fetchInstanceMetadata(path: string, token: string): string {
  return commandOutput([
    "curl",
    "-s",
    "-H",
    `X-aws-ec2-metadata-token: ${token}`,
    `http://169.254.169.254/latest/meta-data/${path}`,
  ]);
}

function managerServiceUnit(hostRoot: string): string {
  return `[Unit]
Description=Agent swarm monitoring server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
ExecStart=${hostRoot}/run-manager.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
}

function managerNodeServiceUnit(hostRoot: string): string {
  return `[Unit]
Description=Agent swarm manager self telemetry
After=network-online.target agent-swarm-monitor.service
Wants=network-online.target agent-swarm-monitor.service

[Service]
Type=simple
User=ec2-user
ExecStart=${hostRoot}/run-manager-node.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  logStep(`setup-host: start runtimeDir=${config.runtimeDir} stateDir=${config.stateDir}`);
  mkdirSync(config.runtimeDir, { recursive: true });
  mkdirSync(config.stateDir, { recursive: true });
  mkdirSync(config.workspaceDir, { recursive: true });
  const managerEnvPath = `${config.stateDir}/agent-swarm-monitor.env`;
  const managerNodeEnvPath = `${config.stateDir}/agent-swarm-manager-node.env`;
  const metricsDbPath = `${config.stateDir}/metrics.sqlite`;
  const swarmSharedTokenPath = `${config.stateDir}/swarm-shared-token`;
  const workerRuntimeReleaseManifestPath = `${config.stateDir}/worker-runtime-release.json`;
  process.env.AGENT_HOME = process.env.AGENT_HOME?.trim() || config.runtimeDir.replace(/\/runtime$/, "");

  const bootstrapContext = readBootstrapContext(config.bootstrapContextPath);
  const monitorPort = Number(bootstrapContext.managerMonitorPort ?? 8787);
  const metadataToken = commandOutput([
    "curl",
    "-X",
    "PUT",
    "-s",
    "http://169.254.169.254/latest/api/token",
    "-H",
    "X-aws-ec2-metadata-token-ttl-seconds: 21600",
  ]);
  const instanceId = fetchInstanceMetadata("instance-id", metadataToken);
  const managerPrivateIp = fetchInstanceMetadata("local-ipv4", metadataToken);

  if (!existsSync(swarmSharedTokenPath)) {
    const token = commandOutput(["openssl", "rand", "-hex", "32"]);
    writeFileSync(swarmSharedTokenPath, ensureTrailingNewline(token), { mode: 0o600 });
  }
  const swarmSharedToken = readFileSync(swarmSharedTokenPath, "utf8").trim();

  writeFileSync(
    config.bootstrapContextPath,
    `${JSON.stringify(
      {
        ...bootstrapContext,
        managerPrivateIp,
        managerMonitorPort: monitorPort,
        swarmSharedToken,
      },
      null,
      2,
    )}\n`,
  );

  runChecked(
    [
      "bun",
      "run",
      "--filter",
      "@agent-infrastructure/swarm-manager",
      "run:install-host-scripts",
      "--",
      "--runtime-dir",
      config.runtimeDir,
      "--host-root",
      config.hostRoot,
      "--agent-github-config-root",
      config.agentGithubConfigRoot,
    ],
    config.runtimeDir,
  );

  writeFileSync(
    "/etc/systemd/system/agent-swarm-monitor.service",
    managerServiceUnit(config.hostRoot),
  );
  logStep("setup-host: wrote /etc/systemd/system/agent-swarm-monitor.service");
  writeFileSync(
    "/etc/systemd/system/agent-swarm-manager-node.service",
    managerNodeServiceUnit(config.hostRoot),
  );
  logStep("setup-host: wrote /etc/systemd/system/agent-swarm-manager-node.service");

  writeFileSync(
    managerEnvPath,
    ensureTrailingNewline(`AGENT_HOME=${process.env.AGENT_HOME}
AGENT_RUNTIME_DIR=${config.runtimeDir}
AGENT_STATE_DIR=${config.stateDir}
AGENT_WORKSPACE_DIR=${config.workspaceDir}
`) +
    ensureTrailingNewline(`MANAGER_WS_HOST=0.0.0.0
MANAGER_WS_PORT=${monitorPort}
SWARM_SHARED_TOKEN=${swarmSharedToken}
METRICS_DB_PATH=${metricsDbPath}
HEARTBEAT_TIMEOUT_SECONDS=5
RAW_RETENTION_DAYS=7
ROLLUP_1M_RETENTION_DAYS=30
ROLLUP_1H_RETENTION_DAYS=365
AGENT_GITHUB_CONFIG_ROOT=${config.agentGithubConfigRoot}
GIT_ASKPASS=${config.hostRoot}/git-askpass.sh
SWARM_BOOTSTRAP_CONTEXT_PATH=${config.bootstrapContextPath}
GIT_TERMINAL_PROMPT=0
`),
  );

  writeFileSync(
    managerNodeEnvPath,
    ensureTrailingNewline(`AGENT_HOME=${process.env.AGENT_HOME}
AGENT_RUNTIME_DIR=${config.runtimeDir}
AGENT_STATE_DIR=${config.stateDir}
AGENT_WORKSPACE_DIR=${config.workspaceDir}
`) +
    ensureTrailingNewline(`MONITOR_MANAGER_URL=ws://127.0.0.1:${monitorPort}/workers/stream
MONITOR_SHARED_TOKEN=${swarmSharedToken}
MONITOR_RECONNECT_DELAY_MS=1000
MONITOR_NODE_ROLE=manager
MONITOR_WORKER_ID=${instanceId}
MONITOR_INSTANCE_ID=${instanceId}
MONITOR_PRIVATE_IP=${managerPrivateIp}
AGENT_GITHUB_CONFIG_ROOT=${config.agentGithubConfigRoot}
GIT_ASKPASS=${config.hostRoot}/git-askpass.sh
GIT_TERMINAL_PROMPT=0
`),
  );

  if (!existsSync(workerRuntimeReleaseManifestPath)) {
    runChecked(
      [
        "bun",
        "run",
        "--filter",
        "@agent-infrastructure/swarm-manager",
        "run:publish-worker-runtime-release",
        "--",
        "--runtime-dir",
        config.runtimeDir,
        "--bootstrap-context",
        config.bootstrapContextPath,
        "--manifest-path",
        workerRuntimeReleaseManifestPath,
        "--release-id",
        "manager-bootstrap",
      ],
      config.runtimeDir,
    );
  }

  runChecked([
    "chown",
    "-R",
    "ec2-user:ec2-user",
    config.runtimeDir,
    config.stateDir,
    config.workspaceDir,
  ]);
  runChecked(["systemctl", "daemon-reload"]);
  runChecked(["systemctl", "enable", "--now", "agent-swarm-monitor.service"]);
  runChecked(["systemctl", "enable", "--now", "agent-swarm-manager-node.service"]);
  logStep("setup-host: complete");

  console.log(
    JSON.stringify({
      ok: true,
      runtimeDir: config.runtimeDir,
      stateDir: config.stateDir,
      workspaceDir: config.workspaceDir,
      hostRoot: config.hostRoot,
    }),
  );
}

await main();
