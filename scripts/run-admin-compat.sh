#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ -f "${STATE_ROOT}/agent-admin.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${STATE_ROOT}/agent-admin.env"
  set +a
fi

cd "${RUNTIME_ROOT}"
run_logged "run-admin-compat.sh" "target=src/admin/compat-server.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/admin/compat-server.ts" "$@"
