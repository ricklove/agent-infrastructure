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

setup_common_install_apply_patch_wrapper() {
  local agent_home="${AGENT_HOME:-/home/ec2-user}"
  local wrapper_dir="${agent_home}/.local/bin"
  local wrapper_path="${wrapper_dir}/apply_patch"
  local real_apply_patch=""

  real_apply_patch="$(find "${agent_home}/.nvm/versions/node" -path '*/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-*/vendor/*/codex/codex' 2>/dev/null | sort | tail -n 1)"
  if [[ -z "${real_apply_patch}" || ! -x "${real_apply_patch}" ]]; then
    printf '%s\n' 'apply_patch cannot be installed on this host because the Codex vendor binary was not found.' >&2
    return 127
  fi

  mkdir -p "${wrapper_dir}"
  ln -sfn "${real_apply_patch}" "${wrapper_path}"
}

setup_common_install_agent_browser_wrapper() {
  local wrapper_path="/usr/local/bin/agent-browser"
  local agent_browser_path=""
  local bun_wrapper_path="/opt/bun/bin/bun"
  local bun_real_path="/opt/bun/bin/bun.real"
  local node_path=""
  local npx_path=""
  local npm_path=""

  agent_browser_path="$(command -v agent-browser 2>/dev/null || true)"
  node_path="$(command -v node 2>/dev/null || true)"
  npx_path="$(command -v npx 2>/dev/null || true)"
  npm_path="$(command -v npm 2>/dev/null || true)"

  if [[ -w "$(dirname "${wrapper_path}")" ]]; then
    cat > "${wrapper_path}" <<'WRAPPEREOF'
#!/usr/bin/env bash
set -euo pipefail

runtime_target_path="${AGENT_RUNTIME_TARGET_PATH:-/home/ec2-user/runtime-target.json}"
role="${DASHBOARD_HOST_ROLE:-}"
if [[ -z "${role}" && -f "${runtime_target_path}" ]]; then
  role="$(jq -r '.role // empty' "${runtime_target_path}" 2>/dev/null || true)"
fi

if [[ "${role}" == "manager" ]]; then
  printf '%s\n' 'agent-browser is forbidden on the manager. Run browser commands on a worker surface via work-at.' >&2
  exit 126
fi

real_agent_browser="$(find /home/ec2-user/.nvm/versions/node -path '*/lib/node_modules/agent-browser/bin/agent-browser-linux-*' 2>/dev/null | sort | tail -n 1)"
if [[ -z "${real_agent_browser}" || ! -x "${real_agent_browser}" ]]; then
  printf '%s\n' 'agent-browser is not installed as a first-class CLI on this host.' >&2
  exit 127
fi

exec "${real_agent_browser}" "$@"
WRAPPEREOF
    chmod 0755 "${wrapper_path}"
  fi

  if [[ -n "${agent_browser_path}" ]]; then
    rm -f "${agent_browser_path}"
    cat > "${agent_browser_path}" <<'WRAPPEREOF'
#!/usr/bin/env bash
set -euo pipefail

runtime_target_path="${AGENT_RUNTIME_TARGET_PATH:-/home/ec2-user/runtime-target.json}"
role="${DASHBOARD_HOST_ROLE:-}"
if [[ -z "${role}" && -f "${runtime_target_path}" ]]; then
  role="$(jq -r '.role // empty' "${runtime_target_path}" 2>/dev/null || true)"
fi

if [[ "${role}" == "manager" ]]; then
  printf '%s\n' 'agent-browser is forbidden on the manager. Run browser commands on a worker surface via work-at.' >&2
  exit 126
fi

real_agent_browser="$(find /home/ec2-user/.nvm/versions/node -path '*/lib/node_modules/agent-browser/bin/agent-browser-linux-*' 2>/dev/null | sort | tail -n 1)"
if [[ -z "${real_agent_browser}" || ! -x "${real_agent_browser}" ]]; then
  printf '%s\n' 'agent-browser is not installed as a first-class CLI on this host.' >&2
  exit 127
fi

exec "${real_agent_browser}" "$@"
WRAPPEREOF
    chmod 0755 "${agent_browser_path}"
  fi

  if [[ -n "${npx_path}" && -n "${node_path}" ]]; then
    rm -f "${npx_path}"
    cat > "${npx_path}" <<WRAPPEREOF
#!/usr/bin/env bash
set -euo pipefail

runtime_target_path="\${AGENT_RUNTIME_TARGET_PATH:-/home/ec2-user/runtime-target.json}"
role="\${DASHBOARD_HOST_ROLE:-}"
if [[ -z "\${role}" && -f "\${runtime_target_path}" ]]; then
  role="\$(jq -r '.role // empty' "\${runtime_target_path}" 2>/dev/null || true)"
fi

if [[ "\${role}" == "manager" ]]; then
  first_command=""
  for arg in "\$@"; do
    case "\${arg}" in
      -*) ;;
      *) first_command="\${arg}"; break ;;
    esac
  done
  if [[ "\${first_command}" == "agent-browser" ]]; then
    printf '%s\n' 'agent-browser is forbidden on the manager. Run browser commands on a worker surface via work-at.' >&2
    exit 126
  fi
