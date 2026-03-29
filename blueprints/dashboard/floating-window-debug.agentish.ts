/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const FloatingWindowDebug = define.system("FloatingWindowDebug", {
  format: Agentish,
  role: "Dashboard feature for exercising the shared floating-window host against arbitrary content shapes and edge-case geometry",
});

const SectionMap = define.document("SectionMap");

const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const Operator = define.actor("DebugOperator", {
  role: "Human operator using the dashboard tab to diagnose floating-window shell and content behavior",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  windowHost: define.entity("DashboardWindowHost"),
  plugin: define.entity("FloatingWindowDebugPlugin"),
  route: define.entity("FloatingWindowDebugRoute"),
  screen: define.entity("FloatingWindowDebugScreen"),
};

const Lab = {
  catalog: define.entity("ComponentCatalog"),
  specimen: define.entity("WindowSpecimen"),
  preset: define.entity("WindowPreset"),
  measurement: define.entity("WindowMeasurementPanel"),
  fixture: define.entity("ContentFixture"),
  scenario: define.entity("VerificationScenario"),
};

const Content = {
  fixedBlock: define.entity("FixedBlockFixture"),
  fullWidthScroll: define.entity("FullWidthScrollFixture"),
  longText: define.entity("LongTextFixture"),
  unbreakableText: define.entity("UnbreakableTextFixture"),
  nestedFlex: define.entity("NestedFlexFixture"),
  formControls: define.entity("FormControlsFixture"),
  ticketView: define.entity("TicketViewFixture"),
};

const Policy = {
  shellFirstDiagnosis: define.concept("ShellFirstDiagnosis"),
  contentMatrixCoverage: define.concept("ContentMatrixCoverage"),
  liveMeasurements: define.concept("LiveMeasurements"),
  multiWindowComparison: define.concept("MultiWindowComparison"),
};

const Package = {
  featureUi: define.package("FloatingWindowDebugUiPackage"),
  dashboardUi: define.package("DashboardUiPackage"),
  dashboardServer: define.package("DashboardGatewayPackage"),
  agentChatUi: define.package("AgentChatUiPackage"),
};

FloatingWindowDebug.contains(
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

SectionMap.defines(`
- Concept
- Scenarios
- ImplementationPlan
- Contracts
`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

FloatingWindowDebug.enforces(`
- The feature exists to debug the shared dashboard floating-window host, not to create a second product-specific window system.
- The shared dashboard window host remains authoritative for placement, stacking, resize, zoom, minimize, and chrome behavior.
- The shared dashboard window host should derive draggable window bounds from a shell-owned fixed viewport surface rather than directly from page or visualViewport panning offsets.
- Native zoom interactions should preserve a stable visual anchor instead of causing mobile windows to jump unexpectedly while scale changes.
- Active drag, resize, and zoom interactions should be owned by the floating-window host so pointer activity does not leak through to the dashboard surfaces behind the active window.
- Touch-driven drag interactions should suppress background page scrolling for the lifetime of the gesture, especially on iOS where vertical pan gestures otherwise transfer control to the underlying scroll container.
- The debug feature should let operators compare shell behavior across many content fixtures without rewriting the underlying shell for each test.
- Repeated window-debug investigations should prefer visible in-page measurements and presets over transient one-off browser eval only.
- TicketView should be one supported fixture in the lab, but ticket semantics remain owned by Agent Chat rather than by the dashboard shell.
- The lab should make shell-only failures easy to separate from content-layout failures.
`);

FloatingWindowDebug.defines(`
- ComponentCatalog means the operator-visible list of testable surfaces in the debug tab.
- WindowSpecimen means one spawned floating window instance created by the lab for diagnosis.
- WindowPreset means one named geometry and content configuration such as 200x220 at 30 percent scale.
- WindowMeasurementPanel means the visible live inspection surface for viewport size, requested scale, effective rendered scale, scaled content size, and overflow metrics for a specimen.
- ContentFixture means one reproducible content shape rendered inside the shared floating-window host.
- VerificationScenario means one repeatable comparison of content fixture plus geometry preset.
- ShellFirstDiagnosis means simple fixtures should be testable before real feature content so shell bugs and content bugs can be separated.
- ContentMatrixCoverage means the lab should exercise multiple width, height, scale, and content-shape combinations rather than only one happy path.
- LiveMeasurements means the operator can inspect window and content metrics from the page without depending only on console output.
`);

Dashboard.shell.contains(Dashboard.windowHost, Dashboard.plugin, Dashboard.route, Dashboard.screen);
Dashboard.screen.contains(Lab.catalog, Lab.specimen, Lab.preset, Lab.measurement, Lab.fixture, Lab.scenario);
Lab.fixture.contains(
  Content.fixedBlock,
  Content.fullWidthScroll,
  Content.longText,
  Content.unbreakableText,
  Content.nestedFlex,
  Content.formControls,
  Content.ticketView,
  Policy.shellFirstDiagnosis,
  Policy.contentMatrixCoverage,
  Policy.liveMeasurements,
  Policy.multiWindowComparison,
);

when(Dashboard.screen.uses(Dashboard.windowHost))
  .then(Dashboard.windowHost.provides("shared floating window chrome"))
  .and(Dashboard.screen.retains("ownership of fixture selection and measurement rendering"));

when(Lab.catalog.selects("floating window"))
  .then(Dashboard.screen.reveals(Lab.fixture, Lab.preset, Lab.measurement))
  .and(Dashboard.screen.preserves(Policy.shellFirstDiagnosis));

when(Operator.selects(Content.fixedBlock))
  .then(Dashboard.screen.creates(Lab.specimen))
  .and(Operator.observes("shell-only baseline geometry without content-driven layout ambiguity"));

when(Operator.selects(Content.fullWidthScroll))
  .then(Dashboard.screen.creates(Lab.specimen))
  .and(Operator.observes("whether vertical scrolling and full-width layout stay constrained inside the scaled viewport"));

when(Operator.selects(Content.longText))
  .then(Dashboard.screen.creates(Lab.specimen))
  .and(Operator.observes("wrapping, readable width, and overflow behavior under narrow scaled windows"));

when(Operator.selects(Content.unbreakableText))
  .then(Dashboard.screen.creates(Lab.specimen))
  .and(Operator.observes("horizontal overflow pressure without relying on real product content"));

when(Operator.selects(Content.ticketView))
  .then(Dashboard.screen.creates(Lab.specimen))
  .and(Dashboard.screen.preserves("ticket content semantics as Agent Chat-owned rendering"))
  .and(Operator.compares("real ticket content against shell-only fixtures"));

when(Operator.applies(Lab.preset))
  .then(Dashboard.screen.creates(Lab.scenario))
  .and(Operator.observes(Lab.measurement))
  .and(Dashboard.screen.preserves(Policy.contentMatrixCoverage));

when(Operator.opens("more than one specimen"))
  .then(Dashboard.screen.preserves(Policy.multiWindowComparison))
  .and(Operator.compares("stacking, focus, resize, minimize, and overlap behavior across multiple windows"));

Package.featureUi.dependsOn(Package.dashboardUi, Package.dashboardServer, Package.agentChatUi);

FloatingWindowDebug.implementsThrough(`
- A dedicated dashboard feature package should own the debug tab plugin, screen, fixture catalog, presets, and visible measurement surface.
- The feature should open specimens through the shared DashboardWindowLayer hook rather than reimplementing floating window chrome inside the feature package.
- The shared host should use touch-action and gesture ownership rules that preserve drag intent on mobile Safari instead of allowing thread or page scroll to steal an active window drag.
- Fixture definitions should stay local to the debug package except when the fixture intentionally renders an existing feature-owned component such as TicketView.
- The screen should expose named presets for narrow-width and low-scale edge cases that were previously investigated through ad hoc browser eval.
- Measurements should stay visible in the screen and should include outer window size, viewport size, requested scale, effective rendered scale, scaled content dimensions, and overflow indicators.
- Scaled height metrics and scrollbar behavior should reflect rendered size rather than raw unscaled content length so zoomed-out windows report the same visual scroll geometry the operator sees.
- The debug package may dispatch feature status items for the active tab when useful, but the lab remains primarily an operator-driven inspection surface.
`);

FloatingWindowDebug.defines(`
- FloatingWindowFixtureId = fixed-block | full-width-scroll | long-text | unbreakable-text | nested-flex | form-controls | ticket-view
- FloatingWindowPresetId = baseline | narrow-50 | narrow-30 | mobile-fit | tall-scroll | ticket-small
- WindowMeasurement fields include window width, window height, viewport width, viewport height, requested scale, effective rendered scale, content client width, content client height, content scroll width, content scroll height, horizontal overflow, and vertical overflow.
`);
