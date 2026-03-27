/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const UiDesignCanvas = define.system("UiDesignCanvas", {
  format: Agentish,
  role: "Dashboard feature for high-level UI design direction, spatial prompting, variant review, and markup-driven critique",
});

const SectionMap = define.document("SectionMap");

const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const User = define.actor("DesignOperator", {
  role: "Human operator directing high-level UI design exploration on the board",
});

const Agent = define.actor("DesignAgent", {
  role: "Background agent that interprets prompts, review markup, and visible board context",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("UiDesignCanvasPlugin"),
  route: define.entity("UiDesignCanvasRoute"),
  screen: define.entity("UiDesignCanvasScreen"),
  status: define.entity("UiDesignCanvasStatusItems"),
};

const Board = {
  workspace: define.workspace("DesignBoardWorkspace"),
  canvas: define.concept("SpatialPromptCanvas"),
  viewport: define.entity("VisibleBoardViewport"),
  markup: define.entity("ReviewMarkupOverlay"),
  snapshot: define.document("ViewportReviewSnapshot"),
  persistedState: define.concept("DurableBoardState"),
  ephemeralState: define.concept("EphemeralBrowserState"),
};

const Prompt = {
  draft: define.graphNode("DraftPromptNode"),
  anchor: define.graphNode("PromptAnchorNode"),
  thread: define.graphNode("ProjectedCommentThreadNode"),
  state: define.entity("PromptLifecycleState"),
  relation: define.graphEdge("PromptRelationEdge"),
};

const Variant = {
  node: define.graphNode("DesignVariantNode"),
  cluster: define.graphLayer("VariantCluster"),
  preview: define.document("VariantPreviewArtifact"),
  derivation: define.graphEdge("VariantDerivationEdge"),
  status: define.entity("VariantStatus"),
};

const Review = {
  event: define.entity("CanvasReviewEvent"),
  bundle: define.document("ReviewInputBundle"),
  context: define.entity("VisibleReviewContext"),
};

const Authority = {
  canvas: define.concept("CanvasOwnsCanonicalSpatialState"),
  agentChat: define.concept("AgentChatOwnsCanonicalTurnHistory"),
  projection: define.concept("AgentTurnProjectionBoundary"),
};

const Policy = {
  highLevelOnly: define.concept("HighLevelDesignDirectionOnly"),
  noBuilder: define.concept("NoLowLevelUiBuilder"),
  immutablePrompt: define.concept("ImmutablePromptAnchor"),
  markupAsInput: define.concept("MarkupAsInterpretiveInput"),
  appendOnly: define.concept("AppendOnlyCanvasMutation"),
  branchFirst: define.concept("BranchFirstVariantGeneration"),
  visibleContext: define.concept("ViewportBoundAgentContext"),
};

const Action = {
  submitPrompt: define.entity("SubmitPromptAction"),
  classifyIntent: define.entity("AgentIntentClassification"),
  comment: define.entity("CommentOnPromptAction"),
  generateVariant: define.entity("GenerateVariantAction"),
  reviseVariant: define.entity("ReviseVariantAction"),
  summarizeVariants: define.entity("SummarizeVariantsAction"),
  recommendVariant: define.entity("RecommendVariantAction"),
  projectTurn: define.entity("ProjectAgentTurnAction"),
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

// Concept

UiDesignCanvas.enforces(`
- The feature is a high-level UI design direction surface, not a granular UI builder.
- The board exists to let humans and agents discuss design direction in place through prompts, variants, and review markup.
- The primary authoring gesture is immediate prompt entry on the canvas rather than a separate form or chat-first workflow.
- Freehand markup is review evidence, not the authoritative design model.
- Submitted prompts remain durable anchors even when later comments, variants, or recommendations attach to them.
- Agent output must stay legible on the board by projecting comments or variants back to the originating prompt.
- Variant generation should branch by default rather than destructively replacing the prior accepted direction.
- Agent context should begin from the visible viewport, visible markup, active selection, and nearby prompt history rather than the entire workspace by default.
- The board owns canonical spatial state while AgentChat owns canonical background turn history.
- Projected board comments and variant outcomes must retain references to the canonical originating AgentChat turn.
`);

UiDesignCanvas.defines(`
- SpatialPromptCanvas means the board is simultaneously a design review surface and a conversational prompt surface.
- DraftPromptNode means the transient text node created directly on the canvas before submission.
- PromptAnchorNode means the committed user-authored prompt anchored at a specific board position.
- ProjectedCommentThreadNode means the visible board-side projection of a canonical AgentChat turn or thread outcome.
- DesignVariantNode means one coarse design direction such as a screen concept, flow direction, or alternative composition rather than a low-level component part.
- VariantCluster means the grouped board artifacts produced for one design direction or branch.
- ViewportReviewSnapshot means the image and semantic context bundle the feature sends to the agent for one review event.
- ReviewInputBundle means the combined prompt text, viewport bounds, visible selection, markup, and board references that define one agent turn.
- CanvasOwnsCanonicalSpatialState means prompt anchors, variant nodes, variant positions, derivation links, markup submissions, and review snapshots are canonical board records.
- AgentChatOwnsCanonicalTurnHistory means background agent execution, tool activity, provider state, and transcript ordering remain canonical in AgentChat.
- AgentTurnProjectionBoundary means the board surfaces selected chat outcomes as spatial artifacts without becoming a second independent chat authority.
- HighLevelDesignDirectionOnly means composition, hierarchy, tone, information architecture, and concept remain in scope while low-level builder concerns remain out of scope.
- MarkupAsInterpretiveInput means strokes are feedback for interpretation rather than semantic layout entities that replace the board model.
`);

Board.workspace.contains(
  Board.canvas,
  Board.viewport,
  Board.markup,
  Board.snapshot,
  Prompt.draft,
  Prompt.anchor,
  Prompt.thread,
  Prompt.state,
  Prompt.relation,
  Variant.node,
  Variant.cluster,
  Variant.preview,
  Variant.derivation,
  Variant.status,
  Review.event,
  Review.bundle,
  Review.context,
  Authority.canvas,
  Authority.agentChat,
  Authority.projection,
  Policy.highLevelOnly,
  Policy.noBuilder,
  Policy.immutablePrompt,
  Policy.markupAsInput,
  Policy.appendOnly,
  Policy.branchFirst,
  Policy.visibleContext,
  Action.submitPrompt,
  Action.classifyIntent,
  Action.comment,
  Action.generateVariant,
  Action.reviseVariant,
  Action.summarizeVariants,
  Action.recommendVariant,
  Action.projectTurn,
);

// Scenarios

when(User.doubleClicks(Board.canvas))
  .then(UiDesignCanvas.creates(Prompt.draft))
  .and(User.starts("inline text entry at the clicked location"));

when(User.submits(Prompt.draft))
  .then(UiDesignCanvas.commits(Prompt.anchor))
  .and(UiDesignCanvas.captures(Board.snapshot))
  .and(UiDesignCanvas.creates(Review.event, Review.bundle))
  .and(Agent.receives(Review.context));

when(Agent.receives(Review.context))
  .then(Agent.classifies(Action.classifyIntent))
  .and(Agent.considers(Policy.visibleContext))
  .and(Agent.considers(Policy.markupAsInput));

when(Agent.classifies(Action.comment))
  .then(UiDesignCanvas.creates(Prompt.thread))
  .and(UiDesignCanvas.links(Prompt.thread).to(Prompt.anchor).through(Prompt.relation))
  .and(UiDesignCanvas.preserves(Policy.immutablePrompt))
  .and(UiDesignCanvas.references(Authority.agentChat));

when(Agent.classifies(Action.generateVariant))
  .then(UiDesignCanvas.creates(Variant.cluster, Variant.node))
  .and(UiDesignCanvas.links(Variant.cluster).to(Prompt.anchor).through(Prompt.relation))
  .and(UiDesignCanvas.preserves(Policy.branchFirst))
  .and(UiDesignCanvas.references(Authority.agentChat));

when(User.submits("markup-backed feedback"))
  .then(UiDesignCanvas.captures(Board.snapshot))
  .and(UiDesignCanvas.creates(Review.bundle))
  .and(Board.snapshot.includes(Board.viewport, Board.markup, Prompt.anchor, Variant.node))
  .and(Agent.receives(Review.context));

when(Agent.applies(Action.reviseVariant))
  .then(UiDesignCanvas.creates(Variant.derivation, Variant.cluster, Variant.node))
  .and(UiDesignCanvas.preserves(Policy.branchFirst))
  .and(UiDesignCanvas.preserves(Policy.appendOnly));

when(UiDesignCanvas.applies(Action.projectTurn))
  .then(UiDesignCanvas.projects("comment or generation outcome onto the board"))
  .and(UiDesignCanvas.retains("a reference to the canonical AgentChat turn"))
  .and(UiDesignCanvas.avoids("creating a second independent conversation history"));

when(User.reopens(Board.workspace))
  .then(UiDesignCanvas.restores(Prompt.anchor, Variant.node, Variant.derivation, Board.snapshot))
  .and(UiDesignCanvas.restores("references to projected AgentChat outcomes"))
  .and(User.recovers("the last accepted visible design direction"));

// ImplementationPlan

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Dashboard.status);
Dashboard.screen.contains(Board.workspace);

Package.featureUi.dependsOn(Package.dashboardUi, Package.agentGraphUi, Package.agentChat);
Package.featureServer.dependsOn(Package.dashboardServer, Package.agentChat);

UiDesignCanvas.implementsThrough(`
- A dedicated dashboard feature package owns the UI Design Canvas plugin definition, screen composition, and board interaction state.
- The feature reuses React Flow as the canonical semantic canvas surface and the repository's existing custom graph-node patterns.
- The main route should be canvas-first, with utility surfaces such as tools, review feed, and inspector presented as movable floating panels above the board rather than as permanent sidebars.
- Freehand markup should render in board coordinates so it scales and pans with the visible canvas rather than acting as a separate screen-space overlay.
- Double-click zoom behavior should not preempt prompt creation on empty canvas space.
- The feature should reuse AgentChat as the canonical background conversation and transcript surface rather than inventing a hidden one-off chat system.
- The feature backend owns durable board state, snapshot storage, and references to AgentChat turns rather than duplicating transcript history.
- The dashboard shell continues to lazy-load the screen through the first-party plugin registry and the gateway continues to own browser session auth.
`);

UiDesignCanvas.definesUiComponents(`
- UiDesignCanvasScreen composes the route and board shell.
- DesignBoardCanvas owns the React Flow surface and prompt or variant node rendering.
- BoardMarkupLayer owns freehand review strokes in board coordinates.
- FloatingToolPalette owns draw controls and global board actions.
- FloatingReviewFeed owns visible projected prompt and agent activity for the active board context.
- FloatingInspector owns selection detail, variant rationale, and recommendation state for the active focus.
`);

UiDesignCanvas.definesStoreSlices(`
- board slice for viewport, node positions, selection, and floating panel placement
- prompt slice for draft, committed, pending, and resolved prompt lifecycle state
- variant slice for variant cards, preview artifacts, derivation links, and review status
- markup slice for in-progress strokes and committed review submissions
- agent slice for current background run, visible status, and AgentChat turn references
`);

UiDesignCanvas.definesStoreActions(`
- createDraftPromptAtPosition
- updateDraftPromptText
- submitDraftPrompt
- beginMarkupStroke
- appendMarkupStrokePoint
- commitMarkupStroke
- clearMarkupOverlay
- captureViewportReviewSnapshot
- createProjectedCommentThread
- createDerivedVariantCluster
- projectAgentChatTurnToBoard
`);

// Contracts

UiDesignCanvas.definesRecords(`
- DraftPromptRecord
  - id
  - boardPosition
  - draftText
- PromptAnchorRecord
  - id
  - boardPosition
  - promptText
  - lifecycleState
  - createdAtMs
- DesignVariantRecord
  - id
  - clusterId
  - boardPosition
  - title
  - summary
  - status
  - sourcePromptId
  - sourceTurnId
- ReviewSnapshotRecord
  - id
  - viewportBounds
  - selectedNodeIds
  - visibleNodeIds
  - markupStrokeIds
  - imageArtifactId
  - createdAtMs
- ProjectedThreadRecord
  - id
  - sourcePromptId
  - sourceTurnId
  - projectedKind
  - boardPosition
`);

UiDesignCanvas.definesCommands(`
- SubmitPromptCommand
  - draftPromptId
- SubmitMarkupReviewCommand
  - snapshotId
  - optionalPromptId
- ReviseVariantCommand
  - sourceVariantId
  - optionalPromptId
`);

UiDesignCanvas.definesAgentResults(`
- AgentIntentResult
  - action
  - confidence
  - rationale
- CommentProjectionResult
  - sourceTurnId
  - sourcePromptId
  - threadTitle
  - threadBody
- VariantProjectionResult
  - sourceTurnId
  - sourcePromptId
  - clusterTitle
  - variantTitle
  - variantSummary
  - variantStatus
`);

UiDesignCanvas.definesStateBoundaries(`
- Durable board state includes prompt anchors, variant records, derivation links, committed review snapshots, committed markup submissions, and AgentChat turn references.
- Projected records include board comment threads and generation outcomes that point back to canonical AgentChat turns.
- Ephemeral browser state includes active textarea text, temporary selection affordances, in-progress markup strokes, drag state, and hover state.
- Gateway auth state and canonical transcript state remain outside the board feature.
`);
