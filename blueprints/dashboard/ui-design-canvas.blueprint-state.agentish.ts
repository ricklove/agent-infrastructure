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
  plannedFeature: define.concept("PlannedDashboardFeature"),
  canonicalStackFit: define.concept("CanonicalReactFlowFit"),
  pluginArchitectureFit: define.concept("DashboardPluginArchitectureFit"),
  agentIntegrationDependency: define.concept("AgentChatDependency"),
  authorityClosedAtBlueprint: define.concept("AuthorityBoundaryClosedInBlueprint"),
  contractsRefinedAtBlueprint: define.concept("RefinedV1Contracts"),
  missingImplementation: define.concept("NoCurrentFeatureImplementation"),
  sectionedSubjectBlueprint: define.concept("SectionedSingleSubjectBlueprint"),
};

UiDesignCanvasBlueprintState.defines(`
- CurrentImplementationStatus means the subject has been defined at the blueprint layer but does not yet exist as a shipped dashboard feature.
- AssessmentConfidence is medium because the repository already has the surrounding plugin architecture, React Flow usage, and chat infrastructure inspected directly from source.
- ImplementationEvidence includes blueprints/tech-stack.agentish.ts, blueprints/dashboard/dashboard-plugins.agentish.ts, blueprints/agent-chat/agent-chat.agentish.ts, and packages/agent-graph-ui as the nearest implemented canvas reference.
- This blueprint-state compares current reality against the canonical UI Design Canvas subject blueprint in ui-design-canvas.agentish.ts.
- ImplementationGap means prompt-node interaction, background chat attachment, variant review UI, markup-overlay capture, and durable feature persistence remain unimplemented work.
- KnownIssue means no existing feature package, route registration, backend endpoints, or persisted canvas model currently realizes this subject.
`);

UiDesignCanvasBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.issue,
  CurrentReality.plannedFeature,
  CurrentReality.canonicalStackFit,
  CurrentReality.pluginArchitectureFit,
  CurrentReality.agentIntegrationDependency,
  CurrentReality.authorityClosedAtBlueprint,
  CurrentReality.contractsRefinedAtBlueprint,
  CurrentReality.missingImplementation,
  CurrentReality.sectionedSubjectBlueprint,
);

CurrentReality.plannedFeature.means(`
- the subject exists today as an intended dashboard feature rather than an implemented operator surface
- the current repository discussion has converged on a high-level design review canvas instead of a granular UI builder
`);

CurrentReality.canonicalStackFit.means(`
- the repository tech-stack blueprint already names React Flow as the canonical graph canvas surface
- packages/agent-graph-ui provides a nearby implemented reference for custom node and edge rendering patterns
`);

CurrentReality.pluginArchitectureFit.means(`
- the dashboard blueprints already require feature-owned plugins with lazy UI loading and gateway-owned auth
- the proposed feature can fit that architecture without changing the shell contract
`);

CurrentReality.agentIntegrationDependency.means(`
- AgentChat remains the canonical conversation and transcript surface the feature should integrate with
- the refined blueprint now closes that the canvas owns spatial state while AgentChat owns canonical turn history
- canvas threads and generated variants should project from AgentChat turns rather than duplicating transcript authority
`);

CurrentReality.authorityClosedAtBlueprint.means(`
- the refined subject blueprint now explicitly closes source-of-truth boundaries between durable canvas state and AgentChat turn authority
- the refined subject blueprint also closes the append-only v1 mutation policy for generated canvas artifacts
`);

CurrentReality.contractsRefinedAtBlueprint.means(`
- the refined subject blueprint now defines concrete v1 record and payload shapes for prompt nodes, variant nodes, comment thread projections, review snapshots, submit commands, and classified agent actions
- implementation still remains pending, but the blueprint no longer leaves those contracts at a purely descriptive level
`);

CurrentReality.missingImplementation.means(`
- no packages/ui-design-canvas-ui or corresponding server package exists yet
- no dashboard feature registry entry currently exposes a UI Design Canvas tab
- no persisted canvas, overlay, snapshot, or prompt lifecycle model exists in source today
`);

CurrentReality.sectionedSubjectBlueprint.means(`
- the canonical subject blueprint now exists as a single sectioned file with Concept, Scenarios, ImplementationPlan, and Contracts
- future implementation work should update this state file alongside the feature and any resulting blueprint refinements
`);

when(CurrentReality.plannedFeature.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.status))
  .and(UiDesignCanvasBlueprintState.treats("UI Design Canvas as blueprint-defined but not yet implemented"));

when(CurrentReality.canonicalStackFit.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("React Flow reuse as already justified by repository guidance"));

when(CurrentReality.authorityClosedAtBlueprint.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("source-of-truth boundaries as now closed at the blueprint layer"));

when(CurrentReality.contractsRefinedAtBlueprint.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("v1 action and persistence contracts as materially tighter than the initial draft"));

when(CurrentReality.missingImplementation.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.gap, Assessment.issue))
  .and(UiDesignCanvasBlueprintState.treats("feature delivery as pending package and dashboard integration work"));

when(CurrentReality.sectionedSubjectBlueprint.exists())
  .then(UiDesignCanvasBlueprintState.records(Assessment.evidence))
  .and(UiDesignCanvasBlueprintState.treats("canonical sectioned blueprint structure as established"));
