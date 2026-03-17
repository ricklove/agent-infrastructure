#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:-AgentSwarmAwsSetup}"
if [[ $# -gt 0 ]]; then
  shift
fi

resolve_region() {
  if [[ -n "${AWS_REGION:-}" ]]; then
    printf '%s\n' "${AWS_REGION}"
    return
  fi

  if [[ -n "${AWS_DEFAULT_REGION:-}" ]]; then
    printf '%s\n' "${AWS_DEFAULT_REGION}"
    return
  fi

  if [[ -n "${CDK_DEFAULT_REGION:-}" ]]; then
    printf '%s\n' "${CDK_DEFAULT_REGION}"
    return
  fi

  local configured_region
  configured_region="$(aws configure get region 2>/dev/null || true)"
  if [[ -n "${configured_region}" ]]; then
    printf '%s\n' "${configured_region}"
    return
  fi

  echo "Unable to determine AWS region. Set AWS_REGION or AWS_DEFAULT_REGION." >&2
  exit 1
}

REGION="$(resolve_region)"
SWARM_TAG="$(aws cloudformation describe-stacks \
  --region "${REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='SwarmTag'].OutputValue | [0]" \
  --output text)"

if [[ -z "${SWARM_TAG}" || "${SWARM_TAG}" == "None" ]]; then
  echo "Could not find SwarmTag output for stack ${STACK_NAME} in ${REGION}." >&2
  exit 1
fi

SWARM_TAG_KEY="${SWARM_TAG%%=*}"
SWARM_TAG_VALUE="${SWARM_TAG#*=}"

INSTANCE_IDS="$(aws ec2 describe-instances \
  --region "${REGION}" \
  --filters \
    "Name=tag:${SWARM_TAG_KEY},Values=${SWARM_TAG_VALUE}" \
    "Name=tag:Role,Values=agent-swarm-worker" \
    "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query "Reservations[].Instances[].InstanceId" \
  --output text)"

if [[ -n "${INSTANCE_IDS}" && "${INSTANCE_IDS}" != "None" ]]; then
  echo "Terminating swarm worker instances for ${STACK_NAME}: ${INSTANCE_IDS}" >&2
  aws ec2 terminate-instances \
    --region "${REGION}" \
    --instance-ids ${INSTANCE_IDS} \
    >/dev/null

  aws ec2 wait instance-terminated \
    --region "${REGION}" \
    --instance-ids ${INSTANCE_IDS}
fi

bunx cdk destroy "${STACK_NAME}" --force "$@"
