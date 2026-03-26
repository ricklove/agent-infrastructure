#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_ROOT="${AGENT_STATE_ROOT:-/home/ec2-user/state}"
BOOTSTRAP_CONTEXT_PATH="${STATE_ROOT}/bootstrap-context.json"
DEFAULT_MANAGER_URL="${AGENT_SWARM_MANAGER_URL:-http://127.0.0.1:8787}"

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options]

Select a low-load swarm worker when possible, otherwise start or launch one,
bootstrap SSH over SSM, and connect directly to the worker private IP.

Options:
  --instance-id ID           Reuse or connect to a specific worker EC2 instance ID.
  --worker-id ID             Alias for --instance-id.
  --region REGION            AWS region to use. Falls back to bootstrap context, env, or aws config.
  --profile PROFILE          AWS CLI profile to use.
  --swarm-tag-value VALUE    Narrow worker discovery to a specific AgentSwarm tag value.
  --manager-url URL          Swarm manager worker inventory endpoint. Default: ${DEFAULT_MANAGER_URL}
  --remote-user USER         Remote SSH user. Default: ec2-user
  --host-alias NAME          SSH host alias to create. Default: agent-swarm-worker-<instance-id>
  --key-path PATH            SSH private key path. Default: ~/.ssh/agent-swarm-worker-<instance-id>
  --max-cpu-percent N        Max connected-worker CPU to reuse. Default: 40
  --max-memory-percent N     Max connected-worker memory to reuse. Default: 70
  --max-containers N         Max connected-worker container count to reuse. Default: 0
  --instance-type TYPE       Instance type to pass through when launching a new worker.
  --subnet-id SUBNET         Subnet to pass through when launching a new worker.
  --image-id AMI             AMI to pass through when launching a new worker.
  --name NAME                Instance name to pass through when launching a new worker.
  --tag KEY=VALUE            Extra EC2 tag to pass through when launching a new worker.
  --no-launch                Do not create a new worker if no reusable worker exists.
  --no-connect               Resolve, prepare, and validate SSH, but do not open an interactive session.
  --print-host-alias         Print the resolved SSH host alias before exiting.
  -h, --help                 Show this help.
EOF
}

log() {
  printf '[connect-worker-ec2-ssh] %s\n' "$*"
}

fail() {
  printf '[connect-worker-ec2-ssh] %s\n' "$*" >&2
  exit 1
}

require_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "required command not found: ${cmd}"
}

base64_no_wrap() {
  base64 | tr -d '\n'
}

