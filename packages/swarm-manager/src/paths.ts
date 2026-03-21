export const DEFAULT_AGENT_HOME = "/home/ec2-user";
export const DEFAULT_RUNTIME_DIR = `${DEFAULT_AGENT_HOME}/runtime`;
export const DEFAULT_STATE_DIR = `${DEFAULT_AGENT_HOME}/state`;
export const DEFAULT_WORKSPACE_DIR = `${DEFAULT_AGENT_HOME}/workspace`;

export const DEFAULT_BOOTSTRAP_CONTEXT_PATH = `${DEFAULT_STATE_DIR}/bootstrap-context.json`;
export const DEFAULT_WORKER_RUNTIME_RELEASE_MANIFEST_PATH = `${DEFAULT_STATE_DIR}/worker-runtime-release.json`;
export const DEFAULT_SWARM_SHARED_TOKEN_PATH = `${DEFAULT_STATE_DIR}/swarm-shared-token`;
export const DEFAULT_METRICS_DB_PATH = `${DEFAULT_STATE_DIR}/metrics.sqlite`;
export const DEFAULT_DASHBOARD_SESSION_STORE_PATH = `${DEFAULT_STATE_DIR}/dashboard-sessions.json`;
export const DEFAULT_DASHBOARD_RUNTIME_DIR = `${DEFAULT_STATE_DIR}/dashboard`;
export const DEFAULT_MANAGER_ENV_PATH = `${DEFAULT_STATE_DIR}/agent-swarm-monitor.env`;
export const DEFAULT_MANAGER_NODE_ENV_PATH = `${DEFAULT_STATE_DIR}/agent-swarm-manager-node.env`;
export const DEFAULT_WORKER_MONITOR_ENV_PATH = `${DEFAULT_STATE_DIR}/agent-swarm-worker-monitor.env`;
export const DEFAULT_WORKER_IMAGE_PROFILE_PATH = `${DEFAULT_STATE_DIR}/worker-image-profile.json`;
