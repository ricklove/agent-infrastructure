#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/setup-common.sh"

setup_common_system_event_log "scripts/setup.sh" "setup.start" "phase=bootstrap"
setup_common_parse_args "$@"
setup_common_prepare_environment
setup_common_install_prereqs

role="$(setup_common_role_from_runtime_target)"
if [[ -z "${role}" ]]; then
  role="manager"
fi

case "${role}" in
  manager)
    target_script="${RUNTIME_ROOT}/scripts/setup-manager.sh"
    ;;
  admin)
    target_script="${RUNTIME_ROOT}/scripts/setup-admin.sh"
    ;;
  worker)
    target_script="${RUNTIME_ROOT}/scripts/setup-worker.sh"
    ;;
  *)
    printf '[setup] unsupported role in runtime target: %s\n' "${role}" >&2
    exit 1
    ;;
esac

setup_common_system_event_log "scripts/setup.sh" "dispatch" "role=${role} target=${target_script}"
exec env AGENT_SETUP_BOOTSTRAPPED=1 bash "${target_script}" \
  --runtime-dir "${RUNTIME_ROOT}" \
  --state-dir "${STATE_ROOT}" \
  --workspace-dir "${WORKSPACE_ROOT}" \
  --bootstrap-context "${BOOTSTRAP_CONTEXT_PATH}" \
  --runtime-target "${RUNTIME_TARGET_PATH}"
