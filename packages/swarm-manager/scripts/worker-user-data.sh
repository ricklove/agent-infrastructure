#!/usr/bin/env bash
set -euo pipefail

TOKEN=$(curl -X PUT -s http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
LOCAL_IPV4=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
MANAGER_EVENT_URL="http://__MANAGER_PRIVATE_IP__:__MANAGER_MONITOR_PORT__/workers/events"
PENDING_EVENT_FILE="/opt/agent-swarm/pending-worker-events.jsonl"

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
REQUIRED_PACKAGES=(awscli docker jq unzip)
MISSING_PACKAGES=()
for package_name in "${REQUIRED_PACKAGES[@]}"; do
  if ! rpm -q "$package_name" >/dev/null 2>&1; then
    MISSING_PACKAGES+=("$package_name")
  fi
done
PACKAGES_ALREADY_PRESENT=true
if (( ${#MISSING_PACKAGES[@]} > 0 )); then
  PACKAGES_ALREADY_PRESENT=false
fi
emit_event packages_install_started "{\"packages\":[\"awscli\",\"docker\",\"jq\",\"unzip\"],\"missingPackageCount\":${#MISSING_PACKAGES[@]},\"alreadyInstalled\":$(json_bool "$PACKAGES_ALREADY_PRESENT")}"
if (( ${#MISSING_PACKAGES[@]} > 0 )); then
  dnf install -y "${MISSING_PACKAGES[@]}"
fi
emit_event packages_install_completed "{\"packages\":[\"awscli\",\"docker\",\"jq\",\"unzip\"],\"missingPackageCount\":${#MISSING_PACKAGES[@]},\"alreadyInstalled\":$(json_bool "$PACKAGES_ALREADY_PRESENT")}"

export HOME=/root
export BUN_INSTALL=/opt/bun
BUN_ALREADY_PRESENT=false
if [[ -x "$BUN_INSTALL/bin/bun" ]]; then
  BUN_ALREADY_PRESENT=true
fi
emit_event bun_install_started "{\"installDir\":\"$BUN_INSTALL\",\"alreadyInstalled\":$(json_bool "$BUN_ALREADY_PRESENT")}"
if [[ "$BUN_ALREADY_PRESENT" != "true" ]]; then
  curl -fsSL https://bun.sh/install | bash
fi
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
emit_event bun_install_completed "{\"binaryPath\":\"/usr/local/bin/bun\",\"alreadyInstalled\":$(json_bool "$BUN_ALREADY_PRESENT")}"

emit_event docker_enable_started "{}"
systemctl enable --now docker
usermod -aG docker ec2-user
emit_event docker_ready "{}"

mkdir -p /opt/agent-swarm/runtime
emit_event runtime_download_started "{\"bucket\":\"__WORKER_RUNTIME_RELEASE_BUCKET__\",\"key\":\"__WORKER_RUNTIME_RELEASE_KEY__\"}"
aws s3 cp "s3://__WORKER_RUNTIME_RELEASE_BUCKET__/__WORKER_RUNTIME_RELEASE_KEY__" /opt/agent-swarm/runtime.zip --region "__REGION__"
rm -rf /opt/agent-swarm/runtime/*
unzip -q /opt/agent-swarm/runtime.zip -d /opt/agent-swarm/runtime
emit_event runtime_download_completed "{}"

cat > /etc/agent-swarm-worker-monitor.env <<'ENVFILE'
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
EnvironmentFile=/etc/agent-swarm-worker-monitor.env
ExecStart=/usr/local/bin/bun /opt/agent-swarm/runtime/packages/swarm-manager/src/worker/agent.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
SERVICE

cat > /opt/agent-swarm/worker-runtime.json <<RUNTIME
{
  "instanceId": "$INSTANCE_ID",
  "privateIp": "$LOCAL_IPV4"
}
RUNTIME

systemctl daemon-reload
emit_event telemetry_service_start_requested "{\"unit\":\"agent-swarm-worker-monitor.service\"}"
systemctl enable --now agent-swarm-worker-monitor.service
flush_pending_events || true
