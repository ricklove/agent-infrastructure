#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  printf 'usage: %s <cdk-subcommand> [args...]\n' "$0" >&2
  exit 1
fi

subcommand="$1"
shift

stack_name="${STACK_NAME:-AgentAdminCdk}"
bash "$(dirname "${BASH_SOURCE[0]}")/../../aws-setup/scripts/prepare-dashboard-enrollment-secret.sh" --stack-name "${stack_name}" >/dev/null

cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec cdk "${subcommand}" "$@"
