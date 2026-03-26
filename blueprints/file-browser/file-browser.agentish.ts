/// <reference path="../_agentish.d.ts" />

// File Browser

const Agentish = define.language("Agentish");

const FileBrowser = define.system("FileBrowser", {
  format: Agentish,
  role: "VS Code-like workspace file browser dashboard feature",
});

const User = define.actor("DashboardOperator", {
  role: "Operator browsing and managing files inside the dashboard",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("FileBrowserDashboardPlugin"),
  route: define.entity("FileBrowserRoute"),
  screen: define.entity("FileBrowserScreen"),
};

const Browser = {
  backend: define.system("FileBrowserBackend"),
  tree: define.entity("WorkspaceTree"),
  node: define.entity("WorkspaceNode"),
  file: define.entity("WorkspaceFileNode"),
  directory: define.entity("WorkspaceDirectoryNode"),
  root: define.entity("WorkspaceRoot"),
  selection: define.entity("SelectedWorkspaceNode"),
  expansion: define.entity("ExpandedDirectorySet"),
  revealTarget: define.entity("RevealTarget"),
  preview: define.entity("FilePreview"),
  metadata: define.entity("WorkspaceNodeMetadata"),
  watch: define.entity("WorkspaceWatchStream"),
  mutation: define.entity("WorkspaceMutation"),
  search: define.entity("WorkspaceNodeFilter"),
  clipboardIntent: define.entity("ClipboardIntent"),
};

const Api = {
  listRoots: define.entity("ListWorkspaceRootsEndpoint"),
  readDirectory: define.entity("ReadDirectoryEndpoint"),
  readFilePreview: define.entity("ReadFilePreviewEndpoint"),
  revealPath: define.entity("RevealPathEndpoint"),
  createNode: define.entity("CreateWorkspaceNodeEndpoint"),
  renameNode: define.entity("RenameWorkspaceNodeEndpoint"),
  moveNode: define.entity("MoveWorkspaceNodeEndpoint"),
  deleteNode: define.entity("DeleteWorkspaceNodeEndpoint"),
  watchWorkspace: define.entity("WatchWorkspaceEndpoint"),
};

const Ui = {
  sidebar: define.entity("ExplorerSidebar"),
  rootPicker: define.entity("WorkspaceRootPicker"),
  treeView: define.entity("WorkspaceTreeView"),
  row: define.entity("WorkspaceTreeRow"),
  disclosure: define.entity("DisclosureChevron"),
  icon: define.entity("NodeTypeIcon"),
  activeIndicator: define.entity("ActiveNodeIndicator"),
  inlineRename: define.entity("InlineRenameControl"),
  contextMenu: define.entity("WorkspaceContextMenu"),
  actionBar: define.entity("ExplorerActionBar"),
  filterInput: define.entity("ExplorerFilterInput"),
  previewPane: define.entity("FilePreviewPane"),
  emptyState: define.entity("ExplorerEmptyState"),
  loadingState: define.entity("ExplorerLoadingState"),
  statusItems: define.entity("FileBrowserFeatureStatusItems"),
};

const Runtime = {
  lazyUi: define.concept("LazyFileBrowserUi"),
  lazyBackend: define.concept("LazyFileBrowserBackend"),
  optimisticUi: define.concept("OptimisticTreeMutation"),
  pushUpdates: define.concept("PushWorkspaceUpdates"),
  boundedPreview: define.concept("BoundedTextPreview"),
  ignoreRules: define.concept("IgnoreAwareListing"),
  keyboardModel: define.concept("ExplorerKeyboardModel"),
};

const Scope = {
  singleWorkspace: define.concept("SingleActiveWorkspaceRoot"),
  multiRootReady: define.concept("MultiRootFutureReady"),
  readFirst: define.concept("ReadFirstExplorerV1"),
  safeMutations: define.concept("GuardedFileMutations"),
};

const Decision = {
  featureId: define.entity("FileBrowserFeatureIdDecision"),
  backendPackage: define.entity("FileBrowserBackendPackageDecision"),
  uiPackage: define.entity("FileBrowserUiPackageDecision"),
  routeName: define.entity("FileBrowserRouteDecision"),
  previewPolicy: define.entity("PreviewPolicyDecision"),
  watchStrategy: define.entity("WorkspaceWatchStrategyDecision"),
  mutationScope: define.entity("FirstMutationScopeDecision"),
};

const Package = {
  ui: define.package("FileBrowserUiPackage"),
  server: define.package("FileBrowserServerPackage"),
  dashboardUi: define.package("DashboardUiPackage"),
  dashboardServer: define.package("DashboardGatewayPackage"),
};

FileBrowser.enforces(`
- The file browser is a real dashboard plugin feature rather than a shell-owned special case.
- The file browser should feel immediately legible to anyone familiar with the VS Code explorer.
- The main surface is a left-side expandable tree with clear file-versus-folder affordances and compact row density.
- The browser must be rooted to an explicit workspace root and must never silently roam arbitrary host filesystem regions.
- Directory expansion state, selection state, and root choice belong to the browser feature rather than to the dashboard shell.
- V1 is read-first but may include safe high-value mutations such as create, rename, move, and delete behind explicit user actions.
- File preview is for inspection and lightweight confirmation, not for replacing a full code editor.
- Large files, binary files, and unreadable paths must degrade cleanly rather than freezing the browser.
- Directory listings must respect declared ignore policy so the tree is not flooded by generated noise.
- The gateway should proxy file-browser traffic and lazy-start the backend on first use.
- After dashboard bootstrap exchange, file-browser HTTP and WebSocket traffic must use gateway-enforced session auth and must not carry dashboard session tokens in URLs.
- File-system change propagation should be incremental and event-driven when practical rather than brute-force full-tree polling.
- Mutations must stay inside the selected workspace root and reject path traversal, symlink escape, and ambiguous overwrite behavior.
- The feature should emit its own dashboard status items for root, watch health, and last refresh state.
`);

FileBrowser.defines(`
- FileBrowserDashboardPlugin means the dashboard feature definition for the explorer tab, route, icon, screen loader, backend health, and startup.
- WorkspaceRoot means the top-level directory boundary the explorer is allowed to show and mutate.
- WorkspaceTree means the lazily loaded hierarchy of directories and files under the selected root.
- RevealTarget means a path the browser expands toward so the matching node becomes visible and selected.
- FilePreview means a bounded inspection payload such as truncated text, language hint, size, and binary classification.
- IgnoreAwareListing means directory enumeration applies repo-relevant ignore rules and hidden-noise policy before rows are rendered.
- ExplorerKeyboardModel means arrow keys, Enter, Space, and rename shortcuts follow conventional file-explorer expectations.
- GuardedFileMutations means V1 mutations are explicit, scoped, reversible where practical, and rejected when they would escape the active root.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Browser.backend);
Browser.backend.contains(
  Browser.tree,
  Browser.node,
  Browser.file,
  Browser.directory,
  Browser.root,
  Browser.selection,
  Browser.expansion,
  Browser.preview,
  Browser.metadata,
  Browser.watch,
  Browser.mutation,
  Browser.search,
  Browser.clipboardIntent,
);
Browser.backend.contains(
  Api.listRoots,
  Api.readDirectory,
  Api.readFilePreview,
  Api.revealPath,
  Api.createNode,
  Api.renameNode,
  Api.moveNode,
  Api.deleteNode,
  Api.watchWorkspace,
);
Dashboard.screen.contains(
  Ui.sidebar,
  Ui.rootPicker,
  Ui.treeView,
  Ui.row,
  Ui.disclosure,
  Ui.icon,
  Ui.activeIndicator,
  Ui.inlineRename,
  Ui.contextMenu,
  Ui.actionBar,
  Ui.filterInput,
  Ui.previewPane,
  Ui.emptyState,
  Ui.loadingState,
  Ui.statusItems,
);
Dashboard.plugin.contains(Runtime.lazyUi, Runtime.lazyBackend);
Browser.backend.contains(Runtime.pushUpdates, Runtime.ignoreRules, Runtime.boundedPreview);
Dashboard.screen.contains(Runtime.keyboardModel, Runtime.optimisticUi);

Scope.singleWorkspace.means(`
- one workspace root is active at a time in V1
- the root may default to /home/ec2-user/workspace
- the operator can switch to another allowed root without opening a new dashboard tab
`);

Scope.multiRootReady.means(`
- contracts and browser state should not assume that only one root can ever exist
- V1 may render one root at a time while preserving room for future multi-root workspaces
- backend payloads should carry explicit root identity rather than relying on implicit singleton state
`);

Scope.readFirst.means(`
- the explorer is primarily for browsing and selecting files and directories
- preview is lightweight and bounded
- rich text editing, tabs, split panes, and full IDE behavior are out of scope for V1
`);

Scope.safeMutations.means(`
- V1 may create files and folders
- V1 may rename, move, and delete nodes with clear confirmation where destructive
- bulk refactors, git-aware staging flows, and merge conflict tooling are out of scope for V1
`);

when(Dashboard.shell.loads(Dashboard.plugin))
  .then(Dashboard.shell.renders("a Files tab"))
  .and(Dashboard.shell.applies(Runtime.lazyUi))
  .and(Dashboard.shell.defers("loading the explorer screen until the route is active"));

when(Dashboard.gateway.proxies(Browser.backend))
  .then(Dashboard.gateway.applies(Runtime.lazyBackend))
  .and(Dashboard.gateway.validates("dashboard browser-session auth before proxy or upgrade"))
  .and(Dashboard.gateway.starts("the file browser backend on first feature traffic"))
  .and(Dashboard.gateway.routes("dashboard-relative /api/file-browser and /ws/file-browser paths"));

when(Ui.treeView.renders(Browser.tree))
  .then(Ui.row.represents(Browser.node))
  .and(Ui.row.shows(Ui.disclosure).when(Browser.node.is(Browser.directory)))
  .and(Ui.row.shows(Ui.icon))
  .and(Ui.row.shows(Ui.activeIndicator).when(Browser.node.matches(Browser.selection)))
  .and(Dashboard.screen.optimizesFor("high-density scanning over decorative chrome"));

when(Ui.rootPicker.changes(Browser.root))
  .then(Browser.backend.reloads(Browser.tree))
  .and(Dashboard.screen.clears(Browser.selection))
  .and(Dashboard.screen.resets("expansion state that belongs to the old root"))
  .and(Dashboard.screen.reports("the new root in feature status items"));

when(User.expands(Browser.directory))
  .then(Browser.backend.serves(Api.readDirectory))
  .and(Dashboard.screen.loads("only the requested subtree"))
  .and(Dashboard.screen.caches("expanded subtree results until invalidated by watch updates or refresh"));

when(User.selects(Browser.file))
  .then(Browser.backend.serves(Api.readFilePreview))
  .and(Dashboard.screen.shows(Ui.previewPane))
  .and(Dashboard.screen.reveals("path, size, language hint, and bounded contents when text-readable"));

when(User.selects(Browser.directory))
  .then(Dashboard.screen.shows("directory metadata and quick actions"))
  .and(Dashboard.screen.doesNotPretend("a directory is a text preview"));

when(User.filters(Browser.search))
  .then(Dashboard.screen.applies("client-side narrowing for loaded nodes"))
  .and(Browser.backend.mayExtend("to server-assisted search when tree size makes local filtering insufficient"));

when(User.requests(Browser.revealTarget))
  .then(Browser.backend.serves(Api.revealPath))
  .and(Dashboard.screen.expands("ancestor directories needed to show the target"))
  .and(Dashboard.screen.selects("the revealed node"));

when(Browser.backend.observes("filesystem changes under the active root"))
  .then(Browser.backend.pushes(Browser.watch))
  .and(Dashboard.screen.applies(Runtime.pushUpdates))
  .and(Dashboard.screen.reconciles("only the affected subtree when a precise update is available"));

when(User.invokes(Ui.contextMenu))
  .then(Dashboard.screen.offers("new file, new folder, rename, delete, refresh, and copy relative path"))
  .and(Dashboard.screen.scopes("actions to the selected node and active root rules"));

when(User.commits(Browser.mutation))
  .then(Browser.backend.validates("the target path remains inside the active root"))
  .and(Browser.backend.rejects("path traversal and symlink escape"))
  .and(Dashboard.screen.applies(Runtime.optimisticUi).when("the mutation is locally predictable"))
  .and(Dashboard.screen.reconciles("with authoritative backend state after mutation completion"));

when(Browser.preview.classifies("binary, too large, or unreadable content"))
  .then(Dashboard.screen.shows("metadata-first preview fallback"))
  .and(Dashboard.screen.avoids("rendering garbage or blocking the UI on full file reads"));

when(Browser.backend.becomes("unhealthy"))
  .then(Dashboard.screen.publishes(Ui.statusItems))
  .and(Dashboard.screen.explains("whether listing, preview, or watch capability is degraded"))
  .and(Dashboard.screen.keeps("already loaded tree state visible when safe"));

Decision.featureId.means(`
- feature id should be files
- route should be /files
- icon should communicate file exploration rather than chat, graph, or swarm control
`);

Decision.backendPackage.means(`
- packages/file-browser-server owns filesystem access, listing policy, preview reads, mutation validation, and watch events
- the backend should remain dependency-light and avoid dashboard-shell knowledge beyond the shared plugin contract
`);

Decision.uiPackage.means(`
- packages/file-browser-ui owns explorer state, tree rendering, preview rendering, keyboard behavior, and feature status dispatch
- the package should export the dashboard plugin and dashboard UI plugin entries using the same pattern as existing features
`);

Decision.previewPolicy.means(`
- text preview payloads should be truncated to a safe upper bound
- the backend should report truncation explicitly
- binary detection should happen before expensive or misleading text decoding
`);

Decision.watchStrategy.means(`
- prefer native filesystem watch plus subtree invalidation when stable on the manager host
- fall back to explicit refresh when watch support is unavailable or unreliable
- watch errors must surface as feature status rather than silently disabling freshness
`);

Decision.mutationScope.means(`
- if implementation needs a smaller first cut, ship browse plus preview first
- the plugin shape, backend contracts, and UI affordances should still leave a clean path for guarded mutations
- do not couple initial browsing success to a full editor or terminal implementation
`);

Package.ui.dependsOn(Package.dashboardUi);
Package.server.dependsOn(Package.dashboardServer);

FileBrowserDashboardImplementation.implementsThrough(`
- packages/file-browser-ui exports the file browser dashboard plugin and lazy-loaded screen.
- packages/file-browser-server exposes the feature-owned HTTP and WebSocket backend.
- packages/dashboard-ui imports the file browser UI plugin into the first-party feature registry.
- packages/dashboard imports the file browser backend plugin into the gateway feature registry.
`);

FileBrowserDashboardImplementation.usesFiles(`
- blueprints/dashboard/dashboard-plugins.agentish.ts
- packages/dashboard-plugin/src/index.ts
- packages/dashboard-ui/src/feature-plugins.ts
- packages/dashboard/src/feature-plugins.ts
- packages/file-browser-ui/src/dashboard-plugin.ts
- packages/file-browser-ui/src/dashboard-ui-plugin.ts
- packages/file-browser-ui/src/FileBrowserScreen.tsx
- packages/file-browser-server/src/index.ts
- packages/file-browser-server/src/workspace-tree.ts
- packages/file-browser-server/src/file-preview.ts
- packages/file-browser-server/src/workspace-watch.ts
`);
