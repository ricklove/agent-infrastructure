/// <reference path="../_agentish.d.ts" />

// Dashboard Plugins

const Agentish = define.language("Agentish");

const DashboardPlugins = define.system("DashboardPlugins", {
  format: Agentish,
  role: "Feature-owned dashboard plugin model for tabs, lazy UI screens, gateway backends, and status wiring",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  pluginRegistry: define.entity("DashboardPluginRegistry"),
  featurePlugin: define.entity("DashboardFeaturePlugin"),
  tab: define.entity("DashboardTab"),
};

const Feature = {
  module: define.entity("FeatureModule"),
  screen: define.entity("FeatureScreen"),
  backend: define.entity("FeatureBackend"),
  status: define.entity("FeatureStatus"),
  icon: define.entity("FeatureIcon"),
  route: define.entity("FeatureRoute"),
  tooltip: define.entity("FeatureTooltip"),
};

const Runtime = {
  lazyUi: define.concept("LazyUiLoad"),
  lazyBackend: define.concept("LazyBackendStart"),
  healthCheck: define.entity("BackendHealthCheck"),
  startup: define.entity("BackendStartup"),
};

DashboardPlugins.enforces(`
- Each dashboard feature owns its own plugin definition.
- The dashboard shell should not duplicate feature label, route, icon, or description.
- The gateway should not duplicate backend health and startup knowledge outside plugin definitions.
- Plugin definitions are first-party and typed, not a third-party dynamic extension system.
- UI screens and backends are lazy by default.
`);

DashboardPlugins.defines(`
- A dashboard feature plugin is the single feature definition consumed by both the dashboard shell and the dashboard gateway.
- A plugin registry is the list of first-party feature plugins that this dashboard build includes.
- Lazy UI load means the feature screen module is imported only when needed.
- Lazy backend start means the gateway starts a backend only when feature traffic requires it.
`);

Dashboard.shell.contains(Dashboard.tab, Dashboard.pluginRegistry);
Dashboard.gateway.contains(Dashboard.pluginRegistry);
Dashboard.pluginRegistry.contains(Dashboard.featurePlugin);
Dashboard.featurePlugin.contains(
  Feature.module,
  Feature.screen,
  Feature.backend,
  Feature.status,
  Feature.icon,
  Feature.route,
  Feature.tooltip,
  Runtime.healthCheck,
  Runtime.startup,
);

when(Feature.module.belongsTo(Dashboard.featurePlugin))
  .then(Feature.module.owns("its tab metadata"))
  .and(Feature.module.owns("its lazy screen loader"))
  .and(Feature.module.owns("its backend definition when one exists"));

when(Dashboard.shell.loads(Dashboard.pluginRegistry))
  .then(Dashboard.shell.renders(Dashboard.tab))
  .and(Dashboard.tab.uses(Feature.icon))
  .and(Dashboard.tab.uses(Feature.route))
  .and(Dashboard.tab.uses(Feature.tooltip))
  .and(Dashboard.shell.applies(Runtime.lazyUi));

when(Dashboard.gateway.proxies(Feature.backend))
  .then(Dashboard.gateway.uses(Runtime.healthCheck))
  .and(Dashboard.gateway.applies(Runtime.lazyBackend))
  .and(Dashboard.gateway.mayInvoke(Runtime.startup));

DashboardPlugins.prescribes(`
- Feature packages export a dependency-light plugin definition.
- The dashboard shell and gateway import the same feature registry.
- The plugin definition should describe screen loading, route, label, icon, tooltip, backend health, backend startup, and status naming.
- Feature status should remain feature-owned rather than centrally guessed by the shell.
`);
