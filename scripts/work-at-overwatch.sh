#!/usr/bin/env bash
set -euo pipefail

STATE_ROOT="${AGENT_STATE_DIR:-/home/ec2-user/state}"
RUNTIME_ROOT="${AGENT_RUNTIME_DIR:-/home/ec2-user/runtime}"
REGISTRY_PATH="${WORK_AT_REGISTRY_PATH:-${STATE_ROOT}/work-at/registry.json}"
LOG_PATH="${WORK_AT_OVERWATCH_LOG_PATH:-${STATE_ROOT}/logs/work-at-overwatch.log}"
PID_PATH="${WORK_AT_OVERWATCH_PID_PATH:-${STATE_ROOT}/work-at-overwatch.pid}"
INTERVAL_SECONDS="${WORK_AT_OVERWATCH_INTERVAL_SECONDS:-60}"

mkdir -p "$(dirname "$LOG_PATH")" "$(dirname "$PID_PATH")"
printf '%s\n' "$$" >"$PID_PATH"

log_line() {
  printf '[%s:work-at-overwatch] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" | tee -a "$LOG_PATH" >&2
}

current_targets() {
  ps -eo args= \
    | grep -E '(^| )work-at [a-z][a-z0-9._-]*' \
    | grep -v 'work-at-overwatch' \
    | sed -En 's/.*(^| )work-at ([a-z][a-z0-9._-]*).*/\2/p' \
    | sort -u
}

attached_profile() {
  local target="$1"
  jq -r --arg name "$target" '.targets[$name].healthProfileId // empty' "$REGISTRY_PATH" 2>/dev/null || true
}

run_health() {
  local target="$1"
  local profile="$2"
  local target_path=""
  target_path="$(jq -r --arg name "$target" '.targets[$name].path // empty' "$REGISTRY_PATH" 2>/dev/null || true)"
  if [[ -z "$profile" ]]; then
    log_line "target=${target} profile=missing action=skip"
    return 0
  fi
  if [[ -z "$target_path" ]]; then
    log_line "target=${target} profile=${profile} path=missing action=skip"
    return 0
  fi

  set +e
  local output
  output="$(
    bun "${RUNTIME_ROOT}/scripts/work-at-health.ts" \
      --profile "$profile" \
      --param "workTarget=${target}" \
      --param "targetPath=${target_path}" \
      --json 2>&1
  )"
  local exit_code=$?
  set -e

  local status="healthy"
  if [[ "$exit_code" -ne 0 ]]; then
    status="unhealthy"
  fi
  log_line "target=${target} profile=${profile} status=${status} exit_code=${exit_code}"
  printf '%s\n' "$output" >>"$LOG_PATH"
}

log_line "start interval_seconds=${INTERVAL_SECONDS}"
while true; do
  while IFS= read -r target; do
    [[ -n "$target" ]] || continue
    profile="$(attached_profile "$target")"
    run_health "$target" "$profile"
  done < <(current_targets)
  sleep "$INTERVAL_SECONDS"
done
