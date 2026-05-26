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
  storyPacket: define.entity("StoryPacket"),
  storyboardPack: define.entity("StoryboardPack"),
  interactivePrototype: define.entity("InteractivePrototype"),
  componentContract: define.entity("ComponentContract"),
  fixtureProof: define.entity("ComponentFixtureProof"),
  validationRun: define.entity("ValidationRun"),
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
- Storyboards and coded prototypes must become the source of truth for component contracts rather than jumping from story name directly to implementation.
- UX evaluation should use purpose-only user stories and must not leak current UI structure to the evaluator.
`);

FacebookContentDashboard.defines(`
- DestinationFirstFlow means the user first identifies where they want to publish, and that destination drives the rest of the workflow.
- OwnHistoryFirstFlow means an established page should begin by learning from its own top-performing posts before reaching for outside sources.
- OptionalExternalInspiration means the operator may add other pages after destination selection to broaden the source pool when needed.
- ContentDashboardSnapshot means the feature-owned backend payload that drives the dashboard screen state.
- ImportedBrightDataSummary means a previously generated summary artifact derived from Bright Data exports rather than a live scrape at render time.
- StoryPacket means the structured story artifact that defines goal, states, data, actions, and viewport constraints for one user story.
- StoryboardPack means the desktop, medium, and mobile frame set for one Story Packet.
- InteractivePrototype means a coded route or fixture surface used to exercise storyboard behavior before or alongside integrated implementation.
- ComponentContract means the source-of-truth definition of one UI unit's props, actions, visual states, and responsive rules derived from the approved storyboard and prototype.
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
- choose one to three purpose-only user stories
- author a Story Packet for each story
- author a StoryboardPack for each story across narrow, medium, and wide layouts
- derive ComponentContracts from the approved storyboard
- build or update isolated fixtures and integrated prototypes before integrated churn
- give a subagent only the live worker URL, viewport instructions, and that story or two sequential tasks
- do not disclose UI structure, implementation details, or intended click path
- require the subagent to attempt the story at narrow, medium, and wide screen sizes
- require screenshots for start, success, and failure or confusion states
- collect friction as user-task feedback, not design-theory feedback
- revise the UX based on that feedback and rerun the loop
- run three subagents in parallel on independent or adjacent stories for broader coverage when capacity allows
`);

Evaluation.uxStory.examples(`
## Destination
- Connect Destination Page
- Confirm Destination Page
- Review Page Context
- Switch Destination Pages

## Past Winners
- Check Page History Availability
- Review Top Past Posts
- Understand Why A Post Worked
- Choose A Winning Post
- Reuse A Proven Pattern

## Outside Inspiration
- Add An Inspiration Page
- Review Outside Top Posts
- Compare Internal And External Winners
- Choose Between Internal And External Sources
- Preserve Source Lineage

## Draft Generation
- Generate A First Draft
- Generate Multiple Draft Directions
- Compare Draft Variants
- Keep One Draft
- Regenerate From The Same Source

## Field Editing
- Edit The Title
- Edit The Post Text
- Edit The Image Choice
- Keep Generated Options While Editing
- See One Coherent Draft Across All Fields

## Field-Level Generation
- Generate Title Options
- Generate Text Options
- Generate Image Options
- Preserve Older Options
- Select The Best Option Per Field
- Reset One Field Only

## Whole-Post Variants
- Generate A Full Post
- Compare Full-Post Variants
- Keep The Best Full Variant
- Delete Unwanted Variants
- Preserve Real Generations

## Review
- Preview The Draft As A Facebook Post
- Check Fit For The Destination Page
- Review Originality
- Review Tone And Safety
- Confirm Draft Readiness

## Save And Approve
- Save Draft
- Return To A Saved Draft
- Approve Draft
- Distinguish Draft States
- Know The Next Step

## Schedule And Publish
- Choose Publish Time
- Queue The Draft
- Review The Publishing Queue
- Edit A Scheduled Post
- Publish The Final Post

## Workflow Continuity
- Change Source Without Refreshing
- Complete Multiple Tasks In One Session
- Navigate Back Without Losing Progress
- Keep Context Clear Across Sources And Drafts

## Learning
- Review Published Post Performance
- Compare Performance To The Source
- Learn Which Generated Choices Worked
- Feed Results Into Future Generations
- Build A Library Of Proven Patterns

## Short MVP Subset
- Connect Destination Page
- Review Top Past Posts
- Add Inspiration Page
- Choose A Source Post
- Generate A First Draft
- Generate Field-Level Options
- Edit Fields Manually
- Select The Best Full Draft
- Save Draft
- Approve Draft
- Schedule Post
- Publish Post
- Learn From Results
`);
