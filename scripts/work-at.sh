#!/usr/bin/env bash
set -euo pipefail

STATE_ROOT="${AGENT_STATE_DIR:-${AGENT_STATE_ROOT:-/home/ec2-user/state}}"
RUNTIME_ROOT="${AGENT_RUNTIME_DIR:-/home/ec2-user/runtime}"
REGISTRY_PATH="${WORK_AT_REGISTRY_PATH:-${STATE_ROOT}/work-at/registry.json}"
HEALTH_RUNNER_PATH="${WORK_AT_HEALTH_RUNNER_PATH:-${RUNTIME_ROOT}/scripts/work-at-health.ts}"
HEALTH_BUN_BIN="${WORK_AT_HEALTH_BUN_BIN:-bun}"

usage() {
  cat <<'EOF'
Usage:
  work-at --help
  work-at --list [--json]
  work-at --register <name> -- --host <host> --path <path> [--shell <shell>] [--health-profile <profile-id>]
  work-at --unregister <name>
  work-at --check <name>
  work-at --describe <name> [--json]
  work-at --health <name> [--json]
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
  - Register targets with `work-at --register <name> -- --host <host> --path <path> [--health-profile <profile-id>]`.
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
  local health_profile=""
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
      --health-profile)
        health_profile="${2:-}"
        [[ -n "$health_profile" ]] || die "--health-profile requires a value"
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
    --arg healthProfileId "$health_profile" \
    --arg registeredAt "$registered_at" \
    '.targets[$name] = {
      host: $host,
      path: $path,
      shell: $shell,
      healthProfileId: ($healthProfileId | select(length > 0)),
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

describe_target() {
  local name="${1:-}"
  local json_mode="${2:-}"
  [[ -n "$name" ]] || die "--describe requires a target name"
  validate_name "$name"
  ensure_registry
  target_exists "$name" || die "target is not registered: ${name}"

  if [[ "$json_mode" == "--json" ]]; then
    jq -r --arg name "$name" '.targets[$name]' "$REGISTRY_PATH"
    return
  fi

  local host path shell health_profile
  host="$(target_field "$name" host || true)"
  path="$(target_field "$name" path)"
  shell="$(target_field "$name" shell || true)"
  health_profile="$(target_field "$name" healthProfileId || true)"
  printf 'name=%s\n' "$name"
  printf 'host=%s\n' "${host}"
  printf 'path=%s\n' "${path}"
  printf 'shell=%s\n' "${shell}"
  if [[ -n "$health_profile" ]]; then
    printf 'health_profile=%s\n' "${health_profile}"
  fi
}

health_target() {
  local name="${1:-}"
  shift || true
  [[ -n "$name" ]] || die "--health requires a target name"
  validate_name "$name"
  ensure_registry
  target_exists "$name" || die "target is not registered: ${name}"

  local health_profile
  local path
  health_profile="$(target_field "$name" healthProfileId || true)"
  path="$(target_field "$name" path)"
  [[ -n "$health_profile" ]] || die "target has no attached health profile: ${name}"
  command -v "$HEALTH_BUN_BIN" >/dev/null 2>&1 || die "bun is required for --health"
  [[ -f "$HEALTH_RUNNER_PATH" ]] || die "health runner does not exist: ${HEALTH_RUNNER_PATH}"

  "$HEALTH_BUN_BIN" "$HEALTH_RUNNER_PATH" \
    --profile "$health_profile" \
    --param "workTarget=${name}" \
    --param "targetPath=${path}" \
    "$@"
}

print_health_guidance() {
  local name="$1"
  local health_profile
  health_profile="$(target_field "$name" healthProfileId || true)"
  [[ -n "$health_profile" ]] || return 0

  printf 'work-at: target health profile detected: %s\n' "$health_profile" >&2
  printf 'work-at: to verify target health, run: work-at --health %s\n' "$name" >&2
  printf 'work-at: if this exposes a repeatable workspace/tool failure, add a fast check to that profile so future agents stay focused on their primary task.\n' >&2
}

suggest_target_name() {
  local parent_name="$1"
  local nested_path="$2"
  NESTED_PATH="$nested_path" python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["NESTED_PATH"])
name = path.name or "surface"
value = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in name.lower())
while "--" in value:
    value = value.replace("--", "-")
value = value.strip("._-") or "surface"
print(value)
PY
}

print_tooling_guidance() {
  local text="$1"
  local target_name="$2"
  local suggested_name="$3"
  local health_profile="$4"
  local suggested_health_profile="$5"

  if [[ "$text" == *"agent-browser"* ]]; then
    printf 'work-at: browser/tooling hint: add fast checks for the local preview URL, the public verification route, and the key app paths used by %s.\n' "$suggested_name" >&2
  fi

  if [[ "$text" == *"cloudflared tunnel"* || "$text" == *"expo start --web"* ]]; then
    printf 'work-at: preview/tunnel hint: add fast checks for the local dev port, preview process ownership, and the declared public route before more browser retries.\n' >&2
  fi

  if [[ -n "$suggested_health_profile" && "$suggested_health_profile" != "$health_profile" ]]; then
    printf 'work-at: suggested health profile for this narrower surface: %s\n' "$suggested_health_profile" >&2
  fi

  if [[ "$health_profile" == "work_at_target_default" ]]; then
    printf 'work-at: target %s is still using the generic profile %s; promote this narrower surface into its own target and add task-specific checks.\n' "$target_name" "$health_profile" >&2
  fi
}

