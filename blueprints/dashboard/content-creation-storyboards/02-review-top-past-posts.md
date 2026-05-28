# Storyboard Pack 02: Review Top Past Posts

## Story Packet
- Name: Review Top Past Posts
- Category: Past Winners
- Goal: Understand what has worked on the destination page and choose a promising source post.
- Entry State: Destination page is selected and has history.
- Success State: A winning post is selected with clear source context.

## Desktop Frames
### Frame 1
- Screen state: top past posts are visible near the selected destination context
- User action: scan the best posts
- System response: each post looks like a real post preview, not raw data
- What changed: the user has real candidate sources

### Frame 2
- Screen state: one post is selected
- User action: inspect the chosen post
- System response: the chosen post stays visible in a richer preview
- What changed: selection becomes explicit

### Frame 3
- Screen state: source post remains visible while the draft workflow becomes available
- User action: proceed to generation
- System response: draft generation becomes the next clear action
- What changed: the source-to-draft transition is understandable

### Frame 4
- Screen state: source can be changed without losing the overall session
- User action: choose another source
- System response: source updates, draft area resets cleanly
- What changed: continuity is preserved

## Medium Frames
- Keep source list and selected source near each other.
- Do not force long scrolling before the source-to-draft action becomes visible.

## Mobile Frames
- Show a short initial winner list.
- Expand only when needed.
- After selection, collapse the list and keep the selected post visible above the draft path.

## Component Contract Extraction
- Components involved:
  - source post option cards
  - selected source preview
  - compact source context card
- Required actions:
  - select source post
  - expand source list
  - change source post
