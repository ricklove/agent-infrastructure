#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options]

Connect VS Code to the swarm manager over SSH tunneled through AWS SSM.

Options:
  --instance-id ID         Use a specific manager EC2 instance ID.
  --region REGION          AWS region to use. Falls back to AWS_REGION, AWS_DEFAULT_REGION, or aws config.
  --profile PROFILE        AWS CLI profile to use.
  --swarm-tag-value VALUE  Narrow manager discovery to a specific AgentSwarm tag value.
  --remote-user USER       Remote SSH user. Default: ec2-user
  --remote-path PATH       Remote folder to open in VS Code. Default: /opt/agent-swarm/runtime
  --host-alias NAME        SSH host alias to create. Default: agent-swarm-manager-<instance-id>
  --key-path PATH          SSH private key path. Default: ~/.ssh/agent-swarm-manager-<instance-id>
  --print-host-alias       Print the resolved SSH host alias to stdout before exiting.
  --no-launch              Configure and validate SSH, but do not launch VS Code.
  -h, --help               Show this help.
EOF
}

log() {
  printf '[connect-vscode] %s\n' "$*"
}

fail() {
  printf '[connect-vscode] %s\n' "$*" >&2
  exit 1
}

require_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "required command not found: ${cmd}"
}

has_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1
}

