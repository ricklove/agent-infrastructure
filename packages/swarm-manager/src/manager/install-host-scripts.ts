import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MANAGER_ENV_PATH,
  DEFAULT_MANAGER_NODE_ENV_PATH,
  DEFAULT_RUNTIME_DIR,
  DEFAULT_WORKER_MONITOR_ENV_PATH,
} from "../paths.js";

function optionalOne(args: string[], flag: string): string | undefined {
  const index = args.findIndex((value) => value === `--${flag}`);
  if (index === -1) {
    return undefined;
  }

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }

  return next;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, ensureTrailingNewline(content), { mode: 0o755 });
}

async function main(): Promise<void> {
  const runtimeDir =
    optionalOne(process.argv.slice(2), "runtime-dir") ?? DEFAULT_RUNTIME_DIR;
  const hostRoot = optionalOne(process.argv.slice(2), "host-root") ?? runtimeDir;
  const agentGithubConfigRoot =
    optionalOne(process.argv.slice(2), "agent-github-config-root") ??
    "/home/ec2-user/.config/agent-github";
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(sourceDir, "../..");
  const scriptsDir = resolve(packageRoot, "scripts");

  mkdirSync(hostRoot, { recursive: true });

  const authEnvPrelude = `export AGENT_GITHUB_CONFIG_ROOT="${agentGithubConfigRoot}"
export GIT_ASKPASS="${hostRoot}/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0`;

  const systemEventLogHelper = `#!/usr/bin/env bash
set -euo pipefail

SYSTEM_EVENT_LOG_PATH="\${SYSTEM_EVENT_LOG_PATH:-/home/ec2-user/state/logs/system-events.log}"

system_event_log() {
  local component="$1"
  local comment="$2"
  local details="\${3:-}"
  local line
  mkdir -p "$(dirname "$SYSTEM_EVENT_LOG_PATH")"
  line="[$(date -u +"%Y-%m-%dT%H:%M:%SZ"):\${component}] \${comment}"
  if [[ -n "\${details}" ]]; then
    line="\${line} \${details}"
  fi
  printf '%s\\n' "\${line}" >> "$SYSTEM_EVENT_LOG_PATH"
  printf '%s\\n' "\${line}" >&2
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
  if [[ "$exit_code" -eq 0 ]]; then
    system_event_log "$component" "exit" "exit_code=0"
  else
    system_event_log "$component" "error" "exit_code=$exit_code"
  fi
  return "$exit_code"
}
`;

  const launchWorkerWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bash ${runtimeDir}/packages/swarm-manager/scripts/launch-worker.sh "$@"
`;

  const updateRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
. ${hostRoot}/system-event-log.sh
${authEnvPrelude}
cd ${runtimeDir}
system_event_run "update-runtime.sh" "target=update-runtime.ts args=$*" \\
  bun ${runtimeDir}/packages/swarm-manager/src/manager/update-runtime.ts "$@"
`;

  const publishWorkerRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
. ${hostRoot}/system-event-log.sh
${authEnvPrelude}
cd ${runtimeDir}
system_event_run "publish-worker-runtime-release.sh" "target=publish-worker-runtime-release.ts args=$*" \\
  bun ${runtimeDir}/packages/swarm-manager/src/manager/publish-worker-runtime-release.ts "$@"
`;

  const hibernateWorkersWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/worker-power.ts --action hibernate "$@"
`;

  const wakeWorkersWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/worker-power.ts --action wake "$@"
`;

  const buildWorkerImageWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/build-worker-image.ts "$@"
`;

  const testWorkerImageLifecycleWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/test-worker-image-lifecycle.ts "$@"
`;

  const issueDashboardSessionWrapper = `#!/usr/bin/env bash
set -euo pipefail
. ${hostRoot}/system-event-log.sh
if [ "\${AGENT_RUN_AS_USER_DONE:-0}" != "1" ] && [ "\$(id -u)" = "0" ]; then
  system_event_log "issue-dashboard-session.sh" "sudo.reexec" "user=ec2-user"
  exec sudo -H -u ec2-user env \\
    AGENT_RUN_AS_USER_DONE=1 \\
    AGENT_GITHUB_CONFIG_ROOT="${agentGithubConfigRoot}" \\
    GIT_ASKPASS="${runtimeDir}/git-askpass.sh" \\
    GIT_TERMINAL_PROMPT=0 \\
    bash "$0" "$@"
fi
${authEnvPrelude}
cd ${runtimeDir}
system_event_run "issue-dashboard-session.sh" "target=issue-dashboard-session.ts args=$*" \\
  bun ${runtimeDir}/packages/swarm-manager/src/manager/issue-dashboard-session.ts "$@"
`;

  const githubAppTokenWrapper = `#!/usr/bin/env bash
set -euo pipefail
export AGENT_GITHUB_CONFIG_ROOT="${agentGithubConfigRoot}"
cd ${runtimeDir}
exec bash ${runtimeDir}/scripts/github-app-token.sh "$@"
`;

  const gitAskpassWrapper = `#!/usr/bin/env bash
set -euo pipefail
export AGENT_GITHUB_CONFIG_ROOT="${agentGithubConfigRoot}"
TOKEN="$(bash ${hostRoot}/github-app-token.sh --repo-path "${"$"}{PWD}" token)"

case "${"$"}{1:-}" in
  *Username*|*username*)
    printf '%s\n' "x-access-token"
    ;;
  *Password*|*password*)
    printf '%s\n' "${"$"}{TOKEN}"
    ;;
  *)
    printf '\n'
    ;;
