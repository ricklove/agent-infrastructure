import { DEFAULT_WORKSPACE_DIR } from "../paths.js";

const DEFAULT_BASE_BRANCH = "development";
const DEFAULT_REPO_PATH = `${DEFAULT_WORKSPACE_DIR}/projects/agent-infrastructure`;
const DEFAULT_WORKER_WORKTREE_ROOT = `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/agent-infrastructure`;
const DEFAULT_MANAGER_WORKTREE_ROOT = `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/agent-infrastructure-manager`;

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function fail(message: string): never {
  console.error(`[merge-worker-feature] ${message}`);
  process.exit(1);
}

function emitConflictBlock(hostAlias: string, featureBranch: string, workerWorktreePath: string): never {
  const resolveCommand = `ssh ${hostAlias} 'cd ${workerWorktreePath} && exec bash -l'`;
  console.error(`merge_outcome=worker_conflict_resolution_required`);
  console.error(`[merge-worker-feature] worker feature branch requires merge conflict resolution`);
  console.error(`worker_alias=${hostAlias}`);
  console.error(`feature_branch=${featureBranch}`);
  console.error(`worker_worktree=${workerWorktreePath}`);
  console.error(`resolve_command=${resolveCommand}`);
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function usage(): never {
  console.log("Usage: bun run src/manager/merge-feature.ts -- <feature-branch-name>");
  process.exit(1);
}

function refreshSharedDevelopmentCheckout(): void {
  runChecked(["chmod", "-R", "u+w", DEFAULT_REPO_PATH]);
  try {
    runChecked(["git", "fetch", "origin", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH);
    const currentBranch = runChecked(["git", "rev-parse", "--abbrev-ref", "HEAD"], DEFAULT_REPO_PATH);
    if (currentBranch !== DEFAULT_BASE_BRANCH) {
      runChecked(["git", "checkout", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH);
    }
    runChecked(["git", "pull", "--ff-only", "origin", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH);
  } finally {
    runChecked(["chmod", "-R", "a-w", DEFAULT_REPO_PATH]);
  }
}

function branchDirName(branchName: string): string {
  return branchName
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function resolveHostAlias(): string {
  const stdout = runChecked([
    "bun",
    "run",
    "src/manager/connect-worker-ec2-ssh.ts",
    "--no-connect",
    "--print-host-alias",
  ]);
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const alias = lines.at(-1) ?? "";
  if (!alias || alias.startsWith("[connect-worker-ec2-ssh]")) {
    fail("could not resolve worker SSH alias");
  }
  return alias;
}

function ensureWorkerBranchReady(hostAlias: string, branchName: string): string {
  const workerWorktreePath = `${DEFAULT_WORKER_WORKTREE_ROOT}/${branchDirName(branchName)}`;
  const mergeBaseBranch = `merge-base/${branchDirName(branchName)}`;
  const remoteScript = [
    "set -euo pipefail",
    `WORKTREE=${shellQuote(workerWorktreePath)}`,
    `BRANCH=${shellQuote(branchName)}`,
    `MERGE_BASE_BRANCH=${shellQuote(mergeBaseBranch)}`,
    'test -d "$WORKTREE"',
    'cd "$WORKTREE"',
    'if ! git show-ref --verify --quiet "refs/heads/$MERGE_BASE_BRANCH"; then',
    '  echo "worker merge-base branch is missing: $MERGE_BASE_BRANCH" >&2',
    "  exit 1",
    "fi",
    'current_branch=$(git rev-parse --abbrev-ref HEAD)',
    'if [ "$current_branch" != "$BRANCH" ]; then',
    '  echo "worker worktree is not on expected branch: $current_branch" >&2',
    "  exit 1",
    "fi",
    'git merge --no-edit "$MERGE_BASE_BRANCH"',
  ].join("\n");

  const result = runCommand(["ssh", hostAlias, remoteScript]);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    if (stderr) {
      console.error(stderr);
    }
    const conflictDetected =
      stderr.includes("CONFLICT") ||
      stderr.includes("Automatic merge failed") ||
      stderr.includes("fix conflicts");
    if (conflictDetected) {
      emitConflictBlock(hostAlias, branchName, workerWorktreePath);
    }
    fail(`command failed: ssh ${hostAlias} <merge worker merge-base branch>`);
  }
  return workerWorktreePath;
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

  const mergeBaseBranch = `merge-base/${featureDirName}`;
  const integrationBranch = `merge-${featureDirName}`;
  const managerWorktreePath = `${DEFAULT_MANAGER_WORKTREE_ROOT}/${featureDirName}`;
  const hostAlias = resolveHostAlias();
  const workerWorktreePath = `${DEFAULT_WORKER_WORKTREE_ROOT}/${featureDirName}`;
  const workerRepoRemote = `ssh://ec2-user@${hostAlias}${workerWorktreePath}`;

  runChecked(["git", "fetch", "origin", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH);
  runChecked(
    [
      "git",
      "push",
      workerRepoRemote,
      `refs/remotes/origin/${DEFAULT_BASE_BRANCH}:refs/heads/${mergeBaseBranch}`,
    ],
    DEFAULT_REPO_PATH,
  );

  ensureWorkerBranchReady(hostAlias, featureBranch);

  if (runCommand(["git", "show-ref", "--verify", "--quiet", `refs/heads/${integrationBranch}`], DEFAULT_REPO_PATH)
    .exitCode === 0) {
    fail(`manager integration branch already exists: ${integrationBranch}`);
  }

  if (runCommand(["test", "-e", managerWorktreePath]).exitCode === 0) {
    fail(`manager integration worktree path already exists: ${managerWorktreePath}`);
  }

  runChecked(
    ["git", "worktree", "add", "-b", integrationBranch, managerWorktreePath, `origin/${DEFAULT_BASE_BRANCH}`],
    DEFAULT_REPO_PATH,
  );

  runChecked(
    ["git", "fetch", workerRepoRemote, `${featureBranch}:refs/heads/${featureBranch}`],
    managerWorktreePath,
  );
  runChecked(["git", "merge", "--no-edit", featureBranch], managerWorktreePath);
  runChecked(["git", "push", "origin", `${integrationBranch}:${DEFAULT_BASE_BRANCH}`], managerWorktreePath);
  refreshSharedDevelopmentCheckout();

  console.log(`merge_outcome=completed`);
  console.log(`worker_alias=${hostAlias}`);
  console.log(`feature_branch=${featureBranch}`);
  console.log(`worker_merge_base_branch=${mergeBaseBranch}`);
  console.log(`worker_worktree=${workerWorktreePath}`);
  console.log(`manager_branch=${integrationBranch}`);
  console.log(`manager_feature_branch=${featureBranch}`);
  console.log(`manager_worktree=${managerWorktreePath}`);
  console.log(`start_command=cd ${managerWorktreePath} && exec bash -l`);
}

main();
