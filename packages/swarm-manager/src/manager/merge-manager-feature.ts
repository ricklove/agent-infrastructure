import { parseRepoProfileArg, resolveRepoProfile } from "./repo-profiles.js"

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function fail(message: string): never {
  console.error(`[merge-manager-feature] ${message}`)
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

function usage(): never {
  console.log(
    "Usage: bun run src/manager/merge-manager-feature.ts -- [--repo-profile <profile>] <feature-branch-name>",
  )
  process.exit(1)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
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

function findWorktreePathForBranch(
  repoPath: string,
  branchName: string,
): string {
  const output = runChecked(
    ["git", "worktree", "list", "--porcelain"],
    repoPath,
  )
  const targetRef = `refs/heads/${branchName}`
  let currentWorktree = ""

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      currentWorktree = line.slice("worktree ".length).trim()
      continue
    }
    if (
      line.startsWith("branch ") &&
      line.slice("branch ".length).trim() === targetRef
    ) {
      return currentWorktree
    }
  }

  fail(`manager feature worktree path does not exist for branch: ${branchName}`)
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

  runChecked(
    ["git", "fetch", "origin", repoProfile.baseBranch],
    repoProfile.repoPath,
  )

  if (
    runCommand(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${featureBranch}`],
      repoProfile.repoPath,
    ).exitCode !== 0
  ) {
    fail(`manager feature branch does not exist: ${featureBranch}`)
  }

  const managerWorktreePath = findWorktreePathForBranch(
    repoProfile.repoPath,
    featureBranch,
  )

  const currentBranch = runChecked(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    managerWorktreePath,
  )
  if (currentBranch !== featureBranch) {
    fail(`manager feature worktree is not on expected branch: ${currentBranch}`)
  }

  if (repoProfile.integrationMode === "push_feature_branch_pr_to_staging") {
    runChecked(
      ["git", "merge", "--no-edit", `origin/${repoProfile.baseBranch}`],
      managerWorktreePath,
    )
    runChecked(
      ["git", "push", "origin", `HEAD:${featureBranch}`],
      managerWorktreePath,
    )
    const pullRequestUrl = createPullRequest(
      repoProfile.repoPath,
      featureBranch,
      repoProfile.pullRequestBaseBranch ?? "staging",
    )
    console.log(`merge_outcome=completed`)
    console.log(`repo_profile=${repoProfile.id}`)
    console.log(`feature_branch=${featureBranch}`)
    console.log(`manager_worktree=${managerWorktreePath}`)
    console.log(`pull_request_url=${pullRequestUrl}`)
    return
  }

  runChecked(
    ["git", "merge", "--no-edit", `origin/${repoProfile.baseBranch}`],
    managerWorktreePath,
  )
  runChecked(
    ["git", "push", "origin", `HEAD:${repoProfile.baseBranch}`],
    managerWorktreePath,
  )
  refreshSharedDevelopmentCheckout(repoProfile.repoPath, repoProfile.baseBranch)

  console.log(`merge_outcome=completed`)
  console.log(`repo_profile=${repoProfile.id}`)
  console.log(`feature_branch=${featureBranch}`)
  console.log(`manager_worktree=${managerWorktreePath}`)
  console.log(`start_command=cd ${managerWorktreePath} && exec bash -l`)
}

main()