fi

npx_cli="\$(find /home/ec2-user/.nvm/versions/node -path '*/lib/node_modules/npm/bin/npx-cli.js' 2>/dev/null | sort | tail -n 1)"
if [[ -z "\${npx_cli}" || ! -f "\${npx_cli}" ]]; then
  printf '%s\n' 'npx is not installed on this host.' >&2
  exit 127
fi

exec "${node_path}" "\${npx_cli}" "\$@"
WRAPPEREOF
    chmod 0755 "${npx_path}"
  fi

  if [[ -n "${npm_path}" && -n "${node_path}" ]]; then
    rm -f "${npm_path}"
    cat > "${npm_path}" <<WRAPPEREOF
#!/usr/bin/env bash
set -euo pipefail

runtime_target_path="\${AGENT_RUNTIME_TARGET_PATH:-/home/ec2-user/runtime-target.json}"
role="\${DASHBOARD_HOST_ROLE:-}"
if [[ -z "\${role}" && -f "\${runtime_target_path}" ]]; then
  role="\$(jq -r '.role // empty' "\${runtime_target_path}" 2>/dev/null || true)"
fi

if [[ "\${role}" == "manager" ]]; then
  if [[ "\${1:-}" == "exec" || "\${1:-}" == "x" ]]; then
    first_command=""
    for arg in "\${@:2}"; do
      case "\${arg}" in
        -*) ;;
        *) first_command="\${arg}"; break ;;
      esac
    done
    if [[ "\${first_command}" == "agent-browser" ]]; then
      printf '%s\n' 'agent-browser is forbidden on the manager. Run browser commands on a worker surface via work-at.' >&2
      exit 126
    fi
  fi
fi

npm_cli="\$(find /home/ec2-user/.nvm/versions/node -path '*/lib/node_modules/npm/bin/npm-cli.js' 2>/dev/null | sort | tail -n 1)"
if [[ -z "\${npm_cli}" || ! -f "\${npm_cli}" ]]; then
  printf '%s\n' 'npm is not installed on this host.' >&2
  exit 127
fi

exec "${node_path}" "\${npm_cli}" "\$@"
WRAPPEREOF
    chmod 0755 "${npm_path}"
  fi

  if [[ -x "${bun_wrapper_path}" && ! -e "${bun_real_path}" ]]; then
    mv "${bun_wrapper_path}" "${bun_real_path}"
  fi
  if [[ -x "${bun_real_path}" ]]; then
    cat > "${bun_wrapper_path}" <<'WRAPPEREOF'
#!/usr/bin/env bash
set -euo pipefail

runtime_target_path="${AGENT_RUNTIME_TARGET_PATH:-/home/ec2-user/runtime-target.json}"
role="${DASHBOARD_HOST_ROLE:-}"
if [[ -z "${role}" && -f "${runtime_target_path}" ]]; then
  role="$(jq -r '.role // empty' "${runtime_target_path}" 2>/dev/null || true)"
fi

mode="$(basename "$0")"
if [[ "${role}" == "manager" ]]; then
  first_command=""
  if [[ "${mode}" == "bunx" ]]; then
    for arg in "$@"; do
      case "${arg}" in
        -*) ;;
        *) first_command="${arg}"; break ;;
      esac
    done
  elif [[ "${1:-}" == "x" ]]; then
    for arg in "${@:2}"; do
      case "${arg}" in
        -*) ;;
        *) first_command="${arg}"; break ;;
      esac
    done
  fi
  if [[ "${first_command}" == "agent-browser" ]]; then
    printf '%s\n' 'agent-browser is forbidden on the manager. Run browser commands on a worker surface via work-at.' >&2
    exit 126
  fi
fi

if [[ "${mode}" == "bunx" ]]; then
  exec /opt/bun/bin/bun.real x "$@"
fi

exec /opt/bun/bin/bun.real "$@"
WRAPPEREOF
    chmod 0755 "${bun_wrapper_path}"
    rm -f /opt/bun/bin/bunx
    ln -s bun /opt/bun/bin/bunx
  fi
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
  setup_common_system_event_run "setup-bootstrap" "target=install-apply-patch-wrapper" \
    setup_common_install_apply_patch_wrapper
  setup_common_system_event_run "setup-bootstrap" "target=install-agent-browser-wrapper" \
    setup_common_install_agent_browser_wrapper

  export AGENT_SETUP_BOOTSTRAPPED=1
}

setup_common_role_from_runtime_target() {
  if [[ ! -f "${RUNTIME_TARGET_PATH}" ]]; then
    return 0
  fi

  jq -r '.role // empty' "${RUNTIME_TARGET_PATH}" 2>/dev/null || true
}
