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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_ROOT="${AGENT_STATE_ROOT:-/home/ec2-user/state}"
CONFIG="${STATE_ROOT}/bootstrap-context.json"
REGION=$(jq -r '.region' "$CONFIG")
TAG_KEY=$(jq -r '.swarmTagKey' "$CONFIG")
TAG_VALUE=$(jq -r '.swarmTagValue' "$CONFIG")
MANAGER_PRIVATE_IP=$(jq -r '.managerPrivateIp' "$CONFIG")
MANAGER_MONITOR_PORT=$(jq -r '.managerMonitorPort' "$CONFIG")
SWARM_SHARED_TOKEN=$(jq -r '.swarmSharedToken' "$CONFIG")
RELEASE_CONFIG="${STATE_ROOT}/worker-runtime-release.json"
AGENT_BROWSER_IDLE_TIMEOUT_MS="${AGENT_BROWSER_IDLE_TIMEOUT_MS:-300000}"

if [[ ! -s "$RELEASE_CONFIG" ]]; then
  system_event_log "launch-worker.sh" "error" "missing_release_config=${RELEASE_CONFIG}"
  echo 'worker runtime release metadata is missing' >&2
  exit 1
fi

usage() {
  cat <<'EOF'
Usage:
  launch-worker.sh [--instance-type t3.small] [--subnet-id subnet-...] [--image-id ami-...] [--name agent-swarm-worker] [--tag Key=Value]

Positional compatibility is retained:
  launch-worker.sh [instance-type] [subnet-id] [image-id]
EOF
}

INSTANCE_TYPE=""
SUBNET_ID=""
IMAGE_ID_OVERRIDE=""
INSTANCE_NAME="agent-swarm-worker"
EXTRA_TAGS=()

POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-type)
      INSTANCE_TYPE="${2:-}"
      shift 2
      ;;
    --subnet-id)
      SUBNET_ID="${2:-}"
      shift 2
      ;;
    --image-id)
      IMAGE_ID_OVERRIDE="${2:-}"
      shift 2
      ;;
    --name)
      INSTANCE_NAME="${2:-}"
      shift 2
      ;;
    --tag)
      EXTRA_TAGS+=("${2:-}")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$INSTANCE_TYPE" && ${#POSITIONAL_ARGS[@]} -gt 0 ]]; then
  INSTANCE_TYPE="${POSITIONAL_ARGS[0]}"
