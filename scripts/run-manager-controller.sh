#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
set -a
source "${STATE_ROOT}/agent-swarm-monitor.env"
set +a
export AGENT_BROWSER_IDLE_TIMEOUT_MS="${AGENT_BROWSER_IDLE_TIMEOUT_MS:-300000}"
cd "${RUNTIME_ROOT}"
run_logged "run-manager-controller.sh" "target=src/manager/manager-controller.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/manager-controller.ts" "$@"
