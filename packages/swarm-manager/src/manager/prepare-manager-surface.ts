import { parseRepoProfileArg, resolveRepoProfile } from "./repo-profiles.js"

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function fail(message: string): never {
  console.error(`[prepare-manager-surface] ${message}`)
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
    "Usage: bun run src/manager/prepare-manager-surface.ts -- [--repo-profile <profile>] <feature-branch-name>",
  )
  process.exit(1)
}

function branchDirName(branchName: string): string {
  return branchName
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
}

function main() {
  const argv = process.argv.slice(2)
  const repoProfile = resolveRepoProfile(parseRepoProfileArg(argv))
  const branchName =
    argv
      .filter(
        (value, index) =>
          value !== "--" &&
          value !== "--repo-profile" &&
          argv[index - 1] !== "--repo-profile",
      )
      .find(Boolean)
      ?.trim() ?? ""
  if (!branchName) {
    usage()
  }

  const worktreeDirName = branchDirName(branchName)
  if (!worktreeDirName) {
    fail("feature branch name must contain at least one path-safe character")
  }

  const worktreePath = `${repoProfile.managerWorktreeRoot}/${worktreeDirName}`

  runChecked(
    ["git", "fetch", "origin", repoProfile.baseBranch],
    repoProfile.repoPath,
  )

  if (
    runCommand(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
      repoProfile.repoPath,
    ).exitCode === 0
  ) {
    fail(`feature branch already exists on manager: ${branchName}`)
  }

  if (runCommand(["test", "-e", worktreePath]).exitCode === 0) {
    fail(`worktree path already exists on manager: ${worktreePath}`)
  }

  runChecked(
    [
      "git",
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
      `origin/${repoProfile.baseBranch}`,
    ],
    repoProfile.repoPath,
  )

  console.log(`repo_profile=${repoProfile.id}`)
  console.log(`branch=${branchName}`)
  console.log(`worktree=${worktreePath}`)
  console.log(`start_command=cd ${worktreePath} && exec bash -l`)
}

main()