esac
`;

  const runManagerWrapper = `#!/usr/bin/env bash
set -euo pipefail
. ${hostRoot}/system-event-log.sh
set -a
source ${DEFAULT_MANAGER_ENV_PATH}
set +a
cd ${runtimeDir}
system_event_run "run-manager.sh" "target=server.ts args=$*" \\
  bun ${runtimeDir}/packages/swarm-manager/src/manager/server.ts "$@"
`;

  const runManagerNodeWrapper = `#!/usr/bin/env bash
set -euo pipefail
. ${hostRoot}/system-event-log.sh
set -a
source ${DEFAULT_MANAGER_NODE_ENV_PATH}
set +a
cd ${runtimeDir}
system_event_run "run-manager-node.sh" "target=worker/agent.ts args=$*" \\
  bun ${runtimeDir}/packages/swarm-manager/src/worker/agent.ts "$@"
`;

  const runWorkerMonitorWrapper = `#!/usr/bin/env bash
set -euo pipefail
. ${hostRoot}/system-event-log.sh
set -a
source ${DEFAULT_WORKER_MONITOR_ENV_PATH}
set +a
cd ${runtimeDir}
system_event_run "run-worker-monitor.sh" "target=worker/agent.ts args=$*" \\
  bun ${runtimeDir}/packages/swarm-manager/src/worker/agent.ts "$@"
`;

  writeExecutable(resolve(hostRoot, "launch-worker.sh"), launchWorkerWrapper);
  writeExecutable(resolve(hostRoot, "system-event-log.sh"), systemEventLogHelper);
  writeExecutable(resolve(hostRoot, "update-runtime.sh"), updateRuntimeWrapper);
  writeExecutable(
    resolve(hostRoot, "publish-worker-runtime-release.sh"),
    publishWorkerRuntimeWrapper,
  );
  writeExecutable(
    resolve(hostRoot, "hibernate-workers.sh"),
    hibernateWorkersWrapper,
  );
  writeExecutable(resolve(hostRoot, "wake-workers.sh"), wakeWorkersWrapper);
  writeExecutable(
    resolve(hostRoot, "build-worker-image.sh"),
    buildWorkerImageWrapper,
  );
  writeExecutable(
    resolve(hostRoot, "test-worker-image-lifecycle.sh"),
    testWorkerImageLifecycleWrapper,
  );
  writeExecutable(
    resolve(hostRoot, "issue-dashboard-session.sh"),
    issueDashboardSessionWrapper,
  );
  writeExecutable(resolve(hostRoot, "github-app-token.sh"), githubAppTokenWrapper);
  writeExecutable(resolve(hostRoot, "git-askpass.sh"), gitAskpassWrapper);
  writeExecutable(resolve(hostRoot, "run-manager.sh"), runManagerWrapper);
  writeExecutable(resolve(hostRoot, "run-manager-node.sh"), runManagerNodeWrapper);
  writeExecutable(resolve(hostRoot, "run-worker-monitor.sh"), runWorkerMonitorWrapper);
  writeExecutable(
    resolve(hostRoot, "worker-user-data.sh"),
    readFileSync(resolve(scriptsDir, "worker-user-data.sh"), "utf8"),
  );

  console.log(
    JSON.stringify({
      ok: true,
      runtimeDir,
      hostRoot,
      agentGithubConfigRoot,
    }),
  );
}

await main();
