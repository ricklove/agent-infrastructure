#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG=/opt/agent-swarm/bootstrap-context.json
REGION=$(jq -r '.region' "$CONFIG")
TAG_KEY=$(jq -r '.swarmTagKey' "$CONFIG")
TAG_VALUE=$(jq -r '.swarmTagValue' "$CONFIG")
MANAGER_PRIVATE_IP=$(jq -r '.managerPrivateIp' "$CONFIG")
MANAGER_MONITOR_PORT=$(jq -r '.managerMonitorPort' "$CONFIG")
SWARM_SHARED_TOKEN=$(jq -r '.swarmSharedToken' "$CONFIG")
RELEASE_CONFIG=/opt/agent-swarm/worker-runtime-release.json

if [[ ! -s "$RELEASE_CONFIG" ]]; then
  echo 'worker runtime release metadata is missing' >&2
  exit 1
fi

INSTANCE_TYPE="${1:-}"
if [[ -z "$INSTANCE_TYPE" ]]; then
  INSTANCE_TYPE="$(jq -r '.workerInstanceType' "$CONFIG")"
fi

SUBNET_ID="${2:-}"
if [[ -z "$SUBNET_ID" ]]; then
  SUBNET_ID="$(jq -r '.workerSubnetIds[0]' "$CONFIG")"
fi

SECURITY_GROUP_ID=$(jq -r '.workerSecurityGroupId' "$CONFIG")
INSTANCE_PROFILE_ARN=$(jq -r '.workerInstanceProfileArn' "$CONFIG")
WORKER_RUNTIME_RELEASE_BUCKET=$(jq -r '.bucket' "$RELEASE_CONFIG")
WORKER_RUNTIME_RELEASE_KEY=$(jq -r '.key' "$RELEASE_CONFIG")

if [[ "$WORKER_RUNTIME_RELEASE_BUCKET" == "null" || -z "$WORKER_RUNTIME_RELEASE_BUCKET" || "$WORKER_RUNTIME_RELEASE_KEY" == "null" || -z "$WORKER_RUNTIME_RELEASE_KEY" ]]; then
  echo 'worker runtime release metadata is invalid' >&2
  exit 1
fi

emit_event() {
  local worker_id="$1"
  local private_ip="$2"
  local event_type="$3"
  local details_json="${4:-{}}"
  local payload
  payload=$(jq -cn \
    --arg workerId "$worker_id" \
    --arg instanceId "$worker_id" \
    --arg privateIp "$private_ip" \
    --arg nodeRole "worker" \
    --arg eventType "$event_type" \
    --argjson eventTsMs "$(($(date +%s) * 1000))" \
    --arg detailsJson "$details_json" \
    '{workerId:$workerId,instanceId:$instanceId,privateIp:$privateIp,nodeRole:$nodeRole,eventType:$eventType,eventTsMs:$eventTsMs,details:($detailsJson | fromjson)}')
  curl -sf -X POST http://127.0.0.1:8787/workers/events \
    -H 'content-type: application/json' \
    -H "x-swarm-token: $SWARM_SHARED_TOKEN" \
    -d "$payload" >/dev/null || true
}

REQUESTED_AT_MS=$(($(date +%s) * 1000))
TEMP_USER_DATA=$(mktemp)
trap 'rm -f "$TEMP_USER_DATA"' EXIT

sed \
  -e "s/__MANAGER_PRIVATE_IP__/$MANAGER_PRIVATE_IP/g" \
  -e "s/__MANAGER_MONITOR_PORT__/$MANAGER_MONITOR_PORT/g" \
  -e "s/__SWARM_SHARED_TOKEN__/$SWARM_SHARED_TOKEN/g" \
  -e "s/__WORKER_RUNTIME_RELEASE_BUCKET__/$WORKER_RUNTIME_RELEASE_BUCKET/g" \
  -e "s#__WORKER_RUNTIME_RELEASE_KEY__#$WORKER_RUNTIME_RELEASE_KEY#g" \
  -e "s/__REGION__/$REGION/g" \
  "$SCRIPT_DIR/worker-user-data.sh" > "$TEMP_USER_DATA"

