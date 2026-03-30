import { DEFAULT_WORKSPACE_DIR } from "../paths.js";

const DEFAULT_BASE_BRANCH = "development";
const DEFAULT_REPO_PATH = `${DEFAULT_WORKSPACE_DIR}/projects/agent-infrastructure`;
const DEFAULT_WORKTREE_ROOT = `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/agent-infrastructure-manager`;

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function fail(message: string): never {
  console.error(`[merge-manager-feature] ${message}`);
  process.exit(1);
}

function runCommand(command: string[], cwd?: string): CommandResult {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

function runChecked(command: string[], cwd?: string): string {
  const result = runCommand(command, cwd);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    if (stderr) {
      console.error(stderr);
    }
    fail(`command failed: ${command.join(" ")}`);
  }
  return result.stdout.trim();
}

function usage(): never {
  console.log("Usage: bun run src/manager/merge-manager-feature.ts -- <feature-branch-name>");
  process.exit(1);
}

function branchDirName(branchName: string): string {
  return branchName
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function main() {
  const featureBranch = process.argv.slice(2).find((value) => value !== "--")?.trim() ?? "";
  if (!featureBranch) {
    usage();
  }

  const featureDirName = branchDirName(featureBranch);
  if (!featureDirName) {
    fail("feature branch name must contain at least one path-safe character");
  }

  const managerWorktreePath = `${DEFAULT_WORKTREE_ROOT}/${featureDirName}`;

  runChecked(["git", "fetch", "origin", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH);

  if (runCommand(["git", "show-ref", "--verify", "--quiet", `refs/heads/${featureBranch}`], DEFAULT_REPO_PATH).exitCode !== 0) {
    fail(`manager feature branch does not exist: ${featureBranch}`);
  }

  if (runCommand(["test", "-d", managerWorktreePath]).exitCode !== 0) {
    fail(`manager feature worktree path does not exist: ${managerWorktreePath}`);
  }

  const currentBranch = runChecked(["git", "rev-parse", "--abbrev-ref", "HEAD"], managerWorktreePath);
  if (currentBranch !== featureBranch) {
    fail(`manager feature worktree is not on expected branch: ${currentBranch}`);
  }

  runChecked(["git", "merge", "--no-edit", `origin/${DEFAULT_BASE_BRANCH}`], managerWorktreePath);
  runChecked(["git", "push", "origin", `HEAD:${DEFAULT_BASE_BRANCH}`], managerWorktreePath);
  runChecked(["git", "fetch", "origin", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH);

  console.log(`merge_outcome=completed`);
  console.log(`feature_branch=${featureBranch}`);
  console.log(`manager_worktree=${managerWorktreePath}`);
  console.log(`start_command=cd ${managerWorktreePath} && exec bash -l`);
}

main();
