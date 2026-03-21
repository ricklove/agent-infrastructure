#!/usr/bin/env bash
set -euo pipefail

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

dnf install -y awscli git jq unzip zip openssl

if [[ ! -f /etc/yum.repos.d/cloudflared.repo ]]; then
  curl -fsSL https://pkg.cloudflare.com/cloudflared.repo -o /etc/yum.repos.d/cloudflared.repo
fi
dnf install -y cloudflared

mkdir -p "${NVM_DIR}"
if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null NVM_DIR="${NVM_DIR}" bash
fi

# shellcheck source=/dev/null
source "${NVM_DIR}/nvm.sh"
nvm install "${NODE_VERSION}"
nvm alias default "${NODE_VERSION}"
nvm use default

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
  curl -fsSL https://bun.sh/install | bash
fi
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

cd "$RUNTIME_ROOT"
bun install --frozen-lockfile
bun run --filter @agent-infrastructure/swarm-manager run:setup-host -- \
  --runtime-dir "$RUNTIME_ROOT" \
  --state-dir "$STATE_ROOT" \
  --workspace-dir "$WORKSPACE_ROOT" \
  --host-root "$RUNTIME_ROOT" \
  --bootstrap-context "$BOOTSTRAP_CONTEXT_PATH"
