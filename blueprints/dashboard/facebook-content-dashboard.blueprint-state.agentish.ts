/// <reference path="../_agentish.d.ts" />

// Facebook Content Dashboard - Blueprint State

const Agentish = define.language("Agentish");

const FacebookContentDashboardState = define.document(
  "FacebookContentDashboardState",
  {
    format: Agentish,
    role: "Current implementation status, gaps, and next steps relative to the Facebook Content Dashboard blueprint",
  },
);

const Blueprint = define.document("facebook-content-dashboard.agentish.ts");

FacebookContentDashboardState.compares(
  "current facebook content dashboard implementation",
  "ideal blueprint",
);

FacebookContentDashboardState.records(`
# Facebook Content Dashboard Implementation Status

## Current Canonical UX
The feature now targets a canonical journey with these top-level phases:
1. destination
2. past winners
3. outside inspiration
4. draft generation
5. field editing
6. field-level generation
7. whole-post variants
8. review
9. save and approve
10. schedule and publish
11. workflow continuity
12. learning

## Current Short MVP Target
1. Connect Destination Page
2. Review Top Past Posts
3. Add Inspiration Page
4. Choose A Source Post
5. Generate A First Draft
6. Generate Field-Level Options
7. Edit Fields Manually
8. Select The Best Full Draft
9. Save Draft
10. Approve Draft
11. Schedule Post
12. Publish Post
13. Learn From Results

## Current Alignment

### Architecture
- ✅ Feature exists as a first-party dashboard plugin
- ✅ Shared dashboard auth is used rather than a feature-local auth scheme
- ✅ Feature backend is lazy-started behind the dashboard gateway
- ✅ UI, server, and core types are split into separate packages
- ✅ A worker-backed dev tunnel exists and is usable for live review

### Data Flow
- ✅ Feature snapshot endpoint exists
- ✅ Sample snapshot fallback exists
- ✅ Imported Bright Data summary file can be mapped into the snapshot model
- ✅ The UI shows whether it is using sample data or imported snapshot data

### UX Process
- ✅ Canonical UX loop now requires Story Packets, storyboard packs, isolated fixtures, and blind subagent testing
- ✅ Worker tunnel is the live surface used for UX review
- ✅ Screenshot artifacts are required inputs to the UX loop
- ✅ The canonical story list and short MVP subset are now stable in blueprints

## Current Gaps

### Process Gaps
- The first five storyboard packs still need to be authored as concrete files
- Story Packet templates, storyboard templates, and validation templates still need to be added as canonical repo artifacts
- Component contracts are still implicit in code more often than explicit in blueprint artifacts

### Product Gaps
- The destination-first UX is not yet fully implemented in the live screen
- Destination pages are not yet first-class backend records; the current screen still derives too much locally
- Added inspiration pages are not yet a real editable feature surface
- Saved draft state is still mostly local UI state rather than durable feature-owned records

### UX Gaps
- The current live screen still carries remnants of the older source-first model
- The first-run experience for users with an established destination page is not yet clean enough
- The distinction between own winners and outside inspiration still needs to be made visually obvious
- Mobile and narrow-width behavior still needs repeated purpose-only testing against the new first-slice flow
- The first draft state still needs stronger confidence and next-step clarity in the live screen
- The saved-draft to publish-queue path is not yet fully closed in the active feature surface

### Backend Gaps
- Imported snapshot loading is file-based today rather than sourced from a durable feature-owned store
- Destination page identity and page-history summary are not yet modeled as dedicated backend payload sections
- Meta publishing integration is not wired yet
- Bright Data import is not yet a first-class ingestion pipeline inside the feature backend

## Required UX Evaluation Loop
1. choose one to three purpose-only user stories
2. author or update the Story Packets
3. author or update the storyboard frames for narrow, medium, and wide layouts
4. derive the component contracts
5. prove isolated component fixtures first
6. issue a fresh worker session URL
7. give a subagent only the URL, the story, and viewport instructions
8. require screenshots for start, success, and confusion states
9. collect friction from the subagent without priming it with UI structure
10. revise the feature UX on the worker
11. rerun the story

## Immediate Next Steps
1. Add canonical Story Packet, storyboard, component-contract, and blind-validation templates
2. Author the first five storyboard packs:
   - Connect Destination Page
   - Review Top Past Posts
   - Add Inspiration Page
   - Generate A First Draft
   - Save And Queue A Draft
3. Turn those storyboard packs into isolated fixture requirements
4. Use those artifacts to drive the next live UI changes instead of direct screen churn
`);

FacebookContentDashboardState.tracks(`
- alignment with the destination-first blueprint
- progress from own-page winners to generated drafts
- maturity of outside-inspiration support
- discipline of the screenshot-based blind UX loop
- presence of explicit Story Packets, storyboards, and component contracts
`);
