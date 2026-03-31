/// <reference path="../_agentish.d.ts" />

// Projects Dashboard Blueprint State

const Agentish = define.language("Agentish");

const ProjectsDashboardBlueprintState = define.system("ProjectsDashboardBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Projects dashboard blueprint",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  managedProjectsSurface: define.concept("ManagedProjectsSurface"),
  mobileProjectsLayout: define.concept("MobileProjectsLayout"),
  githubInstallationRegistry: define.concept("GitHubInstallationRegistry"),
  legacyGithubAppImport: define.concept("LegacyGitHubAppImport"),
  projectIntegrationPolicy: define.concept("ProjectIntegrationPolicyStorage"),
  dashboardSessionBoundary: define.concept("DashboardSessionBoundary"),
  workflowAlignment: define.concept("DevelopmentProcessAlignment"),
};

ProjectsDashboardBlueprintState.defines(`
- CurrentImplementationStatus means the Projects feature exists as a real dashboard surface with a backend registry, project records, GitHub installation records, clone or register flows, and per-project integration settings.
- AssessmentConfidence is medium because the current state now has direct source inspection, local server verification for import behavior, and deployed UI screenshots for the Projects surface.
- ImplementationEvidence includes packages/projects-server/src/index.ts, packages/projects-server/src/registry.ts, packages/projects-server/src/registry.test.ts, the Projects dashboard UI, and screenshots under /home/ec2-user/state/screenshots/projects-feature-20260325/.
- This blueprint-state compares current implementation reality against the ideal Projects dashboard implementation blueprint in projects-dashboard-implementation.agentish.ts and the shared workflow rules in development-process.agentish.ts.
- ImplementationGap means the feature still relies on a narrow registry-backed flow and has not yet grown richer operational automation around project health, job history, or repo workflow orchestration.
- KnownIssue means live verification for the legacy GitHub App import path is still indirect today because the dashboard UI shows imported installations once the backend registry is read, but the feature does not yet expose a dedicated import action or import audit history.
`);

ProjectsDashboardBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.managedProjectsSurface,
  CurrentReality.mobileProjectsLayout,
  CurrentReality.githubInstallationRegistry,
  CurrentReality.legacyGithubAppImport,
  CurrentReality.projectIntegrationPolicy,
  CurrentReality.dashboardSessionBoundary,
  CurrentReality.workflowAlignment,
);

CurrentReality.managedProjectsSurface.means(`
- the dashboard exposes a first-party Projects tab
- the backend serves project and installation records from durable app data
- operators can create project records and update per-project integration settings
`);

CurrentReality.mobileProjectsLayout.means(`
- narrow viewport verification shows one primary Projects section at a time instead of stacked half-height panes
- saved screenshots exist for small, medium, and wide viewports
`);

CurrentReality.githubInstallationRegistry.means(`
- GitHub App installations are stored as explicit registry records rather than being inferred only from repo owner text
- installation summaries report repo counts for bound projects
- authenticated project operations resolve from a concrete installation record
`);

CurrentReality.legacyGithubAppImport.means(`
- legacy GitHub App env files under the agent GitHub config root are discovered during registry reads
- imported installations are normalized into the managed installations directory under the config root
- the managed installation env now points at the managed copied PEM path rather than the legacy source path
- registry tests verify both first-time import and migration of an existing record onto the managed PEM path
`);

CurrentReality.projectIntegrationPolicy.means(`
- each project stores a base branch and post-merge bun command
- those fields are treated as shared-development-process inputs rather than a separate per-project workflow definition
`);

CurrentReality.dashboardSessionBoundary.means(`
- Projects UI request authorization now reads dashboard session state through a shared dashboard-session-ui helper instead of keeping feature-local session-storage plumbing in the screen file
- feature-screen code remains focused on Projects state, forms, and API intent while dashboard-owned browser auth details stay in shared dashboard infrastructure
`);

CurrentReality.workflowAlignment.means(`
- Projects now has a maintained blueprint-state document as required by the shared development process
- future Projects changes should update this document alongside relevant blueprint or implementation changes
`);

when(CurrentReality.managedProjectsSurface.exists())
  .then(ProjectsDashboardBlueprintState.records(Assessment.status))
  .and(ProjectsDashboardBlueprintState.treats("Projects as an implemented dashboard feature rather than a placeholder"));

when(CurrentReality.legacyGithubAppImport.exists())
  .then(ProjectsDashboardBlueprintState.records(Assessment.evidence))
  .and(ProjectsDashboardBlueprintState.treats("legacy credential adoption as implemented backend behavior"));

when(CurrentReality.workflowAlignment.exists())
  .then(ProjectsDashboardBlueprintState.records(Assessment.evidence))
  .and(ProjectsDashboardBlueprintState.treats("blueprint-state maintenance as part of the Projects feature contract"));
