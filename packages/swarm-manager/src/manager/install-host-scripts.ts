import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    optionalOne(process.argv.slice(2), "runtime-dir") ?? "/opt/agent-swarm/runtime";
  const hostRoot =
    optionalOne(process.argv.slice(2), "host-root") ?? "/opt/agent-swarm";
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(sourceDir, "../..");
  const scriptsDir = resolve(packageRoot, "scripts");

  mkdirSync(hostRoot, { recursive: true });

  const launchWorkerWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bash ${runtimeDir}/packages/swarm-manager/scripts/launch-worker.sh "$@"
`;

  const updateRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/update-runtime.ts "$@"
`;

  const publishWorkerRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/publish-worker-runtime-release.ts "$@"
`;

  const hibernateWorkersWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/worker-power.ts --action hibernate "$@"
`;

  const wakeWorkersWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/worker-power.ts --action wake "$@"
`;

  const buildWorkerImageWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/build-worker-image.ts "$@"
`;

  const testWorkerImageLifecycleWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun ${runtimeDir}/packages/swarm-manager/src/manager/test-worker-image-lifecycle.ts "$@"
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
  writeExecutable(
    resolve(hostRoot, "worker-user-data.sh"),
    readFileSync(resolve(scriptsDir, "worker-user-data.sh"), "utf8"),
  );

  console.log(
    JSON.stringify({
      ok: true,
      runtimeDir,
      hostRoot,
    }),
  );
}

await main();
