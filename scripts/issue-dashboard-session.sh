#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ "${AGENT_RUN_AS_USER_DONE:-0}" != "1" && "$(id -u)" == "0" ]]; then
  system_event_log "issue-dashboard-session.sh" "sudo.reexec" "user=ec2-user"
  exec sudo -H -u ec2-user env \
    AGENT_RUN_AS_USER_DONE=1 \
    AGENT_GITHUB_CONFIG_ROOT="${AGENT_GITHUB_CONFIG_ROOT:-/home/ec2-user/.config/agent-github}" \
    GIT_ASKPASS="${RUNTIME_ROOT}/scripts/git-askpass.sh" \
    GIT_TERMINAL_PROMPT=0 \
    bash "$0" "$@"
fi

export AGENT_GITHUB_CONFIG_ROOT="${AGENT_GITHUB_CONFIG_ROOT:-/home/ec2-user/.config/agent-github}"
export GIT_ASKPASS="${RUNTIME_ROOT}/scripts/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0
cd "${RUNTIME_ROOT}"
run_logged "issue-dashboard-session.sh" "target=src/manager/issue-dashboard-session.ts args=$*" \
  bun "${RUNTIME_ROOT}/packages/swarm-manager/src/manager/issue-dashboard-session.ts" "$@"
