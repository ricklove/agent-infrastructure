import { parseRepoProfileArg, resolveRepoProfile } from "./repo-profiles.js"

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function fail(message: string): never {
  console.error(`[merge-worker-feature] ${message}`)
  process.exit(1)
}

function emitConflictBlock(
  hostAlias: string,
  featureBranch: string,
  workerWorktreePath: string,
): never {
  const resolveCommand = `ssh ${hostAlias} 'cd ${workerWorktreePath} && exec bash -l'`
  console.error(`merge_outcome=worker_conflict_resolution_required`)
  console.error(
    `[merge-worker-feature] worker feature branch requires merge conflict resolution`,
  )
  console.error(`worker_alias=${hostAlias}`)
  console.error(`feature_branch=${featureBranch}`)
  console.error(`worker_worktree=${workerWorktreePath}`)
  console.error(`resolve_command=${resolveCommand}`)
  process.exit(1)
}

function runCommand(command: string[], cwd?: string): CommandResult {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  }
}

function runChecked(command: string[], cwd?: string): string {
  const result = runCommand(command, cwd)
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim()
    if (stderr) {
      console.error(stderr)
    }
    fail(`command failed: ${command.join(" ")}`)
  }
  return result.stdout.trim()
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function usage(): never {
  console.log(
    "Usage: bun run src/manager/merge-feature.ts -- [--repo-profile <profile>] <feature-branch-name>",
  )
  process.exit(1)
}

function setSharedCheckoutWritable(repoPath: string, writable: boolean): void {
  const mode = writable ? "u+w" : "a-w"
  const script = [
    "set -euo pipefail",
    `repo=${shellQuote(repoPath)}`,
    `chmod ${mode} "$repo"`,
    `find "$repo" -path "$repo/.git" -prune -o -exec chmod ${mode} {} +`,
  ].join("\n")
  runChecked(["bash", "-lc", script])
}

function refreshSharedDevelopmentCheckout(
  repoPath: string,
  baseBranch: string,
): void {
  setSharedCheckoutWritable(repoPath, true)
  try {
    runChecked(["git", "fetch", "origin", baseBranch], repoPath)
    const currentBranch = runChecked(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      repoPath,
    )
    if (currentBranch !== baseBranch) {
      runChecked(["git", "checkout", baseBranch], repoPath)
    }
    runChecked(["git", "pull", "--ff-only", "origin", baseBranch], repoPath)
  } finally {
    setSharedCheckoutWritable(repoPath, false)
  }
}

function branchDirName(branchName: string): string {
  return branchName
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
}

function resolveHostAlias(): string {
  const stdout = runChecked([
    "bun",
    "run",
    "src/manager/connect-worker-ec2-ssh.ts",
    "--no-connect",
    "--print-host-alias",
  ])
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const alias = lines.at(-1) ?? ""
  if (!alias || alias.startsWith("[connect-worker-ec2-ssh]")) {
    fail("could not resolve worker SSH alias")
  }
  return alias
}

function createPullRequest(
  repoPath: string,
  featureBranch: string,
  baseBranch: string,
): string {
  const token = runChecked(
    ["bash", "./tools/github-app-token.sh", "--repo-path", repoPath, "token"],
    repoPath,
  )
  const repoRemote = runChecked(
    ["git", "remote", "get-url", "origin"],
    repoPath,
  )
  const repoMatch = repoRemote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/)
  if (!repoMatch) {
    fail(`could not parse GitHub repo from remote: ${repoRemote}`)
  }
  const owner = repoMatch[1]
  const repo = repoMatch[2]
  const title = featureBranch.replaceAll(/[-_]+/g, " ").trim()
  const body = `Automated feature PR for ${featureBranch}.`
  const response = runChecked([
    "curl",
    "-sS",
    "-L",
    "-H",
    "Accept: application/vnd.github+json",
    "-H",
    `Authorization: Bearer ${token}`,
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    "-d",
    JSON.stringify({
      title,
      head: featureBranch,
      base: baseBranch,
      body,
    }),
  ])
  const urlMatch = response.match(/"html_url":\s*"([^"]+)"/)
  if (!urlMatch) {
    console.error(response)
    fail("could not parse pull request url from GitHub response")
  }
  return urlMatch[1]
}

function ensureWorkerBranchReady(
  hostAlias: string,
  branchName: string,
  workerWorktreeRoot: string,
): string {
  const workerWorktreePath = `${workerWorktreeRoot}/${branchDirName(branchName)}`
  const mergeBaseBranch = `merge-base/${branchDirName(branchName)}`
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
    "current_branch=$(git rev-parse --abbrev-ref HEAD)",
    'if [ "$current_branch" != "$BRANCH" ]; then',
    '  echo "worker worktree is not on expected branch: $current_branch" >&2',
    "  exit 1",
    "fi",
    'git merge --no-edit "$MERGE_BASE_BRANCH"',
  ].join("\n")

  const result = runCommand(["ssh", hostAlias, remoteScript])
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim()
    if (stderr) {
      console.error(stderr)
    }
    const conflictDetected =
      stderr.includes("CONFLICT") ||
      stderr.includes("Automatic merge failed") ||
      stderr.includes("fix conflicts")
    if (conflictDetected) {
      emitConflictBlock(hostAlias, branchName, workerWorktreePath)
    }
    fail(`command failed: ssh ${hostAlias} <merge worker merge-base branch>`)
  }
  return workerWorktreePath
}

