import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_METRICS_DB_PATH,
} from "../paths.js";

type WorkerAuthMessage = {
  type: "auth";
  token: string;
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole: "manager" | "worker";
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

type WorkerHeartbeatMessage = {
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

type IncomingMessage = WorkerAuthMessage | WorkerHeartbeatMessage;

type SocketData = {
  authenticated: boolean;
  workerId?: string;
  instanceId?: string;
  privateIp?: string;
  nodeRole?: "manager" | "worker";
};

type LiveWorkerState = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole: "manager" | "worker";
  status:
    | "booting"
    | "connected"
    | "stale"
    | "disconnected"
    | "error"
    | "hibernated"
    | "hibernating"
    | "shutdown"
    | "terminated"
    | "zombie";
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

type ProcessSampleRow = {
  workerId: string;
  instanceId: string;
  tsMs: number;
  ranking: "cpu" | "memory";
  rank: number;
  pid: number;
  comm: string;
  state: string;
  cpuPercent: number;
  rssBytes: number;
};

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
  | "terminated";

type WorkerLifecycleEventRecord = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole: "manager" | "worker";
  eventType: WorkerLifecycleEventType;
  eventTsMs: number;
  details: Record<string, unknown> | null;
};

type WorkerLifecycleEventBody = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole?: "manager" | "worker";
  eventType: WorkerLifecycleEventType;
  eventTsMs?: number;
  details?: Record<string, unknown>;
};

type ServiceRecord = {
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
};

type ServiceRegistrationBody = {
  namespace: string;
  serviceName: string;
  instanceId: string;
  workerId: string;
  workerPrivateIp: string;
  hostPort: number;
  containerPort: number;
  protocol?: string;
  healthy?: boolean;
};

type ServiceReleaseBody = {
  namespace: string;
  serviceName: string;
  instanceId: string;
};

type PortLeaseRequestBody = {
  workerId: string;
  namespace: string;
  serviceName: string;
  instanceId: string;
  requestedPort?: number;
};

type PortReleaseBody = {
  workerId: string;
  hostPort: number;
};

type BootstrapContext = {
  region?: string;
  swarmTagKey?: string;
  swarmTagValue?: string;
};

type Ec2InstanceInventory = {
  instanceId: string;
  privateIp: string;
  state: string;
  launchTimeMs: number | null;
};

const config = {
  hostname: process.env.MANAGER_WS_HOST ?? "0.0.0.0",
  port: Number(process.env.MANAGER_WS_PORT ?? "8787"),
  sharedToken: process.env.SWARM_SHARED_TOKEN ?? "",
  dbPath: process.env.METRICS_DB_PATH ?? DEFAULT_METRICS_DB_PATH,
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
  rootNamespace: process.env.SWARM_ROOT_NAMESPACE ?? "root",
  portRangeStart: Number(process.env.SWARM_SERVICE_PORT_RANGE_START ?? "20000"),
  portRangeEnd: Number(process.env.SWARM_SERVICE_PORT_RANGE_END ?? "40000"),
  workerZombieThresholdMs:
    Number(process.env.SWARM_WORKER_ZOMBIE_THRESHOLD_SECONDS ?? "120") * 1000,
  ec2InventoryRefreshMs:
    Number(process.env.SWARM_EC2_INVENTORY_REFRESH_SECONDS ?? "15") * 1000,
  bootstrapContextPath:
    process.env.SWARM_BOOTSTRAP_CONTEXT_PATH ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  ec2InventoryJson: process.env.SWARM_EC2_INVENTORY_JSON ?? "",
};

if (!config.sharedToken) {
  throw new Error("SWARM_SHARED_TOKEN must be set");
}

