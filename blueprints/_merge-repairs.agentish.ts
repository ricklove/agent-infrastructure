/// <reference path="./_agentish.d.ts" />

// Merge Repairs

const Agentish = define.language("Agentish");

const MergeRepairs = define.system("MergeRepairs", {
  format: Agentish,
  role: "Temporary blueprint-side audit notes for recovering lost intent from unmerged or rewritten branch history",
});

const Artifact = {
  sharedDevelopment: define.workspace("SharedDevelopmentBranch"),
  unmergedBranch: define.workspace("UnmergedBranch"),
  orphanCheckout: define.workspace("OrphanCheckout"),
  repairNote: define.document("RepairNote"),
  deletionTarget: define.document("DeletionTarget"),
};

const Finding = {
  recoveredIntent: define.concept("RecoveredBlueprintIntent"),
  staleSnapshot: define.concept("StaleBlueprintSnapshot"),
  conflictingDirection: define.concept("ConflictingBlueprintDirection"),
  cleanupNeeded: define.concept("CleanupNeeded"),
};

MergeRepairs.defines(`
- SharedDevelopmentBranch means the canonical development branch at /home/ec2-user/workspace/projects/agent-infrastructure.
- UnmergedBranch means a branch ref whose tip is not an ancestor of SharedDevelopmentBranch.
- OrphanCheckout means a separate checkout or temp worktree carrying relevant commits that are not reachable from the shared branch tips.
- RecoveredBlueprintIntent means blueprint or blueprint-state content that appeared in lost or unmerged history and should be restored into the canonical shared blueprints.
- StaleBlueprintSnapshot means blueprint content from an older branch snapshot that should not be copied back because current canonical blueprints already moved past it.
- ConflictingBlueprintDirection means older or side-branch blueprint intent that conflicts with newer canonical blueprint direction and therefore should be preserved as a note rather than silently merged.
- CleanupNeeded means the branch, worktree, temp checkout, tag, or orphaned commit should be deleted after lost intent is reconciled.
`);

MergeRepairs.contains(
  Artifact.sharedDevelopment,
  Artifact.unmergedBranch,
  Artifact.orphanCheckout,
  Artifact.repairNote,
  Artifact.deletionTarget,
  Finding.recoveredIntent,
  Finding.staleSnapshot,
  Finding.conflictingDirection,
  Finding.cleanupNeeded,
);

Artifact.repairNote.means(`
- Audit scope used the shared repo at /home/ec2-user/workspace/projects/agent-infrastructure plus the orphan temp checkout at /home/ec2-user/workspace/temp/agent-chat-improvements-release-2.
- Shared repo branches not merged into development at audit time were:
  - feature/agent-chat-improvements-blueprint at d2ff5c2
- The orphan temp checkout carried additional development-process commits not reachable from the shared repo:
  - 732f0de Clarify browser-tool verification in dev process
  - 0eeca10 Specify viewport checks for browser verification
- During cleanup, these stale local-only branches were deleted after their blueprint intent was audited:
  - backup/development-before-restore-20260324-053502
  - backup/development-before-restore-20260324-053511
  - backup/main-before-restore-20260324-051427
  - backup/main-rewritten-20260324-0446
  - temp/dynamic-model-fetching
  - worktree-dashboard-terminal-impl
`);

Finding.recoveredIntent.means(`
- The orphan checkout /home/ec2-user/workspace/temp/agent-chat-improvements-release-2 contained the missing development-process instructions that explicitly require `agent-browser` for UI verification on this machine.
- Those orphan commits also made the workspace tooling path concrete by naming /home/ec2-user/workspace/README.md and /home/ec2-user/workspace/tools/.
- Those development-process instructions were restored into the shared blueprints during this repair.
- feature/agent-chat-improvements-blueprint carried a still-relevant state gap: the Agent Chat session rail is intended to be resizable, but the current blueprint-state did not record that the implementation still lacks that resize behavior.
- That Agent Chat blueprint-state gap was restored into the shared blueprint-state during this repair.
`);

Finding.staleSnapshot.means(`
- The backup/* branches mostly preserve older snapshots of current blueprints rather than lost forward intent.
- The backup/* branches carry an older Dashboard Terminal blueprint-state that says the feature was not implemented; that snapshot is stale and should not be copied back into current development.
- temp/dynamic-model-fetching and worktree-dashboard-terminal-impl also carry older blueprint snapshots and broad implementation divergences, but this audit did not find additional blueprint text there that should overwrite current canonical blueprints.
- feature/agent-chat-improvements-blueprint includes an older positive requirement for a transcript minimap or custom scrollbar. Current canonical blueprints already moved to a stricter position: a custom navigation rail should only ship if it is clearly stable and useful. That older requirement should therefore remain a note rather than be silently restored.
`);

Finding.conflictingDirection.means(`
- feature/agent-chat-improvements-blueprint wanted a compact transcript navigation minimap with hover previews and click-to-jump behavior as a direct product requirement.
- Current canonical Agent Chat blueprints now treat a custom navigation rail as conditional and explicitly prefer omission over shipping a noisy or unstable control.
- Because those positions conflict, the older branch intent was not merged into the shared ideal blueprint during this repair.
`);

Artifact.deletionTarget.means(`
- Delete after reconciliation because they are unmerged or orphaned history refs rather than intended permanent branches:
  - feature/agent-chat-improvements-blueprint
- Delete the orphan temp checkout /home/ec2-user/workspace/temp/agent-chat-improvements-release-2 after its blueprint intent is fully reconciled.
- Delete or archive the orphan-only commits 732f0de and 0eeca10 after the shared development-process file is confirmed to contain their intended instructions.
- Review and likely delete the tag release-20260324-0152-d2ff5c2 if the branch commit it points to is no longer intended to survive as an externally meaningful release point.
- Delete merged local feature and fix branches after final cleanup:
  - feature/agent-chat-expectations-blueprint
  - feature/agent-chat-immediate-watchdog
  - feature/agent-chat-process-placeholder-fix
  - feature/agent-chat-process-queue-only
  - feature/agent-chat-process-queue-ui-fix
  - feature/agent-chat-process-quickset-thread-scope
  - feature/agent-chat-quick-process-set
  - feature/agent-chat-session-list-improvements
  - feature/dashboard-terminal
  - feature/manager-controller-workspace-persistence
  - feature/runtime-deploy-script
  - fix/agent-chat-mobile-message-width
  - fix/agent-chat-mobile-polish
  - fix/agent-chat-mobile-settings-submit
  - fix/agent-chat-mobile-thread
  - fix/dashboard-terminal-mobile
  - fix/dashboard-terminal-session-auth
  - fix/terminal-cursor-and-prompt
  - fix/terminal-mobile-go-and-backspace-display
  - fix/terminal-mobile-input
  - recovery/development-plus-290bbd9
  - recovery/development-plus-290bbd9-plus-dashboard-terminal-v1
  - refactor
  - wip/agent-chat-workboard-ideas
- Remove the corresponding merged worktree directories after branch deletion so merged worktrees do not continue to accumulate on disk.
`);

when(Finding.recoveredIntent.exists())
  .then(MergeRepairs.records("blueprint intent that was genuinely lost and has been reintroduced into the shared blueprints"));

when(Finding.staleSnapshot.exists())
  .then(MergeRepairs.records("older branch state that should remain historical evidence only"));

when(Finding.cleanupNeeded.exists())
  .then(MergeRepairs.records("refs, worktrees, and orphan checkouts that should be deleted after reconciliation"));
