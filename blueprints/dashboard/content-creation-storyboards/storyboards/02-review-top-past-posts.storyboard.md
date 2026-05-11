# Storyboard: Review Top Past Posts

## Goal
Understand what has worked on the destination page and choose a promising source post.

## Desktop
### Frame 1: Winner List
- Visible:
  - destination context
  - top past post previews
  - short source-list affordance if more posts exist
- User intent:
  - scan the strongest candidates quickly
- Emphasis:
  - real post-like previews, not raw metadata
- Change from previous frame:
  - destination context now exposes candidate sources

### Frame 2: Source Selected
- User action:
  - choose one winning post
- System response:
  - selected post becomes explicit
  - richer preview becomes visible
- Emphasis:
  - why this post is now the active source
- Change from previous frame:
  - one source has been promoted from list item to selected source

### Frame 3: Generate Path Visible
- Visible:
  - selected source preview
  - clear path into draft generation
- User intent:
  - move from source inspection into generation
- Emphasis:
  - source-to-draft relationship
- Change from previous frame:
  - generation is now the next obvious action

### Frame 4: Source Change
- User action:
  - choose another source
- System response:
  - selected source updates cleanly
  - draft path resets to the new source
- Emphasis:
  - continuity without confusion
- Change from previous frame:
  - source changes, session context survives

## Medium
### Frame 1: Winner List
- Layout rule:
  - list is compact and near the selected source zone
- Emphasis:
  - scanning should not require long scroll before seeing the selected result

### Frame 2: Source Selected
- Selected source remains above generation path
- Layout rule:
  - do not push the selected preview too far away from the list

### Frame 3: Generate Path Visible
- Generation action remains close to the selected source
- Layout rule:
  - one compact browse-to-generate flow

### Frame 4: Source Change
- Source switch happens in place
- Layout rule:
  - avoid full-screen reset when only the source changes

## Mobile
### Frame 1: Short Winner List
- Visible:
  - short initial list only
  - expand affordance if more winners exist
- Emphasis:
  - fast first scan

### Frame 2: Source Selected
- Selected source collapses into a compact but recognizable post preview
- Emphasis:
  - keep the chosen source visible near the next action

### Frame 3: Generate Path Visible
- Draft generation entry appears directly beneath the selected source
- Emphasis:
  - user knows what the draft will be based on

### Frame 4: Source Change
- Reopen source chooser from the selected source card
- System response:
  - list returns without losing destination context

## Edge States
- long text winner
- broken media winner
- more winners hidden behind expander
- zero-history destination falls back to outside inspiration instead

## Acceptance Notes
- The user can scan winning posts as post previews.
- One source post can be selected clearly.
- The selected source remains visible enough to explain draft lineage.
- Source changes do not destroy the broader session context.
