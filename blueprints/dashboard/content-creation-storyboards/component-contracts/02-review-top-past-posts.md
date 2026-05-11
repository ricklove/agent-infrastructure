# Component Contracts: Review Top Past Posts

## Story
- Name: Review Top Past Posts

## SourcePostOptionCard
- Responsibility: Present one past winning post as a scannable source choice that looks like a believable post preview rather than raw metadata.
- Inputs:
  - post id
  - page identity
  - post text preview
  - media thumbnail url
  - engagement stats
  - timestamp
  - selected state
  - active hover or focus state
- Outputs:
  - select source post
  - expand into richer inspection only when appropriate
- Visual States:
  - compact option
  - active option
  - selected option
  - broken-media fallback
  - long-text preview
- Responsive Rules:
  - narrow mobile: single-column compact card with fixed media square and short text preview
  - medium: denser card that still exposes the first scan line and media without forcing long scroll
  - wide desktop: multi-card browsing grid or list where preview density remains readable
- Fixture Scenarios:
  - compact default
  - active hover/focus
  - selected option
  - long-text content
  - broken-media content

## SelectedSourcePreview
- Responsibility: Keep the chosen winning post visible as the current source and make the source-to-draft relationship obvious.
- Inputs:
  - selected source post identity
  - selected source post preview media
  - selected source post text
  - engagement stats
  - source lineage label
- Outputs:
  - reopen source chooser
  - change source post
- Visual States:
  - selected source with history stats
  - selected source with long content
  - selected source with broken media
  - selected source while draft area is not yet generated
- Responsive Rules:
  - narrow mobile: collapsed but still recognizable selected-source block above the draft action
  - medium: source preview stays near the generation action without pushing the draft below the fold
  - wide desktop: richer selected preview can stay in a persistent browse rail or upper source region
- Fixture Scenarios:
  - selected rich preview
  - selected compact preview
  - selected broken media
  - selected before draft generation

## CompactSourceContextCard
- Responsibility: Preserve enough source context after selection without repeating the full preview everywhere.
- Inputs:
  - source page name
  - source type label: own winner or outside inspiration
  - selected source title or short line
  - reopen affordance state
- Outputs:
  - reopen source selection
- Visual States:
  - own-winner context
  - outside-inspiration context
  - active reopen state
- Responsive Rules:
  - narrow mobile: short context row or card above the draft flow
  - medium: compact pinned context above editor content
  - wide desktop: compact context can live in the main editor header while the richer selected preview lives in the browse rail
- Fixture Scenarios:
  - own winner selected
  - outside inspiration selected
  - reopened state

## SourceListExpander
- Responsibility: Reveal more winners only when needed without overwhelming the initial scan experience.
- Inputs:
  - initial source count
  - hidden source count
  - expanded state
- Outputs:
  - expand source list
  - collapse source list when the pattern calls for it
- Visual States:
  - collapsed short list
  - expanded list
  - no extra items
- Responsive Rules:
  - narrow mobile: must keep the first view short and obvious
  - medium: can show a slightly larger initial set
  - wide desktop: may reveal more items without causing loss of focus
- Fixture Scenarios:
  - collapsed with more items
  - expanded
  - no-more-items state

## Acceptance
- The user can scan top winners without reading raw backend-like data.
- One winning post can be selected with a clearly visible selected state.
- After selection, the source remains visible enough to explain what the draft is based on.
- The user can change source without losing overall session context.
- Mobile keeps the initial winner list short and readable.
