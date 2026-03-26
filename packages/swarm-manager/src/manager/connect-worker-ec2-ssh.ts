import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_DIR,
  DEFAULT_WORKER_RUNTIME_RELEASE_MANIFEST_PATH,
} from "../paths.js";

type BootstrapContext = {
  region?: string;
  swarmTagKey?: string;
  swarmTagValue?: string;
  workerInstanceType?: string;
  workerSubnetIds?: string[];
  workerSecurityGroupId?: string;
  workerInstanceProfileArn?: string;
  managerPrivateIp?: string;
  managerMonitorPort?: number;
  swarmSharedToken?: string;
};

type WorkerRuntimeRelease = {
  bucket?: string;
  key?: string;
};

type WorkerSummary = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole: "manager" | "worker";
  status: "connected" | "stale" | "disconnected" | "hibernated" | "zombie";
  lastHeartbeatAt: number;
  lastMetrics?: {
    cpuPercent?: number;
    memoryPercent?: number;
    containerCount?: number;
  };
};

type WorkersResponse = {
  workers: WorkerSummary[];
};

type Ec2Worker = {
  instanceId: string;
  state: string;
  privateIp: string;
  launchTime: string;
};

type LaunchWorkerResult = {
  Instances: Array<{
    InstanceId: string;
    PrivateIpAddress?: string;
    ImageId: string;
  }>;
};

type ParsedArgs = {
  bootstrapContextPath: string;
  workerRuntimeReleasePath: string;
  runtimeDir: string;
  region: string;
  swarmTagKey: string;
  swarmTagValue: string;
  sharedToken: string;
  managerPrivateIp: string;
  managerMonitorPort: number;
  managerUrl: string;
  remoteUser: string;
  instanceId?: string;
  hostAlias?: string;
  keyPath?: string;
  maxCpuPercent: number;
  maxMemoryPercent: number;
  maxContainers: number;
  allowLaunch: boolean;
  connect: boolean;
  printHostAlias: boolean;
  launchInstanceType: string;
  launchSubnetId: string;
  launchImageId?: string;
  launchName: string;
  launchTags: string[];
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

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

function collectRepeated(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== `--${flag}`) {
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      continue;
    }
    values.push(next);
    index += 1;
  }
  return values;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}

function loadJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    return {};
  }
  try {
    return loadJsonFile<BootstrapContext>(path);
  } catch {
    return {};
  }
}

function loadWorkerRuntimeRelease(path: string): WorkerRuntimeRelease {
  if (!existsSync(path)) {
    return {};
  }
  try {
    return loadJsonFile<WorkerRuntimeRelease>(path);
  } catch {
    return {};
  }
}

function fail(message: string): never {
  console.error(`[connect-worker-ec2-ssh] ${message}`);
  process.exit(1);
}

function log(message: string): void {
  console.log(`[connect-worker-ec2-ssh] ${message}`);
}

function runCommand(command: string[], cwd?: string): CommandResult {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

function runChecked(command: string[], cwd?: string): string {
  const result = runCommand(command, cwd);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    if (stderr) {
      console.error(stderr);
    }
    fail(`command failed: ${command.join(" ")}`);
  }
  return result.stdout.trim();
}

