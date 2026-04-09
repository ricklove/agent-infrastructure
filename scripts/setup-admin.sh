#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-common.sh"

setup_common_system_event_log "scripts/setup-admin.sh" "setup.start" "phase=bootstrap"
setup_common_parse_args "$@"
setup_common_prepare_environment
setup_common_install_prereqs

cd "$RUNTIME_ROOT"
setup_common_system_event_run "scripts/setup-admin.sh" "target=bun-install" bun install --frozen-lockfile
setup_common_system_event_run "scripts/setup-admin.sh" "target=run-setup-admin-host" \
  bun run --filter @agent-infrastructure/swarm-manager run:setup-admin-host -- \
  --runtime-dir "$RUNTIME_ROOT" \
  --state-dir "$STATE_ROOT" \
  --workspace-dir "$WORKSPACE_ROOT" \
  --host-root "$RUNTIME_ROOT" \
  --bootstrap-context "$BOOTSTRAP_CONTEXT_PATH"

setup_common_system_event_log "scripts/setup-admin.sh" "setup.complete" "phase=bootstrap"
