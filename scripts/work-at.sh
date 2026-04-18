#!/usr/bin/env bash
set -euo pipefail

STATE_ROOT="${AGENT_STATE_DIR:-${AGENT_STATE_ROOT:-/home/ec2-user/state}}"
REGISTRY_PATH="${WORK_AT_REGISTRY_PATH:-${STATE_ROOT}/work-at/registry.json}"

usage() {
  cat <<'EOF'
Usage:
  work-at --help
  work-at --list [--json]
  work-at --register <name> -- --host <host> --path <path> [--shell <shell>]
  work-at --unregister <name>
  work-at --check <name>
  work-at <name> [command...]
  work-at <name> < script.sh
  work-at <name>

Special commands always start with -- so they cannot conflict with registered
work target names. Bare words are reserved for registered targets.

Examples:
  work-at --register bc-ops-dashboard -- \
    --host agent-swarm-worker-i-0793c7771e58a677b \
    --path /home/ec2-user/workspace/projects-worktrees/baseconnect-org-bc-ops-dashboard/bc-ops-dashboard-initial-scaffold-20260413

  work-at --check bc-ops-dashboard
  work-at bc-ops-dashboard git status --short
  work-at bc-ops-dashboard bun build
  work-at bc-ops-dashboard

  work-at bc-ops-dashboard <<'SCRIPT'
  pwd
  git branch --show-current
  git status --short
  SCRIPT

Agent Skill:
  To add work-at as an agent skill, create a skill whose instructions say:
  - Run `work-at --list` to discover registered work targets.
  - Run `work-at --check <name>` before doing substantive work.
  - Use `work-at <name> <command...>` for single commands.
  - Use `work-at <name> <<'EOF' ... EOF` for multiline shell work.
  - Use `work-at <name>` only when an interactive shell is needed.
  - Register targets with `work-at --register <name> -- --host <host> --path <path>`.
  - Treat all `--...` options as work-at control commands; bare names are targets.
EOF
}

die() {
  printf 'work-at: %s\n' "$1" >&2
  exit 1
}

need_jq() {
  command -v jq >/dev/null 2>&1 || die "jq is required"
}

validate_name() {
  local name="$1"
  [[ "$name" =~ ^[a-z][a-z0-9._-]*$ ]] || die "invalid target name: ${name}"
}

shell_quote() {
  printf '%q' "$1"
}

ensure_registry() {
  need_jq
  mkdir -p "$(dirname "$REGISTRY_PATH")"
  if [[ ! -f "$REGISTRY_PATH" ]]; then
    printf '{\n  "targets": {}\n}\n' >"$REGISTRY_PATH"
    chmod 0600 "$REGISTRY_PATH"
  fi
}

write_registry() {
  local tmp
  tmp="$(mktemp "${REGISTRY_PATH}.tmp.XXXXXX")"
  cat >"$tmp"
  chmod 0600 "$tmp"
  mv "$tmp" "$REGISTRY_PATH"
}

target_exists() {
  local name="$1"
  jq -e --arg name "$name" '.targets[$name] != null' "$REGISTRY_PATH" >/dev/null
}

target_field() {
  local name="$1"
  local field="$2"
  jq -er --arg name "$name" --arg field "$field" '.targets[$name][$field] // empty' "$REGISTRY_PATH"
}

register_target() {
  local name="${1:-}"
  [[ -n "$name" ]] || die "--register requires a target name"
  validate_name "$name"
  shift || true
  [[ "${1:-}" == "--" ]] || die "--register syntax is: work-at --register <name> -- --host <host> --path <path>"
  shift

  local host=""
  local path=""
  local shell="/bin/bash"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --host)
        host="${2:-}"
        [[ -n "$host" ]] || die "--host requires a value"
        shift 2
        ;;
      --path)
        path="${2:-}"
        [[ -n "$path" ]] || die "--path requires a value"
        shift 2
        ;;
      --shell)
        shell="${2:-}"
        [[ -n "$shell" ]] || die "--shell requires a value"
        shift 2
        ;;
      *)
        die "unknown registration option: $1"
        ;;
    esac
  done

  [[ -n "$path" ]] || die "--path is required"
  ensure_registry

  local registered_at
  registered_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  jq \
    --arg name "$name" \
    --arg host "$host" \
    --arg path "$path" \
    --arg shell "$shell" \
    --arg registeredAt "$registered_at" \
    '.targets[$name] = {
      host: $host,
      path: $path,
      shell: $shell,
      registeredAt: $registeredAt
    }' "$REGISTRY_PATH" | write_registry

  printf 'registered %s\n' "$name"
}

