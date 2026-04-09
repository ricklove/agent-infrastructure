#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-common.sh"

setup_common_system_event_log "scripts/setup-worker.sh" "setup.start" "phase=bootstrap"
setup_common_parse_args "$@"
setup_common_prepare_environment
setup_common_install_prereqs

setup_common_system_event_run "scripts/setup-worker.sh" "target=dnf-install-docker" dnf install -y docker
setup_common_system_event_run "scripts/setup-worker.sh" "target=enable-docker" systemctl enable --now docker
usermod -aG docker ec2-user

cd "$RUNTIME_ROOT"
setup_common_system_event_run "scripts/setup-worker.sh" "target=bun-install" bun install --frozen-lockfile
setup_common_system_event_run "scripts/setup-worker.sh" "target=run-setup-worker-host" \
  bun run --filter @agent-infrastructure/swarm-manager run:setup-worker-host -- \
  --runtime-dir "$RUNTIME_ROOT" \
  --state-dir "$STATE_ROOT" \
  --workspace-dir "$WORKSPACE_ROOT" \
  --host-root "$RUNTIME_ROOT" \
  --bootstrap-context "$BOOTSTRAP_CONTEXT_PATH"

setup_common_system_event_log "scripts/setup-worker.sh" "setup.complete" "phase=bootstrap"
