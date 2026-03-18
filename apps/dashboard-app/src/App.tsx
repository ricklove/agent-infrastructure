import { useEffect, useState } from "react";

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
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string>("");
  const [accessMessage, setAccessMessage] = useState<string>("");
  const [latestEnrollment, setLatestEnrollment] =
    useState<EnrollmentResponse | null>(null);
  const [sessionReady, setSessionReady] = useState<boolean>(false);
  const [authRequired, setAuthRequired] = useState<boolean>(false);

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
        const [healthResponse, workersResponse, servicesResponse] =
          await Promise.all([
            apiFetch("/api/health"),
            apiFetch("/api/workers"),
            apiFetch("/api/services"),
          ]);

        if (
          healthResponse.status === 401 ||
          workersResponse.status === 401 ||
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

        if (!healthResponse.ok || !workersResponse.ok || !servicesResponse.ok) {
          throw new Error("dashboard API request failed");
        }

        const nextHealth = (await healthResponse.json()) as DashboardHealth;
        const nextWorkers = (await workersResponse.json()) as WorkersResponse;
        const nextServices = (await servicesResponse.json()) as ServicesResponse;

        if (cancelled) {
          return;
        }

        setHealth(nextHealth);
        setWorkers(nextWorkers.workers);
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

      {error ? <div className="banner error">{error}</div> : null}
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
            <h2>Live Fleet</h2>
          </div>
        </div>
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
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-row">
                    No fleet nodes connected.
                  </td>
                </tr>
              ) : (
                workers.map((worker) => (
                  <tr key={worker.workerId}>
                    <td>
                      <div className="stacked">
                        <strong>{worker.workerId}</strong>
                        <span>{worker.instanceId}</span>
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
                  </tr>
                ))
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
