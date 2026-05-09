/// <reference path="../_agentish.d.ts" />

// Facebook Content Dashboard

const Agentish = define.language("Agentish");

const FacebookContentDashboard = define.system("FacebookContentDashboard", {
  format: Agentish,
  role: "Dashboard feature for turning a destination Facebook page history and selected inspiration pages into new draft ideas",
});

const User = define.actor("PageOperator", {
  role: "Operator responsible for choosing a destination page, learning from proven content, and generating new drafts for that page",
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

const Content = {
  destinationPage: define.entity("DestinationPage"),
  destinationHistory: define.entity("DestinationHistory"),
  destinationWinner: define.entity("DestinationWinner"),
  inspirationPage: define.entity("InspirationPage"),
  inspirationWinner: define.entity("InspirationWinner"),
  selectedSource: define.entity("SelectedSourcePost"),
  sourcePost: define.entity("SourcePost"),
  sourcePattern: define.entity("SourcePattern"),
  sourceLineage: define.entity("SourceLineage"),
  draftIdea: define.entity("DraftIdea"),
  savedDraft: define.entity("SavedDraft"),
};

const Workflow = {
  connectDestination: define.entity("ConnectDestinationStep"),
  inspectOwnWinners: define.entity("InspectOwnWinnersStep"),
  addInspirationPages: define.entity("AddInspirationPagesStep"),
  compareSources: define.entity("CompareSourcesStep"),
  selectSource: define.entity("SelectSourceStep"),
  generateIdeas: define.entity("GenerateIdeasStep"),
  keepDraft: define.entity("KeepDraftStep"),
  destinationFirst: define.concept("DestinationFirstFlow"),
  ownHistoryFirst: define.concept("OwnHistoryFirstFlow"),
  optionalExternalInspiration: define.concept("OptionalExternalInspiration"),
};

const Ui = {
  destinationChooser: define.entity("DestinationChooser"),
  pageIdentity: define.entity("PageIdentitySurface"),
  ownWinnersSurface: define.entity("OwnWinnersSurface"),
  inspirationPagesSurface: define.entity("InspirationPagesSurface"),
  sourceComparisonSurface: define.entity("SourceComparisonSurface"),
  ideaWorkbench: define.entity("IdeaWorkbench"),
  draftIdeasSurface: define.entity("DraftIdeasSurface"),
};

const Research = {
  brightData: define.entity("BrightDataImport"),
  metaPublishApi: define.entity("MetaPagePublishApi"),
};

const Evaluation = {
  uxStory: define.entity("UxStory"),
  uxLoop: define.concept("PurposeOnlySubagentUxLoop"),
  screenshotArtifact: define.entity("UxScreenshotArtifact"),
  liveTunnel: define.entity("WorkerDashboardTunnel"),
};

FacebookContentDashboard.enforces(`
- This feature must start from the destination page, because destination context determines voice, fit, and what should be published.
- If the destination page has enough historical content, the first meaningful source material must be that page history and best past posts.
- Additional inspiration pages are optional and secondary to destination history.
- The first product slice is Connect destination -> Review own winners -> Optionally add inspiration pages -> Select one source -> Generate draft ideas -> Keep one draft.
- The first product slice must not bury the user in scheduling, review gates, analytics, or queue management before they have produced their first useful draft.
- Every generated draft idea must preserve source lineage back to the selected source post.
- The feature should support imported Facebook summary data and must make its data mode explicit rather than pretending sample data is live data.
- The plugin must remain dashboard-session-auth compatible and use shared dashboard auth behavior instead of inventing per-feature browser auth.
- UX evaluation should use purpose-only user stories and must not leak current UI structure to the evaluator.
`);

FacebookContentDashboard.defines(`
- DestinationFirstFlow means the user first identifies where they want to publish, and that destination drives the rest of the workflow.
- OwnHistoryFirstFlow means an established page should begin by learning from its own top-performing posts before reaching for outside sources.
- OptionalExternalInspiration means the operator may add other pages after destination selection to broaden the source pool when needed.
- ContentDashboardSnapshot means the feature-owned backend payload that drives the dashboard screen state.
- ImportedBrightDataSummary means a previously generated summary artifact derived from Bright Data exports rather than a live scrape at render time.
- PurposeOnlySubagentUxLoop means a subagent receives only a user-purpose story, a live app URL, and viewport instructions, attempts the task, captures screenshots, and reports friction without being primed with UI details.
`);

Dashboard.plugin.contains(Dashboard.route, Dashboard.screen, Feature.backend);
Feature.backend.contains(Feature.snapshot, Feature.importedSummary, Feature.mode);
Dashboard.screen.contains(
  Ui.destinationChooser,
  Ui.pageIdentity,
  Ui.ownWinnersSurface,
  Ui.inspirationPagesSurface,
  Ui.sourceComparisonSurface,
  Ui.ideaWorkbench,
  Ui.draftIdeasSurface,
);
Feature.snapshot.contains(
  Content.destinationPage,
  Content.destinationWinner,
  Content.inspirationPage,
  Content.inspirationWinner,
  Content.sourcePost,
  Content.draftIdea,
  Content.savedDraft,
);
Content.destinationPage.contains(Content.destinationHistory, Content.destinationWinner);
Content.sourcePost.contains(Content.sourcePattern, Content.sourceLineage);
Content.draftIdea.contains(Content.sourceLineage);

when(User.uses(Dashboard.screen))
  .then(User.movesThrough(Workflow.connectDestination))
  .and(User.movesThrough(Workflow.inspectOwnWinners))
  .and(User.mayMoveThrough(Workflow.addInspirationPages))
  .and(User.mayMoveThrough(Workflow.compareSources))
  .and(User.movesThrough(Workflow.selectSource))
  .and(User.movesThrough(Workflow.generateIdeas))
  .and(User.movesThrough(Workflow.keepDraft));

when(Ui.destinationChooser.selects(Content.destinationPage))
  .then(Ui.pageIdentity.confirms("where the user is creating for"))
  .and(Workflow.destinationFirst.applies(User));

when(Content.destinationPage.has("sufficient history"))
  .then(Ui.ownWinnersSurface.prioritizes(Content.destinationWinner))
  .and(Workflow.ownHistoryFirst.applies(User));

when(User.adds(Content.inspirationPage))
  .then(Ui.inspirationPagesSurface.reveals(Content.inspirationWinner))
  .and(Workflow.optionalExternalInspiration.applies(User));

when(User.selects(Content.selectedSource))
  .then(Ui.ideaWorkbench.generates(Content.draftIdea))
  .and(Ui.draftIdeasSurface.supports(Content.savedDraft));

Evaluation.uxLoop.means(`
- choose one purpose-only user story
- give a subagent only the live worker URL, viewport instructions, and that story
- do not disclose UI structure, implementation details, or intended click path
- require the subagent to attempt the story at both large and small screen sizes
- require screenshots for the main success state and the main failure or confusion state
- collect friction as user-task feedback, not design-theory feedback
- revise the UX based on that feedback and rerun the loop
- run up to three subagents in parallel on independent or adjacent stories for broader coverage
`);

Evaluation.uxStory.examples(`
- Connect my destination page
- Confirm I am creating for the right page
- Review my page top past posts
- Understand why a past post performed well
- Choose one of my own winning posts to build from
- Expand the source list when the first winners are not enough
- Add another page as an inspiration source
- See that page top-performing posts
- Compare my page winners with outside winners
- Choose whether to work from my own history or an outside source
- Generate new post ideas for my destination page
- Compare the generated ideas
- Keep one idea and discard the rest
- Review the first generated draft before editing it
- Change the selected source after seeing the first generated draft
- Edit a kept draft without losing the generated baseline
- Save the chosen idea as a draft
- Confirm what happens next after saving the draft
- Queue the saved draft for a page and time
- Verify that the queued draft appears in the publish queue
- Know the next step after saving the draft
`);

FacebookContentDashboard.prescribes(`
- The first backend seam is a snapshot contract, not a large mutable workflow API.
- Imported Bright Data summary artifacts should map into the same source-post model used by the UI.
- The UI should present destination context before source selection.
- The first live workflow should prove that a user can move from destination selection to one saved draft with minimal noise.
- The next live workflow should prove that a user can move from one saved draft to one queued post without leaving the feature.
- The first-view source chooser should stay intentionally short, and expansion should be explicit instead of forcing immediate scroll.
- Once a source is chosen, the generated draft should become the primary nearby reading target before editing controls dominate the surface.
- UX work for this feature should be evaluated against user-purpose completion, not visual novelty or generic dashboard density.
`);