IMAGE_ID=$(aws ec2 describe-images --owners amazon --region "$REGION" --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' 'Name=state,Values=available' --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
RUN_INSTANCES_OUTPUT=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$IMAGE_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --iam-instance-profile Arn="$INSTANCE_PROFILE_ARN" \
  --security-group-ids "$SECURITY_GROUP_ID" \
  --subnet-id "$SUBNET_ID" \
  --user-data file://"$TEMP_USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Role,Value=agent-swarm-worker},{Key=Name,Value=agent-swarm-worker}]" "ResourceType=volume,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Name,Value=agent-swarm-worker-volume}]")

INSTANCE_ID=$(printf '%s' "$RUN_INSTANCES_OUTPUT" | jq -r '.Instances[0].InstanceId')
PRIVATE_IP=$(printf '%s' "$RUN_INSTANCES_OUTPUT" | jq -r '.Instances[0].PrivateIpAddress // ""')
LAUNCH_REQUESTED_DETAILS=$(jq -cn \
  --arg instanceType "$INSTANCE_TYPE" \
  --arg subnetId "$SUBNET_ID" \
  --argjson requestedAtMs "$REQUESTED_AT_MS" \
  '{instanceType:$instanceType,subnetId:$subnetId,requestedAtMs:$requestedAtMs}')
CREATE_DETAILS=$(jq -cn \
  --arg instanceType "$INSTANCE_TYPE" \
  --arg subnetId "$SUBNET_ID" \
  --arg imageId "$IMAGE_ID" \
  --argjson requestedAtMs "$REQUESTED_AT_MS" \
  '{instanceType:$instanceType,subnetId:$subnetId,imageId:$imageId,requestedAtMs:$requestedAtMs}')
emit_event "$INSTANCE_ID" "$PRIVATE_IP" launch_requested "$LAUNCH_REQUESTED_DETAILS"
emit_event "$INSTANCE_ID" "$PRIVATE_IP" create "$CREATE_DETAILS"

(
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
  RUNNING_AT_MS=$(($(date +%s) * 1000))
  RUNNING_ELAPSED_SECONDS=$(((RUNNING_AT_MS - REQUESTED_AT_MS) / 1000))
  EC2_RUNNING_DETAILS=$(jq -cn \
    --argjson elapsedSeconds "$RUNNING_ELAPSED_SECONDS" \
    '{elapsedSeconds:$elapsedSeconds}')
  LAUNCH_DETAILS=$(jq -cn \
    --argjson runningElapsedSeconds "$RUNNING_ELAPSED_SECONDS" \
    '{runningElapsedSeconds:$runningElapsedSeconds}')
  emit_event "$INSTANCE_ID" "$PRIVATE_IP" ec2_running "$EC2_RUNNING_DETAILS"
  emit_event "$INSTANCE_ID" "$PRIVATE_IP" launch "$LAUNCH_DETAILS"
  if aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$INSTANCE_ID"; then
    STATUS_OK_AT_MS=$(($(date +%s) * 1000))
    STATUS_OK_ELAPSED_SECONDS=$(((STATUS_OK_AT_MS - REQUESTED_AT_MS) / 1000))
    INSTANCE_STATUS_OK_DETAILS=$(jq -cn \
      --argjson elapsedSeconds "$STATUS_OK_ELAPSED_SECONDS" \
      '{elapsedSeconds:$elapsedSeconds}')
    emit_event "$INSTANCE_ID" "$PRIVATE_IP" instance_status_ok "$INSTANCE_STATUS_OK_DETAILS"
  fi
) >/dev/null 2>&1 & disown

printf '%s\n' "$RUN_INSTANCES_OUTPUT"
