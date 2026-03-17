type LaunchConfig = {
  managerUrl: string;
  token: string;
  dockerHost?: string;
  workerId: string;
  workerPrivateIp: string;
  namespace: string;
  serviceName: string;
  instanceId: string;
  image: string;
  containerPort: number;
  protocol: string;
  fallbackNamespace: string;
  containerName: string;
  envPairs: string[];
};

type PortLeaseResponse = {
  ok: true;
  workerId: string;
  namespace: string;
  serviceName: string;
  instanceId: string;
  hostPort: number;
};

type ServiceRegisterResponse = {
  ok: true;
  namespace: string;
  serviceName: string;
  instances: Array<{
    namespace: string;
    serviceName: string;
    instanceId: string;
    workerId: string;
    workerPrivateIp: string;
    hostPort: number;
    containerPort: number;
    protocol: string;
    healthy: boolean;
    updatedAtMs: number;
  }>;
};

function parseArgs(argv: string[]): Map<string, string[]> {
  const args = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, [...(args.get(key) ?? []), "true"]);
      continue;
    }

    args.set(key, [...(args.get(key) ?? []), next]);
    index += 1;
  }

  return args;
}

function requireOne(args: Map<string, string[]>, key: string): string {
  const value = args.get(key)?.[0]?.trim();
  if (!value) {
    throw new Error(`missing required --${key}`);
  }

  return value;
}

function optionalOne(args: Map<string, string[]>, key: string): string | undefined {
  const value = args.get(key)?.[0]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseInteger(value: string, key: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid integer for --${key}`);
  }

  return parsed;
}

function buildConfig(argv: string[]): LaunchConfig {
  const args = parseArgs(argv);
  const namespace = requireOne(args, "namespace");
  const serviceName = requireOne(args, "service-name");
  const instanceId =
    optionalOne(args, "instance-id") ?? `${serviceName}-${Date.now()}`;

  return {
    managerUrl: requireOne(args, "manager-url"),
    token: requireOne(args, "token"),
    dockerHost: optionalOne(args, "docker-host"),
    workerId: requireOne(args, "worker-id"),
    workerPrivateIp: requireOne(args, "worker-private-ip"),
    namespace,
    serviceName,
    instanceId,
    image: requireOne(args, "image"),
    containerPort: parseInteger(requireOne(args, "container-port"), "container-port"),
    protocol: optionalOne(args, "protocol") ?? "http",
    fallbackNamespace: optionalOne(args, "fallback-namespace") ?? "root",
    containerName:
      optionalOne(args, "container-name") ??
      `${namespace}-${serviceName}-${instanceId}`.replace(/[^a-zA-Z0-9_.-]/g, "-"),
    envPairs: args.get("env") ?? [],
  };
}

async function postJson<T>(
  url: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-swarm-token": token,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function runDockerCommand(config: LaunchConfig, hostPort: number): string {
  const envPairs = [
    `SWARM_NAMESPACE=${config.namespace}`,
    `SWARM_SERVICE_NAME=${config.serviceName}`,
    `SWARM_INSTANCE_ID=${config.instanceId}`,
    `SWARM_MANAGER_URL=${config.managerUrl}`,
    `SWARM_FALLBACK_NAMESPACE=${config.fallbackNamespace}`,
    ...config.envPairs,
  ];

  const command = ["docker"];
  if (config.dockerHost) {
    command.push("--host", config.dockerHost);
  }

  command.push(
    "run",
    "-d",
    "--restart",
    "unless-stopped",
    "--name",
    config.containerName,
    "-p",
    `${hostPort}:${config.containerPort}`,
  );

  for (const pair of envPairs) {
    command.push("-e", pair);
  }

  command.push(config.image);

  const result = Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString("utf8").trim();
    throw new Error(stderr || "docker run failed");
  }

  return result.stdout.toString("utf8").trim();
}

function removeContainer(config: LaunchConfig): void {
  const command = ["docker"];
  if (config.dockerHost) {
    command.push("--host", config.dockerHost);
  }

  command.push("rm", "-f", config.containerName);
  Bun.spawnSync(command, {
    stdout: "ignore",
    stderr: "ignore",
  });
}

async function main(): Promise<void> {
  const config = buildConfig(process.argv.slice(2));

  const lease = await postJson<PortLeaseResponse>(
    `${config.managerUrl}/ports/lease`,
    config.token,
    {
      workerId: config.workerId,
      namespace: config.namespace,
      serviceName: config.serviceName,
      instanceId: config.instanceId,
    },
  );

  let containerId = "";

  try {
    containerId = runDockerCommand(config, lease.hostPort);

    const registration = await postJson<ServiceRegisterResponse>(
      `${config.managerUrl}/services/register`,
      config.token,
      {
        workerId: config.workerId,
        workerPrivateIp: config.workerPrivateIp,
        namespace: config.namespace,
        serviceName: config.serviceName,
        instanceId: config.instanceId,
        hostPort: lease.hostPort,
        containerPort: config.containerPort,
        protocol: config.protocol,
        healthy: true,
      },
    );

    console.log(
      JSON.stringify({
        ok: true,
        action: "launch-service",
        containerId,
        containerName: config.containerName,
        namespace: config.namespace,
        serviceName: config.serviceName,
        instanceId: config.instanceId,
        workerId: config.workerId,
        workerPrivateIp: config.workerPrivateIp,
        hostPort: lease.hostPort,
        containerPort: config.containerPort,
        protocol: config.protocol,
        instances: registration.instances,
      }),
    );
  } catch (error) {
    if (containerId) {
      removeContainer(config);
    }

    await postJson(
      `${config.managerUrl}/ports/release`,
      config.token,
      {
        workerId: config.workerId,
        hostPort: lease.hostPort,
      },
    ).catch(() => undefined);

    throw error;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "launch failed",
    }),
  );
  process.exit(1);
});
