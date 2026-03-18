import { Fragment, useEffect, useMemo, useState } from "react";

type DashboardHealth = {
  ok: boolean;
  dashboard?: {
    port: number;
  };
  manager?: {
    ok: boolean;
    connectedWorkers: number;
    staleWorkers: number;
    connectedNodes?: number;
    staleNodes?: number;
  };
  error?: string;
};

type DashboardConfig = {
  ok: boolean;
  accessAppUrl: string;
  requiresSession: boolean;
};

type SessionExchangeResponse = {
  ok: boolean;
  sessionToken: string;
  expiresAtMs: number;
};

type EnrollmentResponse = {
  ok: boolean;
  registrationUrl: string;
  expiresAtMs: number;
};

type Worker = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole: "manager" | "worker";
  status: string;
  lastHeartbeatAt: number;
  lastMetrics: {
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    memoryPercent: number;
    containerCount: number;
  } | null;
};

type WorkersResponse = {
  workers: Worker[];
};

type WorkerLifecycleEventType =
  | "launch_request_started"
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
  | "zombie"
  | "hibernate_requested"
  | "hibernating"
  | "hibernated"
  | "wakeup_requested"
  | "wakeup"
  | "shutdown_requested"
  | "shutdown"
  | "terminated";

type WorkerLifecycleEvent = {
  workerId: string;
  instanceId: string;
  privateIp: string;
  nodeRole: "manager" | "worker";
  eventType: WorkerLifecycleEventType;
  eventTsMs: number;
  details: Record<string, unknown> | null;
};

type WorkerLifecycleEventsResponse = {
  ok: boolean;
  events: WorkerLifecycleEvent[];
};

type WorkerEventPageState = {
  events: WorkerLifecycleEvent[];
  loading: boolean;
  hasMore: boolean;
};

type Service = {
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

type ServicesResponse = {
  ok: boolean;
  rootNamespace: string;
  services: Service[];
};

type FleetNode = Worker & {
  archived: boolean;
  latestEvent: WorkerLifecycleEvent | null;
  events: WorkerLifecycleEvent[];
  lifecycle: {
    timeToRunningSeconds: number | null;
  };
};

const sessionStorageKey = "agent-infrastructure.dashboard.session";

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "--";
  }

  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
  }

  return `${seconds}s`;
}

function formatLifecycleEventLabel(eventType: WorkerLifecycleEventType): string {
  return eventType
    .split(/(?=[A-Z])|_/)
    .join(" ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatLifecycleDetailValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return JSON.stringify(value);
}

function formatElapsedSincePreviousEvent(
  currentEvent: WorkerLifecycleEvent,
  nextEvent: WorkerLifecycleEvent | null,
): string | null {
  if (!nextEvent) {
    return null;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.round((nextEvent.eventTsMs - currentEvent.eventTsMs) / 1000),
  );

  return `+${formatDurationSeconds(elapsedSeconds)}`;
}

function readDetailNumber(
  event: WorkerLifecycleEvent | null,
  key: string,
): number | null {
  const value = event?.details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortLifecycleEvents(
  events: WorkerLifecycleEvent[],
): WorkerLifecycleEvent[] {
  return [...events].sort((left, right) => left.eventTsMs - right.eventTsMs);
}

function sortLifecycleEventsDesc(
  events: WorkerLifecycleEvent[],
): WorkerLifecycleEvent[] {
  return [...events].sort((left, right) => right.eventTsMs - left.eventTsMs);
}

function mergeWorkerEvents(
  currentEvents: WorkerLifecycleEvent[],
  nextEvents: WorkerLifecycleEvent[],
): WorkerLifecycleEvent[] {
  const byKey = new Map<string, WorkerLifecycleEvent>();

  for (const event of [...currentEvents, ...nextEvents]) {
    byKey.set(`${event.workerId}:${event.eventType}:${event.eventTsMs}`, event);
  }

  return sortLifecycleEventsDesc(Array.from(byKey.values()));
}

function findLatestLifecycleEvent(
  events: WorkerLifecycleEvent[],
  eventTypes: WorkerLifecycleEventType[],
): WorkerLifecycleEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (eventTypes.includes(event.eventType)) {
      return event;
    }
  }

  return null;
}

