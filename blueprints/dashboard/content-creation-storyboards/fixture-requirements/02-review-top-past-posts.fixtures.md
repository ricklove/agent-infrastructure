# Fixture Requirements: Review Top Past Posts

## Components
- SourcePostOptionCard
- SelectedSourcePreview
- CompactSourceContextCard
- SourceListExpander

## Required Fixture Scenarios
### SourcePostOptionCard
- compact-default
- active-hover-focus
- selected-option
- long-text
- broken-media

### SelectedSourcePreview
- selected-rich-preview
- selected-compact-preview
- selected-broken-media
- selected-before-draft-generation

### CompactSourceContextCard
- own-winner-context
- outside-inspiration-context
- context-reopenable

### SourceListExpander
- collapsed-with-more
- expanded
- no-more-items

## Integrated Story Fixture States
- destination-with-top-winners
- winner-selected-ready-to-generate
- source-changed-after-selection
- mobile-short-list-expanded

## Validation Notes
- Verify the winner list looks like post previews, not data tables.
- Verify selection becomes explicit.
- Verify the selected source stays visible near generation.
- Verify source switching preserves session continuity.
