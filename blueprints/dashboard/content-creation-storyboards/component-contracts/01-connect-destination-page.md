# Component Contracts: Connect Destination Page

## Story
- Name: Connect Destination Page

## DestinationPageSelector
- Responsibility: Present existing destination pages immediately and allow adding a new destination page without a hidden prerequisite step.
- Inputs:
  - existing destination page options
  - selected destination page id
  - add-page input value
  - add-page loading state
- Outputs:
  - select destination page
  - change add-page input
  - submit add-page action
- Visual States:
  - empty: only add-page row
  - success: existing pages visible as selectable options
  - selected: one page visibly active
  - loading: add-page submit is visibly in-flight
  - error: invalid add-page result is visible inline
- Responsive Rules:
  - narrow mobile: full-width stacked choices and input row
  - medium: compact grid with input row below or beside choices
  - wide desktop: compact grid that stays within the left setup rail
- Fixture Scenarios:
  - no existing destinations
  - existing destinations
  - selected destination
  - add-page loading
  - add-page error

## SelectedDestinationCard
- Responsibility: Preserve the chosen destination as persistent context and allow safe reopening without ambiguity.
- Inputs:
  - selected destination name
  - selected destination summary
  - selected destination history count
  - reopen affordance state
- Outputs:
  - reopen destination selector
  - reset downstream source and draft state
- Visual States:
  - selected active
  - selected context
  - selected with history available
  - selected with no history
- Responsive Rules:
  - narrow mobile: compact top card above the next step
  - medium: pinned card above next-step content
  - wide desktop: persistent card in the left rail
- Fixture Scenarios:
  - selected with history
  - selected without history
  - reopened state

## DestinationContextHeader
- Responsibility: Confirm where the user is creating for and make the branch into winners or inspiration legible.
- Inputs:
  - destination page identity
  - history availability state
  - source-branch mode
- Outputs:
  - none directly; purely contextual
- Visual States:
  - page confirmed
  - no-history branch
  - history-available branch
- Responsive Rules:
  - narrow mobile: concise confirmation directly above the next step
  - medium: compact context block
  - wide desktop: can remain a light contextual header since the left rail already preserves the destination
- Fixture Scenarios:
  - history available
  - no history
  - destination changed

## Acceptance
- Existing destination pages are visible immediately when they exist.
- Adding a destination page is possible from the same surface.
- Once selected, the destination remains visible as context.
- Reopening the destination safely clears downstream state.
- The next branch, winners or inspiration, is understandable from the selected destination context.
