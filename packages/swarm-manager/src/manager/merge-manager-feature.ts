import { DEFAULT_WORKSPACE_DIR } from "../paths.js"

const DEFAULT_BASE_BRANCH = "development"
const DEFAULT_REPO_PATH = `${DEFAULT_WORKSPACE_DIR}/projects/agent-infrastructure`
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
    "Usage: bun run src/manager/merge-manager-feature.ts -- <feature-branch-name>",
  )
  process.exit(1)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function setSharedCheckoutWritable(writable: boolean): void {
  const mode = writable ? "u+w" : "a-w"
  const script = [
    "set -euo pipefail",
    `repo=${shellQuote(DEFAULT_REPO_PATH)}`,
    `chmod ${mode} "$repo"`,
    `find "$repo" -path "$repo/.git" -prune -o -exec chmod ${mode} {} +`,
  ].join("\n")
  runChecked(["bash", "-lc", script])
}

function refreshSharedDevelopmentCheckout(): void {
  setSharedCheckoutWritable(true)
  try {
    runChecked(
      ["git", "fetch", "origin", DEFAULT_BASE_BRANCH],
      DEFAULT_REPO_PATH,
    )
    const currentBranch = runChecked(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      DEFAULT_REPO_PATH,
    )
    if (currentBranch !== DEFAULT_BASE_BRANCH) {
      runChecked(["git", "checkout", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH)
    }
    runChecked(
      ["git", "pull", "--ff-only", "origin", DEFAULT_BASE_BRANCH],
      DEFAULT_REPO_PATH,
    )
  } finally {
    setSharedCheckoutWritable(false)
  }
}

function findWorktreePathForBranch(branchName: string): string {
  const output = runChecked(
    ["git", "worktree", "list", "--porcelain"],
    DEFAULT_REPO_PATH,
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

function main() {
  const featureBranch =
    process.argv
      .slice(2)
      .find((value) => value !== "--")
      ?.trim() ?? ""
  if (!featureBranch) {
    usage()
  }

  runChecked(["git", "fetch", "origin", DEFAULT_BASE_BRANCH], DEFAULT_REPO_PATH)

  if (
    runCommand(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${featureBranch}`],
      DEFAULT_REPO_PATH,
    ).exitCode !== 0
  ) {
    fail(`manager feature branch does not exist: ${featureBranch}`)
  }

  const managerWorktreePath = findWorktreePathForBranch(featureBranch)

  const currentBranch = runChecked(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    managerWorktreePath,
  )
  if (currentBranch !== featureBranch) {
    fail(`manager feature worktree is not on expected branch: ${currentBranch}`)
  }

  runChecked(
    ["git", "merge", "--no-edit", `origin/${DEFAULT_BASE_BRANCH}`],
    managerWorktreePath,
  )
  runChecked(
    ["git", "push", "origin", `HEAD:${DEFAULT_BASE_BRANCH}`],
    managerWorktreePath,
  )
  refreshSharedDevelopmentCheckout()

  console.log(`merge_outcome=completed`)
  console.log(`feature_branch=${featureBranch}`)
  console.log(`manager_worktree=${managerWorktreePath}`)
  console.log(`start_command=cd ${managerWorktreePath} && exec bash -l`)
}

main()
