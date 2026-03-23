import { readdirSync, readFileSync } from "node:fs";

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

type ProcessSample = {
  pid: number;
  comm: string;
  state: string;
  cpuPercent: number;
  rssBytes: number;
};

type ProcessWindow = {
  sampledAt: number;
  intervalMs: number;
  topCpu: ProcessSample[];
  topMemory: ProcessSample[];
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
  nodeRole: "manager" | "worker";
  timestamp: number;
  worker: WorkerMetrics;
  containers: ContainerMetrics[];
  processWindow?: ProcessWindow;
};

type ProcessSnapshot = {
  totalCpuTicks: number;
  rssBytes: number;
  state: string;
  comm: string;
};

type LifecycleEventType =
  | "telemetry_process_started"
  | "telemetry_connect_started"
  | "shutdown"
  | "disconnected";

const config: {
  managerUrl: string;
  sharedToken: string;
  reconnectDelayMs: number;
  workerIdOverride: string;
  instanceIdOverride: string;
  privateIpOverride: string;
  nodeRole: "manager" | "worker";
  processSampleIntervalMs: number;
  processTopCount: number;
} = {
  managerUrl: process.env.MONITOR_MANAGER_URL ?? "",
  sharedToken: process.env.MONITOR_SHARED_TOKEN ?? "",
  reconnectDelayMs: Number(process.env.MONITOR_RECONNECT_DELAY_MS ?? "1000"),
  workerIdOverride: process.env.MONITOR_WORKER_ID ?? "",
  instanceIdOverride: process.env.MONITOR_INSTANCE_ID ?? "",
  privateIpOverride: process.env.MONITOR_PRIVATE_IP ?? "",
  nodeRole: process.env.MONITOR_NODE_ROLE === "manager" ? "manager" : "worker",
  processSampleIntervalMs: Number(
    process.env.MONITOR_PROCESS_SAMPLE_INTERVAL_MS ?? "10000",
  ),
  processTopCount: Number(process.env.MONITOR_PROCESS_TOP_COUNT ?? "5"),
};

if (!config.managerUrl || !config.sharedToken) {
  throw new Error("MONITOR_MANAGER_URL and MONITOR_SHARED_TOKEN must be set");
}

let currentSocket: WebSocket | null = null;
let previousCpuSnapshot: CpuSnapshot | null = null;
let previousProcessCpuSnapshot: CpuSnapshot | null = null;
let previousProcessSampleAt = 0;
let previousProcessByPid = new Map<number, ProcessSnapshot>();
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
  let result: Bun.SyncSubprocess;
  try {
    result = Bun.spawnSync([
      "docker",
      "stats",
      "--no-stream",
      "--format",
      "{{json .}}",
    ]);
  } catch {
    return [];
  }

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

function parseProcessSnapshot(pid: number): ProcessSnapshot | null {
  try {
    const statText = readFileSync(`/proc/${pid}/stat`, "utf8");
    const commStart = statText.indexOf("(");
    const commEnd = statText.lastIndexOf(")");
    if (commStart < 0 || commEnd <= commStart) {
      return null;
    }

    const comm = statText.slice(commStart + 1, commEnd);
    const rest = statText.slice(commEnd + 2).trim().split(/\s+/);
    const state = rest[0] ?? "?";
    const utime = Number(rest[11] ?? "0");
    const stime = Number(rest[12] ?? "0");

    const statusText = readFileSync(`/proc/${pid}/status`, "utf8");
    const rssMatch = statusText.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    const rssBytes = Number(rssMatch?.[1] ?? "0") * 1024;

    return {
      totalCpuTicks: utime + stime,
      rssBytes,
      state,
      comm,
    };
  } catch {
    return null;
  }
}