function runCheckedJson<T>(command: string[], cwd?: string): T {
  const output = runChecked(command, cwd);
  return JSON.parse(output) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function awsCommand(baseRegion: string, ...parts: string[]): string[] {
  return ["aws", ...parts, "--region", baseRegion];
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function printHelp(): void {
  console.log(`Usage: bun run --filter @agent-infrastructure/swarm-manager run:connect-worker-ec2-ssh [options]

Select a low-load worker from live swarm telemetry when possible, otherwise
start or launch one, bootstrap SSH through SSM, and connect directly to the
worker private IP.

Options:
  --instance-id ID
  --worker-id ID
  --bootstrap-context PATH
  --worker-runtime-release PATH
  --runtime-dir PATH
  --region REGION
  --manager-url URL
  --remote-user USER
  --host-alias NAME
  --key-path PATH
  --max-cpu-percent N
  --max-memory-percent N
  --max-containers N
  --instance-type TYPE
  --subnet-id SUBNET
  --image-id AMI
  --name NAME
  --tag KEY=VALUE
  --no-launch
  --no-connect
  --print-host-alias
  -h, --help`);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (hasFlag(argv, "help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const bootstrapContextPath =
    optionalOne(argv, "bootstrap-context") ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH;
  const workerRuntimeReleasePath =
    optionalOne(argv, "worker-runtime-release") ??
    DEFAULT_WORKER_RUNTIME_RELEASE_MANIFEST_PATH;
  const runtimeDir = optionalOne(argv, "runtime-dir") ?? DEFAULT_RUNTIME_DIR;
  const bootstrapContext = loadBootstrapContext(bootstrapContextPath);
  const release = loadWorkerRuntimeRelease(workerRuntimeReleasePath);

  const region =
    optionalOne(argv, "region") ??
    bootstrapContext.region?.trim() ??
    process.env.AWS_REGION?.trim() ??
    process.env.AWS_DEFAULT_REGION?.trim() ??
    "";
  const swarmTagKey = bootstrapContext.swarmTagKey?.trim() || "AgentSwarm";
  const swarmTagValue = bootstrapContext.swarmTagValue?.trim() || "";
  const managerPrivateIp = bootstrapContext.managerPrivateIp?.trim() || "";
  const managerMonitorPort = Number.isFinite(bootstrapContext.managerMonitorPort)
    ? Number(bootstrapContext.managerMonitorPort)
    : 8787;
  const managerUrl =
    optionalOne(argv, "manager-url") ?? `http://127.0.0.1:${managerMonitorPort}`;
  const sharedToken = bootstrapContext.swarmSharedToken?.trim() || "";
  const launchInstanceType =
    optionalOne(argv, "instance-type") ??
    bootstrapContext.workerInstanceType?.trim() ??
    "t3.small";
  const launchSubnetId =
    optionalOne(argv, "subnet-id") ??
    bootstrapContext.workerSubnetIds?.[0]?.trim() ??
    "";
  const launchName = optionalOne(argv, "name") ?? "agent-swarm-worker";

  if (!region) {
    fail("region is required");
  }
  if (!swarmTagValue) {
    fail("swarm tag value is required in bootstrap context");
  }
  if (!sharedToken) {
    fail("swarm shared token is required in bootstrap context");
  }
  if (!managerPrivateIp) {
    fail("manager private ip is required in bootstrap context");
  }
  if (!bootstrapContext.workerSecurityGroupId?.trim()) {
    fail("worker security group id is required in bootstrap context");
  }
  if (!bootstrapContext.workerInstanceProfileArn?.trim()) {
    fail("worker instance profile arn is required in bootstrap context");
  }
  if (!launchSubnetId) {
    fail("worker subnet id is required");
  }
  if (!release.bucket?.trim() || !release.key?.trim()) {
    fail("worker runtime release metadata is required");
  }

  return {
    bootstrapContextPath,
    workerRuntimeReleasePath,
    runtimeDir,
    region,
    swarmTagKey,
    swarmTagValue,
    sharedToken,
    managerPrivateIp,
    managerMonitorPort,
    managerUrl,
    remoteUser: optionalOne(argv, "remote-user") ?? "ec2-user",
    instanceId: optionalOne(argv, "instance-id") ?? optionalOne(argv, "worker-id"),
    hostAlias: optionalOne(argv, "host-alias"),
    keyPath: optionalOne(argv, "key-path"),
    maxCpuPercent: parseNumber(optionalOne(argv, "max-cpu-percent"), 40),
    maxMemoryPercent: parseNumber(optionalOne(argv, "max-memory-percent"), 70),
    maxContainers: parseNumber(optionalOne(argv, "max-containers"), 0),
    allowLaunch: !hasFlag(argv, "no-launch"),
    connect: !hasFlag(argv, "no-connect"),
    printHostAlias: hasFlag(argv, "print-host-alias"),
    launchInstanceType,
    launchSubnetId,
    launchImageId: optionalOne(argv, "image-id"),
    launchName,
    launchTags: collectRepeated(argv, "tag"),
  };
}

async function getReusableWorker(config: ParsedArgs): Promise<WorkerSummary | null> {
  try {
    const response = await fetch(`${config.managerUrl}/workers`);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as WorkersResponse;
    const candidates = payload.workers
      .filter((worker) => worker.nodeRole === "worker" && worker.status === "connected")
      .filter((worker) => (worker.lastMetrics?.cpuPercent ?? 1000) <= config.maxCpuPercent)
      .filter(
        (worker) => (worker.lastMetrics?.memoryPercent ?? 1000) <= config.maxMemoryPercent,
      )
      .filter(
        (worker) => (worker.lastMetrics?.containerCount ?? 1000) <= config.maxContainers,
      )
      .sort((left, right) => {
        const leftContainers = left.lastMetrics?.containerCount ?? 1000;
        const rightContainers = right.lastMetrics?.containerCount ?? 1000;
        if (leftContainers !== rightContainers) {
          return leftContainers - rightContainers;
        }
        const leftCpu = left.lastMetrics?.cpuPercent ?? 1000;
        const rightCpu = right.lastMetrics?.cpuPercent ?? 1000;
        if (leftCpu !== rightCpu) {
          return leftCpu - rightCpu;
        }
        const leftMemory = left.lastMetrics?.memoryPercent ?? 1000;
        const rightMemory = right.lastMetrics?.memoryPercent ?? 1000;
        if (leftMemory !== rightMemory) {
          return leftMemory - rightMemory;
        }
        return left.instanceId.localeCompare(right.instanceId);
      });

    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

function listEc2Workers(config: ParsedArgs): Ec2Worker[] {
  const filters = [
    `Name=tag:Role,Values=agent-swarm-worker`,
    `Name=tag:${config.swarmTagKey},Values=${config.swarmTagValue}`,
    "Name=instance-state-name,Values=pending,running,stopping,stopped",
  ];

  return runCheckedJson<Ec2Worker[]>(
    awsCommand(
      config.region,
      "ec2",
      "describe-instances",
      "--filters",
      ...filters,
      "--query",
      "Reservations[].Instances[].{instanceId:InstanceId,state:State.Name,privateIp:PrivateIpAddress,launchTime:LaunchTime}",
      "--output",
      "json",
    ),
  );
}

function pickExistingEc2Worker(workers: Ec2Worker[]): Ec2Worker | null {
  const rank = (state: string): number => {
    switch (state) {
      case "stopped":
        return 0;
      case "running":
        return 1;
      case "pending":
        return 2;
      case "stopping":
        return 3;
      default:
        return 99;
    }
  };

  return (
    workers
      .filter((worker) => worker.instanceId)
      .sort((left, right) => {
        const leftRank = rank(left.state);
        const rightRank = rank(right.state);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        const byLaunch = left.launchTime.localeCompare(right.launchTime);
        if (byLaunch !== 0) {
          return byLaunch;
        }
        return left.instanceId.localeCompare(right.instanceId);
      })[0] ?? null
  );
}

function currentWorkerState(config: ParsedArgs, instanceId: string): Ec2Worker {
  return runCheckedJson<Ec2Worker>(
    awsCommand(
      config.region,
      "ec2",
      "describe-instances",
      "--instance-ids",
      instanceId,
      "--query",
      "Reservations[0].Instances[0].{instanceId:InstanceId,state:State.Name,privateIp:PrivateIpAddress,launchTime:LaunchTime}",
      "--output",
      "json",
    ),
  );
}

function resolveWorkerUserDataTemplate(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const packageRoot = resolve(dirname(currentFilePath), "../../");
  const candidate = resolve(packageRoot, "scripts/worker-user-data.sh");
  if (!existsSync(candidate)) {
    fail(`worker user data script is missing at ${candidate}`);
  }
  return readFileSync(candidate, "utf8");
}

function renderWorkerUserData(
  config: ParsedArgs,
  bootstrapContext: BootstrapContext,
  release: WorkerRuntimeRelease,
): string {
  const template = resolveWorkerUserDataTemplate();
  return template
    .replaceAll("__MANAGER_PRIVATE_IP__", config.managerPrivateIp)
    .replaceAll("__MANAGER_MONITOR_PORT__", String(config.managerMonitorPort))
    .replaceAll("__SWARM_SHARED_TOKEN__", config.sharedToken)
    .replaceAll("__WORKER_RUNTIME_RELEASE_BUCKET__", release.bucket ?? "")
    .replaceAll("__WORKER_RUNTIME_RELEASE_KEY__", release.key ?? "")
    .replaceAll("__REGION__", config.region);
}

function resolveWorkerImage(config: ParsedArgs): { imageId: string; rootDeviceName: string; rootVolumeSize: number } {
  if (config.launchImageId) {
    const image = runCheckedJson<{
      ImageId: string;
      RootDeviceName: string;
      RootDeviceVolumeSize?: number;
    }>(
      awsCommand(
        config.region,
        "ec2",
        "describe-images",
        "--image-ids",
        config.launchImageId,
        "--query",
        "Images[0].{ImageId:ImageId,RootDeviceName:RootDeviceName,RootDeviceVolumeSize:BlockDeviceMappings[?DeviceName==RootDeviceName][0].Ebs.VolumeSize}",
        "--output",
        "json",
      ),
    );
    return {
      imageId: image.ImageId,
      rootDeviceName: image.RootDeviceName,
      rootVolumeSize: Math.max(30, Number(image.RootDeviceVolumeSize ?? 0)),
    };
  }

  const image = runCheckedJson<{
    ImageId: string;
    RootDeviceName: string;
    RootDeviceVolumeSize?: number;
  }>(
    awsCommand(
      config.region,
      "ec2",
      "describe-images",
      "--owners",
      "amazon",
      "--filters",
      "Name=name,Values=al2023-ami-2023.*-x86_64",
      "Name=state,Values=available",
      "--query",
      "sort_by(Images,&CreationDate)[-1].{ImageId:ImageId,RootDeviceName:RootDeviceName,RootDeviceVolumeSize:BlockDeviceMappings[?DeviceName==RootDeviceName][0].Ebs.VolumeSize}",
      "--output",
      "json",
    ),
  );
  return {
    imageId: image.ImageId,
    rootDeviceName: image.RootDeviceName,
    rootVolumeSize: Math.max(30, Number(image.RootDeviceVolumeSize ?? 0)),
  };
}

function launchWorker(config: ParsedArgs, bootstrapContext: BootstrapContext, release: WorkerRuntimeRelease): Ec2Worker {
  const image = resolveWorkerImage(config);
  const tempDir = mkdtempSync(resolve(tmpdir(), "connect-worker-ec2-ssh-"));
  const userDataPath = resolve(tempDir, "worker-user-data.sh");
  try {
    writeFileSync(userDataPath, renderWorkerUserData(config, bootstrapContext, release), "utf8");
    const extraTags = config.launchTags
      .filter((tag) => tag.includes("="))
      .map((tag) => {
        const [key, ...rest] = tag.split("=");
        return `{Key=${key},Value=${rest.join("=")}}`;
      });
    const instanceTagSpec = [
      `{Key=${config.swarmTagKey},Value=${config.swarmTagValue}}`,
      "{Key=Role,Value=agent-swarm-worker}",
      `{Key=Name,Value=${config.launchName}}`,
      ...extraTags,
    ].join(",");
    const volumeTagSpec = [
      `{Key=${config.swarmTagKey},Value=${config.swarmTagValue}}`,
      `{Key=Name,Value=${config.launchName}-volume}`,
    ].join(",");

    const result = runCheckedJson<LaunchWorkerResult>(
      awsCommand(
        config.region,
        "ec2",
        "run-instances",
        "--image-id",
        image.imageId,
        "--instance-type",
        config.launchInstanceType,
        "--hibernation-options",
        "Configured=true",
        "--block-device-mappings",
        `[{"DeviceName":"${image.rootDeviceName}","Ebs":{"DeleteOnTermination":true,"Encrypted":true,"VolumeSize":${image.rootVolumeSize}}}]`,
        "--iam-instance-profile",
        `Arn=${bootstrapContext.workerInstanceProfileArn}`,
        "--security-group-ids",
        `${bootstrapContext.workerSecurityGroupId}`,
        "--subnet-id",
        config.launchSubnetId,
        "--user-data",
        `file://${userDataPath}`,
        "--tag-specifications",
        `ResourceType=instance,Tags=[${instanceTagSpec}]`,
        `ResourceType=volume,Tags=[${volumeTagSpec}]`,
        "--output",
        "json",
      ),
    );

    const instance = result.Instances[0];
    if (!instance?.InstanceId) {
      fail("worker launch did not return an instance id");
    }
    return {
      instanceId: instance.InstanceId,
      state: "pending",
      privateIp: instance.PrivateIpAddress ?? "",
      launchTime: "",
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function waitForInstanceState(config: ParsedArgs, instanceId: string, target: "running" | "stopped"): void {
  runChecked(
    awsCommand(
      config.region,
      "ec2",
      "wait",
      `instance-${target}`,
      "--instance-ids",
      instanceId,
    ),
  );
}

async function waitForSsmOnline(config: ParsedArgs, instanceId: string): Promise<void> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const pingStatus = runCommand(
      awsCommand(
        config.region,
        "ssm",
        "describe-instance-information",
        "--filters",
        `Key=InstanceIds,Values=${instanceId}`,
        "--query",
        "InstanceInformationList[0].PingStatus",
        "--output",
        "text",
      ),
    ).stdout.trim();

    if (pingStatus === "Online") {
      return;
    }
    await sleep(3000);
  }
  fail(`SSM did not come online for ${instanceId} within 300 seconds`);
}

function ensureSshKey(hostAlias: string, keyPath?: string): { hostAlias: string; keyPath: string; publicKey: string } {
  const resolvedKeyPath =
    keyPath ?? resolve(process.env.HOME ?? "/home/ec2-user", ".ssh", hostAlias);
  mkdirSync(dirname(resolvedKeyPath), { recursive: true });
  chmodSync(dirname(resolvedKeyPath), 0o700);

  if (!existsSync(resolvedKeyPath)) {
    runChecked(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", hostAlias, "-f", resolvedKeyPath]);
  }

  chmodSync(resolvedKeyPath, 0o600);
  chmodSync(`${resolvedKeyPath}.pub`, 0o644);
  return {
    hostAlias,
    keyPath: resolvedKeyPath,
    publicKey: readFileSync(`${resolvedKeyPath}.pub`, "utf8").trim(),
  };
}

async function bootstrapSsh(config: ParsedArgs, instanceId: string, publicKey: string): Promise<void> {
  const encodedKey = Buffer.from(publicKey, "utf8").toString("base64");
  const script = `#!/usr/bin/env bash
set -euo pipefail
REMOTE_USER='${config.remoteUser}'
PUBKEY="$(printf '%s' '${encodedKey}' | base64 -d)"
if ! id -u "$REMOTE_USER" >/dev/null 2>&1; then
  echo "remote user $REMOTE_USER does not exist" >&2
  exit 1
fi
if ! command -v sshd >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y openssh-server
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server
  else
    echo "openssh-server is not installed and no supported package manager was found" >&2
    exit 1
  fi
fi
systemctl enable --now sshd 2>/dev/null || systemctl enable --now ssh
systemctl restart sshd 2>/dev/null || systemctl restart ssh
HOME_DIR="$(getent passwd "$REMOTE_USER" | cut -d: -f6)"
install -d -m 700 -o "$REMOTE_USER" -g "$REMOTE_USER" "$HOME_DIR/.ssh"
touch "$HOME_DIR/.ssh/authorized_keys"
grep -qxF "$PUBKEY" "$HOME_DIR/.ssh/authorized_keys" || printf '%s\n' "$PUBKEY" >> "$HOME_DIR/.ssh/authorized_keys"
chown "$REMOTE_USER:$REMOTE_USER" "$HOME_DIR/.ssh/authorized_keys"
chmod 600 "$HOME_DIR/.ssh/authorized_keys"
`;
  const encodedScript = Buffer.from(script, "utf8").toString("base64");
  const commandId = runChecked(
    awsCommand(
      config.region,
      "ssm",
      "send-command",
      "--instance-ids",
      instanceId,
      "--document-name",
      "AWS-RunShellScript",
      "--comment",
      "Configure SSH access for worker connection",
      "--parameters",
      `{"commands":["printf '%s' '${encodedScript}' | base64 -d >/tmp/connect-worker-ec2-ssh.sh && bash /tmp/connect-worker-ec2-ssh.sh"]}`,
      "--query",
      "Command.CommandId",
      "--output",
      "text",
    ),
  );

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const status = runCommand(
      awsCommand(
        config.region,
        "ssm",
        "get-command-invocation",
        "--command-id",
        commandId,
        "--instance-id",
        instanceId,
        "--query",
        "Status",
        "--output",
        "text",
      ),
    ).stdout.trim();
    if (status === "Success") {
      return;
    }
    if (!status || status === "Pending" || status === "InProgress" || status === "Delayed") {
      await sleep(3000);
      continue;
    }
    const stderr = runCommand(
      awsCommand(
        config.region,
        "ssm",
        "get-command-invocation",
        "--command-id",
        commandId,
        "--instance-id",
        instanceId,
        "--query",
        "StandardErrorContent",
        "--output",
        "text",
      ),
    ).stdout.trim();
    fail(`SSH bootstrap failed with status ${status}: ${stderr}`);
  }
  fail(`SSH bootstrap command ${commandId} did not complete within 180 seconds`);
}

function writeSshConfig(hostAlias: string, privateIp: string, keyPath: string, remoteUser: string): void {
  const sshDir = resolve(process.env.HOME ?? "/home/ec2-user", ".ssh");
  const configPath = resolve(sshDir, "config");
  mkdirSync(sshDir, { recursive: true });
  if (!existsSync(configPath)) {
    writeFileSync(configPath, "", "utf8");
  }
  chmodSync(configPath, 0o600);
  const begin = `# agent-infrastructure connect-worker-ec2-ssh begin ${hostAlias}`;
  const end = `# agent-infrastructure connect-worker-ec2-ssh end ${hostAlias}`;
  const block = `${begin}
Host ${hostAlias}
    HostName ${privateIp}
    User ${remoteUser}
    IdentityFile ${keyPath}
    IdentitiesOnly yes
    ForwardAgent yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ServerAliveCountMax 6
${end}
`;
  const lines = readFileSync(configPath, "utf8").split("\n");
  const output: string[] = [];
  let skipping = false;
  let replaced = false;
  for (const line of lines) {
    if (line === begin) {
      output.push(block.trimEnd());
      skipping = true;
      replaced = true;
      continue;
    }
    if (line === end) {
      skipping = false;
      continue;
    }
    if (!skipping) {
      output.push(line);
    }
  }
  let nextContent = output.join("\n").trimEnd();
  if (!replaced) {
    nextContent = `${nextContent}${nextContent ? "\n\n" : ""}${block.trimEnd()}`;
  }
  writeFileSync(configPath, `${nextContent}\n`, "utf8");
}

function validateSsh(hostAlias: string): void {
  const result = runCommand(["ssh", "-o", "ConnectTimeout=20", hostAlias, 'printf "%s\\n" "$HOSTNAME"']);
  if (result.exitCode !== 0) {
    fail(`SSH validation failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  log(`SSH connected to ${result.stdout.trim()}`);
}

function openInteractiveSsh(hostAlias: string): never {
  const proc = Bun.spawn(["ssh", hostAlias], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(proc.exited);
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const bootstrapContext = loadBootstrapContext(config.bootstrapContextPath);
  const release = loadWorkerRuntimeRelease(config.workerRuntimeReleasePath);

  runChecked(awsCommand(config.region, "sts", "get-caller-identity", "--output", "json"));

  let worker: Ec2Worker | null = null;

  if (config.instanceId) {
    worker = currentWorkerState(config, config.instanceId);
  } else {
    const reusableWorker = await getReusableWorker(config);
    if (reusableWorker) {
      log(
        `reusing connected worker ${reusableWorker.instanceId} cpu=${reusableWorker.lastMetrics?.cpuPercent ?? 0}% memory=${reusableWorker.lastMetrics?.memoryPercent ?? 0}% containers=${reusableWorker.lastMetrics?.containerCount ?? 0}`,
      );
      worker = {
        instanceId: reusableWorker.instanceId,
        state: "running",
        privateIp: reusableWorker.privateIp,
        launchTime: "",
      };
    }
  }

  if (!worker) {
    const existingWorker = pickExistingEc2Worker(listEc2Workers(config));
    if (existingWorker) {
      log(`reusing existing worker ${existingWorker.instanceId} state=${existingWorker.state}`);
      worker = existingWorker;
    }
  }

  if (!worker) {
    if (!config.allowLaunch) {
      fail("no reusable worker exists and --no-launch was set");
    }
    log("launching a new worker through swarm manager controls");
    worker = launchWorker(config, bootstrapContext, release);
  }

  if (worker.state === "stopped") {
    log(`starting worker ${worker.instanceId}`);
    runChecked(awsCommand(config.region, "ec2", "start-instances", "--instance-ids", worker.instanceId));
    waitForInstanceState(config, worker.instanceId, "running");
  } else if (worker.state === "stopping") {
    log(`waiting for worker ${worker.instanceId} to stop before restart`);
    waitForInstanceState(config, worker.instanceId, "stopped");
    runChecked(awsCommand(config.region, "ec2", "start-instances", "--instance-ids", worker.instanceId));
    waitForInstanceState(config, worker.instanceId, "running");
  } else if (worker.state === "pending") {
    log(`waiting for worker ${worker.instanceId} to reach running state`);
    waitForInstanceState(config, worker.instanceId, "running");
  }

  worker = currentWorkerState(config, worker.instanceId);
  log(`waiting for SSM on ${worker.instanceId}`);
  await waitForSsmOnline(config, worker.instanceId);

  const hostAlias = config.hostAlias ?? `agent-swarm-worker-${worker.instanceId}`;
  const sshKey = ensureSshKey(hostAlias, config.keyPath);
  await bootstrapSsh(config, worker.instanceId, sshKey.publicKey);
  writeSshConfig(hostAlias, worker.privateIp, sshKey.keyPath, config.remoteUser);
  log(`validating SSH connectivity to ${hostAlias} (${worker.privateIp})`);
  validateSsh(hostAlias);

  if (config.printHostAlias) {
    console.log(hostAlias);
  }

  if (config.connect) {
    openInteractiveSsh(hostAlias);
  }
}

await main();
