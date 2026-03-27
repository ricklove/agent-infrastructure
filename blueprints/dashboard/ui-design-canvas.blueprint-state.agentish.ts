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
  blueprintQualityRefined: define.concept("BlueprintQualityRefinedFromCritique"),
  promptEntryDrift: define.concept("PromptEntryInteractionDrift"),
  layoutDrift: define.concept("CanvasLayoutDrift"),
  canonicalStackFit: define.concept("CanonicalReactFlowFit"),
  pluginArchitectureFit: define.concept("DashboardPluginArchitectureFit"),
  localAgentProjection: define.concept("LocalProjectedAgentLoop"),
  missingDiscussDefault: define.concept("MissingDiscussDefaultForBoardSessions"),
  missingWorkerIsolationForBoardSessions: define.concept("MissingWorkerIsolationForBoardSessions"),
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
- KnownIssue also includes unsafe session defaults if the board can create coding-capable sessions without a `Discuss` default or can target manager-host repositories by default.
- BlueprintQualityRefinedFromCritique means the subject blueprint was reworked using explicit quality critique from the `Refactoring` AgentChat session to reduce abstraction inflation, strengthen scenario closure, and separate section responsibilities more clearly.
- PromptEntryInteractionDrift means the current implementation does not yet fully honor the blueprint's intended immediate double-click-to-text-node authoring path as the dominant interaction.
- CanvasLayoutDrift means the current implementation still uses a panel-led shell rather than a full-screen canvas with movable floating panels.
`);

UiDesignCanvasBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.dashboardFeatureExists,
  CurrentReality.localCanvasVerticalSlice,
  CurrentReality.blueprintQualityRefined,
  CurrentReality.promptEntryDrift,
  CurrentReality.layoutDrift,
  CurrentReality.canonicalStackFit,
  CurrentReality.pluginArchitectureFit,
  CurrentReality.localAgentProjection,
  CurrentReality.missingDiscussDefault,
  CurrentReality.missingWorkerIsolationForBoardSessions,
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
- draft prompt creation, Enter-to-submit, and Shift+Enter newline behavior are present in the slice
- submitted prompts transition into visible prompt nodes with pending and resolved visual state
- draw mode adds a top-level freehand overlay and markup can be cleared or submitted for review
- the right-side review feed shows the visible human and agent interaction loop for the active canvas session
`);

CurrentReality.blueprintQualityRefined.means(`
- the subject blueprint now embodies the section model more clearly through distinct concept, scenario, implementation-plan, and contract blocks
- the noun catalog was reduced so the file teaches the subject through a smaller number of stronger abstractions
- the scenario layer is now organized around a compact set of end-to-end operator-visible flows rather than a longer chain of local event transitions
- layout preferences such as floating panels and board-coordinate markup now live in implementation-plan space rather than pretending to be core product semantics
`);

CurrentReality.promptEntryDrift.means(`
- the current implementation drifted toward a more explicit mode-led interaction model than the blueprint should allow
- the intended dominant interaction is double-click empty canvas, immediate focused draft text node, and direct inline typing without requiring a separate prompt mode
- implementation should be corrected to privilege immediate prompt entry as the default authoring path
`);

CurrentReality.layoutDrift.means(`
- the current implementation presents more fixed shell chrome than the refined blueprint intends
- the intended layout is a full-screen canvas with movable floating review, tool, and inspector panels layered above the board
- implementation should be corrected so support panels assist the canvas without permanently reducing the main design surface
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

CurrentReality.missingDiscussDefault.means(`
- the board subject now requires auto-created prompt sessions to start in the `Discuss` process by default
- any implementation path that creates board sessions without that process guard is behaviorally unsafe because exploratory prompts can turn into code-changing work
`);

CurrentReality.missingWorkerIsolationForBoardSessions.means(`
- the board subject now requires prompt-driven sessions to target isolated worker workspace surfaces by default
- any implementation path that points board-created sessions at manager-host canonical repositories violates the intended worker isolation boundary
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

when(CurrentReality.blueprintQualityRefined.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("the subject blueprint as materially improved by explicit quality critique from the refactoring session"));

when(CurrentReality.promptEntryDrift.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("the current prompt-entry interaction as divergent from the intended direct canvas experience"));

when(CurrentReality.layoutDrift.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("the current panel-led layout as divergent from the intended canvas-first workspace"));

when(CurrentReality.missingPersistenceAndBackend.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("durable backend work as still open against the ideal blueprint"));

when(CurrentReality.missingCanonicalAgentChatIntegration.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("canonical AgentChat projection as unfinished follow-on work"));

when(CurrentReality.missingDiscussDefault.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("board session creation as unsafe until `Discuss` is the default process"));

when(CurrentReality.missingWorkerIsolationForBoardSessions.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("board session targeting as unsafe until worker-host isolation is the default"));

when(CurrentReality.sectionedSubjectBlueprint.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("canonical sectioned blueprint structure as established"));
