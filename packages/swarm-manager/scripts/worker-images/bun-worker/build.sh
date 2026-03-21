#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW_NAME="bun-worker"
WORKFLOW_ARCHIVE_PATH="$(mktemp)"

usage() {
  cat <<'EOF'
Usage:
  build.sh \
    --region us-east-1 \
    --base-ami-id ami-... \
    --subnet-id subnet-... \
    --security-group-id sg-... \
    (--instance-profile-name profile-name | --instance-profile-arn arn:...) \
    [--builder-instance-type t3.small] \
    [--image-name agent-swarm-bun-worker-2026-03-18]

This launches a normal worker candidate from the source worker image,
provisions it with the paired `provision.sh`, creates an AMI, waits for
it to become available, then terminates the candidate.
EOF
}

require_arg() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "missing required argument: $name" >&2
    usage >&2
    exit 1
  fi
}

wait_for_ssm() {
  local instance_id="$1"
  local region="$2"
  local attempts=90
  local attempt=0
  while (( attempt < attempts )); do
    local instance_state
    instance_state="$(aws ec2 describe-instances \
      --region "$region" \
      --instance-ids "$instance_id" \
      --query 'Reservations[0].Instances[0].State.Name' \
      --output text)"

    if [[ "$instance_state" != "running" ]]; then
      sleep 2
      ((attempt+=1))
      continue
    fi

    local ssm_status
    ssm_status="$(aws ssm describe-instance-information \
      --region "$region" \
      --filters "Key=InstanceIds,Values=$instance_id" \
      --query 'InstanceInformationList[0].PingStatus' \
      --output text 2>/dev/null || true)"
    if [[ "$ssm_status" == "Online" ]]; then
      return 0
    fi

    sleep 4
    ((attempt+=1))
  done

  echo "builder instance did not become SSM-ready: $instance_id" >&2
  return 1
}

send_provision_command() {
  local instance_id="$1"
  local region="$2"
  local workflow_archive_b64="$3"

  local commands_json
  commands_json="$(jq -cn \
    --arg workflowArchiveB64 "$workflow_archive_b64" \
    '{
      commands: [
        "set -euo pipefail",
        "mkdir -p /tmp/agent-swarm-worker-image",
        "printf %s " + ($workflowArchiveB64 | @sh) + " | base64 -d > /tmp/agent-swarm-worker-image/workflow.tgz",
        "tar -xzf /tmp/agent-swarm-worker-image/workflow.tgz -C /tmp/agent-swarm-worker-image",
        "cd /tmp/agent-swarm-worker-image",
        "chmod +x /tmp/agent-swarm-worker-image/provision.sh",
        "./provision.sh"
      ]
    }')"

  local command_id
  command_id="$(aws ssm send-command \
    --region "$region" \
    --instance-ids "$instance_id" \
    --document-name AWS-RunShellScript \
    --comment "Provision $WORKFLOW_NAME builder" \
    --parameters "$commands_json" \
    --query 'Command.CommandId' \
    --output text)"

  local attempts=180
  local attempt=0
  while (( attempt < attempts )); do
    local status
    status="$(aws ssm get-command-invocation \
      --region "$region" \
      --command-id "$command_id" \
      --instance-id "$instance_id" \
      --query 'Status' \
      --output text 2>/dev/null || true)"
    case "$status" in
      Success)
        break
        ;;
      Failed|TimedOut|Cancelled|Cancelling)
        aws ssm get-command-invocation \
          --region "$region" \
          --command-id "$command_id" \
          --instance-id "$instance_id" \
          --query '{Status:Status,StandardOutputContent:StandardOutputContent,StandardErrorContent:StandardErrorContent}' \
          --output json >&2
        return 1
        ;;
    esac
    sleep 5
    ((attempt+=1))
  done

  if (( attempt == attempts )); then
    echo "timed out waiting for provision command: $command_id" >&2
    return 1
  fi

  aws ssm get-command-invocation \
    --region "$region" \
    --command-id "$command_id" \
    --instance-id "$instance_id" \
    --query '{Status:Status,StandardOutputContent:StandardOutputContent,StandardErrorContent:StandardErrorContent}' \
    --output json
}

