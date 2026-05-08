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

## Overview
The feature now exists as a first-party dashboard plugin with a worker-backed dev surface, shared dashboard-session auth, a dedicated backend package, a dedicated UI package, and a shared core snapshot contract. The current branch also supports loading a real imported Bright Data summary artifact instead of only hard-coded seed data.

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
- ✅ Source post records now carry direct post URLs and source URLs when present

### Workflow Surface
- ✅ The feature is organized around Discover -> Create -> Review -> Schedule -> Learn
- ✅ The current UI has inspiration, analysis, draft, review, and publishing sections
- ✅ Review language explicitly reinforces human approval before scheduling

## Current Gaps

### Product Gaps
- The current schedule and review actions are still UI-only; they do not persist real editorial state transitions yet
- Draft variants are still derived placeholders rather than operator-created records with real mutations
- Learning signals are still computed/import-derived and not yet connected to actual post-publication feedback loops

### UX Gaps
- The visual surface has improved, but it still does not yet feel fully aligned with the strongest Agent Chat V2 interaction quality
- The feature still needs repeated live UX testing through purpose-only user stories instead of designer-intent walkthroughs
- Mobile and narrow-width behavior needs more intentional iteration after the main desktop workbench is stabilized

### Backend Gaps
- Imported snapshot loading is file-based today rather than sourced from a durable feature-owned store
- There is no real scheduling persistence model yet
- Meta publishing integration is not wired yet
- Bright Data import is not yet a first-class ingestion pipeline inside the feature backend

## Required UX Evaluation Loop

The next UX work should follow this loop:
1. pick one purpose-only user story
2. send a subagent only the live URL and that user-purpose story
3. collect friction from the subagent without priming it with UI structure
4. revise the feature UX
5. rerun the story

## Immediate Next Steps
1. Make draft/review/schedule actions mutate real feature state
2. Keep tightening the workbench UX toward a stronger Agent Chat V2 quality bar
3. Run purpose-only subagent UX passes against the live worker URL
4. Replace imported-file-only scheduling assumptions with durable feature-owned records
`);

FacebookContentDashboardState.tracks(`
- architecture alignment with the feature blueprint
- imported snapshot support versus sample fallback
- real editorial workflow gaps
- required UX evaluation loop discipline
`);
