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

cloudflare_root="${HOME}/.cloudflared"
zone_config_path="${cloudflare_root}/zone-config.json"
stack_config_dir="${cloudflare_root}/stack-tunnels"
stack_config_path="${stack_config_dir}/${stack_name}.json"

if [[ ! -f "${zone_config_path}" ]]; then
  printf 'zone config not found: %s\n' "${zone_config_path}" >&2
  exit 1
fi

zone_name="$(jq -r '.zoneName // ""' "${zone_config_path}")"
origin_cert_path="$(jq -r '.originCertPath // ""' "${zone_config_path}")"
tunnel_prefix="$(jq -r '.tunnelPrefix // ""' "${zone_config_path}")"

if [[ -z "${zone_name}" || -z "${origin_cert_path}" || -z "${tunnel_prefix}" ]]; then
  printf 'zone config must include zoneName, originCertPath, and tunnelPrefix\n' >&2
  exit 1
fi

if [[ ! -f "${origin_cert_path}" ]]; then
  printf 'origin cert not found: %s\n' "${origin_cert_path}" >&2
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
  configured_region="$(
    aws "${aws_cli_base_args[@]}" configure get region 2>/dev/null || true
  )"
  if [[ -n "${configured_region}" ]]; then
    aws_cli_base_args+=(--region "${configured_region}")
  fi
fi

if [[ "${#aws_cli_base_args[@]}" -eq 0 || " ${aws_cli_base_args[*]} " != *" --region "* ]]; then
  printf 'unable to determine AWS region for Secrets Manager writes\n' >&2
  exit 1
fi

tunnel_name="$(printf '%s-%s' "${tunnel_prefix}" "${stack_name}" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"

tunnel_list_json="$(cloudflared tunnel --origincert "${origin_cert_path}" list --output json --name "${tunnel_name}")"
tunnel_id="$(printf '%s' "${tunnel_list_json}" | jq -r 'if type=="array" and length>0 then .[0].id // "" else "" end')"

if [[ -z "${tunnel_id}" ]]; then
  create_output="$(cloudflared tunnel --origincert "${origin_cert_path}" create "${tunnel_name}")"
  tunnel_id="$(printf '%s' "${create_output}" | sed -nE 's/.*id ([0-9a-f-]{36}).*/\1/p' | head -n1)"
fi

if [[ -z "${tunnel_id}" ]]; then
  printf 'failed to create or resolve tunnel id for %s\n' "${tunnel_name}" >&2
  exit 1
fi

tunnel_token="$(cloudflared tunnel --origincert "${origin_cert_path}" token "${tunnel_name}" | tr -d '\n')"
if [[ -z "${tunnel_token}" ]]; then
  printf 'failed to fetch tunnel token for %s\n' "${tunnel_name}" >&2
  exit 1
fi

ensure_secret() {
  local secret_name="$1"
  local secret_value="$2"
  local description="$3"
  local secret_arn
  local current_value

  secret_arn="$(
    aws "${aws_cli_base_args[@]}" secretsmanager describe-secret \
      --secret-id "${secret_name}" \
      --query 'ARN' \
      --output text 2>/dev/null || true
  )"

  if [[ -z "${secret_arn}" || "${secret_arn}" == "None" ]]; then
    secret_arn="$(
      aws "${aws_cli_base_args[@]}" secretsmanager create-secret \
        --name "${secret_name}" \
        --description "${description}" \
        --secret-string "${secret_value}" \
        --query 'ARN' \
        --output text
    )"
    printf '%s' "${secret_arn}"
    return
  fi

  current_value="$(
    aws "${aws_cli_base_args[@]}" secretsmanager get-secret-value \
      --secret-id "${secret_name}" \
      --query 'SecretString' \
      --output text 2>/dev/null || true
  )"

  if [[ "${current_value}" != "${secret_value}" ]]; then
    aws "${aws_cli_base_args[@]}" secretsmanager put-secret-value \
      --secret-id "${secret_name}" \
      --secret-string "${secret_value}" >/dev/null
  fi

  printf '%s' "${secret_arn}"
}

ensure_parameter() {
  local parameter_name="$1"
  local parameter_value="$2"

  if aws "${aws_cli_base_args[@]}" ssm get-parameter --name "${parameter_name}" >/dev/null 2>&1; then
    aws "${aws_cli_base_args[@]}" ssm put-parameter \
      --name "${parameter_name}" \
      --type String \
      --overwrite \
      --value "${parameter_value}" >/dev/null
  else
    aws "${aws_cli_base_args[@]}" ssm put-parameter \
      --name "${parameter_name}" \
      --type String \
      --value "${parameter_value}" >/dev/null
  fi
}

tunnel_token_secret_name="/agent-infrastructure/${stack_name}/cloudflare/tunnel-token"
tunnel_config_parameter_name="/agent-infrastructure/${stack_name}/cloudflare/config"
tunnel_token_secret_arn="$(
  ensure_secret \
    "${tunnel_token_secret_name}" \
    "${tunnel_token}" \
    "Cloudflare named tunnel token for ${stack_name}"
)"

if [[ -z "${tunnel_token_secret_arn}" || "${tunnel_token_secret_arn}" == "None" ]]; then
  printf 'failed to resolve tunnel token secret arn for %s\n' "${stack_name}" >&2
  exit 1
fi

hostname_base="${tunnel_name}.${zone_name}"
wildcard_hostname="*.${hostname_base}"

cloudflared tunnel --origincert "${origin_cert_path}" route dns "${tunnel_name}" "${wildcard_hostname}" >/dev/null

tunnel_config_json="$(
  jq -cn \
    --arg zoneName "${zone_name}" \
    --arg tunnelId "${tunnel_id}" \
    --arg tunnelName "${tunnel_name}" \
    --arg hostnameBase "${hostname_base}" \
    '{
      zoneName: $zoneName,
      tunnelId: $tunnelId,
      tunnelName: $tunnelName,
      hostnameBase: $hostnameBase
    }'
)"
ensure_parameter "${tunnel_config_parameter_name}" "${tunnel_config_json}"

mkdir -p "${stack_config_dir}"
jq -n \
  --arg tunnelConfigParameterName "${tunnel_config_parameter_name}" \
  '{
    tunnelConfigParameterName: $tunnelConfigParameterName
  }' > "${stack_config_path}"

printf '%s\n' "${stack_config_path}"
