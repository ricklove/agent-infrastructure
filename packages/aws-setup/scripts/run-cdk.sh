#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  printf 'usage: %s <cdk-subcommand> [args...]\n' "$0" >&2
  exit 1
fi

subcommand="$1"
shift

stack_name="${STACK_NAME:-}"
expect_stack_name_value=0

for arg in "$@"; do
  if [[ "${expect_stack_name_value}" -eq 1 ]]; then
    if [[ "${arg}" == stackName=* ]]; then
      stack_name="${arg#stackName=}"
    fi
    expect_stack_name_value=0
    continue
  fi

  case "${arg}" in
    -c|--context)
      expect_stack_name_value=1
      ;;
    stackName=*)
      stack_name="${arg#stackName=}"
      ;;
  esac
done

if [[ -z "${stack_name}" ]]; then
  stack_name="AgentSwarmAwsSetup"
fi

zone_config_path="${HOME}/.cloudflared/zone-config.json"
if [[ -f "${zone_config_path}" ]]; then
  bash "$(dirname "${BASH_SOURCE[0]}")/prepare-cloudflare-tunnel.sh" --stack-name "${stack_name}" >/dev/null
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec cdk "${subcommand}" "$@"
