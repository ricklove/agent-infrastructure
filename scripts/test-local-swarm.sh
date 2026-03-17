#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/projects/agent-infrastructure"
MANAGER_PORT="${MANAGER_PORT:-8787}"
SHARED_TOKEN="${SHARED_TOKEN:-test-token}"
DB_PATH="${DB_PATH:-/tmp/swarm-manager-local-smoke.sqlite}"
IMAGE_TAG="${IMAGE_TAG:-devpod-example-1gb:local}"
DOCKER_CONFIG_DIR="${DOCKER_CONFIG_DIR:-/tmp/swarm-manager-docker-config}"
WORKER_ID="${WORKER_ID:-worker-local}"
WORKER_PRIVATE_IP="${WORKER_PRIVATE_IP:-127.0.0.1}"
BACKEND_INSTANCE_ID="${BACKEND_INSTANCE_ID:-backend-1}"
FRONTEND_INSTANCE_ID="${FRONTEND_INSTANCE_ID:-frontend-1}"

manager_pid=""

cleanup() {
  docker rm -f team-a-backend-${BACKEND_INSTANCE_ID} >/dev/null 2>&1 || true
  docker rm -f team-a-frontend-${FRONTEND_INSTANCE_ID} >/dev/null 2>&1 || true
  if [[ -n "${manager_pid}" ]]; then
    kill "${manager_pid}" >/dev/null 2>&1 || true
    wait "${manager_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

mkdir -p "${DOCKER_CONFIG_DIR}"
if [[ ! -f "${DOCKER_CONFIG_DIR}/config.json" ]]; then
  printf '{}\n' > "${DOCKER_CONFIG_DIR}/config.json"
fi

wait_for_http() {
  local url="$1"
  local attempts="${2:-10}"

  for _ in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

cd "${ROOT_DIR}/examples/devpod/1gb"
DOCKER_CONFIG="${DOCKER_CONFIG_DIR}" docker build -t "${IMAGE_TAG}" .

cd "${ROOT_DIR}/packages/swarm-manager"
rm -f "${DB_PATH}"
SWARM_SHARED_TOKEN="${SHARED_TOKEN}" \
MANAGER_WS_PORT="${MANAGER_PORT}" \
METRICS_DB_PATH="${DB_PATH}" \
bun run src/manager/server.ts >/tmp/swarm-manager-local-smoke.log 2>&1 &
manager_pid=$!

wait_for_http "http://127.0.0.1:${MANAGER_PORT}/health" 10

DOCKER_CONFIG="${DOCKER_CONFIG_DIR}" bun run src/manager/launch-service.ts -- \
  --manager-url "http://127.0.0.1:${MANAGER_PORT}" \
  --token "${SHARED_TOKEN}" \
  --worker-id "${WORKER_ID}" \
  --worker-private-ip "${WORKER_PRIVATE_IP}" \
  --namespace team-a \
  --service-name backend \
  --instance-id "${BACKEND_INSTANCE_ID}" \
  --container-name "team-a-backend-${BACKEND_INSTANCE_ID}" \
  --image "${IMAGE_TAG}" \
  --container-port 3000 >/tmp/swarm-launch-backend.json

DOCKER_CONFIG="${DOCKER_CONFIG_DIR}" bun run src/manager/launch-service.ts -- \
  --manager-url "http://127.0.0.1:${MANAGER_PORT}" \
  --token "${SHARED_TOKEN}" \
  --worker-id "${WORKER_ID}" \
  --worker-private-ip "${WORKER_PRIVATE_IP}" \
  --namespace team-a \
  --service-name frontend \
  --instance-id "${FRONTEND_INSTANCE_ID}" \
  --container-name "team-a-frontend-${FRONTEND_INSTANCE_ID}" \
  --image "${IMAGE_TAG}" \
  --container-port 3000 >/tmp/swarm-launch-frontend.json

backend_port="$(jq -r '.hostPort' /tmp/swarm-launch-backend.json)"
frontend_port="$(jq -r '.hostPort' /tmp/swarm-launch-frontend.json)"

wait_for_http "http://127.0.0.1:${backend_port}/health" 10

wait_for_http "http://127.0.0.1:${frontend_port}/health" 10

echo "BACKEND"
curl -fsS "http://127.0.0.1:${backend_port}/identity"
echo
echo "FRONTEND"
curl -fsS "http://127.0.0.1:${frontend_port}/identity"
echo
echo "FRONTEND_RESOLVE_BACKEND"
curl -fsS "http://127.0.0.1:${frontend_port}/resolve/backend"
echo
echo "MANAGER_SERVICES"
curl -fsS "http://127.0.0.1:${MANAGER_PORT}/services"
echo
