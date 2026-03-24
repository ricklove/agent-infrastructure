#!/usr/bin/env bash
set -euo pipefail

stack_name=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack-name)
      stack_name="${2:-}"
      shift 2
      ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${stack_name}" ]]; then
  printf 'missing --stack-name\n' >&2
  exit 1
fi

aws_cli_base_args=()
if [[ -n "${AWS_PROFILE:-}" ]]; then
  aws_cli_base_args+=(--profile "${AWS_PROFILE}")
fi
if [[ -n "${AWS_REGION:-}" ]]; then
  aws_cli_base_args+=(--region "${AWS_REGION}")
elif [[ -n "${AWS_DEFAULT_REGION:-}" ]]; then
  aws_cli_base_args+=(--region "${AWS_DEFAULT_REGION}")
elif [[ -n "${CDK_DEFAULT_REGION:-}" ]]; then
  aws_cli_base_args+=(--region "${CDK_DEFAULT_REGION}")
else
  configured_region="$(aws "${aws_cli_base_args[@]}" configure get region 2>/dev/null || true)"
  if [[ -n "${configured_region}" ]]; then
    aws_cli_base_args+=(--region "${configured_region}")
  fi
fi

if [[ "${#aws_cli_base_args[@]}" -eq 0 || " ${aws_cli_base_args[*]} " != *" --region "* ]]; then
  printf 'unable to determine AWS region for Secrets Manager writes\n' >&2
  exit 1
fi

aws_text() {
  aws "${aws_cli_base_args[@]}" "$@" --output text 2>/dev/null || true
}

ensure_secret() {
  local secret_name="$1"
  local secret_value="$2"
  local description="$3"
  local secret_arn
  local current_value

  secret_arn="$(aws_text secretsmanager describe-secret --secret-id "${secret_name}" --query 'ARN')"
  if [[ -z "${secret_arn}" || "${secret_arn}" == "None" ]]; then
    secret_arn="$(
      aws "${aws_cli_base_args[@]}" secretsmanager create-secret \
        --name "${secret_name}" \
        --description "${description}" \
        --secret-string "${secret_value}" \
        --query 'ARN' \
        --output text
    )"
    printf '%s\n' "${secret_arn}"
    return
  fi

  current_value="$(aws_text secretsmanager get-secret-value --secret-id "${secret_name}" --query 'SecretString')"
  if [[ "${current_value}" != "${secret_value}" ]]; then
    aws "${aws_cli_base_args[@]}" secretsmanager put-secret-value \
      --secret-id "${secret_name}" \
      --secret-string "${secret_value}" >/dev/null
  fi

  printf '%s\n' "${secret_arn}"
}

resolve_current_secret() {
  local function_name
  local current_secret

  if [[ -n "${DASHBOARD_ENROLLMENT_SECRET:-}" ]]; then
    printf '%s\n' "${DASHBOARD_ENROLLMENT_SECRET}"
    return
  fi

  function_name="$(aws_text cloudformation describe-stack-resources --stack-name "${stack_name}" --logical-resource-id "DashboardAccessFunctionAE9E050D" --query 'StackResources[0].PhysicalResourceId')"
  if [[ -n "${function_name}" && "${function_name}" != "None" ]]; then
    current_secret="$(aws_text lambda get-function-configuration --function-name "${function_name}" --query 'Environment.Variables.DASHBOARD_ENROLLMENT_SECRET')"
    if [[ -n "${current_secret}" && "${current_secret}" != "None" ]]; then
      printf '%s\n' "${current_secret}"
      return
    fi
  fi

  openssl rand -hex 32
}

secret_name="/agent-infrastructure/${stack_name}/dashboard/enrollment-secret"
secret_value="$(resolve_current_secret)"
ensure_secret "${secret_name}" "${secret_value}" "Dashboard enrollment secret for ${stack_name}" >/dev/null
printf '%s\n' "${secret_name}"