if (
  !Number.isInteger(config.portRangeStart) ||
  !Number.isInteger(config.portRangeEnd) ||
  config.portRangeStart <= 0 ||
  config.portRangeEnd < config.portRangeStart
) {
  throw new Error("SWARM service port range is invalid");
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

  CREATE TABLE IF NOT EXISTS process_samples (
    worker_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    ts_ms INTEGER NOT NULL,
    ranking TEXT NOT NULL,
    rank INTEGER NOT NULL,
    pid INTEGER NOT NULL,
    comm TEXT NOT NULL,
    state TEXT NOT NULL,
    cpu_percent REAL NOT NULL,
    rss_bytes INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_process_samples_worker_ts
    ON process_samples(worker_id, ts_ms);
  CREATE INDEX IF NOT EXISTS idx_process_samples_worker_ranking_ts
    ON process_samples(worker_id, ranking, ts_ms);

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

  CREATE TABLE IF NOT EXISTS service_instances (
    namespace TEXT NOT NULL,
    service_name TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    worker_private_ip TEXT NOT NULL,
    host_port INTEGER NOT NULL,
    container_port INTEGER NOT NULL,
    protocol TEXT NOT NULL,
    healthy INTEGER NOT NULL,
    registered_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (namespace, service_name, instance_id)
  );

  CREATE INDEX IF NOT EXISTS idx_service_instances_lookup
    ON service_instances(namespace, service_name, healthy, updated_at_ms DESC);

  CREATE TABLE IF NOT EXISTS port_leases (
    worker_id TEXT NOT NULL,
    host_port INTEGER NOT NULL,
    namespace TEXT NOT NULL,
    service_name TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    leased_at_ms INTEGER NOT NULL,
    PRIMARY KEY (worker_id, host_port),
    UNIQUE (worker_id, namespace, service_name, instance_id)
  );

  CREATE TABLE IF NOT EXISTS worker_lifecycle_events (
    worker_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    private_ip TEXT NOT NULL,
    node_role TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_ts_ms INTEGER NOT NULL,
    details_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_events_worker_ts
    ON worker_lifecycle_events(worker_id, event_ts_ms DESC);

  CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_events_ts
    ON worker_lifecycle_events(event_ts_ms DESC);
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

const insertProcessSample = db.query(
  `INSERT INTO process_samples (
    worker_id,
    instance_id,
    ts_ms,
    ranking,
    rank,
    pid,
    comm,
    state,
    cpu_percent,
    rss_bytes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const upsertServiceRecord = db.query(
  `INSERT INTO service_instances (
    namespace,
    service_name,
    instance_id,
    worker_id,
    worker_private_ip,
    host_port,
    container_port,
    protocol,
    healthy,
    registered_at_ms,
    updated_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(namespace, service_name, instance_id) DO UPDATE SET
    worker_id = excluded.worker_id,
    worker_private_ip = excluded.worker_private_ip,
    host_port = excluded.host_port,
    container_port = excluded.container_port,
    protocol = excluded.protocol,
    healthy = excluded.healthy,
    updated_at_ms = excluded.updated_at_ms`,
);

const deleteServiceRecord = db.query(
  `DELETE FROM service_instances
   WHERE namespace = ? AND service_name = ? AND instance_id = ?`,
);

const listServiceRecords = db.query(
  `SELECT
      namespace,
      service_name,
      instance_id,
      worker_id,
      worker_private_ip,
      host_port,
      container_port,
      protocol,
      healthy,
      updated_at_ms
   FROM service_instances
   ORDER BY namespace, service_name, updated_at_ms DESC`,
);

const lookupServiceRecords = db.query(
  `SELECT
      namespace,
      service_name,
      instance_id,
      worker_id,
      worker_private_ip,
      host_port,
      container_port,
      protocol,
      healthy,
      updated_at_ms
   FROM service_instances
   WHERE namespace = ? AND service_name = ? AND healthy = 1
   ORDER BY updated_at_ms DESC`,
);

const lookupAnyServiceRecords = db.query(
  `SELECT
      namespace,
      service_name,
      instance_id,
      worker_id,
      worker_private_ip,
      host_port,
      container_port,
      protocol,
      healthy,
      updated_at_ms
   FROM service_instances
   WHERE namespace = ? AND service_name = ?
   ORDER BY updated_at_ms DESC`,
);

const leaseSpecificPort = db.query(
  `INSERT INTO port_leases (
    worker_id,
    host_port,
    namespace,
    service_name,
    instance_id,
    leased_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?)`,
);

const lookupExistingLease = db.query(
  `SELECT host_port
   FROM port_leases
   WHERE worker_id = ? AND namespace = ? AND service_name = ? AND instance_id = ?`,
);

const listWorkerLeases = db.query(
  `SELECT host_port
   FROM port_leases
   WHERE worker_id = ?
   ORDER BY host_port ASC`,
);

const deletePortLeaseByWorkerPort = db.query(
  `DELETE FROM port_leases
   WHERE worker_id = ? AND host_port = ?`,
);

const deletePortLeaseByService = db.query(
  `DELETE FROM port_leases
   WHERE worker_id = ? AND namespace = ? AND service_name = ? AND instance_id = ?`,
);

const insertWorkerLifecycleEvent = db.query(
  `INSERT INTO worker_lifecycle_events (
    worker_id,
    instance_id,
    private_ip,
    node_role,
    event_type,
    event_ts_ms,
    details_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

const listWorkerLifecycleEvents = db.query(
  `SELECT
      worker_id,
      instance_id,
      private_ip,
      node_role,
      event_type,
      event_ts_ms,
      details_json
   FROM worker_lifecycle_events
   ORDER BY event_ts_ms DESC
   LIMIT ?`,
);

const listWorkerLifecycleEventsByWorker = db.query(
  `SELECT
      worker_id,
      instance_id,
      private_ip,
      node_role,
      event_type,
      event_ts_ms,
      details_json
   FROM worker_lifecycle_events
   WHERE worker_id = ?
   ORDER BY event_ts_ms DESC
   LIMIT ?`,
);

const listWorkerLifecycleEventsByWorkerBefore = db.query(
  `SELECT
      worker_id,
      instance_id,
      private_ip,
      node_role,
      event_type,
      event_ts_ms,
      details_json
   FROM worker_lifecycle_events
   WHERE worker_id = ? AND event_ts_ms < ?
   ORDER BY event_ts_ms DESC
   LIMIT ?`,
);

const listLatestWorkerLifecycleEvents = db.query(
  `SELECT
      events.worker_id,
      events.instance_id,
      events.private_ip,
      events.node_role,
      events.event_type,
      events.event_ts_ms,
      events.details_json
   FROM worker_lifecycle_events AS events
   INNER JOIN (
     SELECT worker_id, MAX(event_ts_ms) AS max_event_ts_ms
     FROM worker_lifecycle_events
     WHERE node_role = 'worker'
     GROUP BY worker_id
   ) AS latest
     ON events.worker_id = latest.worker_id
    AND events.event_ts_ms = latest.max_event_ts_ms
   WHERE events.node_role = 'worker'
   ORDER BY events.event_ts_ms DESC`,
);

const workerSampleBuffer: WorkerSampleRow[] = [];
const containerSampleBuffer: ContainerSampleRow[] = [];
const processSampleBuffer: ProcessSampleRow[] = [];
const liveWorkers = new Map<string, LiveWorkerState>();
const ec2InventoryWorkers = new Map<string, LiveWorkerState>();
const sessions = new Map<string, Bun.ServerWebSocket<SocketData>>();
const bootstrapContext = loadBootstrapContext();

function nowMs(): number {
  return Date.now();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeName(value: string): string {
  return value.trim();
}

function loadBootstrapContext(): BootstrapContext {
  if (!existsSync(config.bootstrapContextPath)) {
    return {};
  }

  try {
    const raw = readFileSync(config.bootstrapContextPath, "utf8");
    return JSON.parse(raw) as BootstrapContext;
  } catch (error) {
    console.error("failed to load bootstrap context", error);
    return {};
  }
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

function isProcessSampleArray(value: unknown): value is ProcessSample[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((process) => {
    if (!process || typeof process !== "object") {
      return false;
    }

    const item = process as Record<string, unknown>;
    return (
      isFiniteNumber(item.pid) &&
      typeof item.comm === "string" &&
      typeof item.state === "string" &&
      isFiniteNumber(item.cpuPercent) &&
      isFiniteNumber(item.rssBytes)
    );
  });
}

function isProcessWindow(value: unknown): value is ProcessWindow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    isFiniteNumber(item.sampledAt) &&
    isFiniteNumber(item.intervalMs) &&
    isProcessSampleArray(item.topCpu) &&
    isProcessSampleArray(item.topMemory)
  );
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
      return {
        ...(parsed as Omit<WorkerAuthMessage, "nodeRole">),
        nodeRole: parsed.nodeRole === "manager" ? "manager" : "worker",
      };
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
      isContainerMetricsArray(parsed.containers) &&
      (parsed.processWindow === undefined || isProcessWindow(parsed.processWindow))
    ) {
      return {
        ...(parsed as Omit<WorkerHeartbeatMessage, "nodeRole">),
        nodeRole: parsed.nodeRole === "manager" ? "manager" : "worker",
      };
    }

    return null;
  }

  return null;
}

function jsonError(status: number, message: string): Response {
  return Response.json(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function requireManagerToken(request: Request): Response | null {
  const token = request.headers.get("x-swarm-token");
  if (token !== config.sharedToken) {
    return jsonError(401, "unauthorized");
  }

  return null;
}

function isServiceRegistrationBody(value: unknown): value is ServiceRegistrationBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    isNonEmptyString(body.namespace) &&
    isNonEmptyString(body.serviceName) &&
    isNonEmptyString(body.instanceId) &&
    isNonEmptyString(body.workerId) &&
    isNonEmptyString(body.workerPrivateIp) &&
    Number.isInteger(body.hostPort) &&
    Number.isInteger(body.containerPort) &&
    (body.protocol === undefined || isNonEmptyString(body.protocol)) &&
    (body.healthy === undefined || typeof body.healthy === "boolean")
  );
}

function isServiceReleaseBody(value: unknown): value is ServiceReleaseBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    isNonEmptyString(body.namespace) &&
    isNonEmptyString(body.serviceName) &&
    isNonEmptyString(body.instanceId)
  );
}

function isPortLeaseRequestBody(value: unknown): value is PortLeaseRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    isNonEmptyString(body.workerId) &&
    isNonEmptyString(body.namespace) &&
    isNonEmptyString(body.serviceName) &&
    isNonEmptyString(body.instanceId) &&
    (body.requestedPort === undefined || Number.isInteger(body.requestedPort))
  );
}

