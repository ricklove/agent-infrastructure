/// <reference path="../_agentish.d.ts" />

// Facebook Content Dashboard - UX Development Process

const Agentish = define.language("Agentish");

const FacebookContentDashboardUxDevelopment = define.document(
  "FacebookContentDashboardUxDevelopment",
  {
    format: Agentish,
    role: "Canonical UX-driven development process for the FacebookMarketing dashboard plugin",
  },
);

FacebookContentDashboardUxDevelopment.records(`
# UX-Driven Development Process

## Rule
All UX development for Dashboard: FacebookMarketing must proceed through blind subagent task attempts on the live worker URL, followed by code changes on the worker, followed by re-verification and retest.

## Canonical Story Order
1. Connect my destination page
2. Confirm I am creating for the right page
3. Review my page top past posts
4. Understand why a past post performed well
5. Choose one of my own winning posts to build from
6. Add another page as an inspiration source
7. See that page top-performing posts
8. Compare my page winners with outside winners
9. Generate new post ideas for my destination page
10. Compare the generated ideas
11. Keep one idea and discard the rest
12. Save the chosen idea as a draft

## Blind Subagent Mission Contract
Each subagent receives only:
- the live worker URL
- viewport instructions
- one purpose-only user story

Each subagent must not receive:
- intended click paths
- screen descriptions
- component names
- implementation details
- desired design conclusions

## Required Output From Each UX Pass
- whether the story was completed
- where the subagent hesitated or got stuck
- any bugs or broken interactions encountered
- any misleading wording or dead-end states encountered
- one screenshot of the main success state
- one screenshot of the main confusion, failure, or friction state

## Parallel Coverage
Up to three subagents may run in parallel when their stories are independent or adjacent. The goal is broader coverage across the feature, not duplicated effort.

## Development Loop
1. choose one to three stories
2. issue fresh worker session URLs
3. run blind subagent passes on large and small viewports
4. review screenshots and friction reports
5. patch the worker code directly
6. run worker checks
7. issue fresh URLs
8. rerun the affected stories

## Quality Bar
- The feature should feel clean, professional, sharp, and intentionally restrained.
- The feature should use the actual Agent Chat V2 Tailwind language, not a generic dark dashboard style.
- The feature should show only UI that is necessary for the active story.
- Architecture quality matters during the loop: state, view models, and components should be organized cleanly as the UX evolves.
`);
