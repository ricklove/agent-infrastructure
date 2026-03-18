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
exec bun run --filter @agent-infrastructure/swarm-manager run:update-runtime -- "$@"
`;

  const publishWorkerRuntimeWrapper = `#!/usr/bin/env bash
set -euo pipefail
cd ${runtimeDir}
exec bun run --filter @agent-infrastructure/swarm-manager run:publish-worker-runtime-release -- "$@"
`;

  writeExecutable(resolve(hostRoot, "launch-worker.sh"), launchWorkerWrapper);
  writeExecutable(resolve(hostRoot, "update-runtime.sh"), updateRuntimeWrapper);
  writeExecutable(
    resolve(hostRoot, "publish-worker-runtime-release.sh"),
    publishWorkerRuntimeWrapper,
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