windows_command_path() {
  local cmd="$1"

  if has_command "$cmd"; then
    command -v "$cmd"
    return 0
  fi

  local candidate="/mnt/c/Windows/System32/${cmd}"
  if [[ -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/${cmd}"
  if [[ -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

is_wsl() {
  [[ -n "${WSL_DISTRO_NAME:-}" ]] && return 0
  grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null
}

require_session_manager_plugin() {
  if command -v session-manager-plugin >/dev/null 2>&1; then
    return 0
  fi

  fail "$(cat <<'EOF'
required command not found: session-manager-plugin

AWS SSM interactive sessions need the Session Manager plugin installed locally.

Linux install:
  curl -fsSL "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o /tmp/session-manager-plugin.deb
  sudo dpkg -i /tmp/session-manager-plugin.deb

Then verify:
  session-manager-plugin
EOF
)"
}

base64_no_wrap() {
  base64 | tr -d '\n'
}

launch_vscode_remote() {
  local folder_uri="$1"

  if has_command code; then
    if code --list-extensions >/dev/null 2>&1; then
      if ! code --list-extensions | grep -qx 'ms-vscode-remote.remote-ssh'; then
        log "installing VS Code Remote - SSH extension"
        code --install-extension ms-vscode-remote.remote-ssh >/dev/null
      fi
    fi
    code --new-window --folder-uri "$folder_uri" >/dev/null 2>&1 &
    disown || true
    return 0
  fi

  if has_command powershell.exe; then
    powershell.exe -NoProfile -NonInteractive -Command \
      "code --install-extension ms-vscode-remote.remote-ssh | Out-Null; code --new-window --folder-uri '$folder_uri'" \
      >/dev/null 2>&1 &
    disown || true
    return 0
  fi

  if has_command cmd.exe; then
    cmd.exe /c "code --install-extension ms-vscode-remote.remote-ssh >nul 2>nul & code --new-window --folder-uri \"$folder_uri\"" \
      >/dev/null 2>&1 &
    disown || true
    return 0
  fi

  return 1
}

resolve_windows_home() {
  local ps_cmd
  if ps_cmd="$(windows_command_path powershell.exe 2>/dev/null)"; then
    "$ps_cmd" -NoProfile -NonInteractive -Command '$env:USERPROFILE' 2>/dev/null | tr -d '\r' | tail -n 1
    return 0
  fi

  local cmd_cmd
  if cmd_cmd="$(windows_command_path cmd.exe 2>/dev/null)"; then
    "$cmd_cmd" /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r' | tail -n 1
    return 0
  fi

  return 1
}

to_windows_path() {
  local linux_path="$1"

  if has_command wslpath; then
    wslpath -w "$linux_path"
    return 0
  fi

  return 1
}

sync_windows_ssh_config() {
  local host_alias="$1"
  local instance_id="$2"
  local remote_user="$3"
  local key_path="$4"
  local profile="$5"
  local region="$6"

  is_wsl || return 0

  local windows_home
  windows_home="$(resolve_windows_home || true)"
  if [[ -z "$windows_home" ]]; then
    log "WSL detected, but Windows home could not be resolved; skipping Windows SSH sync"
    return 0
  fi

  local windows_home_wsl
  if has_command wslpath; then
    windows_home_wsl="$(wslpath "$windows_home")"
  else
    log "WSL detected, but wslpath is unavailable; skipping Windows SSH sync"
    return 0
  fi

  local windows_ssh_dir="${windows_home_wsl}/.ssh"
  mkdir -p "$windows_ssh_dir"

  local windows_key_path="${windows_ssh_dir}/${host_alias}"
  cp "$key_path" "$windows_key_path"
  cp "${key_path}.pub" "${windows_key_path}.pub"

  local windows_config_file="${windows_ssh_dir}/config"
  touch "$windows_config_file"

  local profile_arg=""
  if [[ -n "$profile" ]]; then
    profile_arg=" --profile ${profile}"
  fi

  local windows_key_path_native
  windows_key_path_native="$(to_windows_path "$windows_key_path" || true)"
  if [[ -z "$windows_key_path_native" ]]; then
    log "failed to convert ${windows_key_path} to a Windows path; skipping Windows SSH sync"
    return 0
  fi

  windows_key_path_native="${windows_key_path_native//\\/\\\\}"

  local config_block
  config_block="$(cat <<EOF
# agent-infrastructure connect-vscode begin ${host_alias}
Host ${host_alias}
    HostName ${instance_id}
    User ${remote_user}
    IdentityFile ${windows_key_path_native}
    IdentitiesOnly yes
    ForwardAgent yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ServerAliveCountMax 6
    ProxyCommand aws${profile_arg} ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p --region ${region}
# agent-infrastructure connect-vscode end ${host_alias}
EOF
)"

  local tmp_config
  tmp_config="$(mktemp)"
  if grep -qF "# agent-infrastructure connect-vscode begin ${host_alias}" "$windows_config_file"; then
    awk -v begin="# agent-infrastructure connect-vscode begin ${host_alias}" \
        -v end="# agent-infrastructure connect-vscode end ${host_alias}" \
        -v replacement="$config_block" '
      $0 == begin {
        print replacement
        in_block = 1
        next
      }
      $0 == end {
        in_block = 0
        next
      }
      !in_block { print }
    ' "$windows_config_file" >"$tmp_config"
  else
    cat "$windows_config_file" >"$tmp_config"
    if [[ -s "$tmp_config" ]]; then
      printf '\n' >>"$tmp_config"
    fi
    printf '%s\n' "$config_block" >>"$tmp_config"
  fi
  mv "$tmp_config" "$windows_config_file"

  log "synced Windows SSH config at ${windows_config_file}"
  log "copied SSH key to ${windows_key_path}"
}

aws_cmd=(
  aws
)
profile=""
region="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
instance_id=""
swarm_tag_value=""
remote_user="ec2-user"
remote_path="/opt/agent-swarm/runtime"
host_alias=""
key_path=""
launch_vscode="true"
print_host_alias="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-id)
      [[ $# -ge 2 ]] || fail "--instance-id requires a value"
      instance_id="$2"
      shift 2
      ;;
    --region)
      [[ $# -ge 2 ]] || fail "--region requires a value"
      region="$2"
      shift 2
      ;;
    --profile)
      [[ $# -ge 2 ]] || fail "--profile requires a value"
      profile="$2"
      shift 2
      ;;
    --swarm-tag-value)
      [[ $# -ge 2 ]] || fail "--swarm-tag-value requires a value"
      swarm_tag_value="$2"
      shift 2
      ;;
    --remote-user)
      [[ $# -ge 2 ]] || fail "--remote-user requires a value"
      remote_user="$2"
      shift 2
      ;;
    --remote-path)
      [[ $# -ge 2 ]] || fail "--remote-path requires a value"
      remote_path="$2"
      shift 2
      ;;
    --host-alias)
      [[ $# -ge 2 ]] || fail "--host-alias requires a value"
      host_alias="$2"
      shift 2
      ;;
    --key-path)
      [[ $# -ge 2 ]] || fail "--key-path requires a value"
      key_path="$2"
      shift 2
      ;;
    --print-host-alias)
      print_host_alias="true"
      shift
      ;;
    --no-launch)
      launch_vscode="false"
      shift
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

require_command aws
require_command ssh
require_command ssh-keygen
require_session_manager_plugin

if [[ -n "$profile" ]]; then
  aws_cmd+=(--profile "$profile")
fi

if [[ -z "$region" ]]; then
  region="$("${aws_cmd[@]}" configure get region 2>/dev/null || true)"
fi
[[ -n "$region" ]] || fail "AWS region is not set. Use --region, AWS_REGION, AWS_DEFAULT_REGION, or configure a default region."

if ! "${aws_cmd[@]}" sts get-caller-identity --region "$region" >/dev/null 2>&1; then
  fail "AWS credentials are not available for region ${region}. Authenticate first with aws login or an AWS profile."
fi

discover_manager_instances() {
  local filters=(
    "Name=tag:Role,Values=agent-swarm-manager"
    "Name=instance-state-name,Values=pending,running,stopping,stopped"
  )
  if [[ -n "$swarm_tag_value" ]]; then
    filters+=("Name=tag:AgentSwarm,Values=${swarm_tag_value}")
  fi

  "${aws_cmd[@]}" ec2 describe-instances \
    --region "$region" \
    --filters "${filters[@]}" \
    --query 'Reservations[].Instances[].[InstanceId,State.Name,Tags[?Key==`AgentSwarm`]|[0].Value]' \
    --output text
}

if [[ -z "$instance_id" ]]; then
  mapfile -t candidates < <(discover_manager_instances)
  if [[ "${#candidates[@]}" -eq 0 ]]; then
    fail "no manager instances found in region ${region}"
  fi
  if [[ "${#candidates[@]}" -gt 1 ]]; then
    printf '[connect-vscode] multiple manager instances found:\n' >&2
    printf '  %s\n' "${candidates[@]}" >&2
    fail "pass --instance-id or --swarm-tag-value to select one"
  fi
  instance_id="$(awk '{print $1}' <<<"${candidates[0]}")"
fi

instance_state="$("${aws_cmd[@]}" ec2 describe-instances \
  --region "$region" \
  --instance-ids "$instance_id" \
  --query 'Reservations[0].Instances[0].State.Name' \
  --output text)"

[[ "$instance_state" != "None" ]] || fail "instance ${instance_id} was not found in region ${region}"

if [[ "$instance_state" == "stopped" || "$instance_state" == "stopping" ]]; then
  log "starting instance ${instance_id}"
  "${aws_cmd[@]}" ec2 start-instances --region "$region" --instance-ids "$instance_id" >/dev/null
  "${aws_cmd[@]}" ec2 wait instance-running --region "$region" --instance-ids "$instance_id"
fi

log "waiting for SSM on ${instance_id}"
deadline=$((SECONDS + 180))
while true; do
  ping_status="$("${aws_cmd[@]}" ssm describe-instance-information \
    --region "$region" \
    --filters "Key=InstanceIds,Values=${instance_id}" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || true)"
  if [[ "$ping_status" == "Online" ]]; then
    break
  fi
  if (( SECONDS >= deadline )); then
    fail "SSM did not come online for ${instance_id} within 180 seconds"
  fi
  sleep 3
done

if [[ -z "$host_alias" ]]; then
  host_alias="agent-swarm-manager-${instance_id}"
fi

if [[ -z "$key_path" ]]; then
  key_path="${HOME}/.ssh/${host_alias}"
fi

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"

if [[ ! -f "$key_path" ]]; then
  log "generating SSH key ${key_path}"
  ssh-keygen -q -t ed25519 -N "" -C "$host_alias" -f "$key_path"
fi
chmod 600 "$key_path"
chmod 644 "${key_path}.pub"

public_key="$(<"${key_path}.pub")"
public_key_b64="$(printf '%s' "$public_key" | base64_no_wrap)"

remote_setup_script="$(cat <<EOF
#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER='${remote_user}'
PUBKEY_B64='${public_key_b64}'
PUBKEY="\$(printf '%s' "\$PUBKEY_B64" | base64 -d)"

if ! id -u "\$REMOTE_USER" >/dev/null 2>&1; then
  echo "remote user \$REMOTE_USER does not exist" >&2
  exit 1
fi

if ! command -v sshd >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y openssh-server
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server
  else
    echo "openssh-server is not installed and no supported package manager was found" >&2
    exit 1
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now sshd 2>/dev/null || systemctl enable --now ssh
  systemctl restart sshd 2>/dev/null || systemctl restart ssh
fi

HOME_DIR="\$(getent passwd "\$REMOTE_USER" | cut -d: -f6)"
[[ -n "\$HOME_DIR" ]] || {
  echo "failed to resolve home directory for \$REMOTE_USER" >&2
  exit 1
}

install -d -m 700 -o "\$REMOTE_USER" -g "\$REMOTE_USER" "\$HOME_DIR/.ssh"
touch "\$HOME_DIR/.ssh/authorized_keys"
grep -qxF "\$PUBKEY" "\$HOME_DIR/.ssh/authorized_keys" || printf '%s\n' "\$PUBKEY" >> "\$HOME_DIR/.ssh/authorized_keys"
chown "\$REMOTE_USER:\$REMOTE_USER" "\$HOME_DIR/.ssh/authorized_keys"
chmod 600 "\$HOME_DIR/.ssh/authorized_keys"
EOF
)"

remote_setup_b64="$(printf '%s' "$remote_setup_script" | base64_no_wrap)"
command_id="$("${aws_cmd[@]}" ssm send-command \
  --region "$region" \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --comment "Configure SSH access for VS Code Remote" \
  --parameters "{\"commands\":[\"printf '%s' '${remote_setup_b64}' | base64 -d >/tmp/agent-infrastructure-connect-vscode.sh && bash /tmp/agent-infrastructure-connect-vscode.sh\"]}" \
  --query 'Command.CommandId' \
  --output text)"

log "waiting for SSH bootstrap command ${command_id}"
deadline=$((SECONDS + 180))
while true; do
  status="$("${aws_cmd[@]}" ssm get-command-invocation \
    --region "$region" \
    --command-id "$command_id" \
    --instance-id "$instance_id" \
    --query 'Status' \
    --output text 2>/dev/null || true)"
  case "$status" in
    Success)
      break
      ;;
    Pending|InProgress|Delayed|"")
      if (( SECONDS >= deadline )); then
        fail "SSH bootstrap command ${command_id} did not complete within 180 seconds"
      fi
      sleep 3
      ;;
    *)
      stderr_output="$("${aws_cmd[@]}" ssm get-command-invocation \
        --region "$region" \
        --command-id "$command_id" \
        --instance-id "$instance_id" \
        --query 'StandardErrorContent' \
        --output text 2>/dev/null || true)"
      fail "SSH bootstrap failed with status ${status}: ${stderr_output}"
      ;;
  esac
done

config_file="${HOME}/.ssh/config"
touch "$config_file"
chmod 600 "$config_file"

profile_arg=""
if [[ -n "$profile" ]]; then
  profile_arg=" --profile ${profile}"
fi

config_block="$(cat <<EOF
# agent-infrastructure connect-vscode begin ${host_alias}
Host ${host_alias}
    HostName ${instance_id}
    User ${remote_user}
    IdentityFile ${key_path}
    IdentitiesOnly yes
    ForwardAgent yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ServerAliveCountMax 6
    ProxyCommand sh -lc "aws${profile_arg} ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p' --region ${region}"
# agent-infrastructure connect-vscode end ${host_alias}
EOF
)"

tmp_config="$(mktemp)"
if grep -qF "# agent-infrastructure connect-vscode begin ${host_alias}" "$config_file"; then
  awk -v begin="# agent-infrastructure connect-vscode begin ${host_alias}" \
      -v end="# agent-infrastructure connect-vscode end ${host_alias}" \
      -v replacement="$config_block" '
    $0 == begin {
      print replacement
      in_block = 1
      next
    }
    $0 == end {
      in_block = 0
      next
    }
    !in_block { print }
  ' "$config_file" >"$tmp_config"
else
  cat "$config_file" >"$tmp_config"
  if [[ -s "$tmp_config" ]]; then
    printf '\n' >>"$tmp_config"
  fi
  printf '%s\n' "$config_block" >>"$tmp_config"
fi
mv "$tmp_config" "$config_file"

sync_windows_ssh_config \
  "$host_alias" \
  "$instance_id" \
  "$remote_user" \
  "$key_path" \
  "$profile" \
  "$region"

log "validating SSH connectivity to ${host_alias}"
ssh_output="$(ssh -o ConnectTimeout=20 "$host_alias" 'printf "%s\n" "$HOSTNAME"' 2>&1)" || fail "SSH validation failed: ${ssh_output}"
log "SSH connected to ${ssh_output}"

log "SSH host alias: ${host_alias}"
log "remote path: ${remote_path}"

if [[ "$launch_vscode" == "true" ]]; then
  folder_uri="vscode-remote://ssh-remote+${host_alias}${remote_path}"
  if launch_vscode_remote "$folder_uri"; then
    log "launched VS Code remote window"
  else
    log "VS Code CLI was not available in this shell"
    log "open manually with: code --new-window --folder-uri ${folder_uri}"
  fi
else
  log "skipped VS Code launch because --no-launch was set"
fi

if [[ "$print_host_alias" == "true" ]]; then
  printf '%s\n' "$host_alias"
fi