function main() {
  const argv = process.argv.slice(2)
  const repoProfile = resolveRepoProfile(parseRepoProfileArg(argv))
  const featureBranch =
    argv
      .filter(
        (value, index) =>
          value !== "--" &&
          value !== "--repo-profile" &&
          argv[index - 1] !== "--repo-profile",
      )
      .find(Boolean)
      ?.trim() ?? ""
  if (!featureBranch) {
    usage()
  }

  const featureDirName = branchDirName(featureBranch)
  if (!featureDirName) {
    fail("feature branch name must contain at least one path-safe character")
  }

  const mergeBaseBranch = `merge-base/${featureDirName}`
  const integrationBranch = `merge-${featureDirName}`
  const managerWorktreePath = `${repoProfile.managerWorktreeRoot}/${featureDirName}`
  const hostAlias = resolveHostAlias()
  const workerWorktreePath = `${repoProfile.workerWorktreeRoot}/${featureDirName}`
  const workerRepoRemote = `ssh://ec2-user@${hostAlias}${workerWorktreePath}`

  runChecked(
    ["git", "fetch", "origin", repoProfile.baseBranch],
    repoProfile.repoPath,
  )
  runChecked(
    [
      "git",
      "push",
      workerRepoRemote,
      `refs/remotes/origin/${repoProfile.baseBranch}:refs/heads/${mergeBaseBranch}`,
    ],
    repoProfile.repoPath,
  )

  ensureWorkerBranchReady(
    hostAlias,
    featureBranch,
    repoProfile.workerWorktreeRoot,
  )

  if (repoProfile.integrationMode === "push_feature_branch_pr_to_staging") {
    runChecked(
      [
        "git",
        "fetch",
        workerRepoRemote,
        `${featureBranch}:refs/heads/${featureBranch}`,
      ],
      repoProfile.repoPath,
    )
    runChecked(
      ["git", "push", "origin", `${featureBranch}:${featureBranch}`],
      repoProfile.repoPath,
    )
    const pullRequestUrl = createPullRequest(
      repoProfile.repoPath,
      featureBranch,
      repoProfile.pullRequestBaseBranch ?? "staging",
    )

    console.log(`merge_outcome=completed`)
    console.log(`repo_profile=${repoProfile.id}`)
    console.log(`worker_alias=${hostAlias}`)
    console.log(`feature_branch=${featureBranch}`)
    console.log(`worker_merge_base_branch=${mergeBaseBranch}`)
    console.log(`worker_worktree=${workerWorktreePath}`)
    console.log(`pull_request_url=${pullRequestUrl}`)
    return
  }

  if (
    runCommand(
      [
        "git",
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${integrationBranch}`,
      ],
      repoProfile.repoPath,
    ).exitCode === 0
  ) {
    fail(`manager integration branch already exists: ${integrationBranch}`)
  }

  if (runCommand(["test", "-e", managerWorktreePath]).exitCode === 0) {
    fail(
      `manager integration worktree path already exists: ${managerWorktreePath}`,
    )
  }

  runChecked(
    [
      "git",
      "worktree",
      "add",
      "-b",
      integrationBranch,
      managerWorktreePath,
      `origin/${repoProfile.baseBranch}`,
    ],
    repoProfile.repoPath,
  )

  runChecked(
    [
      "git",
      "fetch",
      workerRepoRemote,
      `${featureBranch}:refs/heads/${featureBranch}`,
    ],
    managerWorktreePath,
  )
  runChecked(["git", "merge", "--no-edit", featureBranch], managerWorktreePath)
  runChecked(
    ["git", "push", "origin", `${integrationBranch}:${repoProfile.baseBranch}`],
    managerWorktreePath,
  )
  refreshSharedDevelopmentCheckout(repoProfile.repoPath, repoProfile.baseBranch)

  console.log(`merge_outcome=completed`)
  console.log(`repo_profile=${repoProfile.id}`)
  console.log(`worker_alias=${hostAlias}`)
  console.log(`feature_branch=${featureBranch}`)
  console.log(`worker_merge_base_branch=${mergeBaseBranch}`)
  console.log(`worker_worktree=${workerWorktreePath}`)
  console.log(`manager_branch=${integrationBranch}`)
  console.log(`manager_feature_branch=${featureBranch}`)
  console.log(`manager_worktree=${managerWorktreePath}`)
  console.log(`start_command=cd ${managerWorktreePath} && exec bash -l`)
}

main()
