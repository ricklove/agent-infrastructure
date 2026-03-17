import { Database } from "bun:sqlite";

type WorkerAuthMessage = {
  type: "auth";
  token: string;
  workerId: string;
  instanceId: string;
  privateIp: string;
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

type WorkerHeartbeatMessage = {
  type: "heartbeat";
  workerId: string;
  instanceId: string;
  privateIp: string;
  timestamp: number;
  worker: WorkerMetrics;
  containers: ContainerMetrics[];
};

type IncomingMessage = WorkerAuthMessage | WorkerHeartbeatMessage;

type SocketData = {
  authenticated: boolean;
  workerId?: string;
  instanceId?: string;
  privateIp?: string;
};

type LiveWorkerState = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  status: "connected" | "stale" | "disconnected" | "error";
  lastHeartbeatAt: number;
  lastMetrics: WorkerMetrics | null;
  lastContainers: ContainerMetrics[];
};

type WorkerSampleRow = {
  workerId: string;
  instanceId: string;
  tsMs: number;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryPercent: number;
  containerCount: number;
};

type ContainerSampleRow = {
  workerId: string;
  projectId: string | null;
  containerId: string;
  containerName: string;
  tsMs: number;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
};

const config = {
  hostname: process.env.MANAGER_WS_HOST ?? "0.0.0.0",
  port: Number(process.env.MANAGER_WS_PORT ?? "8787"),
  sharedToken: process.env.SWARM_SHARED_TOKEN ?? "",
  dbPath: process.env.METRICS_DB_PATH ?? "/var/lib/agent-swarm-monitor/metrics.sqlite",
  heartbeatTimeoutMs:
    Number(process.env.HEARTBEAT_TIMEOUT_SECONDS ?? "5") * 1000,
  rawRetentionMs:
    Number(process.env.RAW_RETENTION_DAYS ?? "7") * 24 * 60 * 60 * 1000,
  rollup1mRetentionMs:
    Number(process.env.ROLLUP_1M_RETENTION_DAYS ?? "30") *
    24 *
    60 *
    60 *
    1000,
  rollup1hRetentionMs:
    Number(process.env.ROLLUP_1H_RETENTION_DAYS ?? "365") *
    24 *
    60 *
    60 *
    1000,
};

if (!config.sharedToken) {
  throw new Error("SWARM_SHARED_TOKEN must be set");
}

