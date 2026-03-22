#!/usr/bin/env bash
set -euo pipefail

SYSTEM_EVENT_LOG_PATH="${SYSTEM_EVENT_LOG_PATH:-/home/ec2-user/state/logs/system-events.log}"

system_event_log() {
  local source="$1"
  local comment="$2"
  local details="${3:-}"
  local line
  mkdir -p "$(dirname "$SYSTEM_EVENT_LOG_PATH")"
  line="[$(date -u +"%Y-%m-%dT%H:%M:%SZ"):${source}] ${comment}"
  if [[ -n "${details}" ]]; then
    line="${line} ${details}"
  fi
  printf '%s\n' "${line}" >> "$SYSTEM_EVENT_LOG_PATH"
  printf '%s\n' "${line}" >&2
}

TOKEN=$(curl -X PUT -s http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
LOCAL_IPV4=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
MANAGER_EVENT_URL="http://__MANAGER_PRIVATE_IP__:__MANAGER_MONITOR_PORT__/workers/events"
RUNTIME_ROOT="/home/ec2-user/runtime"
STATE_ROOT="/home/ec2-user/state"
WORKSPACE_ROOT="/home/ec2-user/workspace"
PENDING_EVENT_FILE="${STATE_ROOT}/pending-worker-events.jsonl"
WORKER_IMAGE_PROFILE_PATH="${STATE_ROOT}/worker-image-profile.json"
WORKER_MONITOR_ENV_PATH="${STATE_ROOT}/agent-swarm-worker-monitor.env"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

json_bool() {
  if [[ "$1" == "true" ]]; then
    printf 'true'
    return
  fi
  printf 'false'
}

post_payload() {
  local payload="$1"
  curl -sf \
    --connect-timeout 2 \
    --max-time 5 \
    --retry 6 \
    --retry-delay 1 \
    --retry-connrefused \
    -X POST "$MANAGER_EVENT_URL" \
    -H 'content-type: application/json' \
    -H "x-swarm-token: __SWARM_SHARED_TOKEN__" \
    -d "$payload" >/dev/null
}

flush_pending_events() {
  mkdir -p "$(dirname "$PENDING_EVENT_FILE")"
  if [[ ! -f "$PENDING_EVENT_FILE" ]]; then
    return
  fi

  local pending_tmp
  pending_tmp="$(mktemp)"
  while IFS= read -r pending_payload || [[ -n "$pending_payload" ]]; do
    if [[ -z "$pending_payload" ]]; then
      continue
    fi
    if ! post_payload "$pending_payload"; then
      printf '%s\n' "$pending_payload" >> "$pending_tmp"
    fi
  done < "$PENDING_EVENT_FILE"

  if [[ -s "$pending_tmp" ]]; then
    mv "$pending_tmp" "$PENDING_EVENT_FILE"
    return
  fi

  rm -f "$PENDING_EVENT_FILE" "$pending_tmp"
}

emit_event() {
  local event_type="$1"
  local details_json="${2-}"
  if [[ -z "$details_json" ]]; then
    details_json="{}"
  fi
  local event_ts_ms
  local payload
  event_ts_ms="$(date +%s%3N)"
  payload=$(cat <<EOF
{"workerId":"$(json_escape "$INSTANCE_ID")","instanceId":"$(json_escape "$INSTANCE_ID")","privateIp":"$(json_escape "$LOCAL_IPV4")","nodeRole":"worker","eventType":"$(json_escape "$event_type")","eventTsMs":$event_ts_ms,"details":$details_json}
EOF
)
  mkdir -p "$(dirname "$PENDING_EVENT_FILE")"
  printf '%s\n' "$payload" >> "$PENDING_EVENT_FILE"
  flush_pending_events || true
}

emit_event cloud_init_started "{\"stage\":\"user-data\"}"
system_event_log "worker-user-data.sh" "setup.start" "instance_id=${INSTANCE_ID}"
BAKED_RUNTIME_PROFILE=""
if [[ -f "$WORKER_IMAGE_PROFILE_PATH" ]]; then
  BAKED_RUNTIME_PROFILE="$(jq -r '.profile // ""' "$WORKER_IMAGE_PROFILE_PATH" 2>/dev/null || true)"
fi

REQUIRED_PACKAGES=(aws docker jq unzip)
MISSING_PACKAGES=()
PACKAGES_ALREADY_PRESENT=true
PACKAGES_SKIPPED=false
if [[ -n "$BAKED_RUNTIME_PROFILE" ]]; then
  PACKAGES_SKIPPED=true
else
  for package_name in "${REQUIRED_PACKAGES[@]}"; do
    if ! command -v "$package_name" >/dev/null 2>&1; then
      MISSING_PACKAGES+=("$package_name")
    fi
  done
  if (( ${#MISSING_PACKAGES[@]} > 0 )); then
    PACKAGES_ALREADY_PRESENT=false
  fi
fi
emit_event packages_install_started "{\"packages\":[\"aws\",\"docker\",\"jq\",\"unzip\"],\"missingPackageCount\":${#MISSING_PACKAGES[@]},\"alreadyInstalled\":$(json_bool "$PACKAGES_ALREADY_PRESENT"),\"skipped\":$(json_bool "$PACKAGES_SKIPPED"),\"bakedProfile\":\"$BAKED_RUNTIME_PROFILE\"}"
system_event_log "worker-user-data.sh" "start" "packages_install missing_count=${#MISSING_PACKAGES[@]}"
if [[ "$PACKAGES_SKIPPED" != "true" && ${#MISSING_PACKAGES[@]} -gt 0 ]]; then
  dnf install -y "${MISSING_PACKAGES[@]}"
fi
emit_event packages_install_completed "{\"packages\":[\"aws\",\"docker\",\"jq\",\"unzip\"],\"missingPackageCount\":${#MISSING_PACKAGES[@]},\"alreadyInstalled\":$(json_bool "$PACKAGES_ALREADY_PRESENT"),\"skipped\":$(json_bool "$PACKAGES_SKIPPED"),\"bakedProfile\":\"$BAKED_RUNTIME_PROFILE\"}"
system_event_log "worker-user-data.sh" "exit" "packages_install exit_code=0"

export HOME=/root
export BUN_INSTALL=/opt/bun
BUN_ALREADY_PRESENT=false
if [[ -x "$BUN_INSTALL/bin/bun" ]]; then
  BUN_ALREADY_PRESENT=true
fi
SKIP_BUN_INSTALL=false
if [[ -n "$BAKED_RUNTIME_PROFILE" && "$BUN_ALREADY_PRESENT" == "true" ]]; then
  SKIP_BUN_INSTALL=true
fi
emit_event bun_install_started "{\"installDir\":\"$BUN_INSTALL\",\"alreadyInstalled\":$(json_bool "$BUN_ALREADY_PRESENT"),\"skipped\":$(json_bool "$SKIP_BUN_INSTALL"),\"bakedProfile\":\"$BAKED_RUNTIME_PROFILE\"}"
system_event_log "worker-user-data.sh" "start" "bun_install skipped=${SKIP_BUN_INSTALL}"
if [[ "$SKIP_BUN_INSTALL" != "true" && "$BUN_ALREADY_PRESENT" != "true" ]]; then
  curl -fsSL https://bun.sh/install | bash
fi
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
emit_event bun_install_completed "{\"binaryPath\":\"/usr/local/bin/bun\",\"alreadyInstalled\":$(json_bool "$BUN_ALREADY_PRESENT"),\"skipped\":$(json_bool "$SKIP_BUN_INSTALL"),\"bakedProfile\":\"$BAKED_RUNTIME_PROFILE\"}"
system_event_log "worker-user-data.sh" "exit" "bun_install exit_code=0"

emit_event docker_enable_started "{}"
system_event_log "worker-user-data.sh" "start" "docker_enable"
systemctl enable --now docker
usermod -aG docker ec2-user
emit_event docker_ready "{}"
system_event_log "worker-user-data.sh" "exit" "docker_enable exit_code=0"

mkdir -p "$RUNTIME_ROOT" "$STATE_ROOT" "$WORKSPACE_ROOT"
emit_event runtime_download_started "{\"bucket\":\"__WORKER_RUNTIME_RELEASE_BUCKET__\",\"key\":\"__WORKER_RUNTIME_RELEASE_KEY__\"}"
system_event_log "worker-user-data.sh" "start" "runtime_download"
aws s3 cp "s3://__WORKER_RUNTIME_RELEASE_BUCKET__/__WORKER_RUNTIME_RELEASE_KEY__" "${STATE_ROOT}/runtime.zip" --region "__REGION__"
rm -rf "${RUNTIME_ROOT}"/*
unzip -q "${STATE_ROOT}/runtime.zip" -d "$RUNTIME_ROOT"
chown -R ec2-user:ec2-user "$RUNTIME_ROOT" "$STATE_ROOT" "$WORKSPACE_ROOT"
emit_event runtime_download_completed "{}"
system_event_log "worker-user-data.sh" "exit" "runtime_download exit_code=0"

cat > "${WORKER_MONITOR_ENV_PATH}" <<'ENVFILE'
MONITOR_MANAGER_URL=ws://__MANAGER_PRIVATE_IP__:__MANAGER_MONITOR_PORT__/workers/stream
MONITOR_SHARED_TOKEN=__SWARM_SHARED_TOKEN__
MONITOR_RECONNECT_DELAY_MS=1000
ENVFILE

cat > /etc/systemd/system/agent-swarm-worker-monitor.service <<'SERVICE'
[Unit]
Description=Agent swarm worker telemetry
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=ec2-user
ExecStart=/home/ec2-user/runtime/run-worker-monitor.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
SERVICE
system_event_log "worker-user-data.sh" "setup.write" "path=/etc/systemd/system/agent-swarm-worker-monitor.service"

cat > "${STATE_ROOT}/worker-runtime.json" <<RUNTIME
{
  "instanceId": "$INSTANCE_ID",
  "privateIp": "$LOCAL_IPV4"
}
RUNTIME

chown -R ec2-user:ec2-user "$RUNTIME_ROOT" "$STATE_ROOT" "$WORKSPACE_ROOT"
system_event_log "worker-user-data.sh" "start" "systemd_daemon_reload"
systemctl daemon-reload
emit_event telemetry_service_start_requested "{\"unit\":\"agent-swarm-worker-monitor.service\"}"
system_event_log "worker-user-data.sh" "start" "telemetry_service_enable unit=agent-swarm-worker-monitor.service"
systemctl enable --now agent-swarm-worker-monitor.service
flush_pending_events || true
system_event_log "worker-user-data.sh" "setup.complete" "instance_id=${INSTANCE_ID}"