REGION=""
BASE_AMI_ID=""
SUBNET_ID=""
SECURITY_GROUP_ID=""
INSTANCE_PROFILE_NAME=""
INSTANCE_PROFILE_ARN=""
BUILDER_INSTANCE_TYPE="t3.small"
IMAGE_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)
      REGION="$2"
      shift 2
      ;;
    --base-ami-id)
      BASE_AMI_ID="$2"
      shift 2
      ;;
    --subnet-id)
      SUBNET_ID="$2"
      shift 2
      ;;
    --security-group-id)
      SECURITY_GROUP_ID="$2"
      shift 2
      ;;
    --instance-profile-name)
      INSTANCE_PROFILE_NAME="$2"
      shift 2
      ;;
    --instance-profile-arn)
      INSTANCE_PROFILE_ARN="$2"
      shift 2
      ;;
    --builder-instance-type)
      BUILDER_INSTANCE_TYPE="$2"
      shift 2
      ;;
    --image-name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_arg --region "$REGION"
require_arg --base-ami-id "$BASE_AMI_ID"
require_arg --subnet-id "$SUBNET_ID"
require_arg --security-group-id "$SECURITY_GROUP_ID"
if [[ -z "$INSTANCE_PROFILE_NAME" && -z "$INSTANCE_PROFILE_ARN" ]]; then
  echo "either --instance-profile-name or --instance-profile-arn is required" >&2
  usage >&2
  exit 1
fi

if [[ -z "$IMAGE_NAME" ]]; then
  IMAGE_NAME="agent-swarm-${WORKFLOW_NAME}-$(date -u +%Y%m%d-%H%M%S)"
fi

tar -C "$SCRIPT_DIR" -czf "$WORKFLOW_ARCHIVE_PATH" .
WORKFLOW_ARCHIVE_B64="$(base64 -w0 "$WORKFLOW_ARCHIVE_PATH")"

INSTANCE_PROFILE_ARG=()
if [[ -n "$INSTANCE_PROFILE_ARN" ]]; then
  INSTANCE_PROFILE_ARG=(--iam-instance-profile "Arn=$INSTANCE_PROFILE_ARN")
else
  INSTANCE_PROFILE_ARG=(--iam-instance-profile "Name=$INSTANCE_PROFILE_NAME")
fi

BUILDER_INSTANCE_ID=""
cleanup() {
  rm -f "$WORKFLOW_ARCHIVE_PATH"
  if [[ -n "$BUILDER_INSTANCE_ID" ]]; then
    aws ec2 terminate-instances \
      --region "$REGION" \
      --instance-ids "$BUILDER_INSTANCE_ID" \
      >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

RUN_OUTPUT="$(bash /home/ec2-user/runtime/launch-worker.sh \
  --instance-type "$BUILDER_INSTANCE_TYPE" \
  --image-id "$BASE_AMI_ID" \
  --name "${WORKFLOW_NAME}-builder" \
  --tag "WorkerImageWorkflow=${WORKFLOW_NAME}" \
  --tag "WorkerImageCandidate=true")"

BUILDER_INSTANCE_ID="$(printf '%s' "$RUN_OUTPUT" | jq -r '.Instances[0].InstanceId')"

wait_for_ssm "$BUILDER_INSTANCE_ID" "$REGION" >/dev/null

PROVISION_RESULT="$(send_provision_command \
  "$BUILDER_INSTANCE_ID" \
  "$REGION" \
  "$WORKFLOW_ARCHIVE_B64")"

IMAGE_ID="$(aws ec2 create-image \
  --region "$REGION" \
  --instance-id "$BUILDER_INSTANCE_ID" \
  --name "$IMAGE_NAME" \
  --tag-specifications "ResourceType=image,Tags=[{Key=Name,Value=$IMAGE_NAME},{Key=WorkerImageWorkflow,Value=${WORKFLOW_NAME}}]" \
  --query 'ImageId' \
  --output text)"

aws ec2 wait image-available \
  --region "$REGION" \
  --image-ids "$IMAGE_ID"

trap - EXIT
cleanup

jq -cn \
  --arg workflow "$WORKFLOW_NAME" \
  --arg builderInstanceId "$BUILDER_INSTANCE_ID" \
  --arg imageId "$IMAGE_ID" \
  --arg imageName "$IMAGE_NAME" \
  --argjson provisionResult "$PROVISION_RESULT" \
  '{ok:true,workflow:$workflow,builderInstanceId:$builderInstanceId,imageId:$imageId,imageName:$imageName,provisionResult:$provisionResult}'
