#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
CONFIG_ROOT="${AGENT_GITHUB_CONFIG_ROOT:-${HOME}/.config/agent-github}"
DEFAULT_ENV_FILE="${CONFIG_ROOT}/env"
DEFAULT_ASKPASS_FILE="${CONFIG_ROOT}/git-askpass.sh"
DEFAULT_PROJECTS_REGISTRY_PATH="${AGENT_PROJECTS_REGISTRY_PATH:-${HOME}/workspace/data/projects/registry.json}"
command_name="token"
env_file="$DEFAULT_ENV_FILE"
askpass_file="$DEFAULT_ASKPASS_FILE"
repo_path="$PWD"
owner_name=""
explicit_env_file="false"

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [command] [options]

Commands:
  token                 Print a GitHub App installation token. Default command.
  env                   Print shell exports for GH_TOKEN and GITHUB_TOKEN.
  install-askpass       Install a Git askpass helper that mints tokens on demand.

Options:
  --env-file PATH       Read app settings from PATH. Default: ${DEFAULT_ENV_FILE}
  --askpass-file PATH   Write the askpass helper to PATH. Default: ${DEFAULT_ASKPASS_FILE}
  --repo-path PATH      Resolve the GitHub owner from the repo at PATH. Default: current directory.
  --owner NAME          Resolve credentials from ${CONFIG_ROOT}/@NAME/.
  -h, --help            Show this help.
EOF
}

fail() {
  printf '[github-app-token] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

github_owner_from_remote() {
  local remote_url owner_part

  remote_url="$(git -C "$repo_path" remote get-url origin 2>/dev/null || true)"
  [[ -n "$remote_url" ]] || return 1

  case "$remote_url" in
    git@github.com:*)
      owner_part="${remote_url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      owner_part="${remote_url#ssh://git@github.com/}"
      ;;
    https://github.com/*)
      owner_part="${remote_url#https://github.com/}"
      ;;
    http://github.com/*)
      owner_part="${remote_url#http://github.com/}"
      ;;
    *)
      return 1
      ;;
  esac

  owner_part="${owner_part%%/*}"
  [[ -n "$owner_part" ]] || return 1
  printf '%s\n' "$owner_part"
}

github_repo_from_remote() {
  local remote_url repo_part

  remote_url="$(git -C "$repo_path" remote get-url origin 2>/dev/null || true)"
  [[ -n "$remote_url" ]] || return 1

  case "$remote_url" in
    git@github.com:*)
      repo_part="${remote_url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      repo_part="${remote_url#ssh://git@github.com/}"
      ;;
    https://github.com/*)
      repo_part="${remote_url#https://github.com/}"
      ;;
    http://github.com/*)
      repo_part="${remote_url#http://github.com/}"
      ;;
    *)
      return 1
      ;;
  esac

  repo_part="${repo_part#*/}"
  repo_part="${repo_part%.git}"
  [[ -n "$repo_part" ]] || return 1
  printf '%s\n' "$repo_part"
}

resolve_project_env_file() {
  local registry_path repo_root repo_name installation_id
  registry_path="$DEFAULT_PROJECTS_REGISTRY_PATH"
  [[ -f "$registry_path" ]] || return 1

  repo_root="$(git -C "$repo_path" rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$repo_root" ]] || return 1

  owner_name="${owner_name:-$(github_owner_from_remote || true)}"
  repo_name="$(github_repo_from_remote || true)"

  installation_id="$(
    jq -r \
      --arg repo_root "$repo_root" \
      --arg owner "$owner_name" \
      --arg repo "$repo_name" \
      '
        first(
          .projects[]?
          | select(
              (.localPath? == $repo_root)
              or ((.owner? == $owner) and (.repo? == $repo))
            )
          | .installationId // empty
        )
      ' \
      "$registry_path"
  )"
  [[ -n "$installation_id" ]] || return 1

  env_file="${CONFIG_ROOT}/installations/${installation_id}/env"
  [[ -f "$env_file" ]] || return 1
}