function isPortReleaseBody(value: unknown): value is PortReleaseBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return isNonEmptyString(body.workerId) && Number.isInteger(body.hostPort);
}

function isLifecycleEventType(value: unknown): value is WorkerLifecycleEventType {
  return [
    "launch_request_started",
    "launch_requested",
    "create",
    "container_start_requested",
    "container_started",
    "launch",
    "ec2_running",
    "instance_status_ok",
    "cloud_init_started",
    "packages_install_started",
    "packages_install_completed",
    "bun_install_started",
    "bun_install_completed",
    "docker_enable_started",
    "bootstrap_started",
    "runtime_download_started",
    "runtime_download_completed",
    "repo_update_started",
    "repo_update_completed",
    "docker_ready",
    "service_bun_install_started",
    "service_bun_install_completed",
    "service_process_started",
    "service_ready",
    "telemetry_service_start_requested",
    "telemetry_process_started",
    "telemetry_connect_started",
    "telemetry_started",
    "running",
    "connected",
    "stale",
    "disconnected",
    "zombie",
    "hibernate_requested",
    "hibernating",
    "hibernated",
    "wakeup_requested",
    "wakeup",
    "shutdown_requested",
    "shutdown",
    "terminated",
  ].includes(String(value));
}

function isWorkerLifecycleEventBody(
  value: unknown,
): value is WorkerLifecycleEventBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    isNonEmptyString(body.workerId) &&
    isNonEmptyString(body.instanceId) &&
    isNonEmptyString(body.privateIp) &&
    isLifecycleEventType(body.eventType) &&
    (body.nodeRole === undefined ||
      body.nodeRole === "manager" ||
      body.nodeRole === "worker") &&
    (body.eventTsMs === undefined || isFiniteNumber(body.eventTsMs)) &&
    (body.details === undefined ||
      (typeof body.details === "object" && body.details !== null))
  );
}

