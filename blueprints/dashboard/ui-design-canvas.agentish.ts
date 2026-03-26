/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const UiDesignCanvas = define.system("UiDesignCanvas", {
  format: Agentish,
  role: "Dashboard feature for spatial human and agent UI design direction, variant review, and markup-driven feedback",
});

const SectionMap = define.document("SectionMap");

const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const User = define.actor("DesignOperator", {
  role: "Human operator directing high-level UI design exploration on the canvas",
});

const Agent = define.actor("DesignAgent", {
  role: "Background agent that interprets prompts, review markup, and visible variant context",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("UiDesignCanvasPlugin"),
  route: define.entity("UiDesignCanvasRoute"),
  screen: define.entity("UiDesignCanvasScreen"),
  status: define.entity("UiDesignCanvasStatusItems"),
};

const Canvas = {
  workspace: define.workspace("DesignCanvasWorkspace"),
  plane: define.concept("SharedCanvasPlane"),
  viewport: define.entity("VisibleCanvasViewport"),
  mode: define.entity("CanvasInteractionMode"),
  selectionMode: define.entity("SelectMode"),
  promptMode: define.entity("PromptMode"),
  drawMode: define.entity("DrawMode"),
  overlay: define.entity("ReviewMarkupOverlay"),
  snapshot: define.document("ViewportReviewSnapshot"),
  intent: define.concept("SpatialPromptCanvas"),
};

const Variant = {
  board: define.workspace("VariantBoard"),
  node: define.graphNode("DesignVariantNode"),
  cluster: define.graphLayer("VariantCluster"),
  preview: define.document("VariantPreviewArtifact"),
  rationale: define.entity("VariantRationale"),
  status: define.entity("VariantStatus"),
  derivation: define.graphEdge("VariantDerivationEdge"),
};

const Prompt = {
  draftNode: define.graphNode("DraftPromptNode"),
  node: define.graphNode("PromptNode"),
  thread: define.graphNode("CommentThreadNode"),
  response: define.graphNode("AgentResponseNode"),
  relation: define.graphEdge("PromptRelationEdge"),
  state: define.entity("PromptLifecycleState"),
};

const Review = {
  annotation: define.entity("FreehandAnnotationStroke"),
  event: define.entity("CanvasReviewEvent"),
  screenshotContext: define.entity("VisibleReviewContext"),
  feedback: define.entity("ReviewFeedback"),
  bundle: define.document("ReviewInputBundle"),
};

const Interaction = {
  submit: define.entity("SubmitPromptAction"),
  classify: define.entity("AgentIntentClassification"),
  commentAction: define.entity("CommentOnPromptAction"),
  generateVariantAction: define.entity("GenerateVariantAction"),
  reviseVariantAction: define.entity("ReviseVariantAction"),
  summarizeAction: define.entity("SummarizeVariantsAction"),
  recommendAction: define.entity("RecommendVariantAction"),
  attachMarkupAction: define.entity("ApplyMarkupFeedbackAction"),
  branchPolicy: define.concept("BranchFirstVariantPolicy"),
  appendOnlyCanvas: define.concept("AppendOnlyCanvasMutationPolicy"),
};

const Scope = {
  highLevelOnly: define.concept("HighLevelDesignDirection"),
  nonGranular: define.concept("NoLowLevelUiBuilder"),
  immutablePromptAnchor: define.concept("ImmutablePromptAnchor"),
  reviewMarkupInput: define.concept("ReviewMarkupAsInterpretiveInput"),
  semanticCanvas: define.concept("SemanticCanvasState"),
  viewportBoundAgentContext: define.concept("ViewportBoundAgentContext"),
  canvasAuthority: define.concept("CanvasAsCanonicalSpatialAuthority"),
  chatAuthority: define.concept("AgentChatAsCanonicalTurnAuthority"),
  projectionBoundary: define.concept("ChatToCanvasProjectionBoundary"),
  persistedCanvasState: define.concept("DurableCanvasWorkspaceState"),
  ephemeralUiState: define.concept("EphemeralBrowserUiState"),
};

const Package = {
  featureUi: define.package("UiDesignCanvasUiPackage"),
  featureServer: define.package("UiDesignCanvasServerPackage"),
  dashboardUi: define.package("DashboardUiPackage"),
  dashboardServer: define.package("DashboardGatewayPackage"),
  agentChat: define.package("AgentChatPackage"),
  agentGraphUi: define.package("AgentGraphUiPackage"),
};

UiDesignCanvas.contains(
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

UiDesignCanvas.enforces(`
- The feature is a high-level UI design direction surface, not a granular component builder.
- Design work happens as spatial prompts, variant boards, review comments, and markup-driven critique.
- React Flow remains the canonical semantic canvas surface for node and relationship interaction.
- Freehand drawing is an overlay review layer above the graph, not the authoritative design model.
- The original user prompt remains a first-class anchor after submission rather than mutating into a different concept.
- Agent output must remain legible on the canvas by attaching comments, responses, or derived variant clusters back to their originating prompt.
- If agent intent is ambiguous, the agent should comment or ask for clarification before generating a new variant.
- Variant generation should branch by default rather than destructively mutating the active accepted direction.
- Agent context should be bounded to the visible viewport, active selection, nearby prompt history, and current markup snapshot rather than the entire workspace by default.
- Dashboard session auth remains gateway-owned; the feature must not introduce its own browser auth model.
- The canvas owns canonical spatial artifacts such as prompt anchors, variants, clusters, node positions, overlay strokes, and review snapshots.
- AgentChat owns canonical agent-turn execution history, provider activity, and transcript semantics for background agent work initiated by the feature.
- Canvas comment or response nodes are projections from canonical agent turns rather than a second independent conversation history.
- V1 canvas mutation should be append-only for prompt, comment, and variant creation except for explicit status updates and operator-authored repositioning.
`);

UiDesignCanvas.defines(`
- SpatialPromptCanvas means the design canvas is simultaneously a review surface and a conversational prompt surface.
- DesignVariantNode means one coarse design direction such as a screen concept, flow direction, or alternative composition rather than a low-level UI element.
- VariantCluster means the grouped set of artifacts and notes produced for one design direction.
- VariantPreviewArtifact means a thumbnail, mock screenshot, or other preview representation attached to a variant.
- DraftPromptNode means the transient text node created by direct canvas intent entry before submission.
- PromptNode means the committed user-authored prompt anchored at a specific canvas position.
- CommentThreadNode means the visible conversational thread attached to a prompt or variant.
- AgentResponseNode means a compact agent-authored explanation, rationale, or generation summary anchored on the canvas.
- ViewportReviewSnapshot means the image and semantic context bundle the feature sends to the agent for one review event.
- ReviewMarkupOverlay means the top-most freehand critique layer drawn over the current viewport.
- VisibleReviewContext means the specific selected nodes, visible variants, viewport bounds, and markup that the agent sees for one interaction.
- HighLevelDesignDirection means composition, hierarchy, tone, and concept decisions remain in scope while pixel-level builder concerns remain out of scope.
- NoLowLevelUiBuilder means the feature should not model every nested DOM or component detail as individual edit nodes.
- ImmutablePromptAnchor means a submitted prompt stays durable even when later comments, variants, or recommendations are attached to it.
- ReviewMarkupAsInterpretiveInput means freehand strokes are evidence for the agent to read, not semantic canvas objects that become the main source of truth.
- SemanticCanvasState means node identity, variant relationships, review history, and prompt lifecycle remain structured app state independent of the freehand overlay.
- ViewportBoundAgentContext means each background agent turn begins from what the operator is currently showing and discussing rather than from the full universe of possible context.
- CanvasAsCanonicalSpatialAuthority means the feature's persisted canvas model is the source of truth for spatial prompt anchors, variant cards, derivation links, overlay annotations, and review snapshots.
- AgentChatAsCanonicalTurnAuthority means background agent execution, tool activity, transcript turns, and provider-owned state remain canonical in AgentChat rather than being reimplemented in the canvas feature.
- ChatToCanvasProjectionBoundary means the canvas projects selected agent outputs into visible nodes and comments while retaining references back to the originating canonical chat turn.
- DurableCanvasWorkspaceState means prompt nodes, variant nodes, variant clusters, node positions, status labels, committed overlay strokes, review snapshots, and chat-turn references persist as workspace feature state.
- EphemeralBrowserUiState means draft prompt text, transient hover state, in-progress strokes, temporary selection affordances, and unsent markup stay browser-local until explicitly committed.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Dashboard.status);
Dashboard.screen.contains(Canvas.workspace, Variant.board, Canvas.overlay);
Canvas.workspace.contains(
  Canvas.plane,
  Canvas.viewport,
  Canvas.mode,
  Canvas.selectionMode,
  Canvas.promptMode,
  Canvas.drawMode,
  Canvas.snapshot,
  Prompt.draftNode,
  Prompt.node,
  Prompt.thread,
  Prompt.response,
  Prompt.relation,
  Variant.node,
  Variant.cluster,
  Variant.preview,
  Variant.rationale,
  Variant.status,
  Variant.derivation,
  Review.annotation,
  Review.event,
  Review.feedback,
  Review.screenshotContext,
  Review.bundle,
);
Canvas.workspace.contains(
  Scope.highLevelOnly,
  Scope.nonGranular,
  Scope.immutablePromptAnchor,
  Scope.reviewMarkupInput,
  Scope.semanticCanvas,
  Scope.viewportBoundAgentContext,
  Scope.canvasAuthority,
  Scope.chatAuthority,
  Scope.projectionBoundary,
  Scope.persistedCanvasState,
  Scope.ephemeralUiState,
  Interaction.branchPolicy,
  Interaction.appendOnlyCanvas,
);

when(User.doubleClicks(Canvas.plane))
  .then(UiDesignCanvas.creates(Prompt.draftNode))
  .and(User.starts("direct text entry at the clicked location"));

when(User.submits(Prompt.draftNode))
  .then(UiDesignCanvas.commits(Prompt.node))
  .and(UiDesignCanvas.removes(Prompt.draftNode))
  .and(UiDesignCanvas.creates(Review.event))
  .and(UiDesignCanvas.captures(Canvas.snapshot))
  .and(UiDesignCanvas.creates(Review.bundle))
  .and(Agent.receives(Review.screenshotContext));

when(User.presses("Enter"))
  .then(UiDesignCanvas.applies(Interaction.submit).to(Prompt.draftNode))
  .and(UiDesignCanvas.treats("Shift+Enter as newline rather than submit"));

when(Agent.receives(Review.screenshotContext))
  .then(Agent.classifies(Interaction.classify))
  .and(Agent.considers(Scope.viewportBoundAgentContext))
  .and(Agent.considers(Scope.reviewMarkupInput));

when(Agent.classifies(Interaction.commentAction))
  .then(UiDesignCanvas.creates(Prompt.thread))
  .and(UiDesignCanvas.links(Prompt.thread).to(Prompt.node).through(Prompt.relation))
  .and(UiDesignCanvas.references("the originating AgentChat turn from the projected canvas thread"))
  .and(UiDesignCanvas.preserves(Scope.immutablePromptAnchor));

when(Agent.classifies(Interaction.generateVariantAction))
  .then(UiDesignCanvas.creates(Variant.cluster))
  .and(UiDesignCanvas.creates(Variant.node))
  .and(UiDesignCanvas.links(Variant.cluster).to(Prompt.node).through(Prompt.relation))
  .and(UiDesignCanvas.references("the originating AgentChat turn from the generated variant cluster"))
  .and(UiDesignCanvas.attaches(Variant.preview, Variant.rationale, Variant.status).to(Variant.node));

when(User.drawsOn(Canvas.overlay))
  .then(UiDesignCanvas.records(Review.annotation))
  .and(UiDesignCanvas.treats(Canvas.overlay).as(Scope.reviewMarkupInput))
  .and(UiDesignCanvas.avoids("promoting freehand strokes into authoritative semantic layout state"));

when(User.submits("markup-backed feedback"))
  .then(UiDesignCanvas.captures(Canvas.snapshot))
  .and(UiDesignCanvas.creates(Review.bundle))
  .and(Canvas.snapshot.includes(Canvas.viewport, Review.annotation, Prompt.node, Variant.node))
  .and(Agent.receives(Review.screenshotContext));

when(User.selects(Variant.node))
  .then(UiDesignCanvas.reveals(Variant.preview, Variant.rationale, Variant.status))
  .and(User.mayRequest(Interaction.reviseVariantAction, Interaction.summarizeAction, Interaction.recommendAction));

when(Agent.applies(Interaction.reviseVariantAction))
  .then(UiDesignCanvas.prefers(Interaction.branchPolicy))
  .and(UiDesignCanvas.creates(Variant.derivation))
  .and(UiDesignCanvas.preserves(Interaction.appendOnlyCanvas))
  .and(UiDesignCanvas.avoids("silent in-place destruction of the prior accepted variant"));

when(User.switches(Canvas.mode))
  .then(UiDesignCanvas.distinguishes(Canvas.selectionMode, Canvas.promptMode, Canvas.drawMode))
  .and(UiDesignCanvas.mustPrevent("draw-select-pan ambiguity"));

Package.featureUi.dependsOn(Package.dashboardUi, Package.agentGraphUi, Package.agentChat);
Package.featureServer.dependsOn(Package.dashboardServer, Package.agentChat);

UiDesignCanvas.implementsThrough(`
- A dedicated dashboard feature package should own the UI Design Canvas plugin definition, screen composition, and canvas interaction state.
- The feature UI should reuse the repository React Flow surface and established custom node-renderer patterns rather than introducing a second graph framework.
- The feature should reuse AgentChat as the canonical background conversation and transcript surface rather than inventing a hidden one-off chat system.
- The feature backend should store durable canvas workspace state and review artifacts while persisting references to originating AgentChat sessions and turns instead of duplicating transcript history.
- The dashboard shell should continue to lazy-load the feature screen through the existing first-party plugin registry.
- The gateway should proxy any feature backend traffic through the existing dashboard session model.
- The feature should separate semantic canvas state from review-overlay raster or stroke data so prompts, variants, and review snapshots remain inspectable and durable.
`);

UiDesignCanvas.definesUiComponents(`
- UiDesignCanvasScreen composes the overall dashboard feature shell.
- DesignCanvasPlane owns the React Flow workspace and prompt or variant node rendering.
- ReviewMarkupLayer owns freehand overlay drawing above the canvas plane.
- VariantInspector owns preview, rationale, recommendation, and selection detail for the active variant.
- PromptComposer owns draft-node entry, submit behavior, and pending-agent visual state.
- ReviewTimeline owns visible prompt, comment, and generation history for the active canvas context.
`);

UiDesignCanvas.definesStoreSlices(`
- canvas slice for viewport, node positions, selection, and interaction mode
- prompt slice for draft, submitted, pending, commented, and resolved prompt lifecycle state
- variant slice for variant cards, preview artifacts, derivation links, and review status
- markup slice for active overlay strokes and committed review snapshots
- agent slice for current background run, visible status, last classified action, and AgentChat turn references
`);

UiDesignCanvas.definesStoreActions(`
- createDraftPromptAtPosition
- updateDraftPromptText
- submitDraftPrompt
- switchCanvasMode
- beginMarkupStroke
- appendMarkupStrokePoint
- commitMarkupStroke
- clearActiveMarkupOverlay
- captureViewportReviewSnapshot
- createCommentThreadForPrompt
- createDerivedVariantCluster
- reviseVariantByBranch
- summarizeVariantDifferences
- recommendPreferredVariant
- projectAgentChatTurnToCanvas
- updatePromptLifecycleState
- updateVariantStatus
`);

UiDesignCanvas.definesContracts(`
- Canvas interaction modes are `select`, `prompt`, and `draw`.
- Prompt lifecycle states are `draft`, `pending`, `commented`, `generated`, `resolved`, and `failed`.
- Variant status values are `idea`, `refined`, `candidate`, `approved`, and `rejected`.
- Agent action kinds are `comment`, `generate_variant`, `revise_variant`, `summarize_variants`, `recommend_variant`, and `apply_markup_feedback`.
- Durable canvas workspace state includes prompt nodes, variant nodes, variant clusters, committed overlay strokes, committed review snapshots, node positions, status values, and references to originating AgentChat sessions and turns.
- Ephemeral browser UI state includes draft prompt text, in-progress overlay strokes, hover or focus affordances, and transient selection chrome that has not yet been committed into workspace state.
- A prompt node record includes `promptId`, `canvasId`, `text`, `position`, `createdAt`, `createdBy`, `lifecycleState`, `originatingSnapshotId | null`, and `agentChatSessionId | null`.
- A variant node record includes `variantId`, `clusterId`, `title`, `summary`, `status`, `position`, `previewArtifactIds[]`, `derivedFromVariantId | null`, `originatingPromptId | null`, and `originatingAgentTurnId | null`.
- A comment thread projection record includes `threadNodeId`, `anchorPromptId | null`, `anchorVariantId | null`, `agentChatSessionId`, `agentChatTurnIds[]`, and `latestSummary`.
- A committed review snapshot payload includes `snapshotId`, `canvasId`, `viewportBounds`, `selectedNodeIds[]`, `visiblePromptIds[]`, `visibleVariantIds[]`, `overlayStrokeIds[]`, `renderedCanvasImageArtifact`, and `createdAt`.
- A review input bundle sent to background agent work includes the committed review snapshot plus nearby prompt summaries, nearby variant summaries, active selection, and the triggering operator instruction when one exists.
- A submit-prompt command payload includes `canvasId`, `draftPromptId`, `text`, `position`, `selectionNodeIds[]`, and `commitOverlayStrokeIds[]`.
- An agent action classification payload includes `actionKind`, `targetPromptId | null`, `targetVariantId | null`, `targetSnapshotId`, `confidence`, and `reasonSummary`.
- A generate-variant result payload includes `sourcePromptId`, `newClusterId`, `newVariantIds[]`, `previewArtifactRefs[]`, `summary`, and `originatingAgentTurnId`.
- A comment projection result payload includes `sourcePromptId | null`, `sourceVariantId | null`, `threadNodeId`, `agentChatSessionId`, `agentChatTurnId`, and `summary`.
- V1 canvas mutation policy is append-only for prompt, comment, thread, cluster, variant, and snapshot creation, while status changes and operator-directed movement remain allowed updates.
`);