resolve_env_file() {
  if [[ "$explicit_env_file" == "true" ]]; then
    return 0
  fi

  if [[ -n "$owner_name" ]]; then
    env_file="${CONFIG_ROOT}/@${owner_name}/env"
    return 0
  fi

  if resolve_project_env_file; then
    return 0
  fi

  owner_name="$(github_owner_from_remote || true)"
  if [[ -n "$owner_name" && -f "${CONFIG_ROOT}/@${owner_name}/env" ]]; then
    env_file="${CONFIG_ROOT}/@${owner_name}/env"
    return 0
  fi

  env_file="$DEFAULT_ENV_FILE"
}

load_env() {
  resolve_env_file
  [[ -f "$env_file" ]] || fail "env file not found: ${env_file}"
  # shellcheck disable=SC1090
  source "$env_file"
  : "${GITHUB_APP_ID:?GITHUB_APP_ID is required in ${env_file}}"
  : "${GITHUB_INSTALLATION_ID:?GITHUB_INSTALLATION_ID is required in ${env_file}}"
  : "${GITHUB_APP_PEM:?GITHUB_APP_PEM is required in ${env_file}}"
  [[ -f "$GITHUB_APP_PEM" ]] || fail "app PEM not found: ${GITHUB_APP_PEM}"
}

generate_token() {
  load_env

  require_command curl
  require_command jq
  require_command openssl

  local now iat exp header payload header_b64 payload_b64 signing_input jwt response token
  now="$(date +%s)"
  iat="$((now - 60))"
  exp="$((now + 540))"

  header='{"alg":"RS256","typ":"JWT"}'
  payload="{\"iat\":${iat},\"exp\":${exp},\"iss\":\"${GITHUB_APP_ID}\"}"

  header_b64="$(printf '%s' "$header" | base64url)"
  payload_b64="$(printf '%s' "$payload" | base64url)"
  signing_input="${header_b64}.${payload_b64}"
  jwt="${signing_input}.$(
    printf '%s' "$signing_input" \
      | openssl dgst -binary -sha256 -sign "$GITHUB_APP_PEM" \
      | base64url
  )"

  response="$(
    curl -fsSL \
      -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${jwt}" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/app/installations/${GITHUB_INSTALLATION_ID}/access_tokens"
  )"

  token="$(jq -r '.token // empty' <<<"$response")"
  [[ -n "$token" ]] || fail "failed to mint installation token"
  printf '%s\n' "$token"
}

install_askpass() {
  local askpass_dir resolved_env_file
  resolve_env_file
  resolved_env_file="$env_file"
  askpass_dir="$(dirname "$askpass_file")"
  mkdir -p "$askpass_dir"

  cat >"$askpass_file" <<EOF
#!/usr/bin/env bash

set -euo pipefail

TOKEN_SCRIPT="${SCRIPT_PATH}"
DEFAULT_ENV_FILE="${resolved_env_file}"
if [[ -d "\${PWD}/.git" || -f "\${PWD}/.git" ]]; then
  TOKEN="\$(bash "\${TOKEN_SCRIPT}" --repo-path "\${PWD}" token)"
else
  TOKEN="\$(bash "\${TOKEN_SCRIPT}" --env-file "\${DEFAULT_ENV_FILE}" token)"
fi

case "\${1:-}" in
  *Username*|*username*)
    printf '%s\n' "x-access-token"
    ;;
  *Password*|*password*)
    printf '%s\n' "\${TOKEN}"
    ;;
  *)
    printf '\n'
    ;;
esac
EOF

  chmod 700 "$askpass_file"
  printf '%s\n' "$askpass_file"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    token|env|install-askpass)
      command_name="$1"
      shift
      ;;
    --env-file)
      [[ $# -ge 2 ]] || fail "--env-file requires a value"
      env_file="$2"
      explicit_env_file="true"
      shift 2
      ;;
    --askpass-file)
      [[ $# -ge 2 ]] || fail "--askpass-file requires a value"
      askpass_file="$2"
      shift 2
      ;;
    --repo-path)
      [[ $# -ge 2 ]] || fail "--repo-path requires a value"
      repo_path="$2"
      shift 2
      ;;
    --owner)
      [[ $# -ge 2 ]] || fail "--owner requires a value"
      owner_name="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

case "$command_name" in
  token)
    generate_token
    ;;
  env)
    token="$(generate_token)"
    printf 'export GH_TOKEN=%q\n' "$token"
    printf 'export GITHUB_TOKEN=%q\n' "$token"
    ;;
  install-askpass)
    install_askpass
    ;;
esac
