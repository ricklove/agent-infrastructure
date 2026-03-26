/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const RenderDiagnostics = define.blueprint("RenderDiagnostics", {
  format: Agentish,
  role: "Repository-wide render instrumentation model for diagnosing React rerender churn without external dependencies",
});

const Artifact = {
  globalRegistry: define.document("GlobalRenderCounterRegistry"),
  renderCounterApi: define.document("RenderCounterApi"),
};

const Concept = {
  sharedGlobalCounter: define.concept("SharedGlobalCounter"),
  flatCounterSpace: define.concept("FlatCounterSpace"),
  componentRenderCounter: define.concept("ComponentRenderCounter"),
  nonRenderEventCounter: define.concept("NonRenderEventCounter"),
  firstLineInstrumentation: define.concept("FirstLineInstrumentation"),
  minificationSafeNames: define.concept("MinificationSafeNames"),
  developmentDiagnosisSurface: define.concept("DevelopmentDiagnosisSurface"),
};

RenderDiagnostics.contains(
  Artifact.globalRegistry,
  Artifact.renderCounterApi,
  Concept.sharedGlobalCounter,
  Concept.flatCounterSpace,
  Concept.componentRenderCounter,
  Concept.nonRenderEventCounter,
  Concept.firstLineInstrumentation,
  Concept.minificationSafeNames,
  Concept.developmentDiagnosisSurface,
);

RenderDiagnostics.prescribes(`- React rerender diagnosis should use one small internal render-counter utility rather than ad hoc console logging in individual components.
- The shared counter registry should live on globalThis and should be keyed through Symbol.for(...) so independently loaded workspace packages converge on one shared registry without ordinary string-key collisions.
- The shared registry should keep a flat counter space first: render counts by component name and event counts by event name.
- Flat counters are the canonical default because they are cheap enough to leave widely instrumented while still giving agents enough signal to infer the hot subtree from code structure.
- Component render instrumentation should use a single first-line call inside the component body, with the canonical shape `useRenderCounter("ComponentName")`.
- Non-render activity should use a separate canonical event counter shape such as `countEvent("event-name")` outside render.
- Component names passed to the render counter should be explicit string literals so the instrumentation remains stable under minification and does not depend on React function names.
- The render-counter utility should not introduce external dependencies.
- The render-counter utility should be cheap enough to drop into any workspace package and removable later without changing product behavior.
- Hierarchical render tracing is optional follow-up instrumentation and should not be the default cost model of the shared counter utility.`);

RenderDiagnostics.defines(`- SharedGlobalCounter means the render instrumentation registry is shared across the current browser runtime through globalThis rather than being recreated per package import.
- FlatCounterSpace means the registry counts by one component or event key at a time instead of trying to capture full parent-child hierarchy in the hot path.
- ComponentRenderCounter means a render-body instrumentation call that increments one render count for a named component.
- NonRenderEventCounter means a separate instrumentation call for handlers, websocket activity, timers, or other non-render causes of churn.
- FirstLineInstrumentation means the render counter call belongs at the start of the component body so it measures all renders of that component uniformly.
- MinificationSafeNames means instrumentation names are explicit string literals and do not depend on inferred function names.
- DevelopmentDiagnosisSurface means the counter utility exists to diagnose overrendering and event churn, not to become product-facing state or analytics.`);

when(UI.uses("ad hoc render logging"))
  .then(RenderDiagnostics.encounters("noisy rerender diagnosis"));

when(Implementation.introduces("render instrumentation"))
  .then(RenderDiagnostics.expects(Artifact.globalRegistry))
  .and(RenderDiagnostics.expects(Artifact.renderCounterApi))
  .and(RenderDiagnostics.expects(Concept.flatCounterSpace))
  .and(RenderDiagnostics.expects(Concept.firstLineInstrumentation));
