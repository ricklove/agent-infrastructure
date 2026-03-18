import { Database } from "bun:sqlite";

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

type WorkerLifecycleEventType =
  | "launch_requested"
  | "create"
  | "launch"
  | "ec2_running"
  | "instance_status_ok"
  | "bootstrap_started"
  | "runtime_download_started"
  | "runtime_download_completed"
  | "docker_ready"
  | "telemetry_started"
  | "running"
  | "connected"
  | "stale"
  | "disconnected"
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
  rootNamespace: process.env.SWARM_ROOT_NAMESPACE ?? "root",
  portRangeStart: Number(process.env.SWARM_SERVICE_PORT_RANGE_START ?? "20000"),
  portRangeEnd: Number(process.env.SWARM_SERVICE_PORT_RANGE_END ?? "40000"),
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

const workerSampleBuffer: WorkerSampleRow[] = [];
const containerSampleBuffer: ContainerSampleRow[] = [];
const liveWorkers = new Map<string, LiveWorkerState>();
const sessions = new Map<string, Bun.ServerWebSocket<SocketData>>();
const seenRunningWorkers = new Set<string>();

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
      isContainerMetricsArray(parsed.containers)
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
    "launch_requested",
    "create",
    "launch",
    "ec2_running",
    "instance_status_ok",
    "bootstrap_started",
    "runtime_download_started",
    "runtime_download_completed",
    "docker_ready",
    "telemetry_started",
    "running",
    "connected",
    "stale",
    "disconnected",
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
): WorkerLifecycleEventRecord[] {
  const normalizedLimit = Math.max(1, Math.min(limit, 500));
  const rows = workerId
    ? listWorkerLifecycleEventsByWorker.all(workerId, normalizedLimit)
    : listWorkerLifecycleEvents.all(normalizedLimit);
  return rows.map((row) =>
    mapLifecycleEventRow(row as Record<string, unknown>),
  );
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
  return Array.from(liveWorkers.values()).sort((left, right) =>
    left.workerId.localeCompare(right.workerId),
  );
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
      });
    }

    if (request.method === "GET" && url.pathname === "/workers") {
      return Response.json({ workers: snapshotWorkers() });
    }

    if (request.method === "GET" && url.pathname === "/workers/events") {
      const limitValue = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
      const workerId = normalizeName(url.searchParams.get("workerId") ?? "");
      return Response.json({
        ok: true,
        events: getWorkerLifecycleEvents(
          Number.isInteger(limitValue) ? limitValue : 100,
          workerId || undefined,
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

        if (!seenRunningWorkers.has(message.workerId)) {
          seenRunningWorkers.add(message.workerId);
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
