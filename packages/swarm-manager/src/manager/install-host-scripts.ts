import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RUNTIME_DIR } from "../paths.js";

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

  const launchWorkerWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bash ${runtimeDir}/packages/swarm-manager/scripts/launch-worker.sh "$@"
`;

  const updateRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/update-runtime.ts "$@"
`;

  const publishWorkerRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
${authEnvPrelude}
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/publish-worker-runtime-release.ts "$@"
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

  writeExecutable(resolve(hostRoot, "launch-worker.sh"), launchWorkerWrapper);
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
  writeExecutable(resolve(hostRoot, "github-app-token.sh"), githubAppTokenWrapper);
  writeExecutable(resolve(hostRoot, "git-askpass.sh"), gitAskpassWrapper);
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