function findFirstLifecycleEventAfter(
  events: WorkerLifecycleEvent[],
  timestampMs: number,
  eventTypes: WorkerLifecycleEventType[],
): WorkerLifecycleEvent | null {
  for (const event of events) {
    if (event.eventTsMs >= timestampMs && eventTypes.includes(event.eventType)) {
      return event;
    }
  }

  return null;
}

function computeDurationFromLifecycleEvents(
  events: WorkerLifecycleEvent[],
  startEventTypes: WorkerLifecycleEventType[],
  endEventTypes: WorkerLifecycleEventType[],
): number | null {
  const chronologicalEvents = sortLifecycleEvents(events);
  const startEvent = findLatestLifecycleEvent(chronologicalEvents, startEventTypes);

  if (!startEvent) {
    return null;
  }

  const endEvent = findFirstLifecycleEventAfter(
    chronologicalEvents,
    startEvent.eventTsMs,
    endEventTypes,
  );

  if (!endEvent || endEvent.eventTsMs < startEvent.eventTsMs) {
    return null;
  }

  return Math.max(
    0,
    Math.round((endEvent.eventTsMs - startEvent.eventTsMs) / 1000),
  );
}

function buildLifecycleSummary(
  events: WorkerLifecycleEvent[],
): FleetNode["lifecycle"] {
  const chronologicalEvents = sortLifecycleEvents(events);
  const firstEvent = chronologicalEvents[0] ?? null;
  const firstRunningEvent = findFirstLifecycleEventAfter(
    chronologicalEvents,
    firstEvent?.eventTsMs ?? 0,
    ["running"],
  );

  return {
    timeToRunningSeconds:
      firstEvent && firstRunningEvent
        ? Math.max(
            0,
            Math.round(
              (firstRunningEvent.eventTsMs - firstEvent.eventTsMs) / 1000,
            ),
          )
        : null,
  };
}

function buildFleetNodes(
  workers: Worker[],
  events: WorkerLifecycleEvent[],
): FleetNode[] {
  const eventsByWorkerId = new Map<string, WorkerLifecycleEvent[]>();

  for (const event of events) {
    const grouped = eventsByWorkerId.get(event.workerId);
    if (grouped) {
      grouped.push(event);
    } else {
      eventsByWorkerId.set(event.workerId, [event]);
    }
  }

  const liveWorkers = new Set(workers.map((worker) => worker.workerId));
  const fleetNodes: FleetNode[] = workers.map((worker) => {
    const workerEvents = eventsByWorkerId.get(worker.workerId) ?? [];
    const latestEvent = workerEvents[0] ?? null;

    return {
      ...worker,
      archived: false,
      latestEvent,
      events: workerEvents,
      lifecycle: buildLifecycleSummary(workerEvents),
    };
  });

  for (const [workerId, workerEvents] of eventsByWorkerId.entries()) {
    if (liveWorkers.has(workerId) || workerEvents.length === 0) {
      continue;
    }

    const latestEvent = workerEvents[0];
    fleetNodes.push({
      workerId,
      instanceId: latestEvent.instanceId,
      privateIp: latestEvent.privateIp,
      nodeRole: latestEvent.nodeRole,
      status: latestEvent.eventType,
      lastHeartbeatAt: latestEvent.eventTsMs,
      lastMetrics: null,
      archived: true,
      latestEvent,
      events: workerEvents,
      lifecycle: buildLifecycleSummary(workerEvents),
    });
  }

  return fleetNodes.sort((left, right) => {
    if (left.archived !== right.archived) {
      return left.archived ? 1 : -1;
    }

    const leftTimestamp = Math.max(
      left.lastHeartbeatAt,
      left.latestEvent?.eventTsMs ?? 0,
    );
    const rightTimestamp = Math.max(
      right.lastHeartbeatAt,
      right.latestEvent?.eventTsMs ?? 0,
    );

    return rightTimestamp - leftTimestamp;
  });
}

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? "";
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const sessionToken = readStoredSessionToken();

  if (sessionToken) {
    headers.set("x-dashboard-session", sessionToken);
  }

  return fetch(path, {
    ...init,
    headers,
  });
}

