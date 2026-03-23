#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

SOURCE_REPO="${AGENT_SOURCE_REPO:-${WORKSPACE_ROOT}/projects/agent-infrastructure}"
BASE_BRANCH="${AGENT_BASE_BRANCH:-development}"
RELEASE_BRANCH="${AGENT_RELEASE_BRANCH:-main}"
RELEASE_TAG="${1:-}"

if [[ -z "${RELEASE_TAG}" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "missing_release_tag"
  printf 'usage: bun run deploy-manager-runtime <release-tag>\n' >&2
  exit 1
fi

if [[ ! -d "${SOURCE_REPO}/.git" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "missing_source_repo path=${SOURCE_REPO}"
  exit 1
fi

if [[ ! -d "${RUNTIME_ROOT}/.git" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "missing_runtime_repo path=${RUNTIME_ROOT}"
  exit 1
fi

run_git() {
  git -C "${SOURCE_REPO}" "$@"
}

run_runtime_git() {
  git -C "${RUNTIME_ROOT}" "$@"
}

if [[ -n "$(run_git status --short)" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "dirty_source_repo path=${SOURCE_REPO}"
  exit 1
fi

CURRENT_BRANCH="$(run_git branch --show-current)"
if [[ "${CURRENT_BRANCH}" != "${BASE_BRANCH}" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "unexpected_branch branch=${CURRENT_BRANCH} expected=${BASE_BRANCH}"
  exit 1
fi

run_logged "deploy-manager-runtime.sh" "target=source-fetch" \
  run_git fetch --tags origin

TARGET_COMMIT="$(run_git rev-parse HEAD)"
BASE_REMOTE_COMMIT="$(run_git rev-parse "origin/${BASE_BRANCH}")"
RELEASE_REMOTE_COMMIT="$(run_git rev-parse "origin/${RELEASE_BRANCH}")"

if [[ "${TARGET_COMMIT}" != "${BASE_REMOTE_COMMIT}" ]]; then
  system_event_log "deploy-manager-runtime.sh" "error" "base_branch_not_synced branch=${BASE_BRANCH} head=${TARGET_COMMIT} origin=${BASE_REMOTE_COMMIT}"
  exit 1
fi

if ! run_git merge-base --is-ancestor "${RELEASE_REMOTE_COMMIT}" "${TARGET_COMMIT}"; then
  system_event_log "deploy-manager-runtime.sh" "error" "release_branch_not_fast_forward release_branch=${RELEASE_BRANCH} release_head=${RELEASE_REMOTE_COMMIT} target=${TARGET_COMMIT}"
  exit 1
fi

if run_git rev-parse -q --verify "refs/tags/${RELEASE_TAG}" >/dev/null 2>&1; then
  TAG_COMMIT="$(run_git rev-list -n 1 "${RELEASE_TAG}")"
  if [[ "${TAG_COMMIT}" != "${TARGET_COMMIT}" ]]; then
    system_event_log "deploy-manager-runtime.sh" "error" "tag_points_elsewhere tag=${RELEASE_TAG} tag_commit=${TAG_COMMIT} target=${TARGET_COMMIT}"
    exit 1
  fi
else
  run_logged "deploy-manager-runtime.sh" "target=create-tag tag=${RELEASE_TAG} commit=${TARGET_COMMIT}" \
    run_git tag -a "${RELEASE_TAG}" -m "Release ${RELEASE_TAG}" "${TARGET_COMMIT}"
fi

run_logged "deploy-manager-runtime.sh" "target=promote-release-branch release_branch=${RELEASE_BRANCH} commit=${TARGET_COMMIT}" \
  run_git push origin "${TARGET_COMMIT}:refs/heads/${RELEASE_BRANCH}"
run_logged "deploy-manager-runtime.sh" "target=push-tag tag=${RELEASE_TAG}" \
  run_git push origin "refs/tags/${RELEASE_TAG}"

run_logged "deploy-manager-runtime.sh" "target=update-local-release-branch release_branch=${RELEASE_BRANCH} commit=${TARGET_COMMIT}" \
  run_git update-ref "refs/heads/${RELEASE_BRANCH}" "${TARGET_COMMIT}"

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
run_logged "deploy-manager-runtime.sh" "target=runtime-checkout tag=${RELEASE_TAG}" \
  run_runtime_git checkout --detach "refs/tags/${RELEASE_TAG}"
run_logged "deploy-manager-runtime.sh" "target=runtime-install" \
  bash -lc "cd \"${RUNTIME_ROOT}\" && bun install --frozen-lockfile"
run_logged "deploy-manager-runtime.sh" "target=runtime-build-dashboard" \
  bash -lc "cd \"${RUNTIME_ROOT}\" && bun run build:dashboard"

terminate_matching_processes "${RUNTIME_ROOT}/packages/dashboard/src/server.ts" "dashboard-server"
terminate_matching_processes "${RUNTIME_ROOT}/packages/agent-chat-server/src/index.ts" "agent-chat-server"

RUNTIME_REVISION="$(run_runtime_git rev-parse HEAD)"
printf '{"ok":true,"sourceRepo":"%s","baseBranch":"%s","releaseBranch":"%s","releaseTag":"%s","targetCommit":"%s","runtimeDir":"%s","runtimeRevision":"%s"}\n' \
  "${SOURCE_REPO}" \
  "${BASE_BRANCH}" \
  "${RELEASE_BRANCH}" \
  "${RELEASE_TAG}" \
  "${TARGET_COMMIT}" \
  "${RUNTIME_ROOT}" \
  "${RUNTIME_REVISION}"
