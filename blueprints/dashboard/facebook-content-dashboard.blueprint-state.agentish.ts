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
The feature now targets a destination-first workflow:
1. connect the destination page
2. confirm the publishing context
3. if the page has history, review that page own top past posts first
4. optionally add outside inspiration pages
5. choose one source post
6. generate draft ideas
7. keep one draft

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
- ✅ Canonical UX loop is blind subagent testing from purpose-only stories
- ✅ Worker tunnel is the live surface used for UX review
- ✅ Screenshot artifacts are required inputs to the UX loop

## Current Gaps

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
1. pick one purpose-only user story
2. issue a fresh worker session URL
3. give a subagent only the URL, the story, and viewport instructions
4. require screenshots for success and confusion states
5. collect friction from the subagent without priming it with UI structure
6. revise the feature UX on the worker
7. rerun the story

## Immediate Next Steps
1. Complete the live path from saved draft to queued post
2. Add direct component fixtures for expanded source lists and the saved-draft scheduling state
3. Keep tightening draft visibility and confidence after source selection
4. Run fresh blind UX passes against the worker URL on both desktop and small screens
`);

FacebookContentDashboardState.tracks(`
- alignment with the destination-first blueprint
- progress from own-page winners to generated drafts
- maturity of outside-inspiration support
- discipline of the screenshot-based blind UX loop
`);
