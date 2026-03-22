#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="${AGENT_RUNTIME_DIR:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
STATE_ROOT="${AGENT_STATE_DIR:-/home/ec2-user/state}"
WORKSPACE_ROOT="${AGENT_WORKSPACE_DIR:-/home/ec2-user/workspace}"
SYSTEM_EVENT_LOG_PATH="${SYSTEM_EVENT_LOG_PATH:-${STATE_ROOT}/logs/system-events.log}"

system_event_log() {
  local source="$1"
  local comment="$2"
  local details="${3:-}"
  local line
  mkdir -p "$(dirname "${SYSTEM_EVENT_LOG_PATH}")"
  line="[$(date -u +"%Y-%m-%dT%H:%M:%SZ"):${source}] ${comment}"
  if [[ -n "${details}" ]]; then
    line="${line} ${details}"
  fi
  printf '%s\n' "${line}" >> "${SYSTEM_EVENT_LOG_PATH}"
  printf '%s\n' "${line}" >&2
}

run_logged() {
  local source="$1"
  shift
  local details="$1"
  shift
  system_event_log "${source}" "start" "${details}"
  set +e
  "$@"
  local exit_code=$?
  set -e
  if [[ "${exit_code}" -eq 0 ]]; then
    system_event_log "${source}" "exit" "exit_code=0"
  else
    system_event_log "${source}" "error" "exit_code=${exit_code}"
  fi
  return "${exit_code}"
}
