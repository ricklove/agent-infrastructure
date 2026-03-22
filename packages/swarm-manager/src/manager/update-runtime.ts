import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_BOOTSTRAP_CONTEXT_PATH,
  DEFAULT_RUNTIME_DIR,
} from "../paths.js";

type BootstrapContext = {
  runtimeRepoUrl?: string;
  runtimeRepoRef?: string;
  region?: string;
  workerRuntimeReleaseBucketName?: string;
};

type UpdateRuntimeConfig = {
  runtimeDir: string;
  bootstrapContextPath: string;
  repoUrl: string;
  repoRef: string;
  releaseId: string;
  restartServices: boolean;
};

function logStep(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

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

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}

function readBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as BootstrapContext;
  } catch {
    return {};
  }
}

function parseArgs(argv: string[]): UpdateRuntimeConfig {
  const bootstrapContextPath =
    optionalOne(argv, "bootstrap-context") ?? DEFAULT_BOOTSTRAP_CONTEXT_PATH;
  const bootstrapContext = readBootstrapContext(bootstrapContextPath);
  const runtimeDir = optionalOne(argv, "runtime-dir") ?? DEFAULT_RUNTIME_DIR;
  const repoUrl =
    optionalOne(argv, "repo-url") ??
    bootstrapContext.runtimeRepoUrl?.trim() ??
    "";
  const repoRef =
    optionalOne(argv, "repo-ref") ??
    bootstrapContext.runtimeRepoRef?.trim() ??
    "development";
  const releaseId =
    optionalOne(argv, "release-id") ??
    `git-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;

  if (!repoUrl) {
    throw new Error("runtime repo url is required");
  }

  return {
    runtimeDir,
    bootstrapContextPath,
    repoUrl,
    repoRef,
    releaseId,
    restartServices: !hasFlag(argv, "no-restart"),
  };
}

function runChecked(
  command: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
): void {
  logStep(`update-runtime: run ${command.join(" ")}`);
  const result = Bun.spawnSync(command, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    logStep(`update-runtime: command failed (${result.exitCode}) ${command.join(" ")}`);
    throw new Error(`command failed: ${command.join(" ")}`);
  }
}

function ensureGitCheckout(config: UpdateRuntimeConfig): void {
  if (!existsSync(`${config.runtimeDir}/.git`)) {
    runChecked([
      "git",
      "clone",
      "--branch",
      config.repoRef,
      "--single-branch",
      config.repoUrl,
      config.runtimeDir,
    ]);
    return;
  }

  runChecked(["git", "fetch", "--tags", "origin"], config.runtimeDir);
  runChecked(["git", "checkout", config.repoRef], config.runtimeDir);
  runChecked(["git", "pull", "--ff-only", "origin", config.repoRef], config.runtimeDir);
}

function maybeRestartService(name: string): void {
  logStep(`update-runtime: restart ${name}`);
  const result = Bun.spawnSync(["systemctl", "restart", name], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`failed to restart ${name}`);
  }
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  logStep(`update-runtime: start runtimeDir=${config.runtimeDir} repoRef=${config.repoRef}`);

  ensureGitCheckout(config);
  runChecked(["bun", "install", "--frozen-lockfile"], config.runtimeDir);
  runChecked(
    [
      "bun",
      "run",
      "--filter",
      "@agent-infrastructure/swarm-manager",
      "run:install-host-scripts",
      "--",
      "--runtime-dir",
      config.runtimeDir,
    ],
    config.runtimeDir,
  );
  runChecked(["bun", "run", "build:dashboard"], config.runtimeDir);
  runChecked(
    [
      "bun",
      "run",
      "--filter",
      "@agent-infrastructure/swarm-manager",
      "run:publish-worker-runtime-release",
      "--",
      "--runtime-dir",
      config.runtimeDir,
      "--bootstrap-context",
      config.bootstrapContextPath,
      "--release-id",
      config.releaseId,
    ],
    config.runtimeDir,
  );

  if (config.restartServices) {
    maybeRestartService("agent-swarm-monitor.service");
    maybeRestartService("agent-swarm-manager-node.service");
  }

  logStep("update-runtime: complete");

  console.log(
    JSON.stringify({
      ok: true,
      runtimeDir: config.runtimeDir,
      repoUrl: config.repoUrl,
      repoRef: config.repoRef,
      releaseId: config.releaseId,
      restartServices: config.restartServices,
    }),
  );
}

await main();
