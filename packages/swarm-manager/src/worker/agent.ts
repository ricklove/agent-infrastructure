import { readFileSync } from "node:fs";

type CpuSnapshot = {
  idle: number;
  total: number;
};

type WorkerMetrics = {
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
  containerCount: number;
};

type ContainerMetrics = {
  containerId: string;
  containerName: string;
  projectId: string | null;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
};

type HeartbeatPayload = {
  type: "heartbeat";
  workerId: string;
  instanceId: string;
  privateIp: string;
  timestamp: number;
  worker: WorkerMetrics;
  containers: ContainerMetrics[];
};

const config = {
  managerUrl: process.env.MONITOR_MANAGER_URL ?? "",
  sharedToken: process.env.MONITOR_SHARED_TOKEN ?? "",
  reconnectDelayMs: Number(process.env.MONITOR_RECONNECT_DELAY_MS ?? "1000"),
};

if (!config.managerUrl || !config.sharedToken) {
  throw new Error("MONITOR_MANAGER_URL and MONITOR_SHARED_TOKEN must be set");
}

let currentSocket: WebSocket | null = null;
let previousCpuSnapshot: CpuSnapshot | null = null;
let workerId = "";
let instanceId = "";
let privateIp = "";
let heartbeatInFlight = false;

async function fetchImdsToken(): Promise<string> {
  const response = await fetch("http://169.254.169.254/latest/api/token", {
    method: "PUT",
    headers: {
      "X-aws-ec2-metadata-token-ttl-seconds": "21600",
    },
  });

  if (!response.ok) {
    throw new Error(`failed to fetch IMDS token: ${response.status}`);
  }

  return response.text();
}

async function fetchMetadata(path: string, token: string): Promise<string> {
  const response = await fetch(`http://169.254.169.254/latest/meta-data/${path}`, {
    headers: {
      "X-aws-ec2-metadata-token": token,
    },
  });

  if (!response.ok) {
    throw new Error(`failed to fetch metadata ${path}: ${response.status}`);
  }

  return response.text();
}

function parseCpuSnapshot(): CpuSnapshot {
  const statLine = readFileSync("/proc/stat", "utf8").split("\n")[0] ?? "";
  const fields = statLine.trim().split(/\s+/).slice(1).map(Number);
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  const total = fields.reduce((sum: number, value: number) => sum + value, 0);
  return { idle, total };
}

function readCpuPercent(): number {
  const snapshot = parseCpuSnapshot();

  if (!previousCpuSnapshot) {
    previousCpuSnapshot = snapshot;
    return 0;
  }

  const totalDelta = snapshot.total - previousCpuSnapshot.total;
  const idleDelta = snapshot.idle - previousCpuSnapshot.idle;
  previousCpuSnapshot = snapshot;

  if (totalDelta <= 0) {
    return 0;
  }

  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(2));
}

function readMemoryMetrics(): {
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
} {
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const totalMatch = meminfo.match(/^MemTotal:\s+(\d+)\s+kB$/m);
  const availableMatch = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m);

  const totalKb = Number(totalMatch?.[1] ?? "0");
  const availableKb = Number(availableMatch?.[1] ?? "0");
  const totalBytes = totalKb * 1024;
  const usedBytes = Math.max(totalKb - availableKb, 0) * 1024;
  const memoryPercent =
    totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0;

  return {
    memoryUsedBytes: usedBytes,
    memoryTotalBytes: totalBytes,
    memoryPercent,
  };
}

function parsePercent(value: string): number {
  return Number.parseFloat(value.replace("%", "").trim()) || 0;
}

function parseBytes(value: string): number {
  const normalized = value.trim();
  const match = normalized.match(/^([\d.]+)\s*([KMGTP]?i?B|B)$/i);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
    PB: 1000 ** 5,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
    PIB: 1024 ** 5,
  };

  return Math.round(amount * (multipliers[unit] ?? 1));
}

function readContainerMetrics(): ContainerMetrics[] {
  const result = Bun.spawnSync([
    "docker",
    "stats",
    "--no-stream",
    "--format",
    "{{json .}}",
  ]);

  if (result.exitCode !== 0) {
    return [];
  }

  const stdout = new TextDecoder().decode(result.stdout);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, string>)
    .map((container) => {
      const usage = container.MemUsage ?? "0B / 0B";
      const [usedRaw, limitRaw] = usage.split("/").map((part) => part.trim());
      return {
        containerId: container.ID ?? "",
        containerName: container.Name ?? "",
        projectId: null,
        cpuPercent: parsePercent(container.CPUPerc ?? "0%"),
        memoryUsedBytes: parseBytes(usedRaw ?? "0B"),
        memoryLimitBytes: parseBytes(limitRaw ?? "0B"),
        memoryPercent: parsePercent(container.MemPerc ?? "0%"),
      };
    })
    .filter((container) => container.containerId.length > 0);
}

function buildHeartbeat(): HeartbeatPayload {
  const memory = readMemoryMetrics();
  const containers = readContainerMetrics();

  return {
    type: "heartbeat",
    workerId,
    instanceId,
    privateIp,
    timestamp: Date.now(),
    worker: {
      cpuPercent: readCpuPercent(),
      memoryUsedBytes: memory.memoryUsedBytes,
      memoryTotalBytes: memory.memoryTotalBytes,
      memoryPercent: memory.memoryPercent,
      containerCount: containers.length,
    },
    containers,
  };
}

function sendAuth(): void {
  currentSocket?.send(
    JSON.stringify({
      type: "auth",
      token: config.sharedToken,
      workerId,
      instanceId,
      privateIp,
    }),
  );
}

function connect(): void {
  const socket = new WebSocket(config.managerUrl);
  currentSocket = socket;

  socket.addEventListener("open", () => {
    sendAuth();
  });

  socket.addEventListener("close", () => {
    if (currentSocket === socket) {
      currentSocket = null;
    }

    setTimeout(connect, config.reconnectDelayMs);
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

async function tick(): Promise<void> {
  if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  if (heartbeatInFlight) {
    return;
  }

  heartbeatInFlight = true;
  try {
    currentSocket.send(JSON.stringify(buildHeartbeat()));
  } finally {
    heartbeatInFlight = false;
  }
}

const token = await fetchImdsToken();
instanceId = await fetchMetadata("instance-id", token);
privateIp = await fetchMetadata("local-ipv4", token);
workerId = instanceId;

connect();
setInterval(() => {
  void tick();
}, 1000);