export function App() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [health, setHealth] = useState<DashboardHealth | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerEvents, setWorkerEvents] = useState<WorkerLifecycleEvent[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string>("");
  const [accessMessage, setAccessMessage] = useState<string>("");
  const [latestEnrollment, setLatestEnrollment] =
    useState<EnrollmentResponse | null>(null);
  const [sessionReady, setSessionReady] = useState<boolean>(false);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [showArchivedWorkers, setShowArchivedWorkers] = useState<boolean>(false);
  const [expandedFleetNodes, setExpandedFleetNodes] = useState<string[]>([]);
  const [workerEventPages, setWorkerEventPages] = useState<
    Record<string, WorkerEventPageState>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function initialize(): Promise<void> {
      try {
        const configResponse = await fetch("/api/config");
        if (!configResponse.ok) {
          throw new Error("failed to load dashboard config");
        }

        const nextConfig = (await configResponse.json()) as DashboardConfig;
        if (cancelled) {
          return;
        }

        setConfig(nextConfig);

        const currentUrl = new URL(window.location.href);
        const bootstrapKey = currentUrl.searchParams.get("sessionKey");
        if (bootstrapKey) {
          const exchangeResponse = await fetch("/api/session/exchange", {
            method: "POST",
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({ sessionKey: bootstrapKey }),
          });

          if (!exchangeResponse.ok) {
            throw new Error("failed to exchange dashboard session key");
          }

          const exchangePayload =
            (await exchangeResponse.json()) as SessionExchangeResponse;
          window.sessionStorage.setItem(
            sessionStorageKey,
            exchangePayload.sessionToken,
          );
          currentUrl.searchParams.delete("sessionKey");
          window.history.replaceState({}, "", currentUrl.toString());
        }

        if (nextConfig.requiresSession && !readStoredSessionToken()) {
          setAuthRequired(true);
          setAccessMessage(
            "This dashboard requires a valid browser session. Open it from a fresh access link.",
          );
        }

        setSessionReady(true);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "failed to initialize dashboard access",
        );
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }

    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const [
          healthResponse,
          workersResponse,
          workerEventsResponse,
          servicesResponse,
        ] =
          await Promise.all([
            apiFetch("/api/health"),
            apiFetch("/api/workers"),
            apiFetch("/api/workers/events?limit=200"),
            apiFetch("/api/services"),
          ]);

        if (
          healthResponse.status === 401 ||
          workersResponse.status === 401 ||
          workerEventsResponse.status === 401 ||
          servicesResponse.status === 401
        ) {
          window.sessionStorage.removeItem(sessionStorageKey);
          setAuthRequired(true);
          setAccessMessage(
            "Dashboard access expired. Go back to the auth page for a fresh access link.",
          );
          setError("");
          return;
        }

        if (
          !healthResponse.ok ||
          !workersResponse.ok ||
          !workerEventsResponse.ok ||
          !servicesResponse.ok
        ) {
          throw new Error("dashboard API request failed");
        }

        const nextHealth = (await healthResponse.json()) as DashboardHealth;
        const nextWorkers = (await workersResponse.json()) as WorkersResponse;
        const nextWorkerEvents =
          (await workerEventsResponse.json()) as WorkerLifecycleEventsResponse;
        const nextServices = (await servicesResponse.json()) as ServicesResponse;

        if (cancelled) {
          return;
        }

        setHealth(nextHealth);
        setWorkers(nextWorkers.workers);
        setWorkerEvents(nextWorkerEvents.events);
        setServices(nextServices.services);
        setAuthRequired(false);
        setError("");
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "failed to load dashboard",
        );
      }
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionReady]);

  const groupedWorkerEvents = useMemo(() => {
    const grouped = new Map<string, WorkerLifecycleEvent[]>();

    for (const event of workerEvents) {
      const existing = grouped.get(event.workerId);
      if (existing) {
        existing.push(event);
      } else {
        grouped.set(event.workerId, [event]);
      }
    }

    return grouped;
  }, [workerEvents]);

  useEffect(() => {
    setWorkerEventPages((currentValue) => {
      const nextValue = { ...currentValue };

      for (const [workerId, events] of groupedWorkerEvents.entries()) {
        const existing = nextValue[workerId];
        nextValue[workerId] = {
          events: mergeWorkerEvents(existing?.events ?? [], events),
          loading: existing?.loading ?? false,
          hasMore: existing?.hasMore ?? true,
        };
      }

      return nextValue;
    });
  }, [groupedWorkerEvents]);

  async function createEnrollmentLink(): Promise<EnrollmentResponse> {
    const response = await apiFetch("/api/access/enrollment-url", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error("failed to create registration link");
    }

    const payload = (await response.json()) as EnrollmentResponse;
    setLatestEnrollment(payload);
    return payload;
  }

  async function beginPasskeyRegistration(): Promise<void> {
    try {
      setAccessMessage("Creating a one-time registration link...");
      const payload = await createEnrollmentLink();
      window.open(payload.registrationUrl, "_blank", "noopener,noreferrer");
      setAccessMessage(
        `Registration page opened. The one-time link expires at ${new Date(
          payload.expiresAtMs,
        ).toLocaleTimeString()}.`,
      );
    } catch (nextError) {
      setAccessMessage(
        nextError instanceof Error
          ? nextError.message
          : "failed to open passkey registration",
      );
    }
  }

  async function copyPasskeyRegistrationUrl(): Promise<void> {
    try {
      setAccessMessage("Creating a one-time registration link...");
      const payload = await createEnrollmentLink();
      await window.navigator.clipboard.writeText(payload.registrationUrl);
      setAccessMessage(
        `Registration URL copied. It expires at ${new Date(
          payload.expiresAtMs,
        ).toLocaleTimeString()}.`,
      );
    } catch (nextError) {
      setAccessMessage(
        nextError instanceof Error
          ? nextError.message
          : "failed to copy passkey registration url",
      );
    }
  }

  const connectedNodes = workers.filter((worker) => worker.status === "connected")
    .length;
  const staleNodes = workers.filter((worker) => worker.status === "stale").length;
  const healthyServices = services.filter((service) => service.healthy).length;
  const managerNodes = workers.filter((worker) => worker.nodeRole === "manager")
    .length;
  const workerNodes = workers.filter((worker) => worker.nodeRole === "worker").length;
  const fleetNodes = buildFleetNodes(workers, workerEvents);
  const archivedNodes = fleetNodes.filter((worker) => worker.archived);
  const displayedFleetNodes = showArchivedWorkers
    ? fleetNodes
    : fleetNodes.filter((worker) => !worker.archived);

  function toggleFleetNode(workerId: string): void {
    setExpandedFleetNodes((currentValue) =>
      currentValue.includes(workerId)
        ? currentValue.filter((value) => value !== workerId)
        : [...currentValue, workerId],
    );
  }

  async function loadMoreWorkerEvents(workerId: string): Promise<void> {
    const currentPage = workerEventPages[workerId];
    if (currentPage?.loading || currentPage?.hasMore === false) {
      return;
    }

    const baseEvents =
      currentPage?.events ??
      sortLifecycleEventsDesc(groupedWorkerEvents.get(workerId) ?? []);
    const oldestEvent = baseEvents[baseEvents.length - 1] ?? null;
    if (!oldestEvent) {
      return;
    }

    setWorkerEventPages((currentValue) => ({
      ...currentValue,
      [workerId]: {
        events: currentValue[workerId]?.events ?? baseEvents,
        loading: true,
        hasMore: currentValue[workerId]?.hasMore ?? true,
      },
    }));

    try {
      const response = await apiFetch(
        `/api/workers/events?workerId=${encodeURIComponent(
          workerId,
        )}&limit=50&beforeEventTsMs=${oldestEvent.eventTsMs}`,
      );

      if (response.status === 401) {
        window.sessionStorage.removeItem(sessionStorageKey);
        setAuthRequired(true);
        setAccessMessage(
          "Dashboard access expired. Go back to the auth page for a fresh access link.",
        );
        setError("");
        return;
      }

      if (!response.ok) {
        throw new Error("dashboard API request failed");
      }

      const payload = (await response.json()) as WorkerLifecycleEventsResponse;
      const nextEvents = payload.events;

      setWorkerEventPages((currentValue) => {
        const existing = currentValue[workerId];
        return {
          ...currentValue,
          [workerId]: {
            events: mergeWorkerEvents(existing?.events ?? baseEvents, nextEvents),
            loading: false,
            hasMore: nextEvents.length === 50,
          },
        };
      });
    } catch (nextError) {
      setWorkerEventPages((currentValue) => ({
        ...currentValue,
        [workerId]: {
          events: currentValue[workerId]?.events ?? baseEvents,
          loading: false,
          hasMore: currentValue[workerId]?.hasMore ?? true,
        },
      }));
      setError(
        nextError instanceof Error
          ? nextError.message
          : "failed to load more lifecycle events",
      );
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Agent Infrastructure</p>
          <h1>Manager Dashboard</h1>
          <p className="lede">
            Direct operator view into manager health, the live fleet, the current
            service registry, and passkey-based remote access enrollment.
          </p>
        </div>
        <div className="hero-badge">
          <span>Dashboard Port</span>
          <strong>{health?.dashboard?.port ?? "..."}</strong>
        </div>
      </section>

      {error ? (
        <div className="banner error auth-banner">
          <span>{error}</span>
          {config?.accessAppUrl ? (
            <button
              className="secondary-action"
              onClick={() => {
                window.location.href = config.accessAppUrl;
              }}
            >
              Go To Auth Page
            </button>
          ) : null}
        </div>
      ) : null}
      {health?.error ? <div className="banner error">{health.error}</div> : null}
      {accessMessage ? <div className="banner">{accessMessage}</div> : null}
      {authRequired && config?.accessAppUrl ? (
        <div className="banner auth-banner">
          <span>Session access is required to use this dashboard.</span>
          <button
            className="secondary-action"
            onClick={() => {
              window.location.href = config.accessAppUrl;
            }}
          >
            Go To Auth Page
          </button>
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Access</p>
            <h2>Passkeys</h2>
          </div>
        </div>
        <p className="lede">
          Register new passkeys by minting a one-time enrollment link on the
          public auth origin. That keeps the passkey bound to the same origin
          your iPhone will later use for login.
        </p>
        <div className="actions-row">
          <button className="primary-action" onClick={() => void beginPasskeyRegistration()}>
            Register Passkey
          </button>
          <button
            className="secondary-action"
            onClick={() => void copyPasskeyRegistrationUrl()}
          >
            Copy Registration URL
          </button>
          <span className="action-hint">
            {config?.accessAppUrl
              ? `Public auth app: ${config.accessAppUrl}`
              : "Public auth app is not configured yet."}
          </span>
        </div>
        {latestEnrollment ? (
          <div className="link-card">
            <span className="link-card-label">Latest Registration Link</span>
            <code>{latestEnrollment.registrationUrl}</code>
            <div className="actions-row link-actions">
              <button
                className="secondary-action"
                onClick={() =>
                  void window.navigator.clipboard
                    .writeText(latestEnrollment.registrationUrl)
                    .then(() => {
                      setAccessMessage("Registration URL copied.");
                    })
                    .catch(() => {
                      setAccessMessage("failed to copy registration URL");
                    })
                }
              >
                Copy Link
              </button>
              <button
                className="secondary-action"
                onClick={() =>
                  window.open(
                    latestEnrollment.registrationUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Open Link
              </button>
              <span className="action-hint">
                Expires at{" "}
                {new Date(latestEnrollment.expiresAtMs).toLocaleTimeString()}.
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Manager</span>
          <strong>{health?.manager?.ok ? "Healthy" : "Unavailable"}</strong>
        </article>
        <article className="metric-card">
          <span>Fleet Nodes</span>
          <strong>{workers.length}</strong>
        </article>
        <article className="metric-card">
          <span>Worker Nodes</span>
          <strong>{workerNodes}</strong>
        </article>
        <article className="metric-card">
          <span>Manager Nodes</span>
          <strong>{managerNodes}</strong>
        </article>
        <article className="metric-card">
          <span>Connected</span>
          <strong>{connectedNodes}</strong>
        </article>
        <article className="metric-card">
          <span>Stale</span>
          <strong>{staleNodes}</strong>
        </article>
        <article className="metric-card">
          <span>Services</span>
          <strong>{services.length}</strong>
        </article>
        <article className="metric-card">
          <span>Healthy Services</span>
          <strong>{healthyServices}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Fleet</p>
            <h2>Fleet</h2>
          </div>
          <button
            className="secondary-action"
            onClick={() => {
              setShowArchivedWorkers((currentValue) => !currentValue);
            }}
          >
            {showArchivedWorkers
              ? "Hide Archive"
              : `Show Archive${archivedNodes.length > 0 ? ` (${archivedNodes.length})` : ""}`}
          </button>
        </div>
        <p className="lede">
          Active manager and worker telemetry stays live. Archive mode also keeps
          hibernated, disconnected, and terminated nodes visible with their most
          recent lifecycle timings.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Role</th>
                <th>Status</th>
                <th>Private IP</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Containers</th>
                <th>Heartbeat</th>
                <th>Lifecycle</th>
              </tr>
            </thead>
            <tbody>
              {displayedFleetNodes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-row">
                    {showArchivedWorkers
                      ? "No fleet nodes or archived lifecycle records."
                      : "No live fleet nodes connected."}
                  </td>
                </tr>
              ) : (
                displayedFleetNodes.map((worker) => {
                  const expanded = expandedFleetNodes.includes(worker.workerId);
                  const detailEvents =
                    workerEventPages[worker.workerId]?.events ?? worker.events;
                  const detailLoading =
                    workerEventPages[worker.workerId]?.loading ?? false;
                  const detailHasMore =
                    workerEventPages[worker.workerId]?.hasMore ?? true;

                  return (
                    <Fragment key={worker.workerId}>
                      <tr
                        className={expanded ? "fleet-row expanded" : "fleet-row"}
                      >
                        <td>
                          <div className="stacked">
                            <strong>{worker.workerId}</strong>
                            <span>{worker.instanceId}</span>
                            {worker.archived ? (
                              <span className="archive-label">archived</span>
                            ) : null}
                          </div>
                        </td>
                        <td>{worker.nodeRole}</td>
                        <td>
                          <span className={`status-pill status-${worker.status}`}>
                            {worker.status}
                          </span>
                        </td>
                        <td>{worker.privateIp}</td>
                        <td>
                          {worker.lastMetrics
                            ? `${worker.lastMetrics.cpuPercent.toFixed(1)}%`
                            : "--"}
                        </td>
                        <td>
                          {worker.lastMetrics
                            ? `${formatBytes(
                                worker.lastMetrics.memoryUsedBytes,
                              )} / ${formatBytes(
                                worker.lastMetrics.memoryTotalBytes,
                              )}`
                            : "--"}
                        </td>
                        <td>{worker.lastMetrics?.containerCount ?? "--"}</td>
                        <td>{formatTimestamp(worker.lastHeartbeatAt)}</td>
                        <td>
                          <div className="lifecycle-summary">
                            <span>
                              {worker.latestEvent
                                ? `${formatLifecycleEventLabel(
                                    worker.latestEvent.eventType,
                                  )} at ${formatTimestamp(worker.latestEvent.eventTsMs)}`
                                : "No lifecycle events yet"}
                            </span>
                            <button
                              className="expand-row-button"
                              onClick={() => {
                                toggleFleetNode(worker.workerId);
                              }}
                            >
                              {expanded ? "Hide Details" : "Show Details"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="fleet-row-detail">
                          <td colSpan={9}>
                            <div className="fleet-detail-grid">
                              <section className="fleet-detail-card">
                                <span className="fleet-detail-label">
                                  Lifecycle Timings
                                </span>
                                <div className="fleet-detail-metrics">
                                  <div className="stacked">
                                    <span>Time To Running</span>
                                    <strong>
                                      {formatDurationSeconds(
                                        worker.lifecycle.timeToRunningSeconds,
                                      )}
                                    </strong>
                                  </div>
                                </div>
                              </section>
                              <section className="fleet-detail-card">
                                <span className="fleet-detail-label">
                                  Recent Events
                                </span>
                                {detailEvents.length === 0 ? (
                                  <p className="fleet-detail-empty">
                                    No lifecycle events recorded yet.
                                  </p>
                                ) : (
                                  <div
                                    className="fleet-event-list"
                                    onScroll={(event) => {
                                      const currentTarget = event.currentTarget;
                                      const remaining =
                                        currentTarget.scrollHeight -
                                        currentTarget.scrollTop -
                                        currentTarget.clientHeight;
                                      if (remaining <= 120) {
                                        void loadMoreWorkerEvents(worker.workerId);
                                      }
                                    }}
                                  >
                                    {detailEvents.map((event, index) => {
                                      const nextEvent =
                                        index > 0 ? detailEvents[index - 1] ?? null : null;
                                      const elapsedLabel =
                                        formatElapsedSincePreviousEvent(
                                          event,
                                          nextEvent,
                                        );

                                      return (
                                      <article
                                        key={`${worker.workerId}-${event.eventType}-${event.eventTsMs}`}
                                        className="fleet-event-item"
                                      >
                                        <div className="fleet-event-head">
                                          <strong>
                                            {formatLifecycleEventLabel(
                                              event.eventType,
                                            )}
                                          </strong>
                                          <div className="fleet-event-time">
                                            {elapsedLabel ? (
                                              <span className="fleet-event-elapsed">
                                                {elapsedLabel}
                                              </span>
                                            ) : null}
                                            <span>
                                              {formatTimestamp(event.eventTsMs)}
                                            </span>
                                          </div>
                                        </div>
                                        {event.details &&
                                        Object.keys(event.details).length > 0 ? (
                                          <div className="fleet-event-details">
                                            {Object.entries(event.details).map(
                                              ([key, value]) => (
                                                <span
                                                  key={`${event.eventTsMs}-${key}`}
                                                >
                                                  {key}:{" "}
                                                  {formatLifecycleDetailValue(
                                                    value,
                                                  )}
                                                </span>
                                              ),
                                            )}
                                          </div>
                                        ) : null}
                                      </article>
                                      );
                                    })}
                                    {detailLoading ? (
                                      <p className="fleet-detail-empty">
                                        Loading older events...
                                      </p>
                                    ) : !detailHasMore ? (
                                      <p className="fleet-detail-empty">
                                        Reached the first recorded event.
                                      </p>
                                    ) : null}
                                  </div>
                                )}
                              </section>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Services</p>
            <h2>Registry</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Namespace</th>
                <th>Worker</th>
                <th>Endpoint</th>
                <th>Health</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No registered services.
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr key={`${service.namespace}/${service.serviceName}/${service.instanceId}`}>
                    <td>
                      <div className="stacked">
                        <strong>{service.serviceName}</strong>
                        <span>{service.instanceId}</span>
                      </div>
                    </td>
                    <td>{service.namespace}</td>
                    <td>{service.workerId}</td>
                    <td>
                      {service.workerPrivateIp}:{service.hostPort}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          service.healthy ? "status-connected" : "status-stale"
                        }`}
                      >
                        {service.healthy ? "healthy" : "unhealthy"}
                      </span>
                    </td>
                    <td>{formatTimestamp(service.updatedAtMs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
