export default {
  currentReality: [
    "Host bootstrap is shell-first and role-aware through scripts/setup.sh plus setup-manager.sh, setup-admin.sh, and setup-worker.sh.",
    "scripts/setup.sh remains backward compatible for managers by defaulting to manager role when runtime-target.json is absent.",
    "Manager, admin, and worker setup-host flows now record resolved runtime state to ~/state/runtime-current.json after setup.",
  ],
  changedFiles: [
    "scripts/setup.sh",
    "scripts/setup-common.sh",
    "scripts/setup-manager.sh",
    "scripts/setup-admin.sh",
    "scripts/setup-worker.sh",
    "scripts/run-admin-compat.sh",
    "packages/swarm-manager/src/paths.ts",
    "packages/swarm-manager/src/host-runtime-target/write-runtime-current.ts",
    "packages/swarm-manager/src/manager/setup-host.ts",
    "packages/swarm-manager/src/admin/setup-host.ts",
    "packages/swarm-manager/src/worker/setup-host.ts",
    "packages/aws-setup/src/aws-setup-stack.ts",
  ],
  verification: [
    "bash -n scripts/setup.sh scripts/setup-common.sh scripts/setup-manager.sh scripts/setup-admin.sh scripts/setup-worker.sh scripts/run-admin-compat.sh",
    "bun run --filter @agent-infrastructure/swarm-manager check",
    "direct runtime-current probe writing ~/state/runtime-current.json to a temporary state directory",
  ],
  remainingWork: [
    "Broader runtime materialization transport unification for worker release bundles remains future work.",
  ],
} as const
