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

  local payload
  local details_fragment
  details_fragment="${details_json#\{}"
  details_fragment="${details_fragment%\}}"
  if [[ -n "$details_fragment" ]]; then
    details_fragment=",${details_fragment}"
  fi
  payload="$(cat <<EOF
{"workerId":"${SWARM_WORKER_ID}","instanceId":"${SWARM_WORKER_ID}","privateIp":"${SWARM_WORKER_PRIVATE_IP}","nodeRole":"worker","eventType":"${event_type}","eventTsMs":$(date +%s%3N),"details":{"namespace":"${SWARM_NAMESPACE:-root}","serviceName":"${SWARM_SERVICE_NAME:-bun-repo-runner}","instanceId":"${SWARM_INSTANCE_ID:-bun-repo-runner-local}","containerName":"${HOSTNAME:-unknown}","repoRef":"${RUNNER_REPO_REF}","repoUrl":"${RUNNER_REPO_URL}","appDir":"${RUNNER_APP_DIR}"${details_fragment}}}
EOF
)"
  curl -sf \
    --connect-timeout 2 \
    --max-time 5 \
    --retry 3 \
    --retry-delay 1 \
    --retry-connrefused \
    -X POST "${SWARM_MANAGER_URL}/workers/events" \
    -H 'content-type: application/json' \
    -H "x-swarm-token: ${SWARM_MANAGER_TOKEN}" \
    -d "$payload" >/dev/null || true
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
