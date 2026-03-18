#!/usr/bin/env bash
set -euo pipefail

dnf install -y awscli docker jq unzip
export HOME=/root
export BUN_INSTALL=/opt/bun
curl -fsSL https://bun.sh/install | bash
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

TOKEN=$(curl -X PUT -s http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
LOCAL_IPV4=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
MANAGER_EVENT_URL="http://__MANAGER_PRIVATE_IP__:__MANAGER_MONITOR_PORT__/workers/events"

emit_event() {
  local event_type="$1"
  local details_json="${2:-{}}"
  local payload
  payload=$(jq -cn \
    --arg workerId "$INSTANCE_ID" \
    --arg instanceId "$INSTANCE_ID" \
    --arg privateIp "$LOCAL_IPV4" \
    --arg nodeRole "worker" \
    --arg eventType "$event_type" \
    --argjson eventTsMs "$(($(date +%s) * 1000))" \
    --argjson details "$details_json" \
    '{workerId:$workerId,instanceId:$instanceId,privateIp:$privateIp,nodeRole:$nodeRole,eventType:$eventType,eventTsMs:$eventTsMs,details:$details}')
  curl -sf -X POST "$MANAGER_EVENT_URL" \
    -H 'content-type: application/json' \
    -H "x-swarm-token: __SWARM_SHARED_TOKEN__" \
    -d "$payload" >/dev/null || true
}

emit_event bootstrap_started "{\"stage\":\"cloud-init\"}"
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
__WORKER_SERVICE_UNIT__
SERVICE

cat > /opt/agent-swarm/worker-runtime.json <<RUNTIME
{
  "instanceId": "$INSTANCE_ID",
  "privateIp": "$LOCAL_IPV4"
}
RUNTIME

systemctl daemon-reload
emit_event telemetry_started "{}"
systemctl enable --now agent-swarm-worker-monitor.service
