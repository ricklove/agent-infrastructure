#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
set -a
source "${STATE_ROOT}/agent-swarm-monitor.env"
set +a
cd "${RUNTIME_ROOT}"
run_logged "request-workspace-persistence.sh" "target=src/manager/request-workspace-persistence.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/request-workspace-persistence.ts" "$@"