function mapServiceRow(row: Record<string, unknown>): ServiceRecord {
  return {
    namespace: String(row.namespace),
    serviceName: String(row.service_name),
    instanceId: String(row.instance_id),
    workerId: String(row.worker_id),
    workerPrivateIp: String(row.worker_private_ip),
    hostPort: Number(row.host_port),
    containerPort: Number(row.container_port),
    protocol: String(row.protocol),
    healthy: Number(row.healthy) === 1,
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function mapLifecycleEventRow(
  row: Record<string, unknown>,
): WorkerLifecycleEventRecord {
  return {
    workerId: String(row.worker_id),
    instanceId: String(row.instance_id),
    privateIp: String(row.private_ip),
    nodeRole: row.node_role === "manager" ? "manager" : "worker",
    eventType: String(row.event_type) as WorkerLifecycleEventType,
    eventTsMs: Number(row.event_ts_ms),
    details:
      typeof row.details_json === "string" && row.details_json.length > 0
        ? (JSON.parse(String(row.details_json)) as Record<string, unknown>)
        : null,
  };
}

function recordWorkerLifecycleEvent(
  event: WorkerLifecycleEventRecord,
): void {
  insertWorkerLifecycleEvent.run(
    event.workerId,
    event.instanceId,
    event.privateIp,
    event.nodeRole,
    event.eventType,
    event.eventTsMs,
    event.details ? JSON.stringify(event.details) : null,
  );
}

function getWorkerLifecycleEvents(
  limit: number,
  workerId?: string,
  beforeEventTsMs?: number,
): WorkerLifecycleEventRecord[] {
  const normalizedLimit = Math.max(1, Math.min(limit, 500));
  const rows = workerId
    ? beforeEventTsMs !== undefined
      ? listWorkerLifecycleEventsByWorkerBefore.all(
          workerId,
          beforeEventTsMs,
          normalizedLimit,
        )
      : listWorkerLifecycleEventsByWorker.all(workerId, normalizedLimit)
    : listWorkerLifecycleEvents.all(normalizedLimit);
  return rows.map((row) =>
    mapLifecycleEventRow(row as Record<string, unknown>),
  );
}

function getLatestWorkerLifecycleEvent(
  workerId: string,
): WorkerLifecycleEventRecord | null {
  const events = getWorkerLifecycleEvents(1, workerId);
  return events[0] ?? null;
}

function getLatestLifecycleEventsByWorker(): WorkerLifecycleEventRecord[] {
  return listLatestWorkerLifecycleEvents
    .all()
    .map((row) => mapLifecycleEventRow(row as Record<string, unknown>));
}

function getLatestLifecycleEventOfTypes(
  workerId: string,
  eventTypes: WorkerLifecycleEventType[],
): WorkerLifecycleEventRecord | null {
  const events = getWorkerLifecycleEvents(50, workerId);
  return events.find((event) => eventTypes.includes(event.eventType)) ?? null;
}

function listEc2WorkerInstances(): Ec2InstanceInventory[] {
  if (config.ec2InventoryJson) {
    try {
      return JSON.parse(config.ec2InventoryJson) as Ec2InstanceInventory[];
    } catch (error) {
      console.error("failed to parse SWARM_EC2_INVENTORY_JSON", error);
      return [];
    }
  }

  const region = bootstrapContext.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  const swarmTagKey = bootstrapContext.swarmTagKey;
  const swarmTagValue = bootstrapContext.swarmTagValue;
  if (!region || !swarmTagKey || !swarmTagValue) {
    return [];
  }

  const command = [
    "aws",
    "ec2",
    "describe-instances",
    "--region",
    region,
    "--filters",
    `Name=tag:${swarmTagKey},Values=${swarmTagValue}`,
    "Name=tag:Role,Values=agent-swarm-worker",
    "Name=instance-state-name,Values=pending,running,stopping,stopped",
    "--query",
    "Reservations[].Instances[].{instanceId:InstanceId,privateIp:PrivateIpAddress,state:State.Name,launchTimeMs:LaunchTime}",
    "--output",
    "json",
  ];
  const result = Bun.spawnSync(command, {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const stderr = Buffer.from(result.stderr).toString("utf8").trim();
    if (stderr.length > 0) {
      console.error("failed to describe worker instances", stderr);
    }
    return [];
  }

  const raw = Buffer.from(result.stdout).toString("utf8");
  try {
    const parsed = JSON.parse(raw) as Array<{
      instanceId: string;
      privateIp: string;
      state: string;
      launchTimeMs: string | null;
    }>;
    return parsed.map((instance) => ({
      instanceId: instance.instanceId,
      privateIp: instance.privateIp ?? "",
      state: instance.state,
      launchTimeMs: instance.launchTimeMs
        ? Date.parse(instance.launchTimeMs)
        : null,
    }));
  } catch (error) {
    console.error("failed to parse worker instance inventory", error);
    return [];
  }
}

function deriveInventoryWorkerStatus(
  instance: Ec2InstanceInventory,
): LiveWorkerState["status"] {
  if (instance.state === "stopped") {
    const latestHibernateEvent = getLatestLifecycleEventOfTypes(instance.instanceId, [
      "hibernated",
      "hibernate_requested",
      "hibernating",
    ]);
    if (latestHibernateEvent?.eventType === "hibernated") {
      return "hibernated";
    }
    if (
      latestHibernateEvent?.eventType === "hibernating" ||
      latestHibernateEvent?.eventType === "hibernate_requested"
    ) {
      return "hibernating";
    }
    return "shutdown";
  }

  if (instance.state === "stopping") {
    return "hibernating";
  }

  if (instance.state === "pending") {
    return "booting";
  }

  if (instance.state !== "running") {
    return "disconnected";
  }

  const currentTime = nowMs();
  const latestConnectedLikeEvent = getLatestLifecycleEventOfTypes(instance.instanceId, [
    "connected",
    "running",
    "stale",
    "disconnected",
    "zombie",
  ]);
  if (
    latestConnectedLikeEvent?.eventType === "disconnected" ||
    latestConnectedLikeEvent?.eventType === "stale"
  ) {
    return latestConnectedLikeEvent.eventType;
  }
  if (latestConnectedLikeEvent?.eventType === "zombie") {
    return "zombie";
  }

  const latestProgressEvent = getLatestLifecycleEventOfTypes(instance.instanceId, [
    "service_ready",
    "service_process_started",
    "service_bun_install_completed",
    "service_bun_install_started",
    "repo_update_completed",
    "repo_update_started",
    "instance_status_ok",
    "telemetry_service_start_requested",
    "telemetry_process_started",
    "telemetry_connect_started",
    "telemetry_started",
    "runtime_download_completed",
    "container_started",
    "container_start_requested",
    "bootstrap_started",
    "docker_ready",
    "docker_enable_started",
    "bun_install_completed",
    "bun_install_started",
    "packages_install_completed",
    "packages_install_started",
    "cloud_init_started",
    "launch",
    "create",
    "launch_requested",
    "launch_request_started",
  ]);
  const referenceTs =
    latestProgressEvent?.eventTsMs ?? instance.launchTimeMs ?? currentTime;
  if (currentTime - referenceTs >= config.workerZombieThresholdMs) {
    return "zombie";
  }

  return "booting";
}

function refreshEc2InventoryWorkers(): void {
  const instances = listEc2WorkerInstances();
  const nextWorkers = new Map<string, LiveWorkerState>();
  const inventoryWorkerIds = new Set(instances.map((instance) => instance.instanceId));

  for (const instance of instances) {
    if (liveWorkers.has(instance.instanceId)) {
      continue;
    }

    const status = deriveInventoryWorkerStatus(instance);
    const latestEvent = getLatestWorkerLifecycleEvent(instance.instanceId);
    nextWorkers.set(instance.instanceId, {
      workerId: instance.instanceId,
      instanceId: instance.instanceId,
      privateIp: instance.privateIp,
      nodeRole: "worker",
      status,
      lastHeartbeatAt:
        latestEvent?.eventTsMs ?? instance.launchTimeMs ?? 0,
      lastMetrics: null,
      lastContainers: [],
    });

    if (status === "zombie" && latestEvent?.eventType !== "zombie") {
      recordWorkerLifecycleEvent({
        workerId: instance.instanceId,
        instanceId: instance.instanceId,
        privateIp: instance.privateIp,
        nodeRole: "worker",
        eventType: "zombie",
        eventTsMs: nowMs(),
        details: {
          reason: "running_without_telemetry",
          ec2State: instance.state,
        },
      });
    }
  }

  for (const latestEvent of getLatestLifecycleEventsByWorker()) {
    if (inventoryWorkerIds.has(latestEvent.workerId)) {
      continue;
    }
    if (liveWorkers.has(latestEvent.workerId)) {
      continue;
    }
    if (latestEvent.eventType === "terminated") {
      continue;
    }

    recordWorkerLifecycleEvent({
      workerId: latestEvent.workerId,
      instanceId: latestEvent.instanceId,
      privateIp: latestEvent.privateIp,
      nodeRole: "worker",
      eventType: "terminated",
      eventTsMs: nowMs(),
      details: {
        reason: "ec2_missing_from_inventory",
        previousEventType: latestEvent.eventType,
      },
    });
  }

  ec2InventoryWorkers.clear();
  for (const [workerId, workerState] of nextWorkers.entries()) {
    ec2InventoryWorkers.set(workerId, workerState);
  }
}

function listServices(): ServiceRecord[] {
  return listServiceRecords.all().map((row) =>
    mapServiceRow(row as Record<string, unknown>),
  );
}

function lookupServices(
  namespace: string,
  serviceName: string,
  healthyOnly = true,
): ServiceRecord[] {
  const query = healthyOnly ? lookupServiceRecords : lookupAnyServiceRecords;
  return query.all(namespace, serviceName).map((row) =>
    mapServiceRow(row as Record<string, unknown>),
  );
}

function resolveRelativeService(
  callerNamespace: string,
  serviceName: string,
  fallbackNamespace = config.rootNamespace,
): {
  resolvedNamespace: string;
  serviceName: string;
  instances: ServiceRecord[];
} {
  const localMatches = lookupServices(callerNamespace, serviceName, true);
  if (localMatches.length > 0) {
    return {
      resolvedNamespace: callerNamespace,
      serviceName,
      instances: localMatches,
    };
  }

  if (fallbackNamespace && fallbackNamespace !== callerNamespace) {
    const fallbackMatches = lookupServices(fallbackNamespace, serviceName, true);
    if (fallbackMatches.length > 0) {
      return {
        resolvedNamespace: fallbackNamespace,
        serviceName,
        instances: fallbackMatches,
      };
    }
  }

  return {
    resolvedNamespace: callerNamespace,
    serviceName,
    instances: [],
  };
}

function allocatePort(
  workerId: string,
  namespace: string,
  serviceName: string,
  instanceId: string,
  requestedPort?: number,
): number {
  const existingLease = lookupExistingLease.get(
    workerId,
    namespace,
    serviceName,
    instanceId,
  ) as { host_port: number } | null;

  if (existingLease) {
    return Number(existingLease.host_port);
  }

  const leasePort = (hostPort: number): number => {
    leaseSpecificPort.run(
      workerId,
      hostPort,
      namespace,
      serviceName,
      instanceId,
      nowMs(),
    );
    return hostPort;
  };

  if (requestedPort !== undefined) {
    if (
      requestedPort < config.portRangeStart ||
      requestedPort > config.portRangeEnd
    ) {
      throw new Error("requested port is outside the configured service port range");
    }

    return leasePort(requestedPort);
  }

  const leasedPorts = new Set(
    listWorkerLeases
      .all(workerId)
      .map((row) => Number((row as { host_port: number }).host_port)),
  );

  for (
    let candidatePort = config.portRangeStart;
    candidatePort <= config.portRangeEnd;
    candidatePort += 1
  ) {
    if (!leasedPorts.has(candidatePort)) {
      return leasePort(candidatePort);
    }
  }

  throw new Error("no free service ports remain on this worker");
}

function releasePortForService(
  workerId: string,
  namespace: string,
  serviceName: string,
  instanceId: string,
): void {
  deletePortLeaseByService.run(workerId, namespace, serviceName, instanceId);
}

function flushSamples(): void {
  if (
    workerSampleBuffer.length === 0 &&
    containerSampleBuffer.length === 0 &&
    processSampleBuffer.length === 0
  ) {
    return;
  }

  const pendingWorkers = workerSampleBuffer.splice(0, workerSampleBuffer.length);
  const pendingContainers = containerSampleBuffer.splice(
    0,
    containerSampleBuffer.length,
  );
  const pendingProcesses = processSampleBuffer.splice(0, processSampleBuffer.length);

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

    for (const sample of pendingProcesses) {
      insertProcessSample.run(
        sample.workerId,
        sample.instanceId,
        sample.tsMs,
        sample.ranking,
        sample.rank,
        sample.pid,
        sample.comm,
        sample.state,
        sample.cpuPercent,
        sample.rssBytes,
      );
    }
  });

  transaction();
}

function rollupWorkerRaw(intervalMs: number): void {
  db.query(
    `INSERT OR REPLACE INTO worker_samples_1m (
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

function rollupContainerRaw(intervalMs: number): void {
  db.query(
    `INSERT OR REPLACE INTO container_samples_1m (
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

function rollupFrom1mTo1h(
  sourceTable: "worker_samples_1m" | "container_samples_1m",
): void {
  if (sourceTable === "worker_samples_1m") {
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
  db.query("DELETE FROM process_samples WHERE ts_ms < ?").run(
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
    if (
      worker.status === "connected" &&
      currentTime - worker.lastHeartbeatAt > config.heartbeatTimeoutMs
    ) {
      worker.status = "stale";
      recordWorkerLifecycleEvent({
        workerId: worker.workerId,
        instanceId: worker.instanceId,
        privateIp: worker.privateIp,
        nodeRole: worker.nodeRole,
        eventType: "stale",
        eventTsMs: currentTime,
        details: {
          lastHeartbeatAt: worker.lastHeartbeatAt,
        },
      });
    }
  }
}

function snapshotWorkers(): LiveWorkerState[] {
  const merged = new Map<string, LiveWorkerState>();
  for (const [workerId, worker] of ec2InventoryWorkers.entries()) {
    merged.set(workerId, worker);
  }
  for (const [workerId, worker] of liveWorkers.entries()) {
    merged.set(workerId, worker);
  }
  return Array.from(merged.values()).sort((left, right) =>
    left.workerId.localeCompare(right.workerId),
  );
}

function getWorkerTimeline(workerId: string, sinceTsMs: number, untilTsMs: number): {
  workerId: string;
  sinceTsMs: number;
  untilTsMs: number;
  hostSamples: Array<{
    tsMs: number;
    cpuPercent: number;
    memoryPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    containerCount: number;
  }>;
  processSamples: Array<{
    tsMs: number;
    ranking: "cpu" | "memory";
    rank: number;
    pid: number;
    comm: string;
    state: string;
    cpuPercent: number;
    rssBytes: number;
  }>;
} {
  const rangeMs = Math.max(untilTsMs - sinceTsMs, 0);

  const hostSamples =
    rangeMs <= 6 * 60 * 60 * 1000
      ? (db
          .query(
            `SELECT
                ts_ms,
                cpu_percent,
                memory_percent,
                memory_used_bytes,
                memory_total_bytes,
                container_count
             FROM worker_samples
             WHERE worker_id = ? AND ts_ms >= ?
             ORDER BY ts_ms ASC`,
          )
          .all(workerId, sinceTsMs) as Array<{
          ts_ms: number;
          cpu_percent: number;
          memory_percent: number;
          memory_used_bytes: number;
          memory_total_bytes: number;
          container_count: number;
        }>)
      : rangeMs <= 30 * 24 * 60 * 60 * 1000
        ? (db
            .query(
              `SELECT
                  bucket_start_ms AS ts_ms,
                  avg_cpu_percent AS cpu_percent,
                  avg_memory_percent AS memory_percent,
                  0 AS memory_used_bytes,
                  0 AS memory_total_bytes,
                  avg_container_count AS container_count
               FROM worker_samples_1m
               WHERE worker_id = ? AND bucket_start_ms >= ?
               ORDER BY bucket_start_ms ASC`,
            )
            .all(workerId, sinceTsMs) as Array<{
            ts_ms: number;
            cpu_percent: number;
            memory_percent: number;
            memory_used_bytes: number;
            memory_total_bytes: number;
            container_count: number;
          }>)
        : (db
            .query(
              `SELECT
                  bucket_start_ms AS ts_ms,
                  avg_cpu_percent AS cpu_percent,
                  avg_memory_percent AS memory_percent,
                  0 AS memory_used_bytes,
                  0 AS memory_total_bytes,
                  avg_container_count AS container_count
               FROM worker_samples_1h
               WHERE worker_id = ? AND bucket_start_ms >= ?
               ORDER BY bucket_start_ms ASC`,
            )
            .all(workerId, sinceTsMs) as Array<{
            ts_ms: number;
            cpu_percent: number;
            memory_percent: number;
            memory_used_bytes: number;
            memory_total_bytes: number;
            container_count: number;
          }>);

  const processSinceTsMs = Math.max(sinceTsMs, untilTsMs - config.rawRetentionMs);
  const processBucketMs =
    rangeMs <= 60 * 60 * 1000
      ? 10 * 1000
      : rangeMs <= 6 * 60 * 60 * 1000
        ? 60 * 1000
        : rangeMs <= 24 * 60 * 60 * 1000
          ? 5 * 60 * 1000
          : rangeMs <= 7 * 24 * 60 * 60 * 1000
            ? 15 * 60 * 1000
            : 60 * 60 * 1000;

  const processSamples = db
    .query(
      `SELECT
          (ts_ms / ?) * ? AS ts_ms,
          ranking,
          MIN(rank) AS rank,
          pid,
          comm,
          state,
          MAX(cpu_percent) AS cpu_percent,
          MAX(rss_bytes) AS rss_bytes
       FROM process_samples
       WHERE worker_id = ? AND ts_ms >= ?
       GROUP BY (ts_ms / ?) * ?, ranking, pid, comm, state
       ORDER BY ts_ms ASC, ranking ASC, rank ASC`,
    )
    .all(
      processBucketMs,
      processBucketMs,
      workerId,
      processSinceTsMs,
      processBucketMs,
      processBucketMs,
    ) as Array<{
    ts_ms: number;
    ranking: "cpu" | "memory";
    rank: number;
    pid: number;
    comm: string;
    state: string;
    cpu_percent: number;
    rss_bytes: number;
  }>;

  return {
    workerId,
    sinceTsMs,
    untilTsMs,
    hostSamples: hostSamples.map((sample) => ({
      tsMs: sample.ts_ms,
      cpuPercent: sample.cpu_percent,
      memoryPercent: sample.memory_percent,
      memoryUsedBytes: sample.memory_used_bytes,
      memoryTotalBytes: sample.memory_total_bytes,
      containerCount: sample.container_count,
    })),
    processSamples: processSamples.map((sample) => ({
      tsMs: sample.ts_ms,
      ranking: sample.ranking,
      rank: sample.rank,
      pid: sample.pid,
      comm: sample.comm,
      state: sample.state,
      cpuPercent: sample.cpu_percent,
      rssBytes: sample.rss_bytes,
    })),
  };
}

function closeStaleSession(
  workerId: string,
  nextSocket: Bun.ServerWebSocket<SocketData>,
): void {
  const currentSocket = sessions.get(workerId);
  if (currentSocket && currentSocket !== nextSocket) {
    currentSocket.close(1012, "replaced");
  }
}

const server = Bun.serve<SocketData>({
  hostname: config.hostname,
  port: config.port,
  async fetch(request, serverInstance) {
    const url = new URL(request.url);

    if (url.pathname === "/workers/stream") {
      if (serverInstance.upgrade(request, { data: { authenticated: false } })) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const connectedWorkers = snapshotWorkers();
      return Response.json({
        ok: true,
        connectedWorkers: connectedWorkers.filter(
          (worker) => worker.status === "connected",
        ).length,
        staleWorkers: connectedWorkers.filter((worker) => worker.status === "stale")
          .length,
        connectedNodes: connectedWorkers.filter(
          (worker) => worker.status === "connected",
        ).length,
        staleNodes: connectedWorkers.filter((worker) => worker.status === "stale")
          .length,
        zombieWorkers: connectedWorkers.filter((worker) => worker.status === "zombie")
          .length,
        zombieNodes: connectedWorkers.filter((worker) => worker.status === "zombie")
          .length,
      });
    }

    if (request.method === "GET" && url.pathname === "/workers") {
      return Response.json({ workers: snapshotWorkers() });
    }

    if (request.method === "GET" && url.pathname === "/workers/timeline") {
      const workerId = normalizeName(url.searchParams.get("workerId") ?? "");
      const rangeMinutesRaw = Number.parseInt(
        url.searchParams.get("rangeMinutes") ?? "30",
        10,
      );

      if (!workerId) {
        return jsonError(400, "workerId is required");
      }

      const rangeMinutes = Math.min(
        365 * 24 * 60,
        Math.max(5, Number.isInteger(rangeMinutesRaw) ? rangeMinutesRaw : 30),
      );
      const untilTsMs = nowMs();
      const sinceTsMs = untilTsMs - rangeMinutes * 60 * 1000;

      return Response.json({
        ok: true,
        ...getWorkerTimeline(workerId, sinceTsMs, untilTsMs),
      });
    }

    if (request.method === "GET" && url.pathname === "/workers/events") {
      const limitValue = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
      const workerId = normalizeName(url.searchParams.get("workerId") ?? "");
      const beforeEventTsMsRaw = url.searchParams.get("beforeEventTsMs");
      const beforeEventTsMs = beforeEventTsMsRaw
        ? Number.parseInt(beforeEventTsMsRaw, 10)
        : undefined;
      return Response.json({
        ok: true,
        events: getWorkerLifecycleEvents(
          Number.isInteger(limitValue) ? limitValue : 100,
          workerId || undefined,
          Number.isInteger(beforeEventTsMs) ? beforeEventTsMs : undefined,
        ),
      });
    }

    if (request.method === "GET" && url.pathname === "/services") {
      return Response.json({
        ok: true,
        rootNamespace: config.rootNamespace,
        services: listServices(),
      });
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/services/resolve/")
    ) {
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (pathParts.length === 3) {
        const serviceName = normalizeName(decodeURIComponent(pathParts[2] ?? ""));
        const callerNamespace = normalizeName(
          url.searchParams.get("callerNamespace") ?? "",
        );
        const fallbackNamespace = normalizeName(
          url.searchParams.get("fallbackNamespace") ?? config.rootNamespace,
        );

        if (!callerNamespace || !serviceName) {
          return jsonError(400, "callerNamespace and service name are required");
        }

        const result = resolveRelativeService(
          callerNamespace,
          serviceName,
          fallbackNamespace,
        );

        if (result.instances.length === 0) {
          return jsonError(404, "service not found");
        }

        const endpoint = result.instances[0];
        return Response.json({
          ok: true,
          query: {
            callerNamespace,
            serviceName,
            fallbackNamespace,
          },
          resolvedNamespace: result.resolvedNamespace,
          endpoint: {
            host: endpoint?.workerPrivateIp,
            port: endpoint?.hostPort,
            protocol: endpoint?.protocol,
            healthy: endpoint?.healthy ?? false,
          },
          instances: result.instances,
        });
      }

      if (pathParts.length === 4) {
        const namespace = normalizeName(decodeURIComponent(pathParts[2] ?? ""));
        const serviceName = normalizeName(decodeURIComponent(pathParts[3] ?? ""));

        if (!namespace || !serviceName) {
          return jsonError(400, "namespace and service name are required");
        }

        const instances = lookupServices(namespace, serviceName, true);
        if (instances.length === 0) {
          return jsonError(404, "service not found");
        }

        const endpoint = instances[0];
        return Response.json({
          ok: true,
          resolvedNamespace: namespace,
          endpoint: {
            host: endpoint?.workerPrivateIp,
            port: endpoint?.hostPort,
            protocol: endpoint?.protocol,
            healthy: endpoint?.healthy ?? false,
          },
          instances,
        });
      }

      return jsonError(404, "invalid resolve path");
    }

    if (request.method === "POST" && url.pathname === "/ports/lease") {
      const unauthorized = requireManagerToken(request);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseJsonBody<PortLeaseRequestBody>(request);
      if (!isPortLeaseRequestBody(body)) {
        return jsonError(400, "invalid port lease request body");
      }

      try {
        const hostPort = allocatePort(
          normalizeName(body.workerId),
          normalizeName(body.namespace),
          normalizeName(body.serviceName),
          normalizeName(body.instanceId),
          body.requestedPort,
        );

        return Response.json({
          ok: true,
          workerId: normalizeName(body.workerId),
          namespace: normalizeName(body.namespace),
          serviceName: normalizeName(body.serviceName),
          instanceId: normalizeName(body.instanceId),
          hostPort,
        });
      } catch (error) {
        return jsonError(
          409,
          error instanceof Error ? error.message : "port allocation failed",
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/ports/release") {
      const unauthorized = requireManagerToken(request);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseJsonBody<PortReleaseBody>(request);
      if (!isPortReleaseBody(body)) {
        return jsonError(400, "invalid port release request body");
      }

      deletePortLeaseByWorkerPort.run(normalizeName(body.workerId), body.hostPort);
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/workers/events") {
      const unauthorized = requireManagerToken(request);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseJsonBody<WorkerLifecycleEventBody>(request);
      if (!isWorkerLifecycleEventBody(body)) {
        return jsonError(400, "invalid worker lifecycle event body");
      }

      const event: WorkerLifecycleEventRecord = {
        workerId: normalizeName(body.workerId),
        instanceId: normalizeName(body.instanceId),
        privateIp: normalizeName(body.privateIp),
        nodeRole: body.nodeRole === "manager" ? "manager" : "worker",
        eventType: body.eventType,
        eventTsMs: body.eventTsMs ?? nowMs(),
        details: body.details ?? null,
      };

      recordWorkerLifecycleEvent(event);
      return Response.json({ ok: true, event });
    }

    if (request.method === "POST" && url.pathname === "/services/register") {
      const unauthorized = requireManagerToken(request);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseJsonBody<ServiceRegistrationBody>(request);
      if (!isServiceRegistrationBody(body)) {
        return jsonError(400, "invalid service registration body");
      }

      const namespace = normalizeName(body.namespace);
      const serviceName = normalizeName(body.serviceName);
      const instanceId = normalizeName(body.instanceId);
      const workerId = normalizeName(body.workerId);
      const workerPrivateIp = normalizeName(body.workerPrivateIp);
      const protocol = normalizeName(body.protocol ?? "http");
      const updatedAtMs = nowMs();

      try {
        const hostPort = allocatePort(
          workerId,
          namespace,
          serviceName,
          instanceId,
          body.hostPort,
        );

        upsertServiceRecord.run(
          namespace,
          serviceName,
          instanceId,
          workerId,
          workerPrivateIp,
          hostPort,
          body.containerPort,
          protocol,
          body.healthy === false ? 0 : 1,
          updatedAtMs,
          updatedAtMs,
        );

        return Response.json({
          ok: true,
          namespace,
          serviceName,
          instances: lookupServices(namespace, serviceName, false),
        });
      } catch (error) {
        return jsonError(
          409,
          error instanceof Error ? error.message : "service registration failed",
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/services/release") {
      const unauthorized = requireManagerToken(request);
      if (unauthorized) {
        return unauthorized;
      }

      const body = await parseJsonBody<ServiceReleaseBody>(request);
      if (!isServiceReleaseBody(body)) {
        return jsonError(400, "invalid service release body");
      }

      const namespace = normalizeName(body.namespace);
      const serviceName = normalizeName(body.serviceName);
      const instanceId = normalizeName(body.instanceId);
      const existing = lookupServices(namespace, serviceName, false).find(
        (service) => service.instanceId === instanceId,
      );

      if (existing) {
        releasePortForService(existing.workerId, namespace, serviceName, instanceId);
      }
      deleteServiceRecord.run(namespace, serviceName, instanceId);

      return Response.json({ ok: true });
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
          ws.data.nodeRole = message.nodeRole;
          sessions.set(message.workerId, ws);

          const currentTime = nowMs();
          liveWorkers.set(message.workerId, {
            workerId: message.workerId,
            instanceId: message.instanceId,
            privateIp: message.privateIp,
            nodeRole: message.nodeRole,
            status: "connected",
            lastHeartbeatAt: currentTime,
            lastMetrics: null,
            lastContainers: [],
          });
          recordWorkerLifecycleEvent({
            workerId: message.workerId,
            instanceId: message.instanceId,
            privateIp: message.privateIp,
            nodeRole: message.nodeRole,
            eventType: "connected",
            eventTsMs: currentTime,
            details: null,
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
          nodeRole: message.nodeRole,
          status: "connected" as const,
          lastHeartbeatAt: currentTime,
          lastMetrics: null,
          lastContainers: [],
        };

        workerState.instanceId = message.instanceId;
        workerState.privateIp = message.privateIp;
        workerState.nodeRole = message.nodeRole;
        workerState.status = "connected";
        workerState.lastHeartbeatAt = currentTime;
        workerState.lastMetrics = message.worker;
        workerState.lastContainers = message.containers;
        liveWorkers.set(message.workerId, workerState);

        const latestWorkerLifecycleEvent = getLatestWorkerLifecycleEvent(
          message.workerId,
        );
        if (latestWorkerLifecycleEvent?.eventType !== "running") {
          recordWorkerLifecycleEvent({
            workerId: message.workerId,
            instanceId: message.instanceId,
            privateIp: message.privateIp,
            nodeRole: message.nodeRole,
            eventType: "running",
            eventTsMs: currentTime,
            details: {
              containerCount: message.worker.containerCount,
            },
          });
        }

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

        if (message.processWindow) {
          for (const [index, process] of message.processWindow.topCpu.entries()) {
            processSampleBuffer.push({
              workerId: message.workerId,
              instanceId: message.instanceId,
              tsMs: message.processWindow.sampledAt,
              ranking: "cpu",
              rank: index + 1,
              pid: process.pid,
              comm: process.comm,
              state: process.state,
              cpuPercent: process.cpuPercent,
              rssBytes: process.rssBytes,
            });
          }

          for (const [index, process] of message.processWindow.topMemory.entries()) {
            processSampleBuffer.push({
              workerId: message.workerId,
              instanceId: message.instanceId,
              tsMs: message.processWindow.sampledAt,
              ranking: "memory",
              rank: index + 1,
              pid: process.pid,
              comm: process.comm,
              state: process.state,
              cpuPercent: process.cpuPercent,
              rssBytes: process.rssBytes,
            });
          }
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
        recordWorkerLifecycleEvent({
          workerId: liveWorker.workerId,
          instanceId: liveWorker.instanceId,
          privateIp: liveWorker.privateIp,
          nodeRole: liveWorker.nodeRole,
          eventType: "disconnected",
          eventTsMs: nowMs(),
          details: null,
        });
      }
    },
  },
});

setInterval(() => {
  flushSamples();
  updateStaleWorkers();
}, 1000);

setInterval(() => {
  refreshEc2InventoryWorkers();
}, config.ec2InventoryRefreshMs);

setInterval(() => {
  flushSamples();
  rollupWorkerRaw(60_000);
  rollupContainerRaw(60_000);
}, 60_000);

setInterval(() => {
  flushSamples();
  rollupFrom1mTo1h("worker_samples_1m");
  rollupFrom1mTo1h("container_samples_1m");
  pruneOldData();
}, 60 * 60 * 1000);

console.log(
  JSON.stringify({
    event: "manager_monitor_started",
    hostname: config.hostname,
    port: config.port,
    dbPath: config.dbPath,
    rootNamespace: config.rootNamespace,
    servicePortRange: [config.portRangeStart, config.portRangeEnd],
  }),
);

refreshEc2InventoryWorkers();

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
