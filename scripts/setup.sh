#!/usr/bin/env bash
set -euo pipefail

SYSTEM_EVENT_LOG_PATH="${SYSTEM_EVENT_LOG_PATH:-/home/ec2-user/state/logs/system-events.log}"

system_event_log() {
  local component="$1"
  local comment="$2"
  local details="${3:-}"
  local line
  mkdir -p "$(dirname "$SYSTEM_EVENT_LOG_PATH")"
  line="[$(date -u +"%Y-%m-%dT%H:%M:%SZ"):${component}] ${comment}"
  if [[ -n "${details}" ]]; then
    line="${line} ${details}"
  fi
  printf '%s\n' "${line}" >> "$SYSTEM_EVENT_LOG_PATH"
  printf '%s\n' "${line}" >&2
}

system_event_run() {
  local component="$1"
  shift
  local details="$1"
  shift
  system_event_log "$component" "start" "$details"
  set +e
  "$@"
  local exit_code=$?
  set -e
  if [[ "${exit_code}" -eq 0 ]]; then
    system_event_log "$component" "exit" "exit_code=0"
  else
    system_event_log "$component" "error" "exit_code=${exit_code}"
  fi
  return "$exit_code"
}

system_event_log "scripts/setup.sh" "setup.start" "phase=bootstrap"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_ROOT="${ROOT_DIR}"
AGENT_HOME="${AGENT_HOME:-$(cd "${RUNTIME_ROOT}/.." && pwd)}"
STATE_ROOT="${AGENT_HOME}/state"
WORKSPACE_ROOT="${AGENT_HOME}/workspace"
BOOTSTRAP_CONTEXT_PATH="${STATE_ROOT}/bootstrap-context.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runtime-dir)
      RUNTIME_ROOT="$2"
      shift 2
      ;;
    --state-dir)
      STATE_ROOT="$2"
      shift 2
      ;;
    --workspace-dir)
      WORKSPACE_ROOT="$2"
      shift 2
      ;;
    --bootstrap-context)
      BOOTSTRAP_CONTEXT_PATH="$2"
      shift 2
      ;;
    *)
      printf '[setup] unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

export AGENT_HOME
export AGENT_RUNTIME_DIR="${RUNTIME_ROOT}"
export AGENT_STATE_DIR="${STATE_ROOT}"
export AGENT_WORKSPACE_DIR="${WORKSPACE_ROOT}"
export NVM_DIR="${AGENT_HOME}/.nvm"
export NODE_VERSION="24"
export HOME="${AGENT_HOME}"

agent_user="$(stat -c '%U' "${AGENT_HOME}")"
agent_group="$(stat -c '%G' "${AGENT_HOME}")"

mkdir -p "$RUNTIME_ROOT" "$STATE_ROOT" "$WORKSPACE_ROOT"

system_event_run "scripts/setup.sh" "target=dnf-install-packages" \
  dnf install -y awscli git jq unzip zip openssl

if [[ ! -f /etc/yum.repos.d/cloudflared.repo ]]; then
  system_event_run "scripts/setup.sh" "target=cloudflared-repo" \
    curl -fsSL https://pkg.cloudflare.com/cloudflared.repo -o /etc/yum.repos.d/cloudflared.repo
fi
system_event_run "scripts/setup.sh" "target=dnf-install-cloudflared" dnf install -y cloudflared

mkdir -p "${NVM_DIR}"
if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
  system_event_log "scripts/setup.sh" "start" "target=nvm-install-script"
  set +e
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null NVM_DIR="${NVM_DIR}" bash
  exit_code=$?
  set -e
  system_event_log "scripts/setup.sh" "exit" "target=nvm-install-script exit_code=${exit_code}"
  if [[ "${exit_code}" -ne 0 ]]; then
    exit "${exit_code}"
  fi
fi

# shellcheck source=/dev/null
source "${NVM_DIR}/nvm.sh"
system_event_run "scripts/setup.sh" "target=nvm-install" nvm install "${NODE_VERSION}"
system_event_run "scripts/setup.sh" "target=nvm-alias-default" nvm alias default "${NODE_VERSION}"
system_event_run "scripts/setup.sh" "target=nvm-use-default" nvm use default

agent_shell_profile="${AGENT_HOME}/.bashrc"
touch "${agent_shell_profile}"
if ! grep -q 'export NVM_DIR="' "${agent_shell_profile}"; then
  cat >>"${agent_shell_profile}" <<EOF
export NVM_DIR="${NVM_DIR}"
[ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
[ -s "\$NVM_DIR/bash_completion" ] && \. "\$NVM_DIR/bash_completion"
EOF
fi
chown -R "${agent_user}:${agent_group}" "${NVM_DIR}" "${agent_shell_profile}"

export BUN_INSTALL=/opt/bun
if [[ ! -x "$BUN_INSTALL/bin/bun" ]]; then
  system_event_log "scripts/setup.sh" "start" "target=bun-install-script"
  set +e
  curl -fsSL https://bun.sh/install | bash
  exit_code=$?
  set -e
  system_event_log "scripts/setup.sh" "exit" "target=bun-install-script exit_code=${exit_code}"
  if [[ "${exit_code}" -ne 0 ]]; then
    exit "${exit_code}"
  fi
fi
system_event_run "scripts/setup.sh" "target=install-bun-binary" \
  install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

cd "$RUNTIME_ROOT"
system_event_run "scripts/setup.sh" "target=bun-install" bun install --frozen-lockfile
system_event_run "scripts/setup.sh" "target=run-setup-host" \
  bun run --filter @agent-infrastructure/swarm-manager run:setup-host -- \
  --runtime-dir "$RUNTIME_ROOT" \
  --state-dir "$STATE_ROOT" \
  --workspace-dir "$WORKSPACE_ROOT" \
  --host-root "$RUNTIME_ROOT" \
  --bootstrap-context "$BOOTSTRAP_CONTEXT_PATH"

system_event_log "scripts/setup.sh" "setup.complete" "phase=bootstrap"
