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
All UX development for Dashboard: FacebookMarketing must proceed through Story Packets, storyboard frames, coded prototype fixtures, blind subagent task attempts on the live worker URL, worker-only code changes, and re-verification on the same live surface.

## Required Artifact Chain
Story -> Story Packet -> Storyboard -> Interactive Prototype -> Component Contract -> Isolated Fixture -> Integrated Implementation -> Blind Validation

## Story Packet Requirement
Every story must first have a Story Packet that defines:
- story name
- user goal
- entry state
- success state
- failure, empty, loading, and back states
- required data and entities
- user actions
- viewport constraints for narrow mobile, medium, and wide desktop

## Storyboard Requirement
Every story must then have:
- a wide desktop storyboard
- a medium storyboard
- a narrow mobile storyboard

Each storyboard must include:
- 4 to 8 frames
- screen state
- user action
- system response
- what changed from the previous frame
- the key UI element that should hold user attention

## Prototype And Contract Requirement
Before integrated implementation:
- the story must have a coded prototype or fixture route
- each meaningful component in that story must have an isolated debug route
- each component must have a contract covering props, emitted actions, visual states, and responsive rules

## Validation Matrix
Every story must be validated across:
- narrow mobile
- medium
- wide desktop

Every story must be validated across:
- empty
- loading
- error
- success
- long-content
- broken-media

## Canonical Story Order
### Destination
1. Connect Destination Page
2. Confirm Destination Page
3. Review Page Context
4. Switch Destination Pages

### Past Winners
5. Check Page History Availability
6. Review Top Past Posts
7. Understand Why A Post Worked
8. Choose A Winning Post
9. Reuse A Proven Pattern

### Outside Inspiration
10. Add An Inspiration Page
11. Review Outside Top Posts
12. Compare Internal And External Winners
13. Choose Between Internal And External Sources
14. Preserve Source Lineage

### Draft Generation
15. Generate A First Draft
16. Generate Multiple Draft Directions
17. Compare Draft Variants
18. Keep One Draft
19. Regenerate From The Same Source

### Field Editing
20. Edit The Title
21. Edit The Post Text
22. Edit The Image Choice
23. Keep Generated Options While Editing
24. See One Coherent Draft Across All Fields

### Field-Level Generation
25. Generate Title Options
26. Generate Text Options
27. Generate Image Options
28. Preserve Older Options
29. Select The Best Option Per Field
30. Reset One Field Only

### Whole-Post Variants
31. Generate A Full Post
32. Compare Full-Post Variants
33. Keep The Best Full Variant
34. Delete Unwanted Variants
35. Preserve Real Generations

### Review
36. Preview The Draft As A Facebook Post
37. Check Fit For The Destination Page
38. Review Originality
39. Review Tone And Safety
40. Confirm Draft Readiness

### Save And Approve
41. Save Draft
42. Return To A Saved Draft
43. Approve Draft
44. Distinguish Draft States
45. Know The Next Step

### Schedule And Publish
46. Choose Publish Time
47. Queue The Draft
48. Review The Publishing Queue
49. Edit A Scheduled Post
50. Publish The Final Post

### Workflow Continuity
51. Change Source Without Refreshing
52. Complete Multiple Tasks In One Session
53. Navigate Back Without Losing Progress
54. Keep Context Clear Across Sources And Drafts

### Learning
55. Review Published Post Performance
56. Compare Performance To The Source
57. Learn Which Generated Choices Worked
58. Feed Results Into Future Generations
59. Build A Library Of Proven Patterns

## Short MVP Subset
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

## Initial Storyboard Packs
1. Connect Destination Page
2. Review Top Past Posts
3. Add Inspiration Page
4. Generate A First Draft
5. Save And Queue A Draft

## Blind Subagent Mission Contract
Each subagent receives only:
- the live worker URL
- viewport instructions
- one purpose-only user story or two sequential purpose-only tasks

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
- one screenshot of the starting state
- one screenshot of the main success state
- one screenshot of the main confusion, failure, or friction state
- a note describing whether the second task still worked without refresh
- a note describing whether the screen preserved enough context after back or source changes

## Parallel Coverage
The default UX pass uses three subagents in parallel on independent or adjacent stories. The goal is broader coverage across setup, generation, and continuity instead of duplicated effort.

## Development Loop
1. choose one to three stories
2. author or update the Story Packets
3. author or update the desktop, medium, and mobile storyboard frames
4. derive or update the component contracts
5. build or refine isolated component fixtures
6. prove the isolated fixtures
7. integrate the change on the live worker surface
8. issue fresh worker session URLs
9. run blind subagent passes on narrow, medium, and wide viewports
10. review screenshots and friction reports
11. patch only the observed failures on the worker
12. rerun the affected stories

## Quality Bar
- The feature should feel clean, professional, sharp, and intentionally restrained.
- The feature should use the actual Agent Chat V2 Tailwind language, not a generic dark dashboard style.
- The feature should show only UI that is necessary for the active story.
- Architecture quality matters during the loop: state, view models, and components should be organized cleanly as the UX evolves.
- A story is not complete until its fixture proofs and integrated blind-task proofs both pass on narrow, medium, and wide layouts.
`);