const db = new Database(config.dbPath, { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;

  CREATE TABLE IF NOT EXISTS worker_samples (
    worker_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    ts_ms INTEGER NOT NULL,
    cpu_percent REAL NOT NULL,
    memory_used_bytes INTEGER NOT NULL,
    memory_total_bytes INTEGER NOT NULL,
    memory_percent REAL NOT NULL,
    container_count INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_worker_samples_worker_ts
    ON worker_samples(worker_id, ts_ms);
  CREATE INDEX IF NOT EXISTS idx_worker_samples_ts
    ON worker_samples(ts_ms);

  CREATE TABLE IF NOT EXISTS container_samples (
    worker_id TEXT NOT NULL,
    project_id TEXT,
    container_id TEXT NOT NULL,
    container_name TEXT NOT NULL,
    ts_ms INTEGER NOT NULL,
    cpu_percent REAL NOT NULL,
    memory_used_bytes INTEGER NOT NULL,
    memory_limit_bytes INTEGER NOT NULL,
    memory_percent REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_container_samples_worker_ts
    ON container_samples(worker_id, ts_ms);
  CREATE INDEX IF NOT EXISTS idx_container_samples_container_ts
    ON container_samples(container_id, ts_ms);
  CREATE INDEX IF NOT EXISTS idx_container_samples_project_ts
    ON container_samples(project_id, ts_ms);

  CREATE TABLE IF NOT EXISTS worker_samples_1m (
    worker_id TEXT NOT NULL,
    bucket_start_ms INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    min_cpu_percent REAL NOT NULL,
    max_cpu_percent REAL NOT NULL,
    avg_cpu_percent REAL NOT NULL,
    min_memory_percent REAL NOT NULL,
    max_memory_percent REAL NOT NULL,
    avg_memory_percent REAL NOT NULL,
    avg_container_count REAL NOT NULL,
    PRIMARY KEY (worker_id, bucket_start_ms)
  );

  CREATE TABLE IF NOT EXISTS worker_samples_1h (
    worker_id TEXT NOT NULL,
    bucket_start_ms INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    min_cpu_percent REAL NOT NULL,
    max_cpu_percent REAL NOT NULL,
    avg_cpu_percent REAL NOT NULL,
    min_memory_percent REAL NOT NULL,
    max_memory_percent REAL NOT NULL,
    avg_memory_percent REAL NOT NULL,
    avg_container_count REAL NOT NULL,
    PRIMARY KEY (worker_id, bucket_start_ms)
  );

  CREATE TABLE IF NOT EXISTS container_samples_1m (
    worker_id TEXT NOT NULL,
    project_id TEXT,
    container_id TEXT NOT NULL,
    container_name TEXT NOT NULL,
    bucket_start_ms INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    min_cpu_percent REAL NOT NULL,
    max_cpu_percent REAL NOT NULL,
    avg_cpu_percent REAL NOT NULL,
    min_memory_percent REAL NOT NULL,
    max_memory_percent REAL NOT NULL,
    avg_memory_percent REAL NOT NULL,
    PRIMARY KEY (worker_id, container_id, bucket_start_ms)
  );

  CREATE TABLE IF NOT EXISTS container_samples_1h (
    worker_id TEXT NOT NULL,
    project_id TEXT,
    container_id TEXT NOT NULL,
    container_name TEXT NOT NULL,
    bucket_start_ms INTEGER NOT NULL,
    sample_count INTEGER NOT NULL,
    min_cpu_percent REAL NOT NULL,
    max_cpu_percent REAL NOT NULL,
    avg_cpu_percent REAL NOT NULL,
    min_memory_percent REAL NOT NULL,
    max_memory_percent REAL NOT NULL,
    avg_memory_percent REAL NOT NULL,
    PRIMARY KEY (worker_id, container_id, bucket_start_ms)
  );
`);

const insertWorkerSample = db.query(
  `INSERT INTO worker_samples (
    worker_id,
    instance_id,
    ts_ms,
    cpu_percent,
    memory_used_bytes,
    memory_total_bytes,
    memory_percent,
    container_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertContainerSample = db.query(
  `INSERT INTO container_samples (
    worker_id,
    project_id,
    container_id,
    container_name,
    ts_ms,
    cpu_percent,
    memory_used_bytes,
    memory_limit_bytes,
    memory_percent
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const workerSampleBuffer: WorkerSampleRow[] = [];
const containerSampleBuffer: ContainerSampleRow[] = [];
const liveWorkers = new Map<string, LiveWorkerState>();
const sessions = new Map<string, Bun.ServerWebSocket<SocketData>>();

function nowMs(): number {
  return Date.now();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWorkerMetrics(value: unknown): value is WorkerMetrics {
  if (!value || typeof value !== "object") {
    return false;
  }

  const metrics = value as Record<string, unknown>;
  return (
    isFiniteNumber(metrics.cpuPercent) &&
    isFiniteNumber(metrics.memoryUsedBytes) &&
    isFiniteNumber(metrics.memoryTotalBytes) &&
    isFiniteNumber(metrics.memoryPercent) &&
    isFiniteNumber(metrics.containerCount)
  );
}

function isContainerMetricsArray(value: unknown): value is ContainerMetrics[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((container) => {
    if (!container || typeof container !== "object") {
      return false;
    }

    const item = container as Record<string, unknown>;
    return (
      typeof item.containerId === "string" &&
      typeof item.containerName === "string" &&
      (typeof item.projectId === "string" || item.projectId === null) &&
      isFiniteNumber(item.cpuPercent) &&
      isFiniteNumber(item.memoryUsedBytes) &&
      isFiniteNumber(item.memoryLimitBytes) &&
      isFiniteNumber(item.memoryPercent)
    );
  });
}

function parseMessage(raw: string | Buffer): IncomingMessage | null {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  const parsed = JSON.parse(text) as Record<string, unknown>;

  if (parsed.type === "auth") {
    if (
      typeof parsed.token === "string" &&
      typeof parsed.workerId === "string" &&
      typeof parsed.instanceId === "string" &&
      typeof parsed.privateIp === "string"
    ) {
      return parsed as WorkerAuthMessage;
    }
    return null;
  }

  if (parsed.type === "heartbeat") {
    if (
      typeof parsed.workerId === "string" &&
      typeof parsed.instanceId === "string" &&
      typeof parsed.privateIp === "string" &&
      isFiniteNumber(parsed.timestamp) &&
      isWorkerMetrics(parsed.worker) &&
      isContainerMetricsArray(parsed.containers)
    ) {
      return parsed as WorkerHeartbeatMessage;
    }
    return null;
  }

  return null;
}

function flushSamples(): void {
  if (workerSampleBuffer.length === 0 && containerSampleBuffer.length === 0) {
    return;
  }

  const pendingWorkers = workerSampleBuffer.splice(0, workerSampleBuffer.length);
  const pendingContainers = containerSampleBuffer.splice(
    0,
    containerSampleBuffer.length,
  );

  const transaction = db.transaction(() => {
    for (const sample of pendingWorkers) {
      insertWorkerSample.run(
        sample.workerId,
        sample.instanceId,
        sample.tsMs,
        sample.cpuPercent,
        sample.memoryUsedBytes,
        sample.memoryTotalBytes,
        sample.memoryPercent,
        sample.containerCount,
      );
    }

    for (const sample of pendingContainers) {
      insertContainerSample.run(
        sample.workerId,
        sample.projectId,
        sample.containerId,
        sample.containerName,
        sample.tsMs,
        sample.cpuPercent,
        sample.memoryUsedBytes,
        sample.memoryLimitBytes,
        sample.memoryPercent,
      );
    }
  });

  transaction();
}

function rollupWorkerRaw(intervalMs: number, tableName: "worker_samples_1m"): void {
  db.query(
    `INSERT OR REPLACE INTO ${tableName} (
      worker_id,
      bucket_start_ms,
      sample_count,
      min_cpu_percent,
      max_cpu_percent,
      avg_cpu_percent,
      min_memory_percent,
      max_memory_percent,
      avg_memory_percent,
      avg_container_count
    )
    SELECT
      worker_id,
      (ts_ms / ?) * ? AS bucket_start_ms,
      COUNT(*) AS sample_count,
      MIN(cpu_percent),
      MAX(cpu_percent),
      AVG(cpu_percent),
      MIN(memory_percent),
      MAX(memory_percent),
      AVG(memory_percent),
      AVG(container_count)
    FROM worker_samples
    WHERE ts_ms < ?
    GROUP BY worker_id, bucket_start_ms`,
  ).run(intervalMs, intervalMs, nowMs() - intervalMs);
}

function rollupContainerRaw(intervalMs: number, tableName: "container_samples_1m"): void {
  db.query(
    `INSERT OR REPLACE INTO ${tableName} (
      worker_id,
      project_id,
      container_id,
      container_name,
      bucket_start_ms,
      sample_count,
      min_cpu_percent,
      max_cpu_percent,
      avg_cpu_percent,
      min_memory_percent,
      max_memory_percent,
      avg_memory_percent
    )
    SELECT
      worker_id,
      project_id,
      container_id,
      MAX(container_name),
      (ts_ms / ?) * ? AS bucket_start_ms,
      COUNT(*) AS sample_count,
      MIN(cpu_percent),
      MAX(cpu_percent),
      AVG(cpu_percent),
      MIN(memory_percent),
      MAX(memory_percent),
      AVG(memory_percent)
    FROM container_samples
    WHERE ts_ms < ?
    GROUP BY worker_id, project_id, container_id, bucket_start_ms`,
  ).run(intervalMs, intervalMs, nowMs() - intervalMs);
}

function rollupFrom1mTo1h(sourceTable: "worker_samples_1m" | "container_samples_1m", targetTable: "worker_samples_1h" | "container_samples_1h"): void {
  if (sourceTable === "worker_samples_1m" && targetTable === "worker_samples_1h") {
    db.query(
      `INSERT OR REPLACE INTO worker_samples_1h (
        worker_id,
        bucket_start_ms,
        sample_count,
        min_cpu_percent,
        max_cpu_percent,
        avg_cpu_percent,
        min_memory_percent,
        max_memory_percent,
        avg_memory_percent,
        avg_container_count
      )
      SELECT
        worker_id,
        (bucket_start_ms / 3600000) * 3600000 AS hour_bucket,
        SUM(sample_count),
        MIN(min_cpu_percent),
        MAX(max_cpu_percent),
        AVG(avg_cpu_percent),
        MIN(min_memory_percent),
        MAX(max_memory_percent),
        AVG(avg_memory_percent),
        AVG(avg_container_count)
      FROM worker_samples_1m
      WHERE bucket_start_ms < ?
      GROUP BY worker_id, hour_bucket`,
    ).run(nowMs() - 3600000);
    return;
  }

  db.query(
    `INSERT OR REPLACE INTO container_samples_1h (
      worker_id,
      project_id,
      container_id,
      container_name,
      bucket_start_ms,
      sample_count,
      min_cpu_percent,
      max_cpu_percent,
      avg_cpu_percent,
      min_memory_percent,
      max_memory_percent,
      avg_memory_percent
    )
    SELECT
      worker_id,
      project_id,
      container_id,
      MAX(container_name),
      (bucket_start_ms / 3600000) * 3600000 AS hour_bucket,
      SUM(sample_count),
      MIN(min_cpu_percent),
      MAX(max_cpu_percent),
      AVG(avg_cpu_percent),
      MIN(min_memory_percent),
      MAX(max_memory_percent),
      AVG(avg_memory_percent)
    FROM container_samples_1m
    WHERE bucket_start_ms < ?
    GROUP BY worker_id, project_id, container_id, hour_bucket`,
  ).run(nowMs() - 3600000);
}

function pruneOldData(): void {
  const currentTime = nowMs();
  db.query("DELETE FROM worker_samples WHERE ts_ms < ?").run(
    currentTime - config.rawRetentionMs,
  );
  db.query("DELETE FROM container_samples WHERE ts_ms < ?").run(
    currentTime - config.rawRetentionMs,
  );
  db.query("DELETE FROM worker_samples_1m WHERE bucket_start_ms < ?").run(
    currentTime - config.rollup1mRetentionMs,
  );
  db.query("DELETE FROM container_samples_1m WHERE bucket_start_ms < ?").run(
    currentTime - config.rollup1mRetentionMs,
  );
  db.query("DELETE FROM worker_samples_1h WHERE bucket_start_ms < ?").run(
    currentTime - config.rollup1hRetentionMs,
  );
  db.query("DELETE FROM container_samples_1h WHERE bucket_start_ms < ?").run(
    currentTime - config.rollup1hRetentionMs,
  );
}

function updateStaleWorkers(): void {
  const currentTime = nowMs();
  for (const worker of liveWorkers.values()) {
    if (worker.status === "connected") {
      if (currentTime - worker.lastHeartbeatAt > config.heartbeatTimeoutMs) {
        worker.status = "stale";
      }
    }
  }
}

function snapshotWorkers(): LiveWorkerState[] {
  return Array.from(liveWorkers.values()).sort((left, right) =>
    left.workerId.localeCompare(right.workerId),
  );
}

function closeStaleSession(workerId: string, nextSocket: Bun.ServerWebSocket<SocketData>): void {
  const currentSocket = sessions.get(workerId);
  if (currentSocket && currentSocket !== nextSocket) {
    currentSocket.close(1012, "replaced");
  }
}

const server = Bun.serve<SocketData>({
  hostname: config.hostname,
  port: config.port,
  fetch(request, serverInstance) {
    const url = new URL(request.url);

    if (url.pathname === "/workers/stream") {
      if (serverInstance.upgrade(request, { data: { authenticated: false } })) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/health") {
      const connectedWorkers = snapshotWorkers();
      return Response.json({
        ok: true,
        connectedWorkers: connectedWorkers.filter(
          (worker) => worker.status === "connected",
        ).length,
        staleWorkers: connectedWorkers.filter((worker) => worker.status === "stale")
          .length,
      });
    }

    if (url.pathname === "/workers") {
      return Response.json({ workers: snapshotWorkers() });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    message(ws, rawMessage) {
      try {
        const message = parseMessage(rawMessage);
        if (!message) {
          ws.close(1003, "invalid-payload");
          return;
        }

        if (message.type === "auth") {
          if (message.token !== config.sharedToken) {
            ws.close(1008, "unauthorized");
            return;
          }

          closeStaleSession(message.workerId, ws);
          ws.data.authenticated = true;
          ws.data.workerId = message.workerId;
          ws.data.instanceId = message.instanceId;
          ws.data.privateIp = message.privateIp;
          sessions.set(message.workerId, ws);

          const currentTime = nowMs();
          liveWorkers.set(message.workerId, {
            workerId: message.workerId,
            instanceId: message.instanceId,
            privateIp: message.privateIp,
            status: "connected",
            lastHeartbeatAt: currentTime,
            lastMetrics: null,
            lastContainers: [],
          });
          ws.send(JSON.stringify({ type: "auth_ok", ts: currentTime }));
          return;
        }

        if (!ws.data.authenticated || !ws.data.workerId) {
          ws.close(1008, "authenticate-first");
          return;
        }

        if (message.workerId !== ws.data.workerId) {
          ws.close(1008, "worker-mismatch");
          return;
        }

        const currentTime = nowMs();
        const workerState = liveWorkers.get(message.workerId) ?? {
          workerId: message.workerId,
          instanceId: message.instanceId,
          privateIp: message.privateIp,
          status: "connected" as const,
          lastHeartbeatAt: currentTime,
          lastMetrics: null,
          lastContainers: [],
        };

        workerState.instanceId = message.instanceId;
        workerState.privateIp = message.privateIp;
        workerState.status = "connected";
        workerState.lastHeartbeatAt = currentTime;
        workerState.lastMetrics = message.worker;
        workerState.lastContainers = message.containers;
        liveWorkers.set(message.workerId, workerState);

        workerSampleBuffer.push({
          workerId: message.workerId,
          instanceId: message.instanceId,
          tsMs: message.timestamp,
          cpuPercent: message.worker.cpuPercent,
          memoryUsedBytes: message.worker.memoryUsedBytes,
          memoryTotalBytes: message.worker.memoryTotalBytes,
          memoryPercent: message.worker.memoryPercent,
          containerCount: message.worker.containerCount,
        });

        for (const container of message.containers) {
          containerSampleBuffer.push({
            workerId: message.workerId,
            projectId: container.projectId,
            containerId: container.containerId,
            containerName: container.containerName,
            tsMs: message.timestamp,
            cpuPercent: container.cpuPercent,
            memoryUsedBytes: container.memoryUsedBytes,
            memoryLimitBytes: container.memoryLimitBytes,
            memoryPercent: container.memoryPercent,
          });
        }
      } catch (error) {
        console.error("worker message handling failed", error);
        ws.close(1011, "server-error");
      }
    },
    close(ws) {
      const workerId = ws.data.workerId;
      if (!workerId) {
        return;
      }

      const existingSocket = sessions.get(workerId);
      if (existingSocket === ws) {
        sessions.delete(workerId);
      }

      const liveWorker = liveWorkers.get(workerId);
      if (liveWorker) {
        liveWorker.status = "disconnected";
      }
    },
  },
});

setInterval(() => {
  flushSamples();
  updateStaleWorkers();
}, 1000);

setInterval(() => {
  flushSamples();
  rollupWorkerRaw(60_000, "worker_samples_1m");
  rollupContainerRaw(60_000, "container_samples_1m");
}, 60_000);

setInterval(() => {
  flushSamples();
  rollupFrom1mTo1h("worker_samples_1m", "worker_samples_1h");
  rollupFrom1mTo1h("container_samples_1m", "container_samples_1h");
  pruneOldData();
}, 60 * 60 * 1000);

console.log(
  JSON.stringify({
    event: "manager_monitor_started",
    hostname: config.hostname,
    port: config.port,
    dbPath: config.dbPath,
  }),
);

process.on("SIGINT", () => {
  flushSamples();
  server.stop(true);
  process.exit(0);
});

process.on("SIGTERM", () => {
  flushSamples();
  server.stop(true);
  process.exit(0);
});
