#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
set -a
source "${STATE_ROOT}/agent-swarm-monitor.env"
set +a
cd "${RUNTIME_ROOT}"
run_logged "run-manager-controller.sh" "target=src/manager/manager-controller.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/manager-controller.ts" "$@"