print_surface_guidance() {
  local name="$1"
  local target_path="$2"
  local nested_path="$3"
  local command_text="${4:-}"
  [[ -n "$nested_path" ]] || return 0
  [[ "$nested_path" == "$target_path" ]] && return 0
  case "$nested_path" in
    "$target_path"/*)
      local host shell health_profile suggested_health_profile suffix suggested_name register_command
      host="$(target_field "$name" host || true)"
      shell="$(target_field "$name" shell || true)"
      health_profile="$(target_field "$name" healthProfileId || true)"
      suggested_health_profile="$health_profile"
      if [[ "$command_text" == *"agent-browser"* || "$command_text" == *"cloudflared tunnel"* || "$command_text" == *"expo start --web"* ]]; then
        suggested_health_profile="work_at_expo_preview_surface"
      fi
      suffix="$(suggest_target_name "$name" "$nested_path")"
      suggested_name="${name}-${suffix}"
      register_command="work-at --register ${suggested_name} -- --host ${host:-local} --path $(shell_quote "$nested_path")"
      if [[ -n "$shell" ]]; then
        register_command+=" --shell $(shell_quote "$shell")"
      fi
      if [[ -n "$suggested_health_profile" ]]; then
        register_command+=" --health-profile ${suggested_health_profile}"
      fi
      printf 'work-at: command is operating inside a narrower surface than target %s\n' "$name" >&2
      printf 'work-at: target path: %s\n' "$target_path" >&2
      printf 'work-at: nested path: %s\n' "$nested_path" >&2
      printf 'work-at: register this narrower surface as its own work-at target so agents improve their tooling instead of getting sidetracked.\n' >&2
      printf 'work-at: suggested command: %s\n' "$register_command" >&2
      if [[ -n "$suggested_health_profile" ]]; then
        printf 'work-at: after registering it, run: work-at --health %s\n' "$suggested_name" >&2
      fi
      print_tooling_guidance "$command_text" "$name" "$suggested_name" "$health_profile" "$suggested_health_profile"
      ;;
  esac
}

detect_nested_surface_from_text() {
  local text="$1"
  local target_path="$2"
  TEXT="$text" TARGET_PATH="$target_path" python3 - <<'PY'
import os, re
text = os.environ.get("TEXT", "")
target_path = os.environ.get("TARGET_PATH", "")
patterns = [
    re.compile(r"\bcd\s+(['\"]?)(/[^'\"\s;&|]+)\1"),
]
for pattern in patterns:
    for match in pattern.finditer(text):
        path = match.group(2).strip()
        if path and path != target_path and path.startswith(target_path.rstrip("/") + "/"):
            print(path)
            raise SystemExit(0)
raise SystemExit(1)
PY
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
    local exit_code=0
    local nested_path=""
    local arg
    for arg in "$@"; do
      command_string+=" $(shell_quote "$arg")"
    done
    command_string="${command_string# }"
    nested_path="$(detect_nested_surface_from_text "$*" "$path" || true)"
    print_surface_guidance "$name" "$path" "$nested_path" "$*"
    set +e
    if [[ -z "$host" || "$host" == "local" || "$host" == "localhost" ]]; then
      (
        cd "$path"
        "$@"
      )
      exit_code=$?
    else
      ssh "$host" "cd ${quoted_path} && ${command_string}"
      exit_code=$?
    fi
    set -e
    if [[ "$exit_code" -ne 0 ]]; then
      print_health_guidance "$name"
    fi
    exit "$exit_code"
  fi

  if [[ ! -t 0 ]]; then
    local script_text nested_path exit_code
    script_text="$(cat)"
    nested_path="$(detect_nested_surface_from_text "$script_text" "$path" || true)"
    print_surface_guidance "$name" "$path" "$nested_path" "$script_text"
    set +e
    if [[ -z "$host" || "$host" == "local" || "$host" == "localhost" ]]; then
      cd "$path"
      "$shell" -se <<<"$script_text"
      exit_code=$?
    else
      local quoted_shell
      quoted_shell="$(shell_quote "$shell")"
      ssh "$host" "cd ${quoted_path} && exec ${quoted_shell} -se" <<<"$script_text"
      exit_code=$?
    fi
    set -e
    if [[ "$exit_code" -ne 0 ]]; then
      print_health_guidance "$name"
    fi
    exit "$exit_code"
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
    --describe)
      shift
      describe_target "${1:-}" "${2:-}"
      ;;
    --health)
      shift
      health_target "$@"
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
