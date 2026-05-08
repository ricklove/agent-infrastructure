/// <reference path="../_agentish.d.ts" />

// Facebook Content Dashboard

const Agentish = define.language("Agentish");

const FacebookContentDashboard = define.system("FacebookContentDashboard", {
  format: Agentish,
  role: "Dashboard feature for discovering proven Facebook content patterns, generating derivative drafts, reviewing them, and scheduling approved posts",
});

const User = define.actor("PageOperator", {
  role: "Operator who turns high-performing Facebook inspiration into approved scheduled posts",
});

const Dashboard = {
  shell: define.system("DashboardShell"),
  gateway: define.system("DashboardGateway"),
  plugin: define.entity("FacebookContentDashboardPlugin"),
  route: define.entity("FacebookContentRoute"),
  screen: define.entity("FacebookContentScreen"),
};

const Feature = {
  backend: define.system("FacebookContentBackend"),
  snapshot: define.entity("ContentDashboardSnapshot"),
  importedSummary: define.entity("ImportedBrightDataSummary"),
  mode: define.entity("ContentDashboardMode"),
};

const Workflow = {
  discover: define.entity("DiscoverStep"),
  create: define.entity("CreateStep"),
  review: define.entity("ReviewStep"),
  schedule: define.entity("ScheduleStep"),
  learn: define.entity("LearnStep"),
  editorialCopilot: define.concept("EditorialCopilot"),
  humanApproval: define.concept("HumanApprovalBeforeScheduling"),
};

const Content = {
  sourcePost: define.entity("SourcePost"),
  sourcePattern: define.entity("SourcePattern"),
  sourceLineage: define.entity("SourceLineage"),
  draft: define.entity("DraftVariant"),
  originality: define.entity("OriginalitySignal"),
  tone: define.entity("ToneSignal"),
  risk: define.entity("RiskSignal"),
  scheduledPost: define.entity("ScheduledPost"),
  learningSignal: define.entity("LearningSignal"),
};

const Ui = {
  inspirationRail: define.entity("InspirationRail"),
  sourceAnalysis: define.entity("SourceAnalysisPanel"),
  draftStudio: define.entity("DraftStudioPanel"),
  reviewGate: define.entity("ReviewGatePanel"),
  publishingRail: define.entity("PublishingRail"),
  queue: define.entity("PublishingQueue"),
  learningLoop: define.entity("LearningLoopPanel"),
};

const Research = {
  brightData: define.entity("BrightDataImport"),
  metaPublishApi: define.entity("MetaPagePublishApi"),
};

const Evaluation = {
  uxStory: define.entity("UxStory"),
  uxLoop: define.concept("PurposeOnlySubagentUxLoop"),
  liveTunnel: define.entity("WorkerDashboardTunnel"),
};

FacebookContentDashboard.enforces(`
- This feature must feel like an editorial copilot, not an AI autoposter.
- The primary user flow is Discover -> Create -> Review -> Schedule -> Learn.
- Every generated draft must preserve source lineage back to the source post or imported pattern.
- Every draft must expose originality, tone, and risk signals before it can be scheduled.
- Human approval is required before scheduling; generation alone must never imply publish readiness.
- The dashboard should optimize for moving from inspiration to a scheduled post quickly, not for maximizing the number of raw analytics widgets.
- The feature should support imported Facebook summary data and must make its data mode explicit rather than pretending sample data is live data.
- The plugin must remain dashboard-session-auth compatible and use shared dashboard auth behavior instead of inventing per-feature browser auth.
- UX evaluation should use purpose-only user stories and must not leak current UI structure to the evaluator.
`);

FacebookContentDashboard.defines(`
- EditorialCopilot means the system helps an operator reason from a successful source pattern to a safe, original derivative and then to a scheduled post.
- ContentDashboardSnapshot means the feature-owned backend payload that drives the dashboard screen state.
- ImportedBrightDataSummary means a previously generated summary artifact derived from Bright Data exports rather than a live scrape at render time.
- HumanApprovalBeforeScheduling means the workflow enforces a review boundary between draft generation and queue placement.
- PurposeOnlySubagentUxLoop means a subagent receives only a user-purpose story and a live app URL, attempts the task, and reports friction without being primed with UI details.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Feature.backend);
Feature.backend.contains(Feature.snapshot, Feature.importedSummary, Feature.mode);
Dashboard.screen.contains(
  Ui.inspirationRail,
  Ui.sourceAnalysis,
  Ui.draftStudio,
  Ui.reviewGate,
  Ui.publishingRail,
  Ui.queue,
  Ui.learningLoop,
);
Feature.snapshot.contains(
  Workflow.discover,
  Workflow.create,
  Workflow.review,
  Workflow.schedule,
  Workflow.learn,
  Content.sourcePost,
  Content.draft,
  Content.scheduledPost,
  Content.learningSignal,
);
Content.sourcePost.contains(
  Content.sourcePattern,
  Content.sourceLineage,
  Content.originality,
  Content.tone,
  Content.risk,
);
Content.draft.contains(
  Content.sourceLineage,
  Content.originality,
  Content.tone,
  Content.risk,
);
Dashboard.screen.contains(Evaluation.uxStory, Evaluation.liveTunnel);
Dashboard.screen.contains(Research.brightData, Research.metaPublishApi);

when(User.uses(Dashboard.screen))
  .then(User.movesThrough(Workflow.discover))
  .and(User.movesThrough(Workflow.create))
  .and(User.movesThrough(Workflow.review))
  .and(User.movesThrough(Workflow.schedule))
  .and(User.movesThrough(Workflow.learn));

when(Ui.inspirationRail.renders(Content.sourcePost))
  .then(Ui.inspirationRail.optimizesFor("fast discovery of reusable winners"))
  .and(Ui.sourceAnalysis.explains("why the source post worked"))
  .and(Ui.draftStudio.derives("several draft variants from one selected source"));

when(Ui.reviewGate.checks(Content.draft))
  .then(Ui.reviewGate.requires(Content.originality))
  .and(Ui.reviewGate.requires(Content.tone))
  .and(Ui.reviewGate.requires(Content.risk))
  .and(Ui.reviewGate.applies(Workflow.humanApproval));

when(Ui.publishingRail.queues(Content.scheduledPost))
  .then(Ui.queue.exposes("needs review, approved, scheduled"))
  .and(Ui.learningLoop.updates(Content.learningSignal));

Evaluation.uxLoop.means(`
- choose one purpose-only user story
- give a subagent only the live URL and that story
- do not disclose UI structure, implementation details, or intended click path
- collect friction as user-task feedback, not design-theory feedback
- revise the UX based on that feedback and rerun the loop
`);

Evaluation.uxStory.examples(`
- Discover Winning Posts
- Understand Why A Post Worked
- Turn A Winning Post Into Draft Ideas
- Compare Draft Variants Quickly
- Check Originality Before Reuse
- Review Tone And Safety
- Approve A Draft For Publishing
- Schedule A Post To The Right Page
- Manage The Publishing Queue
- Revisit Past Winners
- Learn From Published Results
- Move From Inspiration To Scheduled Post Fast
`);

FacebookContentDashboard.prescribes(`
- The first backend seam is a snapshot contract, not a large mutable workflow API.
- Imported Bright Data summary artifacts should map into the same source-post model used by the UI.
- The screen should make sample-vs-imported data obvious in the header and connection state.
- The feature should converge toward real editorial actions: promote source -> create draft -> review -> schedule.
- UX work for this feature should be evaluated against user-purpose completion, not aesthetics alone.
`);
