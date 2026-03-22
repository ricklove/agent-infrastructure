#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
system_event_log "git-askpass.sh" "start" "cwd=${PWD}"
TOKEN="$(bash "${RUNTIME_ROOT}/scripts/github-app-token.sh" --repo-path "${PWD}" token)"

case "${1:-}" in
  *Username*|*username*)
    printf '%s\n' "x-access-token"
    ;;
  *Password*|*password*)
    printf '%s\n' "${TOKEN}"
    ;;
  *)
    printf '\n'
    ;;
esac

system_event_log "git-askpass.sh" "exit" "exit_code=0"
