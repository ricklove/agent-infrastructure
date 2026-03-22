#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
export AGENT_GITHUB_CONFIG_ROOT="${AGENT_GITHUB_CONFIG_ROOT:-/home/ec2-user/.config/agent-github}"
export GIT_ASKPASS="${RUNTIME_ROOT}/packages/swarm-manager/scripts/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0
cd "${RUNTIME_ROOT}"
run_logged "publish-worker-runtime-release.sh" "target=src/manager/publish-worker-runtime-release.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/publish-worker-runtime-release.ts" "$@"
