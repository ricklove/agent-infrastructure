import { DEFAULT_AGENT_HOME } from "../paths.js"
import { parseRepoProfileArg, resolveRepoProfile } from "./repo-profiles.js"

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

function fail(message: string): never {
  console.error(`[prepare-worker-surface] ${message}`)
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
    "Usage: bun run src/manager/prepare-worker-surface.ts -- [--repo-profile <profile>] <feature-branch-name>",
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

function shellCommand(command: string[]): string {
  return command.map((value) => shellQuote(value)).join(" ")
}

function ensureWorkerGithubAuth(hostAlias: string): void {
  runChecked([
    "ssh",
    hostAlias,
    "mkdir -p /home/ec2-user/.config /home/ec2-user/runtime/tools /home/ec2-user/workspace/data/projects",
  ])
  runChecked([
    "bash",
    "-lc",
    [
      "set -euo pipefail",
      `tar -cf - -C ${shellQuote(DEFAULT_AGENT_HOME)} .config/agent-github runtime/tools/github-app-token.sh workspace/data/projects/registry.json | ssh ${shellQuote(hostAlias)} ${shellQuote(`tar -xf - -C ${DEFAULT_AGENT_HOME}`)}`,
    ].join("\n"),
  ])
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

  const hostAlias = resolveHostAlias()
  const worktreePath = `${repoProfile.workerWorktreeRoot}/${worktreeDirName}`

  runChecked(
    ["git", "fetch", "origin", repoProfile.baseBranch],
    repoProfile.repoPath,
  )
  ensureWorkerGithubAuth(hostAlias)

  const remoteScript = [
    "set -euo pipefail",
    `export AGENT_GITHUB_CONFIG_ROOT=${shellQuote(`${DEFAULT_AGENT_HOME}/.config/agent-github`)}`,
    `export AGENT_PROJECTS_REGISTRY_PATH=${shellQuote(`${DEFAULT_AGENT_HOME}/workspace/data/projects/registry.json`)}`,
    `export GIT_ASKPASS=${shellQuote(`${DEFAULT_AGENT_HOME}/.config/agent-github/git-askpass.sh`)}`,
    "export GIT_TERMINAL_PROMPT=0",
    `REPO=${shellQuote(repoProfile.repoPath)}`,
    `ORIGIN_URL=${shellQuote(repoProfile.originUrl)}`,
    `WORKTREE_ROOT=${shellQuote(repoProfile.workerWorktreeRoot)}`,
    `WORKTREE=${shellQuote(worktreePath)}`,
    `BRANCH=${shellQuote(branchName)}`,
    `BASE_BRANCH=${shellQuote(repoProfile.baseBranch)}`,
    'if ! test -d "$REPO/.git"; then',
    '  mkdir -p "$(dirname "$REPO")"',
    '  git clone "$ORIGIN_URL" "$REPO"',
    "fi",
    'mkdir -p "$WORKTREE_ROOT"',
    'cd "$REPO"',
    'git fetch origin "$BASE_BRANCH"',
    "git worktree prune",
    'if test -e "$WORKTREE"; then',
    '  git worktree remove --force "$WORKTREE"',
    "fi",
    'if git show-ref --verify --quiet "refs/heads/$BRANCH"; then',
    '  git branch -D "$BRANCH"',
    "fi",
    'git worktree add -b "$BRANCH" "$WORKTREE" "origin/$BASE_BRANCH"',
    'cd "$WORKTREE"',
    shellCommand(repoProfile.installCommand),
  ].join("\n")

  runChecked(["ssh", hostAlias, remoteScript])

  const startCommand = `ssh ${hostAlias} 'cd ${worktreePath} && exec bash -l'`
  console.log(`worker_alias=${hostAlias}`)
  console.log(`repo_profile=${repoProfile.id}`)
  console.log(`branch=${branchName}`)
  console.log(`worktree=${worktreePath}`)
  console.log(`start_command=${startCommand}`)
}

main()
