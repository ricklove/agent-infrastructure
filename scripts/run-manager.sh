#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
set -a
source "${STATE_ROOT}/agent-swarm-monitor.env"
set +a
export AGENT_BROWSER_IDLE_TIMEOUT_MS="${AGENT_BROWSER_IDLE_TIMEOUT_MS:-300000}"
cd "${RUNTIME_ROOT}"
run_logged "run-manager.sh" "target=src/manager/server.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/server.ts" "$@"
