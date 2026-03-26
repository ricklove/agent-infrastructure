/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const UiDesignCanvasBlueprintState = define.system("UiDesignCanvasBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the UI Design Canvas blueprint",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
  issue: define.concept("KnownIssue"),
};

const CurrentReality = {
  dashboardFeatureExists: define.concept("ImplementedDashboardFeature"),
  localCanvasVerticalSlice: define.concept("LocalCanvasVerticalSlice"),
  canonicalStackFit: define.concept("CanonicalReactFlowFit"),
  pluginArchitectureFit: define.concept("DashboardPluginArchitectureFit"),
  localAgentProjection: define.concept("LocalProjectedAgentLoop"),
  authorityClosedAtBlueprint: define.concept("AuthorityBoundaryClosedInBlueprint"),
  contractsRefinedAtBlueprint: define.concept("RefinedV1Contracts"),
  missingPersistenceAndBackend: define.concept("MissingDurableCanvasBackend"),
  missingCanonicalAgentChatIntegration: define.concept("MissingCanonicalAgentChatProjection"),
  sectionedSubjectBlueprint: define.concept("SectionedSingleSubjectBlueprint"),
};

UiDesignCanvasBlueprintState.defines(`
- CurrentImplementationStatus means the UI Design Canvas now exists as a real dashboard feature package and registered dashboard tab, but only as an intentionally local vertical slice rather than a complete persisted product surface.
- AssessmentConfidence is medium because the current state is grounded in direct source inspection and local worker-host verification, but durable persistence, backend contracts, and live deployed verification still remain unfinished.
- ImplementationEvidence includes packages/ui-design-canvas-ui, dashboard plugin registration in packages/dashboard-ui and packages/dashboard, dashboard-plugin type expansion, Tailwind source inclusion in apps/dashboard-app/src/styles.css, and the local worker-hosted verification loop.
- This blueprint-state compares current reality against the canonical UI Design Canvas subject blueprint in ui-design-canvas.agentish.ts.
- ImplementationGap means durable workspace persistence, canonical AgentChat projection, committed review snapshots, and release-grade live verification are not yet complete.
- KnownIssue means the current feature simulates the background agent loop locally in the UI package instead of projecting from canonical AgentChat turns.
`);

UiDesignCanvasBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.dashboardFeatureExists,
  CurrentReality.localCanvasVerticalSlice,
  CurrentReality.canonicalStackFit,
  CurrentReality.pluginArchitectureFit,
  CurrentReality.localAgentProjection,
  CurrentReality.authorityClosedAtBlueprint,
  CurrentReality.contractsRefinedAtBlueprint,
  CurrentReality.missingPersistenceAndBackend,
  CurrentReality.missingCanonicalAgentChatIntegration,
  CurrentReality.sectionedSubjectBlueprint,
);

CurrentReality.dashboardFeatureExists.means(`
- a first-party UI Design tab now exists in the dashboard plugin registry
- the dashboard shell now recognizes the `design` feature id and icon
- the feature ships as packages/ui-design-canvas-ui with plugin and ui-plugin exports
`);

CurrentReality.localCanvasVerticalSlice.means(`
- the current screen renders a real React Flow canvas with seeded high-level design variants
- double-clicking the canvas creates a draft prompt node with Enter-to-submit and Shift+Enter newline behavior
- submitted prompts transition into visible prompt nodes with pending and resolved visual state
- draw mode adds a top-level freehand overlay and markup can be cleared or submitted for review
- the right-side review feed shows the visible human and agent interaction loop for the active canvas session
`);

CurrentReality.canonicalStackFit.means(`
- the implementation reuses React Flow as the repository's canonical graph surface
- the feature uses Tailwind utility classes for static styling and keeps runtime styling minimal
`);

CurrentReality.pluginArchitectureFit.means(`
- the feature follows the existing feature-owned dashboard plugin model
- the dashboard shell and gateway register the feature through the same first-party registry path used by other dashboard tabs
- the current slice remains UI-only and therefore does not yet introduce a feature backend definition
`);

CurrentReality.localAgentProjection.means(`
- the current implementation already distinguishes prompt submission from agent response projection on the canvas
- local classifier logic currently chooses between comment-thread projection and variant generation so the visible loop is testable before backend integration
- this loop is intentionally local scaffolding rather than canonical AgentChat-backed execution
`);

CurrentReality.authorityClosedAtBlueprint.means(`
- the refined subject blueprint explicitly closes canvas spatial authority versus AgentChat turn authority
- the current implementation follows that blueprint direction conceptually, even though canonical AgentChat projection is not yet wired
`);

CurrentReality.contractsRefinedAtBlueprint.means(`
- the subject blueprint now includes tighter v1 record and action contracts for prompt, variant, thread, and review snapshot state
- the current UI slice implements only part of that contract surface today
`);

CurrentReality.missingPersistenceAndBackend.means(`
- canvas prompts, variants, overlay strokes, and review history are not yet persisted as durable workspace state
- there is no feature backend package or API surface yet for snapshots, saved canvases, or shared session state
`);

CurrentReality.missingCanonicalAgentChatIntegration.means(`
- projected comment and variant nodes do not yet originate from canonical AgentChat sessions or turns
- the visible review feed is still local UI state rather than a projection of durable chat history
`);

CurrentReality.sectionedSubjectBlueprint.means(`
- the canonical subject blueprint remains one sectioned file with Concept, Scenarios, ImplementationPlan, and Contracts
- future implementation work should continue updating this state file alongside feature behavior changes
`);

when(CurrentReality.dashboardFeatureExists.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.status, Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("UI Design Canvas as an implemented local dashboard feature slice"));

when(CurrentReality.localCanvasVerticalSlice.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("prompt, variant, and markup behavior as locally testable today"));

when(CurrentReality.missingPersistenceAndBackend.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("durable backend work as still open against the ideal blueprint"));

when(CurrentReality.missingCanonicalAgentChatIntegration.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("canonical AgentChat projection as unfinished follow-on work"));

when(CurrentReality.sectionedSubjectBlueprint.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("canonical sectioned blueprint structure as established"));