unregister_target() {
  local name="${1:-}"
  [[ -n "$name" ]] || die "--unregister requires a target name"
  validate_name "$name"
  ensure_registry
  target_exists "$name" || die "target is not registered: ${name}"
  jq --arg name "$name" 'del(.targets[$name])' "$REGISTRY_PATH" | write_registry
  printf 'unregistered %s\n' "$name"
}

list_targets() {
  ensure_registry
  if [[ "${1:-}" == "--json" ]]; then
    jq '.' "$REGISTRY_PATH"
    return
  fi
  jq -r '
    .targets
    | to_entries
    | sort_by(.key)
    | .[]
    | [.key, (.value.host // ""), .value.path]
    | @tsv
  ' "$REGISTRY_PATH"
}

check_target() {
  local name="${1:-}"
  [[ -n "$name" ]] || die "--check requires a target name"
  validate_name "$name"
  ensure_registry
  target_exists "$name" || die "target is not registered: ${name}"

  local host path quoted_path
  host="$(target_field "$name" host || true)"
  path="$(target_field "$name" path)"
  quoted_path="$(shell_quote "$path")"

  if [[ -z "$host" || "$host" == "local" || "$host" == "localhost" ]]; then
    [[ -d "$path" ]] || die "target path does not exist: ${path}"
  else
    ssh "$host" "test -d ${quoted_path}" || die "target path does not exist on ${host}: ${path}"
  fi
  printf 'ok %s\n' "$name"
}

run_target() {
  local name="$1"
  shift
  validate_name "$name"
  ensure_registry
  target_exists "$name" || die "target is not registered: ${name}"

  local host path shell quoted_path
  host="$(target_field "$name" host || true)"
  path="$(target_field "$name" path)"
  shell="$(target_field "$name" shell || true)"
  [[ -n "$shell" ]] || shell="/bin/bash"
  quoted_path="$(shell_quote "$path")"

  if [[ $# -gt 0 ]]; then
    local command_string=""
    local arg
    for arg in "$@"; do
      command_string+=" $(shell_quote "$arg")"
    done
    command_string="${command_string# }"
    if [[ -z "$host" || "$host" == "local" || "$host" == "localhost" ]]; then
      cd "$path"
      exec "$@"
    fi
    exec ssh "$host" "cd ${quoted_path} && ${command_string}"
  fi

  if [[ -t 0 ]]; then
    local quoted_shell
    quoted_shell="$(shell_quote "$shell")"
    if [[ -z "$host" || "$host" == "local" || "$host" == "localhost" ]]; then
      cd "$path"
      exec "$shell" -l
    fi
    exec ssh -t "$host" "cd ${quoted_path} && exec ${quoted_shell} -l"
  fi

  if [[ -z "$host" || "$host" == "local" || "$host" == "localhost" ]]; then
    cd "$path"
    exec "$shell" -se
  fi
  local quoted_shell
  quoted_shell="$(shell_quote "$shell")"
  exec ssh "$host" "cd ${quoted_path} && exec ${quoted_shell} -se"
}

main() {
  case "${1:-}" in
    -h|--help)
      usage
      ;;
    --list)
      shift
      list_targets "$@"
      ;;
    --register)
      shift
      register_target "$@"
      ;;
    --unregister)
      shift
      unregister_target "$@"
      ;;
    --check)
      shift
      check_target "$@"
      ;;
    --*)
      die "unknown option: $1"
      ;;
    "")
      usage
      exit 1
      ;;
    *)
      run_target "$@"
      ;;
  esac
}

main "$@"
