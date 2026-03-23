#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

SOURCE_REPO="${AGENT_SOURCE_REPO:-${WORKSPACE_ROOT}/projects/agent-infrastructure}"
TARGET_REVISION="${1:-}"

if [[ -z "${TARGET_REVISION}" ]]; then
  TARGET_REVISION="$(git -C "${SOURCE_REPO}" rev-parse HEAD)"
fi

if [[ ! -d "${SOURCE_REPO}/.git" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "missing_source_repo path=${SOURCE_REPO}"
  exit 1
fi

if [[ ! -d "${RUNTIME_ROOT}/.git" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "missing_runtime_repo path=${RUNTIME_ROOT}"
  exit 1
fi

if [[ -n "$(git -C "${SOURCE_REPO}" status --short)" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "dirty_source_repo path=${SOURCE_REPO}"
  exit 1
fi

terminate_matching_processes() {
  local pattern="$1"
  local label="$2"
  mapfile -t pids < <(pgrep -f "${pattern}" || true)

  if [[ "${#pids[@]}" -eq 0 ]]; then
    system_event_log "deploy-manager-runtime.sh" "skip" "target=${label} reason=no_matching_process"
    return
  fi

  system_event_log "deploy-manager-runtime.sh" "start" "target=${label} signal=SIGTERM pids=${pids[*]}"
  kill "${pids[@]}"

  local pid
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    local remaining=0
    for pid in "${pids[@]}"; do
      if kill -0 "${pid}" 2>/dev/null; then
        remaining=1
        break
      fi
    done
    if [[ "${remaining}" -eq 0 ]]; then
      system_event_log "deploy-manager-runtime.sh" "exit" "target=${label} signal=SIGTERM"
      return
    fi
    sleep 1
  done

  system_event_log "deploy-manager-runtime.sh" "warn" "target=${label} signal=SIGKILL pids=${pids[*]}"
  kill -KILL "${pids[@]}" 2>/dev/null || true
}

run_logged "deploy-manager-runtime.sh" "target=runtime-checkout revision=${TARGET_REVISION}" \
  git -C "${RUNTIME_ROOT}" fetch --tags origin
run_logged "deploy-manager-runtime.sh" "target=runtime-checkout revision=${TARGET_REVISION}" \
  git -C "${RUNTIME_ROOT}" checkout --detach "${TARGET_REVISION}"
run_logged "deploy-manager-runtime.sh" "target=runtime-install" \
  bun --cwd "${RUNTIME_ROOT}" install --frozen-lockfile
run_logged "deploy-manager-runtime.sh" "target=runtime-build-dashboard" \
  bun --cwd "${RUNTIME_ROOT}" run build:dashboard

terminate_matching_processes "${RUNTIME_ROOT}/packages/dashboard/src/server.ts" "dashboard-server"
terminate_matching_processes "${RUNTIME_ROOT}/packages/agent-chat-server/src/index.ts" "agent-chat-server"

RUNTIME_REVISION="$(git -C "${RUNTIME_ROOT}" rev-parse HEAD)"
printf '{"ok":true,"runtimeDir":"%s","sourceRepo":"%s","targetRevision":"%s","runtimeRevision":"%s"}\n' \
  "${RUNTIME_ROOT}" \
  "${SOURCE_REPO}" \
  "${TARGET_REVISION}" \
  "${RUNTIME_REVISION}"
