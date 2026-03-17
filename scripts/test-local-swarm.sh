#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/projects/agent-infrastructure"
MANAGER_PORT="${MANAGER_PORT:-8787}"
SHARED_TOKEN="${SHARED_TOKEN:-test-token}"
DB_PATH="${DB_PATH:-/tmp/swarm-manager-local-smoke.sqlite}"
IMAGE_TAG="${IMAGE_TAG:-devpod-example-1gb:local}"
DOCKER_CONFIG_DIR="${DOCKER_CONFIG_DIR:-/tmp/swarm-manager-docker-config}"
SERVICE_PORT_RANGE_START="${SERVICE_PORT_RANGE_START:-21000}"
SERVICE_PORT_RANGE_END="${SERVICE_PORT_RANGE_END:-21100}"
WORKER_ID="${WORKER_ID:-worker-local}"
WORKER_PRIVATE_IP="${WORKER_PRIVATE_IP:-}"
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

wait_for_container_http() {
  local container_name="$1"
  local url="$2"
  local attempts="${3:-10}"

  for _ in $(seq 1 "${attempts}"); do
    if docker exec "${container_name}" bun -e "const run = async () => { const response = await fetch('${url}'); if (!response.ok) process.exit(1); }; await run();" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

if [[ -z "${WORKER_PRIVATE_IP}" ]]; then
  WORKER_PRIVATE_IP="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}')"
fi

cd "${ROOT_DIR}/examples/devpod/1gb"
DOCKER_CONFIG="${DOCKER_CONFIG_DIR}" docker build -t "${IMAGE_TAG}" .

cd "${ROOT_DIR}/packages/swarm-manager"
rm -f "${DB_PATH}"
SWARM_SHARED_TOKEN="${SHARED_TOKEN}" \
MANAGER_WS_PORT="${MANAGER_PORT}" \
METRICS_DB_PATH="${DB_PATH}" \
SWARM_SERVICE_PORT_RANGE_START="${SERVICE_PORT_RANGE_START}" \
SWARM_SERVICE_PORT_RANGE_END="${SERVICE_PORT_RANGE_END}" \
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
  --container-port 3000 \
  --env "SWARM_MANAGER_URL=http://${WORKER_PRIVATE_IP}:${MANAGER_PORT}" >/tmp/swarm-launch-backend.json

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
  --container-port 3000 \
  --env "SWARM_MANAGER_URL=http://${WORKER_PRIVATE_IP}:${MANAGER_PORT}" >/tmp/swarm-launch-frontend.json

backend_port="$(jq -r '.hostPort' /tmp/swarm-launch-backend.json)"
frontend_port="$(jq -r '.hostPort' /tmp/swarm-launch-frontend.json)"

wait_for_container_http "team-a-backend-${BACKEND_INSTANCE_ID}" "http://127.0.0.1:3000/health" 10

wait_for_container_http "team-a-frontend-${FRONTEND_INSTANCE_ID}" "http://127.0.0.1:3000/health" 10

echo "BACKEND"
docker exec "team-a-backend-${BACKEND_INSTANCE_ID}" bun -e "const run = async () => { const response = await fetch('http://127.0.0.1:3000/identity'); console.log(await response.text()); }; await run();"
echo
echo "FRONTEND"
docker exec "team-a-frontend-${FRONTEND_INSTANCE_ID}" bun -e "const run = async () => { const response = await fetch('http://127.0.0.1:3000/identity'); console.log(await response.text()); }; await run();"
echo
echo "MANAGER_RESOLVE_BACKEND"
curl -fsS "http://127.0.0.1:${MANAGER_PORT}/services/resolve/backend?callerNamespace=team-a"
echo
echo "MANAGER_SERVICES"
curl -fsS "http://127.0.0.1:${MANAGER_PORT}/services"
echo
