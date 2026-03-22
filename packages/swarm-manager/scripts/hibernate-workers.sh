#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
export AGENT_GITHUB_CONFIG_ROOT="${AGENT_GITHUB_CONFIG_ROOT:-/home/ec2-user/.config/agent-github}"
export GIT_ASKPASS="${RUNTIME_ROOT}/packages/swarm-manager/scripts/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0
cd "${RUNTIME_ROOT}"
run_logged "hibernate-workers.sh" "target=src/manager/worker-power.ts action=hibernate args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/worker-power.ts" --action hibernate "$@"