function rankProcesses(
  currentCpuSnapshot: CpuSnapshot,
  sampledAt: number,
): ProcessWindow | undefined {
  const intervalMs = previousProcessSampleAt
    ? sampledAt - previousProcessSampleAt
    : 0;
  previousProcessSampleAt = sampledAt;

  const pids = readdirSync("/proc", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .filter((pid) => Number.isInteger(pid));

  const nextProcessByPid = new Map<number, ProcessSnapshot>();
  const processSamples: ProcessSample[] = [];

  const totalCpuDelta = previousProcessCpuSnapshot
    ? currentCpuSnapshot.total - previousProcessCpuSnapshot.total
    : 0;
  previousProcessCpuSnapshot = currentCpuSnapshot;

  for (const pid of pids) {
    const snapshot = parseProcessSnapshot(pid);
    if (!snapshot) {
      continue;
    }

    nextProcessByPid.set(pid, snapshot);
    const previous = previousProcessByPid.get(pid);
    const cpuDelta = previous ? snapshot.totalCpuTicks - previous.totalCpuTicks : 0;
    const cpuPercent =
      totalCpuDelta > 0 && cpuDelta > 0
        ? Number(((cpuDelta / totalCpuDelta) * 100).toFixed(2))
        : 0;

    processSamples.push({
      pid,
      comm: snapshot.comm,
      state: snapshot.state,
      cpuPercent,
      rssBytes: snapshot.rssBytes,
    });
  }

  previousProcessByPid = nextProcessByPid;

  if (intervalMs <= 0) {
    return undefined;
  }

  const topCount = Math.max(1, config.processTopCount);
  const topCpu = [...processSamples]
    .sort((left, right) => {
      if (right.cpuPercent !== left.cpuPercent) {
        return right.cpuPercent - left.cpuPercent;
      }
      return right.rssBytes - left.rssBytes;
    })
    .slice(0, topCount);
  const topMemory = [...processSamples]
    .sort((left, right) => {
      if (right.rssBytes !== left.rssBytes) {
        return right.rssBytes - left.rssBytes;
      }
      return right.cpuPercent - left.cpuPercent;
    })
    .slice(0, topCount);

  return {
    sampledAt,
    intervalMs,
    topCpu,
    topMemory,
  };
}

function buildHeartbeat(): HeartbeatPayload {
  const sampledAt = Date.now();
  const memory = readMemoryMetrics();
  const containers = readContainerMetrics();
  const currentCpuSnapshot = parseCpuSnapshot();
  const processWindow =
    config.processSampleIntervalMs > 0 &&
    (previousProcessSampleAt === 0 ||
      sampledAt - previousProcessSampleAt >= config.processSampleIntervalMs)
      ? rankProcesses(currentCpuSnapshot, sampledAt)
      : undefined;

  return {
    type: "heartbeat",
    workerId,
    instanceId,
    privateIp,
    nodeRole: config.nodeRole,
    timestamp: sampledAt,
    worker: {
      cpuPercent: readCpuPercent(),
      memoryUsedBytes: memory.memoryUsedBytes,
      memoryTotalBytes: memory.memoryTotalBytes,
      memoryPercent: memory.memoryPercent,
      containerCount: containers.length,
    },
    containers,
    processWindow,
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
      nodeRole: config.nodeRole,
    }),
  );
}

function managerHttpBaseUrl(): string {
  return config.managerUrl
    .replace(/^wss?:\/\//, (match) => (match === "wss://" ? "https://" : "http://"))
    .replace(/\/workers\/stream$/, "");
}

async function emitLifecycleEvent(
  eventType: LifecycleEventType,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${managerHttpBaseUrl()}/workers/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-swarm-token": config.sharedToken,
      },
      body: JSON.stringify({
        workerId,
        instanceId,
        privateIp,
        nodeRole: config.nodeRole,
        eventType,
        eventTsMs: Date.now(),
        details: details ?? {},
      }),
    });
  } catch {}
}

function connect(): void {
  const socket = new WebSocket(config.managerUrl);
  currentSocket = socket;

  socket.addEventListener("open", () => {
    sendAuth();
  });

  socket.addEventListener("close", () => {
    void emitLifecycleEvent("disconnected");
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

if (
  config.workerIdOverride &&
  config.instanceIdOverride &&
  config.privateIpOverride
) {
  workerId = config.workerIdOverride;
  instanceId = config.instanceIdOverride;
  privateIp = config.privateIpOverride;
} else {
  const token = await fetchImdsToken();
  instanceId = await fetchMetadata("instance-id", token);
  privateIp = await fetchMetadata("local-ipv4", token);
  workerId = instanceId;
}

await emitLifecycleEvent("telemetry_process_started", {
  managerUrl: config.managerUrl,
  nodeRole: config.nodeRole,
});
await emitLifecycleEvent("telemetry_connect_started");
connect();
setInterval(() => {
  void tick();
}, 1000);
