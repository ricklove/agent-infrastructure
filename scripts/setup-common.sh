#!/usr/bin/env bash
set -euo pipefail

SYSTEM_EVENT_LOG_PATH="${SYSTEM_EVENT_LOG_PATH:-/home/ec2-user/state/logs/system-events.log}"

setup_common_system_event_log() {
  local source="$1"
  local comment="$2"
  local details="${3:-}"
  local line
  mkdir -p "$(dirname "$SYSTEM_EVENT_LOG_PATH")"
  line="[$(date -u +"%Y-%m-%dT%H:%M:%SZ"):${source}] ${comment}"
  if [[ -n "${details}" ]]; then
    line="${line} ${details}"
  fi
  printf '%s\n' "$line" >> "$SYSTEM_EVENT_LOG_PATH"
  printf '%s\n' "$line" >&2
}

setup_common_system_event_run() {
  local source="$1"
  shift
  local details="$1"
  shift
  setup_common_system_event_log "$source" "start" "$details"
  set +e
  "$@"
  local exit_code=$?
  set -e
  if [[ "${exit_code}" -eq 0 ]]; then
    setup_common_system_event_log "$source" "exit" "exit_code=0"
  else
    setup_common_system_event_log "$source" "error" "exit_code=${exit_code}"
  fi
  return "${exit_code}"
}

setup_common_parse_args() {
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  RUNTIME_ROOT="${ROOT_DIR}"
  AGENT_HOME="${AGENT_HOME:-$(cd "${RUNTIME_ROOT}/.." && pwd)}"
  STATE_ROOT="${AGENT_HOME}/state"
  WORKSPACE_ROOT="${AGENT_HOME}/workspace"
  BOOTSTRAP_CONTEXT_PATH="${STATE_ROOT}/bootstrap-context.json"
  RUNTIME_TARGET_PATH="${AGENT_HOME}/runtime-target.json"

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
      --runtime-target)
        RUNTIME_TARGET_PATH="$2"
        shift 2
        ;;
      *)
        printf '[setup] unknown argument: %s\n' "$1" >&2
        exit 1
        ;;
    esac
  done
}

setup_common_prepare_environment() {
  export AGENT_HOME
  export AGENT_RUNTIME_DIR="${RUNTIME_ROOT}"
  export AGENT_STATE_DIR="${STATE_ROOT}"
  export AGENT_WORKSPACE_DIR="${WORKSPACE_ROOT}"
  export NVM_DIR="${AGENT_HOME}/.nvm"
  export NODE_VERSION="24"
  export HOME="${AGENT_HOME}"

  AGENT_USER="$(stat -c '%U' "${AGENT_HOME}")"
  AGENT_GROUP="$(stat -c '%G' "${AGENT_HOME}")"

  mkdir -p "$RUNTIME_ROOT" "$STATE_ROOT" "$WORKSPACE_ROOT"
}

setup_common_install_prereqs() {
  if [[ "${AGENT_SETUP_BOOTSTRAPPED:-0}" == "1" ]]; then
    return
  fi

  cat > /etc/profile.d/agent-browser-idle-timeout.sh <<'IDLEEOF'
export AGENT_BROWSER_IDLE_TIMEOUT_MS="${AGENT_BROWSER_IDLE_TIMEOUT_MS:-300000}"
IDLEEOF
  chmod 0644 /etc/profile.d/agent-browser-idle-timeout.sh
  if grep -q '^AGENT_BROWSER_IDLE_TIMEOUT_MS=' /etc/environment; then
    sed -i 's/^AGENT_BROWSER_IDLE_TIMEOUT_MS=.*/AGENT_BROWSER_IDLE_TIMEOUT_MS=300000/' /etc/environment
  else
    printf '\nAGENT_BROWSER_IDLE_TIMEOUT_MS=300000\n' >> /etc/environment
  fi

  setup_common_system_event_run "setup-bootstrap" "target=dnf-install-packages" \
    dnf install -y awscli git jq unzip zip openssl

  if [[ ! -f /etc/yum.repos.d/cloudflared.repo ]]; then
    setup_common_system_event_run "setup-bootstrap" "target=cloudflared-repo" \
      curl -fsSL https://pkg.cloudflare.com/cloudflared.repo -o /etc/yum.repos.d/cloudflared.repo
  fi
  setup_common_system_event_run "setup-bootstrap" "target=dnf-install-cloudflared" dnf install -y cloudflared

  mkdir -p "${NVM_DIR}"
  if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
    setup_common_system_event_log "setup-bootstrap" "start" "target=nvm-install-script"
    set +e
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null NVM_DIR="${NVM_DIR}" bash
    local exit_code=$?
    set -e
    setup_common_system_event_log "setup-bootstrap" "exit" "target=nvm-install-script exit_code=${exit_code}"
    if [[ "${exit_code}" -ne 0 ]]; then
      exit "${exit_code}"
    fi
  fi

  # shellcheck source=/dev/null
  source "${NVM_DIR}/nvm.sh"
  setup_common_system_event_run "setup-bootstrap" "target=nvm-install" nvm install "${NODE_VERSION}"
  setup_common_system_event_run "setup-bootstrap" "target=nvm-alias-default" nvm alias default "${NODE_VERSION}"
  setup_common_system_event_run "setup-bootstrap" "target=nvm-use-default" nvm use default

  local agent_shell_profile="${AGENT_HOME}/.bashrc"
  touch "${agent_shell_profile}"
  if ! grep -q 'export NVM_DIR="' "${agent_shell_profile}"; then
    cat >>"${agent_shell_profile}" <<PROFILEEOF
export NVM_DIR="${NVM_DIR}"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
[ -s "\$NVM_DIR/bash_completion" ] && . "\$NVM_DIR/bash_completion"
PROFILEEOF
  fi
  if ! grep -q 'AGENT_BROWSER_IDLE_TIMEOUT_MS' "${agent_shell_profile}"; then
    cat >>"${agent_shell_profile}" <<'TIMEOUTEOF'
export AGENT_BROWSER_IDLE_TIMEOUT_MS="${AGENT_BROWSER_IDLE_TIMEOUT_MS:-300000}"
TIMEOUTEOF
  fi
  chown -R "${AGENT_USER}:${AGENT_GROUP}" "${NVM_DIR}" "${agent_shell_profile}"

  export BUN_INSTALL=/opt/bun
  if [[ ! -x "$BUN_INSTALL/bin/bun" ]]; then
    setup_common_system_event_log "setup-bootstrap" "start" "target=bun-install-script"
    set +e
    curl -fsSL https://bun.sh/install | bash
    local exit_code=$?
    set -e
    setup_common_system_event_log "setup-bootstrap" "exit" "target=bun-install-script exit_code=${exit_code}"
    if [[ "${exit_code}" -ne 0 ]]; then
      exit "${exit_code}"
    fi
  fi
  setup_common_system_event_run "setup-bootstrap" "target=install-bun-binary" \
    install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

  export AGENT_SETUP_BOOTSTRAPPED=1
}

setup_common_role_from_runtime_target() {
  if [[ ! -f "${RUNTIME_TARGET_PATH}" ]]; then
    return 0
  fi

  jq -r '.role // empty' "${RUNTIME_TARGET_PATH}" 2>/dev/null || true
}
