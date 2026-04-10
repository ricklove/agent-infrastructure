import { execFileSync } from "node:child_process"
import {
  formatUtcDashboardReleaseDate,
  nextCanonicalDashboardReleaseTag,
} from "@agent-infrastructure/dashboard-plugin"
import { DEFAULT_WORKSPACE_DIR } from "../paths.js"

const defaultRepoPath = `${DEFAULT_WORKSPACE_DIR}/projects/agent-infrastructure`

function gitOutput(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim()
}

function main() {
  const repoPath = defaultRepoPath
  const hash = gitOutput(["rev-parse", "--short=10", "HEAD"], repoPath)
  const commitDate = gitOutput(
    ["show", "-s", "--date=format:%Y-%m-%dT%H:%M:%SZ", "--format=%cd", "HEAD"],
    repoPath,
  )
  const visibleReleaseTags = gitOutput(
    ["tag", "--list", "release-*", "--sort=-creatordate"],
    repoPath,
  )
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)

  const tag = nextCanonicalDashboardReleaseTag({
    dateKey: formatUtcDashboardReleaseDate(new Date(commitDate)),
    hash,
    visibleReleaseTags,
  })

  console.log(tag)
}

main()