fi
if [[ -z "$SUBNET_ID" && ${#POSITIONAL_ARGS[@]} -gt 1 ]]; then
  SUBNET_ID="${POSITIONAL_ARGS[1]}"
fi
if [[ -z "$IMAGE_ID_OVERRIDE" && ${#POSITIONAL_ARGS[@]} -gt 2 ]]; then
  IMAGE_ID_OVERRIDE="${POSITIONAL_ARGS[2]}"
fi

if [[ -z "$INSTANCE_TYPE" ]]; then
  INSTANCE_TYPE="$(jq -r '.workerInstanceType' "$CONFIG")"
fi

if [[ -z "$SUBNET_ID" ]]; then
  SUBNET_ID="$(jq -r '.workerSubnetIds[0]' "$CONFIG")"
fi

SECURITY_GROUP_ID=$(jq -r '.workerSecurityGroupId' "$CONFIG")
INSTANCE_PROFILE_ARN=$(jq -r '.workerInstanceProfileArn' "$CONFIG")
WORKER_RUNTIME_RELEASE_BUCKET=$(jq -r '.bucket' "$RELEASE_CONFIG")
WORKER_RUNTIME_RELEASE_KEY=$(jq -r '.key' "$RELEASE_CONFIG")

if [[ "$WORKER_RUNTIME_RELEASE_BUCKET" == "null" || -z "$WORKER_RUNTIME_RELEASE_BUCKET" || "$WORKER_RUNTIME_RELEASE_KEY" == "null" || -z "$WORKER_RUNTIME_RELEASE_KEY" ]]; then
  system_event_log "launch-worker.sh" "error" "invalid_release_metadata"
  echo 'worker runtime release metadata is invalid' >&2
  exit 1
fi

emit_event() {
  local worker_id="$1"
  local private_ip="$2"
  local event_type="$3"
  local details_json="${4-}"
  local event_ts_ms="${5-}"
  if [[ -z "$details_json" ]]; then
    details_json="{}"
  fi
  if [[ -z "$event_ts_ms" ]]; then
    event_ts_ms="$(($(date +%s) * 1000))"
  fi
  local payload
  payload=$(jq -cn \
    --arg workerId "$worker_id" \
    --arg instanceId "$worker_id" \
    --arg privateIp "$private_ip" \
    --arg nodeRole "worker" \
    --arg eventType "$event_type" \
    --argjson eventTsMs "$event_ts_ms" \
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
system_event_log "launch-worker.sh" "start" "instance_type=${INSTANCE_TYPE:-unset} subnet_id=${SUBNET_ID:-unset}"

sed \
  -e "s/__MANAGER_PRIVATE_IP__/$MANAGER_PRIVATE_IP/g" \
  -e "s/__MANAGER_MONITOR_PORT__/$MANAGER_MONITOR_PORT/g" \
  -e "s/__SWARM_SHARED_TOKEN__/$SWARM_SHARED_TOKEN/g" \
  -e "s/__WORKER_RUNTIME_RELEASE_BUCKET__/$WORKER_RUNTIME_RELEASE_BUCKET/g" \
  -e "s#__WORKER_RUNTIME_RELEASE_KEY__#$WORKER_RUNTIME_RELEASE_KEY#g" \
  -e "s/__AGENT_BROWSER_IDLE_TIMEOUT_MS__/$AGENT_BROWSER_IDLE_TIMEOUT_MS/g" \
  -e "s/__REGION__/$REGION/g" \
  "$SCRIPT_DIR/worker-user-data.sh" > "$TEMP_USER_DATA"

IMAGE_SOURCE="latest-amazon-linux"
IMAGE_METADATA=""
if [[ -n "$IMAGE_ID_OVERRIDE" ]]; then
  IMAGE_METADATA=$(aws ec2 describe-images \
    --region "$REGION" \
    --image-ids "$IMAGE_ID_OVERRIDE" \
    --query 'Images[0].{ImageId:ImageId,RootDeviceName:RootDeviceName,RootDeviceVolumeSize:BlockDeviceMappings[?DeviceName==RootDeviceName][0].Ebs.VolumeSize}' \
    --output json)
  IMAGE_ID=$(printf '%s' "$IMAGE_METADATA" | jq -r '.ImageId')
  IMAGE_SOURCE="explicit-image-id"
else
  IMAGE_METADATA=$(aws ec2 describe-images --owners amazon --region "$REGION" --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' 'Name=state,Values=available' --query 'sort_by(Images,&CreationDate)[-1].{ImageId:ImageId,RootDeviceName:RootDeviceName,RootDeviceVolumeSize:BlockDeviceMappings[?DeviceName==RootDeviceName][0].Ebs.VolumeSize}' --output json)
  IMAGE_ID=$(printf '%s' "$IMAGE_METADATA" | jq -r '.ImageId')
fi
ROOT_DEVICE_NAME=$(printf '%s' "$IMAGE_METADATA" | jq -r '.RootDeviceName')
ROOT_DEVICE_VOLUME_SIZE=$(printf '%s' "$IMAGE_METADATA" | jq -r '.RootDeviceVolumeSize // 0')
if [[ "$ROOT_DEVICE_VOLUME_SIZE" =~ ^[0-9]+$ ]] && (( ROOT_DEVICE_VOLUME_SIZE > 30 )); then
  WORKER_ROOT_VOLUME_SIZE="$ROOT_DEVICE_VOLUME_SIZE"
else
  WORKER_ROOT_VOLUME_SIZE="30"
fi
INSTANCE_TAG_SPEC="ResourceType=instance,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Role,Value=agent-swarm-worker},{Key=Name,Value=$INSTANCE_NAME}"
for extra_tag in "${EXTRA_TAGS[@]}"; do
  if [[ -z "$extra_tag" || "$extra_tag" != *=* ]]; then
    continue
  fi
  extra_key="${extra_tag%%=*}"
  extra_value="${extra_tag#*=}"
  INSTANCE_TAG_SPEC+=",{Key=$extra_key,Value=$extra_value}"
done
INSTANCE_TAG_SPEC+="]"
RUN_INSTANCES_OUTPUT=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$IMAGE_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --hibernation-options Configured=true \
  --block-device-mappings "[{\"DeviceName\":\"$ROOT_DEVICE_NAME\",\"Ebs\":{\"DeleteOnTermination\":true,\"Encrypted\":true,\"VolumeSize\":$WORKER_ROOT_VOLUME_SIZE}}]" \
  --iam-instance-profile Arn="$INSTANCE_PROFILE_ARN" \
  --security-group-ids "$SECURITY_GROUP_ID" \
  --subnet-id "$SUBNET_ID" \
  --user-data file://"$TEMP_USER_DATA" \
  --tag-specifications "$INSTANCE_TAG_SPEC" "ResourceType=volume,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Name,Value=${INSTANCE_NAME}-volume}]")

INSTANCE_ID=$(printf '%s' "$RUN_INSTANCES_OUTPUT" | jq -r '.Instances[0].InstanceId')
PRIVATE_IP=$(printf '%s' "$RUN_INSTANCES_OUTPUT" | jq -r '.Instances[0].PrivateIpAddress // ""')
system_event_log "launch-worker.sh" "exit" "instance_id=${INSTANCE_ID} private_ip=${PRIVATE_IP} image_id=${IMAGE_ID}"
LAUNCH_REQUESTED_DETAILS=$(jq -cn \
  --arg instanceType "$INSTANCE_TYPE" \
  --arg subnetId "$SUBNET_ID" \
  --arg imageId "$IMAGE_ID" \
  --arg imageSource "$IMAGE_SOURCE" \
  --argjson requestedAtMs "$REQUESTED_AT_MS" \
  '{instanceType:$instanceType,subnetId:$subnetId,imageId:$imageId,imageSource:$imageSource,requestedAtMs:$requestedAtMs}')
LAUNCH_REQUEST_STARTED_DETAILS=$(jq -cn \
  --arg instanceType "$INSTANCE_TYPE" \
  --arg subnetId "$SUBNET_ID" \
  --arg imageId "$IMAGE_ID" \
  --arg imageSource "$IMAGE_SOURCE" \
  --argjson requestedAtMs "$REQUESTED_AT_MS" \
  '{instanceType:$instanceType,subnetId:$subnetId,imageId:$imageId,imageSource:$imageSource,requestedAtMs:$requestedAtMs}')
CREATE_DETAILS=$(jq -cn \
  --arg instanceType "$INSTANCE_TYPE" \
  --arg subnetId "$SUBNET_ID" \
  --arg imageId "$IMAGE_ID" \
  --arg imageSource "$IMAGE_SOURCE" \
  --argjson requestedAtMs "$REQUESTED_AT_MS" \
  '{instanceType:$instanceType,subnetId:$subnetId,imageId:$imageId,imageSource:$imageSource,requestedAtMs:$requestedAtMs}')
emit_event "$INSTANCE_ID" "$PRIVATE_IP" launch_request_started "$LAUNCH_REQUEST_STARTED_DETAILS" "$REQUESTED_AT_MS"
emit_event "$INSTANCE_ID" "$PRIVATE_IP" launch_requested "$LAUNCH_REQUESTED_DETAILS"
emit_event "$INSTANCE_ID" "$PRIVATE_IP" create "$CREATE_DETAILS"

(
  system_event_log "launch-worker.sh" "start" "wait_for_instance_running instance_id=${INSTANCE_ID}"
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
  system_event_log "launch-worker.sh" "exit" "instance_running instance_id=${INSTANCE_ID} elapsed_seconds=${RUNNING_ELAPSED_SECONDS}"
  if aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$INSTANCE_ID"; then
    STATUS_OK_AT_MS=$(($(date +%s) * 1000))
    STATUS_OK_ELAPSED_SECONDS=$(((STATUS_OK_AT_MS - REQUESTED_AT_MS) / 1000))
    INSTANCE_STATUS_OK_DETAILS=$(jq -cn \
      --argjson elapsedSeconds "$STATUS_OK_ELAPSED_SECONDS" \
      '{elapsedSeconds:$elapsedSeconds}')
    emit_event "$INSTANCE_ID" "$PRIVATE_IP" instance_status_ok "$INSTANCE_STATUS_OK_DETAILS"
    system_event_log "launch-worker.sh" "exit" "instance_status_ok instance_id=${INSTANCE_ID} elapsed_seconds=${STATUS_OK_ELAPSED_SECONDS}"
  fi
) >/dev/null 2>&1 & disown

printf '%s\n' "$RUN_INSTANCES_OUTPUT"
