import { DEFAULT_WORKSPACE_DIR } from "../paths.js"

export type RepoProfile = {
  id: string
  aliases: string[]
  repoPath: string
  originUrl: string
  baseBranch: string
  installCommand: string[]
  workerWorktreeRoot: string
  managerWorktreeRoot: string
  integrationMode: "push_to_development" | "push_feature_branch_pr_to_staging"
  pullRequestBaseBranch?: string
}

const REPO_PROFILES: RepoProfile[] = [
  {
    id: "agent-infrastructure",
    aliases: ["agent-infrastructure"],
    repoPath: `${DEFAULT_WORKSPACE_DIR}/projects/agent-infrastructure`,
    originUrl: "https://github.com/baseconnect-org/agent-infrastructure.git",
    baseBranch: "development",
    installCommand: ["bun", "install"],
    workerWorktreeRoot: `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/agent-infrastructure`,
    managerWorktreeRoot: `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/agent-infrastructure-manager`,
    integrationMode: "push_to_development",
  },
  {
    id: "connect-common",
    aliases: ["connect-common", "baseconnect-org-connect-common"],
    repoPath: `${DEFAULT_WORKSPACE_DIR}/projects/baseconnect-org-connect-common`,
    originUrl: "https://github.com/baseconnect-org/connect-common.git",
    baseBranch: "development",
    installCommand: ["npm", "install"],
    workerWorktreeRoot: `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/baseconnect-org-connect-common`,
    managerWorktreeRoot: `${DEFAULT_WORKSPACE_DIR}/projects-worktrees/baseconnect-org-connect-common-manager`,
    integrationMode: "push_feature_branch_pr_to_staging",
    pullRequestBaseBranch: "staging",
  },
]

export function resolveRepoProfile(profileId?: string): RepoProfile {
  const normalized = profileId?.trim()
  if (!normalized) {
    return REPO_PROFILES[0]
  }

  const profile = REPO_PROFILES.find(
    (candidate) =>
      candidate.id === normalized || candidate.aliases.includes(normalized),
  )
  if (!profile) {
    const supportedProfiles = REPO_PROFILES.map(
      (candidate) => candidate.id,
    ).join(", ")
    throw new Error(
      `unknown repo profile: ${normalized}. Supported profiles: ${supportedProfiles}`,
    )
  }
  return profile
}

export function parseRepoProfileArg(argv: string[]): string | undefined {
  const index = argv.indexOf("--repo-profile")
  if (index === -1) {
    return undefined
  }
  const next = argv[index + 1]?.trim()
  if (!next || next === "--") {
    throw new Error("missing value for --repo-profile")
  }
  return next
}
