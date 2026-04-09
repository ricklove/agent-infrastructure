export default {
  currentReality: [
    "A first cdk-admin package exists and provides a dedicated CDK app and stack for provisioning an isolated admin host.",
    "The admin stack tags the provisioned host with the admin role identity expected by dashboard-access and passes explicit target tag and role environment variables into the access Lambda.",
    "dashboard-access now resolves a generic target instance, supports target wake and SSM readiness checks, and can reconcile a target host before issuing the dashboard session when configuration requires it.",
  ],
  changedFiles: [
    "packages/cdk-admin/src/app.ts",
    "packages/cdk-admin/src/cdk-admin-stack.ts",
    "packages/dashboard-access/src/handler.ts",
    "packages/aws-setup/src/aws-setup-stack.ts",
  ],
  verification: [
    "bun run --filter @agent-infrastructure/dashboard-access check",
    "bun run --filter @agent-infrastructure/cdk-admin check",
    "bun run --filter @agent-infrastructure/aws-setup check",
    "agent-browser screenshot verification against the worker-local admin compat health endpoint",
  ],
  remainingWork: [
    "Full stack-admin UI and server behavior remains out of scope for this revision.",
    "Broader deploy and cross-stack repair workflows beyond the initial access, wake, and reconciliation contract remain future work.",
  ],
} as const
