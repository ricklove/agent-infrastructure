/// <reference path="../_agentish.d.ts" />

// Projects Dashboard

const Agentish = define.language("Agentish");

const ProjectsDashboard = define.system("ProjectsDashboard", {
  format: Agentish,
  role: "Dashboard feature that manages workspace projects, GitHub access, and per-project agent process policy",
});

const User = define.actor("DashboardOperator", {
  role: "Operator who registers repos, configures GitHub access, and defines project workflow policy",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("ProjectsDashboardPlugin"),
  route: define.entity("ProjectsRoute"),
  screen: define.entity("ProjectsScreen"),
};

const Projects = {
  backend: define.system("ProjectsBackend"),
};

const Project = {
  workspace: define.workspace("WorkspaceProjects"),
  record: define.entity("WorkspaceProjectRecord"),
  repo: define.entity("ProjectRepository"),
  root: define.entity("ProjectWorkspaceRoot"),
  remote: define.entity("ProjectRemote"),
  baseBranch: define.entity("ProjectBaseBranch"),
  integrationPolicy: define.entity("ProjectIntegrationPolicy"),
  postMergeCommand: define.entity("ProjectPostMergeBunCommand"),
  status: define.entity("ProjectHealthStatus"),
  validation: define.entity("ProjectValidationResult"),
};

const Github = {
  account: define.entity("GitHubAccount"),
  app: define.entity("GitHubApp"),
  installation: define.entity("GitHubAppInstallation"),
  credential: define.entity("GitHubAppCredential"),
  repoCatalog: define.entity("GitHubAccessibleRepositoryCatalog"),
  discoveredRepo: define.entity("GitHubDiscoveredRepository"),
  repoBinding: define.entity("ProjectGitHubBinding"),
  authCheck: define.entity("GitHubAccessValidation"),
  tokenResolution: define.entity("GitHubInstallationTokenResolution"),
};

const Api = {
  listGithubInstallations: define.entity("ListGitHubInstallationsEndpoint"),
  listProjects: define.entity("ListProjectsEndpoint"),
  createProject: define.entity("CreateProjectEndpoint"),
  updateProject: define.entity("UpdateProjectEndpoint"),
  cloneRepo: define.entity("CloneProjectRepoEndpoint"),
  registerExistingRepo: define.entity("RegisterExistingRepoEndpoint"),
  listGithubBindings: define.entity("ListGitHubBindingsEndpoint"),
  createGithubBinding: define.entity("CreateGitHubBindingEndpoint"),
  validateGithubBinding: define.entity("ValidateGitHubBindingEndpoint"),
  listAccessibleRepos: define.entity("ListAccessibleGitHubReposEndpoint"),
  importExistingProjects: define.entity("ImportExistingProjectsEndpoint"),
  updateIntegrationPolicy: define.entity("UpdateProjectIntegrationPolicyEndpoint"),
};

const Ui = {
  projectList: define.entity("ProjectsListPanel"),
  projectDetail: define.entity("ProjectDetailPanel"),
  createProjectDialog: define.entity("CreateProjectDialog"),
  mobileSectionTabs: define.entity("ProjectsMobileSectionTabs"),
  githubAccessPanel: define.entity("GitHubAccessPanel"),
  githubInstallationList: define.entity("GitHubInstallationList"),
  accessibleRepoPicker: define.entity("AccessibleRepoPicker"),
  repoForm: define.entity("ProjectRepoForm"),
  githubBindingForm: define.entity("ProjectGitHubBindingForm"),
  integrationPolicyForm: define.entity("ProjectIntegrationPolicyForm"),
  projectStatus: define.entity("ProjectStatusSummary"),
  cloneAction: define.entity("CloneRepoAction"),
  registerAction: define.entity("RegisterExistingRepoAction"),
  validationState: define.entity("ProjectValidationState"),
  statusItems: define.entity("ProjectsFeatureStatusItems"),
};

const Scope = {
  explicitProjects: define.concept("ExplicitProjectRegistry"),
  repoRootBoundaries: define.concept("RepoRootBoundary"),
  installationScopedAuth: define.concept("InstallationScopedGitHubAccess"),
  githubFirstPrivateRepoOnboarding: define.concept("GitHubFirstPrivateRepoOnboarding"),
  existingLocalGithubAppImport: define.concept("ExistingLocalGitHubAppImport"),
  projectScopedIntegration: define.concept("ProjectScopedIntegrationPolicy"),
  sharedDevelopmentProcess: define.concept("SharedDevelopmentProcessForAllProjects"),
  noImplicitOwnerAuth: define.concept("NoImplicitOwnerOnlyAuth"),
};

const Decision = {
  featureId: define.entity("ProjectsFeatureIdDecision"),
  storage: define.entity("ProjectsStorageDecision"),
  authModel: define.entity("GitHubBindingDecision"),
  integrationModel: define.entity("ProjectIntegrationPolicyDecision"),
};

const Package = {
  ui: define.package("ProjectsUiPackage"),
  server: define.package("ProjectsServerPackage"),
  dashboardUi: define.package("DashboardUiPackage"),
  dashboardServer: define.package("DashboardGatewayPackage"),
};

ProjectsDashboard.enforces(`
- The dashboard must expose a first-party Projects tab rather than relying on ad hoc shell scripts as the primary operator surface.
- Workspace projects must be explicit dashboard-managed records rather than being inferred only from whichever repos happen to exist on disk.
- Adding a project must support both cloning a remote repo and registering an already-present local repo.
- Existing project import must be scoped to repositories already present under the workspace `projects/` folder rather than treating every git checkout in the workspace as a dashboard project candidate.
- Project repos must stay inside approved workspace roots and must not silently roam arbitrary host paths.
- Project repo identity must include local path, remote URL, and base branch as explicit stored fields.
- GitHub access must be configured as an explicit project-to-installation binding rather than being inferred only from repository owner text.
- GitHub App access must be validated against the selected repo before the project is considered ready for agent write operations.
- The system must not assume one GitHub App installation per owner; multiple installations for the same owner or org must remain representable without ambiguity.
- Private-repo onboarding should support adding GitHub App access before any clone step so the system can discover private repos through that installation.
- After GitHub App access is added, the operator should be able to list repositories visible to that installation and create a project from that discovered repo catalog.
- For private repos, selecting from the discovered installation-visible repo list is the preferred add-project path over manually typing a clone URL first.
- Existing locally configured GitHub App credentials under the agent GitHub config root should be discoverable and importable into the managed installation registry so operators do not need to re-enter already-installed app access.
- On narrow mobile viewports, GitHub Access and project-management surfaces must not remain scrunched into simultaneous half-height panes.
- Mobile layout should show one primary section at a time with a compact section switcher such as tabs, segmented controls, or an equivalent single-surface navigator.
- All projects should share the same development-process blueprint for agentic coding rather than defining bespoke full project workflows.
- Each project should only define the repo-specific integration settings needed by that shared workflow: the base branch and the post-merge bun command.
- Continuous integration back into the configured base branch is the default operating model for agent work.
- Project integration settings are project configuration, not a separate per-project process blueprint.
- The gateway should proxy Projects feature traffic and lazy-start the backend on first use.
- Dashboard session auth must remain gateway-owned; the Projects feature must not invent a separate browser auth model.
- GitHub App credentials and installation metadata are durable app data and must not live under temporary runtime state.
- GitHub validation and clone or push capability checks may fail clearly, but they must not mutate repo configuration into an ambiguous partial state.
`);

ProjectsDashboard.defines(`
- WorkspaceProjectRecord means the canonical app-owned configuration record for one managed repo in the workspace.
- ProjectIntegrationPolicy means the stored repo-specific integration settings used by the shared development process.
- ProjectPostMergeBunCommand means the declared bun command to run after code lands on the project's configured base branch.
- GitHubAppInstallation means one concrete installation grant that can mint installation tokens within its granted repository scope.
- GitHubAccessibleRepositoryCatalog means the list of repositories the configured installation can see and therefore can authorize for agent git operations.
- ProjectGitHubBinding means the explicit relation between a project repo and the GitHub App installation used for authenticated git operations.
- InstallationScopedGitHubAccess means token resolution starts from the selected project binding and chosen installation, not from owner name alone.
- GitHubFirstPrivateRepoOnboarding means the operator may need to configure GitHub access first, browse installation-visible repos second, and only then create the project record for a private repository.
- ExistingLocalGitHubAppImport means legacy or manually configured local app credentials may be adopted into the Projects-managed installation registry and surfaced in the dashboard as reusable GitHub access records.
- ProjectScopedIntegrationPolicy means each project carries only the repo-specific integration values needed by the shared development workflow.
- SharedDevelopmentProcessForAllProjects means agents use the same development-process blueprint across repos while reading base branch and post-merge command from project config.
- RepoRootBoundary means project paths are validated relative to approved workspace roots so the Projects feature cannot become a generic host filesystem browser.
- ImportExistingProjectsEndpoint means the dashboard may adopt existing local repos from the workspace `projects/` folder into the managed registry without pulling in system repos such as the workspace root or runtime checkout.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Projects.backend);
Projects.backend.contains(Project.workspace);
Project.workspace.contains(
  Project.record,
  Project.repo,
  Project.root,
  Project.remote,
  Project.baseBranch,
  Project.integrationPolicy,
  Project.postMergeCommand,
  Project.status,
  Project.validation,
  Github.repoBinding,
);
Project.workspace.contains(
  Api.listGithubInstallations,
  Api.listProjects,
  Api.createProject,
  Api.updateProject,
  Api.cloneRepo,
  Api.registerExistingRepo,
  Api.listGithubBindings,
  Api.createGithubBinding,
  Api.validateGithubBinding,
  Api.listAccessibleRepos,
  Api.importExistingProjects,
  Api.updateIntegrationPolicy,
);
Dashboard.screen.contains(
  Ui.projectList,
  Ui.projectDetail,
  Ui.createProjectDialog,
  Ui.mobileSectionTabs,
  Ui.githubAccessPanel,
  Ui.githubInstallationList,
  Ui.accessibleRepoPicker,
  Ui.repoForm,
  Ui.githubBindingForm,
  Ui.integrationPolicyForm,
  Ui.projectStatus,
  Ui.cloneAction,
  Ui.registerAction,
  Ui.validationState,
  Ui.statusItems,
);
Project.record.contains(
  Github.account,
  Github.app,
  Github.installation,
  Github.credential,
  Github.repoCatalog,
  Github.discoveredRepo,
  Github.repoBinding,
  Github.authCheck,
  Github.tokenResolution,
);
Project.workspace.contains(
  Scope.explicitProjects,
  Scope.repoRootBoundaries,
  Scope.installationScopedAuth,
  Scope.githubFirstPrivateRepoOnboarding,
  Scope.existingLocalGithubAppImport,
  Scope.projectScopedIntegration,
  Scope.sharedDevelopmentProcess,
  Scope.noImplicitOwnerAuth,
);

Scope.explicitProjects.means(`
- a project appears in the dashboard only after explicit registration
- the project registry is durable app data rather than an ephemeral scan result
- projects may point to cloned repos or existing local repos
`);

Scope.repoRootBoundaries.means(`
- project repo paths must stay under approved roots such as /home/ec2-user/workspace
- clone targets and registered repo paths are validated before acceptance
- path traversal, symlink escape, and arbitrary host-path capture are rejected
`);

Scope.installationScopedAuth.means(`
- authenticated git operations resolve from project to GitHub App installation
- one owner or org may have multiple valid app installations
- repo access checks are tied to the chosen installation and repo binding
`);

Scope.githubFirstPrivateRepoOnboarding.means(`
- the operator may add GitHub App access before creating the project record
- once an installation is configured, the system can list repos visible to that installation
- private repos should usually be added to Projects by selecting from that discovered repo list
`);

Scope.existingLocalGithubAppImport.means(`
- pre-existing local app credentials under the agent GitHub config root may be discovered without manual re-entry
- imported credentials are normalized into the managed installation registry so repo binding and token resolution use the same source of truth
- import should preserve operator clarity by surfacing the adopted installation as a normal dashboard-managed GitHub access record
`);

Scope.projectScopedIntegration.means(`
- each project stores its own base branch and post-merge bun command
- the shared development workflow reads those values from project configuration
- project config supplies integration parameters without redefining the full development process
`);

Scope.sharedDevelopmentProcess.means(`
- all projects use the shared development-process blueprint for agent work
- projects do not define their own full agent workflow by default
- the per-project configuration surface is intentionally small so continuous integration back into the base branch stays standard
`);

when(Dashboard.shell.loads(Dashboard.plugin))
  .then(Dashboard.shell.renders("a Projects tab"))
  .and(Dashboard.shell.uses(Ui.statusItems))
  .and(Dashboard.shell.defers("loading the Projects screen until the route is active"));

when(Dashboard.gateway.proxies(Projects.backend))
  .then(Dashboard.gateway.validates("dashboard browser-session auth before proxy or upgrade"))
  .and(Dashboard.gateway.starts("the Projects backend on first feature traffic"))
  .and(Dashboard.gateway.routes("dashboard-relative /api/projects paths"));

when(User.creates(Project.record))
  .then(Ui.createProjectDialog.collects(Ui.repoForm))
  .and(Ui.createProjectDialog.offers(Ui.cloneAction).orOffers(Ui.registerAction))
  .and(Ui.createProjectDialog.mayOffer(Ui.accessibleRepoPicker))
  .and(Project.workspace.requires(Scope.explicitProjects))
  .and(Project.workspace.requires(Scope.repoRootBoundaries));

when(Dashboard.screen.renders("on a narrow viewport"))
  .then(Dashboard.screen.shows(Ui.mobileSectionTabs))
  .and(Dashboard.screen.shows("one primary section at a time"))
  .and(Dashboard.screen.avoids("splitting GitHub access and project management into cramped equal-height panes"));

when(User.configures(Github.installation))
  .then(Ui.githubAccessPanel.shows(Ui.githubInstallationList))
  .and(Project.workspace.serves(Api.listGithubInstallations))
  .and(Project.workspace.serves(Api.createGithubBinding))
  .and(Project.workspace.requires(Scope.installationScopedAuth))
  .and(Project.workspace.requires(Scope.githubFirstPrivateRepoOnboarding));

when(User.browses(Github.repoCatalog))
  .then(Project.workspace.serves(Api.listAccessibleRepos))
  .and(Ui.githubAccessPanel.shows(Ui.accessibleRepoPicker))
  .and(Project.workspace.records(Github.discoveredRepo))
  .and(Project.workspace.requires(Scope.githubFirstPrivateRepoOnboarding));

when(User.selects(Github.discoveredRepo))
  .then(Project.workspace.prefills(Ui.repoForm))
  .and(Project.workspace.prefills(Project.remote))
  .and(Project.workspace.prefills(Github.repoBinding))
  .and(Project.workspace.prefers("creating the project from installation-visible repo metadata before clone"));

when(User.invokes(Ui.cloneAction))
  .then(Project.workspace.serves(Api.cloneRepo))
  .and(Project.workspace.validates("remote URL, target path, and approved root"))
  .and(Project.workspace.records(Project.remote))
  .and(Project.workspace.records(Project.baseBranch));

when(User.invokes(Ui.registerAction))
  .then(Project.workspace.serves(Api.registerExistingRepo))
  .and(Project.workspace.validates("repo presence, git metadata, remote URL, and approved root"))
  .and(Project.workspace.records(Project.repo));

when(User.configures(Github.repoBinding))
  .then(Ui.projectDetail.shows(Ui.githubBindingForm))
  .and(Project.workspace.serves(Api.createGithubBinding))
  .and(Project.workspace.requires(Scope.installationScopedAuth));

when(User.validates(Github.repoBinding))
  .then(Project.workspace.serves(Api.validateGithubBinding))
  .and(Github.authCheck.tests("clone, fetch, or push capability against the configured repo"))
  .and(Ui.projectDetail.shows(Ui.validationState))
  .and(Project.workspace.records(Project.validation));

when(User.configures(Project.integrationPolicy))
  .then(Project.workspace.serves(Api.updateIntegrationPolicy))
  .and(Project.workspace.requires(Scope.projectScopedIntegration))
  .and(Project.workspace.requires(Scope.sharedDevelopmentProcess))
  .and(Project.workspace.records(Project.baseBranch))
  .and(Project.workspace.records(Project.postMergeCommand));

when(User.opens(Project.record))
  .then(Ui.projectDetail.shows(Ui.repoForm))
  .and(Ui.projectDetail.shows(Ui.githubBindingForm))
  .and(Ui.projectDetail.shows(Ui.integrationPolicyForm))
  .and(Ui.projectDetail.shows(Ui.projectStatus));

Decision.featureId.means(`
- feature id should be projects
- route should be /projects
- icon should communicate managed repositories and project settings rather than chat or terminal work
`);

Decision.storage.means(`
- project records, GitHub bindings, and process policy are canonical durable app data
- derived health and validation state may be cached but must be rebuildable
- credentials should be stored through the runtime-owned GitHub config path rather than browser-only state
`);

Decision.authModel.means(`
- GitHub App onboarding should end in an explicit installation binding the system can reuse for git operations
- the config model must allow many project repos to share one installation
- the config model must also allow one owner or org to have multiple installations without ambiguity
- the auth model should support discovering installation-visible private repos before the operator enters clone details manually
`);

Decision.integrationModel.means(`
- project config should store only the repo-specific integration values needed by the shared development process
- the required values are the base branch and the post-merge bun command
- human approval before merge to the base branch is not the default because queueing unmerged agent work increases merge-conflict pressure
`);

Package.ui.dependsOn(Package.dashboardUi);
Package.server.dependsOn(Package.dashboardServer);

ProjectsDashboardImplementation.implementsThrough(`
- packages/projects-server owns the Projects base dashboard plugin alongside the project registry, repo onboarding, GitHub binding, and integration-policy endpoints.
- packages/projects-ui composes the Projects UI plugin by attaching the screen loader to the server-owned feature definition.
- packages/dashboard-ui imports the Projects UI plugin into the feature registry.
- packages/dashboard imports the Projects server-owned base plugin into the gateway registry without depending on the UI package.
`);

ProjectsDashboardImplementation.usesFiles(`
- blueprints/dashboard/dashboard-plugins.agentish.ts
- blueprints/dashboard/dashboard-session-auth.agentish.ts
- blueprints/development-process.agentish.ts
- packages/dashboard-plugin/src/index.ts
- packages/dashboard-ui/src/feature-plugins.ts
- packages/dashboard/src/feature-plugins.ts
- packages/projects-server/src/dashboard-plugin.ts
- packages/projects-server/src/index.ts
- packages/projects-ui/src/dashboard-plugin.ts
- packages/projects-ui/src/dashboard-ui-plugin.ts
- packages/projects-ui/src/ProjectsScreen.tsx
- tools/github-app-token.sh
`);
