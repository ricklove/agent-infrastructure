# Component Contracts: Save And Queue A Draft

## Story
- Name: Save And Queue A Draft

## SaveStatusBanner
- Responsibility: Make the result of saving unmistakable and visible near the active draft.
- Inputs:
  - save state
  - active draft title or id
  - save error message
- Outputs:
  - none directly; purely confirmational
- Visual States:
  - unsaved draft
  - saving in progress
  - save success
  - save error
- Responsive Rules:
  - narrow mobile: must appear before long preview content pushes it away
  - medium: stays close to the primary draft editor
  - wide desktop: stays in the main work surface, not hidden in a distant queue panel
- Fixture Scenarios:
  - unsaved
  - saving
  - saved
  - save error

## QueueControls
- Responsibility: Let the user choose a valid future publish time and queue the saved draft without ambiguity.
- Inputs:
  - save state
  - selected publish time
  - queue loading state
  - queue validation error
- Outputs:
  - change publish time
  - queue draft
- Visual States:
  - disabled before save
  - ready to queue
  - invalid past time
  - queue loading
  - queue success
  - queue error
- Responsive Rules:
  - narrow mobile: controls remain near the draft and stay readable in a stacked form
  - medium: controls can sit below the editor or preview-adjacent, but must remain near the draft
  - wide desktop: controls can share the preview rail only if confirmation remains obvious in the main draft flow
- Fixture Scenarios:
  - disabled before save
  - ready to queue
  - invalid time
  - queue loading
  - queued success

## QueuedConfirmationSurface
- Responsibility: Show the queued result clearly and preserve it while the user continues the session.
- Inputs:
  - queued state
  - scheduled publish time
  - destination page
  - active draft identity
- Outputs:
  - optional reopen or edit scheduled draft action later
- Visual States:
  - queued confirmation visible
  - queued confirmation dismissed from primary focus but still legible
  - queued state after source changes
- Responsive Rules:
  - narrow mobile: confirmation must be visible without needing to scroll far back up
  - medium: confirmation remains near the action region
  - wide desktop: confirmation may live in the preview/queue rail but must still be obvious
- Fixture Scenarios:
  - queued success
  - queued and continuing session
  - queued after source change

## DraftStateIndicator
- Responsibility: Distinguish whether the active draft is unsaved, saved, or queued so the next action is obvious.
- Inputs:
  - draft stage
  - save state
  - queue state
- Outputs:
  - none directly; contextual only
- Visual States:
  - unsaved
  - saved
  - queued
- Responsive Rules:
  - narrow mobile: concise state marker near save/queue actions
  - medium: visible without repeating the same state in multiple places
  - wide desktop: one authoritative state location, not duplicated banners everywhere
- Fixture Scenarios:
  - unsaved
  - saved
  - queued

## Acceptance
- Saving a draft produces an unmistakable visible confirmation.
- Queueing is disabled or blocked when the draft is not ready or the time is invalid.
- Queueing success remains visible as the user continues the session.
- The current draft stage, unsaved, saved, or queued, is always understandable.
