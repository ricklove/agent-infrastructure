#!/usr/bin/env bash
set -euo pipefail

RUNNER_REPO_DIR="${RUNNER_REPO_DIR:-/opt/agent-swarm/agent-infrastructure}"
RUNNER_REPO_URL="${RUNNER_REPO_URL:-https://github.com/ricklove/agent-infrastructure.git}"
RUNNER_REPO_REF="${RUNNER_REPO_REF:-development}"
RUNNER_APP_DIR="${RUNNER_APP_DIR:-examples/benchmarks/bun-repo-runner}"

emit_event() {
  local event_type="$1"
  local details_json="${2:-{}}"
  if [[ -z "${SWARM_MANAGER_URL:-}" || -z "${SWARM_MANAGER_TOKEN:-}" || -z "${SWARM_WORKER_ID:-}" || -z "${SWARM_WORKER_PRIVATE_IP:-}" ]]; then
    return
  fi
  EVENT_TYPE="$event_type" EVENT_DETAILS_JSON="$details_json" bun -e '
const eventType = process.env.EVENT_TYPE ?? "";
let extraDetails = {};
try {
  extraDetails = JSON.parse(process.env.EVENT_DETAILS_JSON ?? "{}");
} catch {
  extraDetails = {};
}
const payload = {
  workerId: process.env.SWARM_WORKER_ID,
  instanceId: process.env.SWARM_WORKER_ID,
  privateIp: process.env.SWARM_WORKER_PRIVATE_IP,
  nodeRole: "worker",
  eventType,
  eventTsMs: Date.now(),
  details: {
    namespace: process.env.SWARM_NAMESPACE ?? "root",
    serviceName: process.env.SWARM_SERVICE_NAME ?? "bun-repo-runner",
    instanceId: process.env.SWARM_INSTANCE_ID ?? "bun-repo-runner-local",
    containerName: process.env.HOSTNAME ?? "unknown",
    repoRef: process.env.RUNNER_REPO_REF ?? "development",
    repoUrl: process.env.RUNNER_REPO_URL ?? "",
    appDir: process.env.RUNNER_APP_DIR ?? "",
    ...extraDetails,
  },
};

const response = await fetch(`${process.env.SWARM_MANAGER_URL}/workers/events`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-swarm-token": process.env.SWARM_MANAGER_TOKEN ?? "",
  },
  body: JSON.stringify(payload),
}).catch((error) => {
  console.error(`failed to emit ${eventType}`, error);
  return null;
});

if (!response) {
  process.exit(0);
}

if (!response.ok) {
  const body = await response.text().catch(() => "");
  console.error(`failed to emit ${eventType}: ${response.status} ${body}`);
}
' >/dev/null || true
}

if [[ ! -d "$RUNNER_REPO_DIR/.git" ]]; then
  git clone "$RUNNER_REPO_URL" "$RUNNER_REPO_DIR"
fi

cd "$RUNNER_REPO_DIR"

emit_event repo_update_started '{"stage":"git-fetch"}'
git fetch --tags origin
git checkout "$RUNNER_REPO_REF"
git pull --ff-only origin "$RUNNER_REPO_REF"
current_commit="$(git rev-parse HEAD)"
emit_event repo_update_completed "{\"commit\":\"${current_commit}\"}"

cd "$RUNNER_REPO_DIR/$RUNNER_APP_DIR"
emit_event service_bun_install_started '{}'
bun install
emit_event service_bun_install_completed '{}'
emit_event service_process_started '{}'

exec bun run start