aws_cmd=(aws)
profile=""
region="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
instance_id=""
swarm_tag_value=""
swarm_tag_key="AgentSwarm"
manager_url="${DEFAULT_MANAGER_URL}"
remote_user="ec2-user"
host_alias=""
key_path=""
max_cpu_percent="40"
max_memory_percent="70"
max_containers="0"
launch_instance_type=""
launch_subnet_id=""
launch_image_id=""
launch_name=""
declare -a launch_extra_tags=()
allow_launch="true"
open_ssh="true"
print_host_alias="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-id|--worker-id)
      [[ $# -ge 2 ]] || fail "$1 requires a value"
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
    --manager-url)
      [[ $# -ge 2 ]] || fail "--manager-url requires a value"
      manager_url="$2"
      shift 2
      ;;
    --remote-user)
      [[ $# -ge 2 ]] || fail "--remote-user requires a value"
      remote_user="$2"
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
    --max-cpu-percent)
      [[ $# -ge 2 ]] || fail "--max-cpu-percent requires a value"
      max_cpu_percent="$2"
      shift 2
      ;;
    --max-memory-percent)
      [[ $# -ge 2 ]] || fail "--max-memory-percent requires a value"
      max_memory_percent="$2"
      shift 2
      ;;
    --max-containers)
      [[ $# -ge 2 ]] || fail "--max-containers requires a value"
      max_containers="$2"
      shift 2
      ;;
    --instance-type)
      [[ $# -ge 2 ]] || fail "--instance-type requires a value"
      launch_instance_type="$2"
      shift 2
      ;;
    --subnet-id)
      [[ $# -ge 2 ]] || fail "--subnet-id requires a value"
      launch_subnet_id="$2"
      shift 2
      ;;
    --image-id)
      [[ $# -ge 2 ]] || fail "--image-id requires a value"
      launch_image_id="$2"
      shift 2
      ;;
    --name)
      [[ $# -ge 2 ]] || fail "--name requires a value"
      launch_name="$2"
      shift 2
      ;;
    --tag)
      [[ $# -ge 2 ]] || fail "--tag requires a value"
      launch_extra_tags+=("$2")
      shift 2
      ;;
    --no-launch)
      allow_launch="false"
      shift
      ;;
    --no-connect)
      open_ssh="false"
      shift
      ;;
    --print-host-alias)
      print_host_alias="true"
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
require_command curl
require_command jq
require_command ssh
require_command ssh-keygen

if [[ -n "$profile" ]]; then
  aws_cmd+=(--profile "$profile")
fi

if [[ -s "$BOOTSTRAP_CONTEXT_PATH" ]]; then
  if [[ -z "$region" ]]; then
    region="$(jq -r '.region // empty' "$BOOTSTRAP_CONTEXT_PATH")"
  fi
  if [[ -z "$swarm_tag_value" ]]; then
    swarm_tag_value="$(jq -r '.swarmTagValue // empty' "$BOOTSTRAP_CONTEXT_PATH")"
  fi
  swarm_tag_key="$(jq -r '.swarmTagKey // "AgentSwarm"' "$BOOTSTRAP_CONTEXT_PATH")"
fi

if [[ -z "$region" ]]; then
  region="$("${aws_cmd[@]}" configure get region 2>/dev/null || true)"
fi
[[ -n "$region" ]] || fail "AWS region is not set. Use --region, env vars, bootstrap context, or configure a default region."

if ! "${aws_cmd[@]}" sts get-caller-identity --region "$region" >/dev/null 2>&1; then
  fail "AWS credentials are not available for region ${region}. Authenticate first with aws login or an AWS profile."
fi

select_reusable_worker() {
  curl -sf "${manager_url}/workers" | jq -r \
    --argjson maxCpu "$max_cpu_percent" \
    --argjson maxMemory "$max_memory_percent" \
    --argjson maxContainers "$max_containers" '
      .workers
      | map(
          select(.nodeRole == "worker" and .status == "connected")
          | . + {
              cpu: (.lastMetrics.cpuPercent // 1000),
              memory: (.lastMetrics.memoryPercent // 1000),
              containers: (.lastMetrics.containerCount // 1000)
            }
        )
      | map(select(.cpu <= $maxCpu and .memory <= $maxMemory and .containers <= $maxContainers))
      | sort_by([.containers, .cpu, .memory, .workerId])
      | first
      | if . == null then empty else [.instanceId, .privateIp, .cpu, .memory, .containers] | @tsv end
    ' 2>/dev/null || true
}

describe_worker_instances() {
  local filters=(
    "Name=tag:Role,Values=agent-swarm-worker"
    "Name=instance-state-name,Values=pending,running,stopping,stopped"
  )
  if [[ -n "$swarm_tag_value" ]]; then
    filters+=("Name=tag:${swarm_tag_key},Values=${swarm_tag_value}")
  fi

  "${aws_cmd[@]}" ec2 describe-instances \
    --region "$region" \
    --filters "${filters[@]}" \
    --query 'Reservations[].Instances[].{instanceId:InstanceId,state:State.Name,privateIp:PrivateIpAddress,launchTime:LaunchTime}' \
    --output json
}

pick_existing_instance() {
  local instances_json="$1"
  printf '%s' "$instances_json" | jq -r '
    def rank:
      if .state == "stopped" then 0
      elif .state == "running" then 1
      elif .state == "pending" then 2
      elif .state == "stopping" then 3
      else 100 end;

    map(select(.instanceId != null))
    | sort_by([rank, .launchTime, .instanceId])
    | first
    | if . == null then empty else [.instanceId, .state, (.privateIp // "")] | @tsv end
  '
}

refresh_instance_metadata() {
  "${aws_cmd[@]}" ec2 describe-instances \
    --region "$region" \
    --instance-ids "$instance_id" \
    --query 'Reservations[0].Instances[0].{state:State.Name,privateIp:PrivateIpAddress}' \
    --output json
}

wait_for_ssm_online() {
  local target_instance_id="$1"
  local deadline=$((SECONDS + 300))
  while true; do
    local ping_status
    ping_status="$("${aws_cmd[@]}" ssm describe-instance-information \
      --region "$region" \
      --filters "Key=InstanceIds,Values=${target_instance_id}" \
      --query 'InstanceInformationList[0].PingStatus' \
      --output text 2>/dev/null || true)"
    if [[ "$ping_status" == "Online" ]]; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 3
  done
}

bootstrap_worker_ssh() {
  local target_instance_id="$1"
  local public_key_path="$2"
  local public_key
  public_key="$(<"$public_key_path")"
  local public_key_b64
  public_key_b64="$(printf '%s' "$public_key" | base64_no_wrap)"

  local remote_setup_script
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

  local remote_setup_b64
  remote_setup_b64="$(printf '%s' "$remote_setup_script" | base64_no_wrap)"
  local command_id
  command_id="$("${aws_cmd[@]}" ssm send-command \
    --region "$region" \
    --instance-ids "$target_instance_id" \
    --document-name AWS-RunShellScript \
    --comment "Configure SSH access for worker connection" \
    --parameters "{\"commands\":[\"printf '%s' '${remote_setup_b64}' | base64 -d >/tmp/agent-infrastructure-connect-worker-ec2-ssh.sh && bash /tmp/agent-infrastructure-connect-worker-ec2-ssh.sh\"]}" \
    --query 'Command.CommandId' \
    --output text)"

  log "waiting for SSH bootstrap command ${command_id}"
  local deadline=$((SECONDS + 180))
  while true; do
    local status
    status="$("${aws_cmd[@]}" ssm get-command-invocation \
      --region "$region" \
      --command-id "$command_id" \
      --instance-id "$target_instance_id" \
      --query 'Status' \
      --output text 2>/dev/null || true)"
    case "$status" in
      Success)
        return 0
        ;;
      Pending|InProgress|Delayed|"")
        if (( SECONDS >= deadline )); then
          fail "SSH bootstrap command ${command_id} did not complete within 180 seconds"
        fi
        sleep 3
        ;;
      *)
        local stderr_output
        stderr_output="$("${aws_cmd[@]}" ssm get-command-invocation \
          --region "$region" \
          --command-id "$command_id" \
          --instance-id "$target_instance_id" \
          --query 'StandardErrorContent' \
          --output text 2>/dev/null || true)"
        fail "SSH bootstrap failed with status ${status}: ${stderr_output}"
        ;;
    esac
  done
}

configure_ssh_alias() {
  local target_host_alias="$1"
  local target_private_ip="$2"
  local target_key_path="$3"
  local config_file="${HOME}/.ssh/config"
  local config_block

  touch "$config_file"
  chmod 600 "$config_file"

  config_block="$(cat <<EOF
# agent-infrastructure connect-worker-ec2-ssh begin ${target_host_alias}
Host ${target_host_alias}
    HostName ${target_private_ip}
    User ${remote_user}
    IdentityFile ${target_key_path}
    IdentitiesOnly yes
    ForwardAgent yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ServerAliveCountMax 6
# agent-infrastructure connect-worker-ec2-ssh end ${target_host_alias}
EOF
)"

  local tmp_config
  tmp_config="$(mktemp)"
  if grep -qF "# agent-infrastructure connect-worker-ec2-ssh begin ${target_host_alias}" "$config_file"; then
    awk -v begin="# agent-infrastructure connect-worker-ec2-ssh begin ${target_host_alias}" \
      -v end="# agent-infrastructure connect-worker-ec2-ssh end ${target_host_alias}" \
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
}

if [[ -z "$instance_id" ]]; then
  reusable_worker="$(select_reusable_worker || true)"
  if [[ -n "$reusable_worker" ]]; then
    IFS=$'\t' read -r instance_id private_ip selected_cpu selected_memory selected_containers <<<"$reusable_worker"
    log "reusing connected worker ${instance_id} cpu=${selected_cpu}% memory=${selected_memory}% containers=${selected_containers}"
  fi
fi

if [[ -z "$instance_id" ]]; then
  existing_instances_json="$(describe_worker_instances)"
  existing_instance="$(pick_existing_instance "$existing_instances_json")"
  if [[ -n "$existing_instance" ]]; then
    IFS=$'\t' read -r instance_id instance_state private_ip <<<"$existing_instance"
    log "reusing existing worker ${instance_id} state=${instance_state}"
  fi
fi

if [[ -z "$instance_id" ]]; then
  [[ "$allow_launch" == "true" ]] || fail "no reusable worker exists and --no-launch was set"
  log "launching a new worker"
  launch_cmd=(bash "${ROOT_DIR}/scripts/launch-worker.sh")
  [[ -n "$launch_instance_type" ]] && launch_cmd+=(--instance-type "$launch_instance_type")
  [[ -n "$launch_subnet_id" ]] && launch_cmd+=(--subnet-id "$launch_subnet_id")
  [[ -n "$launch_image_id" ]] && launch_cmd+=(--image-id "$launch_image_id")
  [[ -n "$launch_name" ]] && launch_cmd+=(--name "$launch_name")
  for extra_tag in "${launch_extra_tags[@]}"; do
    launch_cmd+=(--tag "$extra_tag")
  done
  launch_output="$("${launch_cmd[@]}")"
  instance_id="$(printf '%s' "$launch_output" | jq -r '.Instances[0].InstanceId')"
  private_ip="$(printf '%s' "$launch_output" | jq -r '.Instances[0].PrivateIpAddress // empty')"
  [[ -n "$instance_id" && "$instance_id" != "null" ]] || fail "launch-worker did not return an instance id"
  log "launched worker ${instance_id}"
fi

instance_metadata="$(refresh_instance_metadata)"
instance_state="$(printf '%s' "$instance_metadata" | jq -r '.state')"
private_ip="$(printf '%s' "$instance_metadata" | jq -r '.privateIp // empty')"

case "$instance_state" in
  stopped)
    log "starting worker ${instance_id}"
    "${aws_cmd[@]}" ec2 start-instances --region "$region" --instance-ids "$instance_id" >/dev/null
    "${aws_cmd[@]}" ec2 wait instance-running --region "$region" --instance-ids "$instance_id"
    ;;
  stopping)
    log "waiting for worker ${instance_id} to stop before restart"
    "${aws_cmd[@]}" ec2 wait instance-stopped --region "$region" --instance-ids "$instance_id"
    "${aws_cmd[@]}" ec2 start-instances --region "$region" --instance-ids "$instance_id" >/dev/null
    "${aws_cmd[@]}" ec2 wait instance-running --region "$region" --instance-ids "$instance_id"
    ;;
  pending)
    log "waiting for worker ${instance_id} to reach running state"
    "${aws_cmd[@]}" ec2 wait instance-running --region "$region" --instance-ids "$instance_id"
    ;;
  running)
    ;;
  *)
    fail "worker ${instance_id} is in unsupported state ${instance_state}"
    ;;
esac

log "waiting for SSM on ${instance_id}"
wait_for_ssm_online "$instance_id" || fail "SSM did not come online for ${instance_id} within 300 seconds"

instance_metadata="$(refresh_instance_metadata)"
private_ip="$(printf '%s' "$instance_metadata" | jq -r '.privateIp // empty')"
[[ -n "$private_ip" && "$private_ip" != "null" ]] || fail "worker ${instance_id} does not have a private IP"

if [[ -z "$host_alias" ]]; then
  host_alias="agent-swarm-worker-${instance_id}"
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

bootstrap_worker_ssh "$instance_id" "${key_path}.pub"
configure_ssh_alias "$host_alias" "$private_ip" "$key_path"

log "validating SSH connectivity to ${host_alias} (${private_ip})"
ssh_output="$(ssh -o ConnectTimeout=20 "$host_alias" 'printf "%s\n" "$HOSTNAME"' 2>&1)" || fail "SSH validation failed: ${ssh_output}"
log "SSH connected to ${ssh_output}"

if [[ "$print_host_alias" == "true" ]]; then
  printf '%s\n' "$host_alias"
fi

if [[ "$open_ssh" == "true" ]]; then
  exec ssh "$host_alias"
fi
