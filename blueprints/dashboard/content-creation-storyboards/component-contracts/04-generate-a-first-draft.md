# Component Contracts: Generate A First Draft

## Story
- Name: Generate A First Draft

## DraftEditorSurface
- Responsibility: Present one primary generated draft as the clear editing focus and keep its controls coherent.
- Inputs:
  - active draft id
  - active draft title
  - active draft text
  - active draft selected image option
  - generation in-flight states
  - save state
  - queue state
- Outputs:
  - generate full post
  - save draft
  - queue draft
  - delete active draft
- Visual States:
  - no draft yet
  - generating first draft
  - draft ready
  - saving draft
  - queued draft
  - generation failure
- Responsive Rules:
  - narrow mobile: primary draft remains the focus and can move into a deeper editing mode
  - medium: editor remains primary, preview remains nearby but secondary
  - wide desktop: editor occupies the main work surface while preview lives in a dedicated right rail
- Fixture Scenarios:
  - empty no-draft state
  - generating first draft
  - active draft ready
  - save success
  - queue success
  - generation error

## DraftFieldEditor
- Responsibility: Fully edit one field with manual input, field-level generation, and selectable options.
- Inputs:
  - field label
  - selected field value
  - option list
  - generation in-flight state for that field
  - provider state
- Outputs:
  - edit manual value
  - generate field options
  - select field option
  - reset field
- Visual States:
  - manual edit only
  - options available
  - generating field options
  - broken option media for image field
  - long text options
- Responsive Rules:
  - narrow mobile: input, generate action, and option grid stay readable without horizontal overflow
  - medium: field editor can show denser option layouts while preserving the selected field value clearly
  - wide desktop: field editor can coexist with preview rail and alternative drafts without losing hierarchy
- Fixture Scenarios:
  - title editor with options
  - text editor with options
  - image editor with options
  - field loading
  - broken-media image option

## DraftPreviewRail
- Responsibility: Show the current draft as a believable post preview without displacing the editor.
- Inputs:
  - active draft content
  - selected draft image option
  - source context
  - preview state
- Outputs:
  - none directly; purely review-oriented
- Visual States:
  - compact preview
  - expanded preview
  - missing image placeholder
  - long text preview
- Responsive Rules:
  - narrow mobile: floating preview near top of draft flow, then main preview in-content
  - medium: dedicated nearby preview panel
  - wide desktop: dedicated right rail with independent scroll
- Fixture Scenarios:
  - compact preview
  - expanded preview
  - missing image placeholder
  - long text

## AlternativeDraftGrid
- Responsibility: Present additional full-post variants as small post-preview options that do not compete with the main draft.
- Inputs:
  - alternative draft list
  - selected alternative id
  - delete affordance state
- Outputs:
  - select alternative draft
  - delete alternative draft
  - regenerate full draft set
- Visual States:
  - multiple alternatives
  - one alternative only
  - deleted alternative result
  - regenerated set
- Responsive Rules:
  - narrow mobile: wrapped or compact grid that remains scannable
  - medium: grid of smaller previews that does not dominate the screen
  - wide desktop: denser preview grid below or beside the editor without taking over the workbench
- Fixture Scenarios:
  - multiple alternatives
  - selected alternative
  - deleted alternative
  - regenerated alternatives

## Acceptance
- Generating a first draft produces one clear primary draft.
- The primary editor is more prominent than the alternatives.
- Each field can be edited manually and via generated options.
- The draft preview remains believable and nearby across all target viewports.
- Alternative drafts stay visible but clearly secondary.
