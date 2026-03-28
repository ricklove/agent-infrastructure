#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

RELEASE_BRANCH="${AGENT_RELEASE_BRANCH:-main}"
RELEASE_TAG="${1:-}"

if [[ ! -d "${RUNTIME_ROOT}/.git" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "missing_runtime_repo path=${RUNTIME_ROOT}"
  exit 1
fi

run_runtime_git() {
  git -C "${RUNTIME_ROOT}" "$@"
}

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

run_logged "deploy-manager-runtime.sh" "target=runtime-fetch" \
  run_runtime_git fetch --tags origin

TARGET_REF="origin/${RELEASE_BRANCH}"
TARGET_KIND="branch"

if [[ -n "${RELEASE_TAG}" ]]; then
  if ! run_runtime_git rev-parse -q --verify "refs/tags/${RELEASE_TAG}" >/dev/null 2>&1; then
    system_event_log "deploy-manager-runtime.sh" "error" "missing_release_tag tag=${RELEASE_TAG}"
    exit 1
  fi
  TARGET_REF="refs/tags/${RELEASE_TAG}"
  TARGET_KIND="tag"
fi

run_logged "deploy-manager-runtime.sh" "target=runtime-checkout ${TARGET_KIND}=${TARGET_REF}" \
  run_runtime_git checkout --detach "${TARGET_REF}"
run_logged "deploy-manager-runtime.sh" "target=runtime-install" \
  bash -lc "cd \"${RUNTIME_ROOT}\" && bun install --frozen-lockfile"
run_logged "deploy-manager-runtime.sh" "target=runtime-build-dashboard" \
  bash -lc "cd \"${RUNTIME_ROOT}\" && bun run build:dashboard"

terminate_matching_processes "${RUNTIME_ROOT}/packages/dashboard/src/server.ts" "dashboard-server"
terminate_matching_processes "${RUNTIME_ROOT}/packages/agent-chat-server/src/index.ts" "agent-chat-server"
terminate_matching_processes "${RUNTIME_ROOT}/packages/projects-server/src/index.ts" "projects-server"

RUNTIME_REVISION="$(run_runtime_git rev-parse HEAD)"
TARGET_COMMIT="${RUNTIME_REVISION}"
printf '{"ok":true,"sourceRepo":"%s","baseBranch":"%s","releaseBranch":"%s","releaseTag":"%s","targetCommit":"%s","runtimeDir":"%s","runtimeRevision":"%s"}\n' \
  "" \
  "" \
  "${RELEASE_BRANCH}" \
  "${RELEASE_TAG}" \
  "${TARGET_COMMIT}" \
  "${RUNTIME_ROOT}" \
  "${RUNTIME_REVISION}"
