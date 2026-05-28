# Storyboard Pack 03: Add Inspiration Page

## Story Packet
- Name: Add Inspiration Page
- Category: Outside Inspiration
- Goal: Add an outside page with proven content when my destination lacks enough history or I want more source material.
- Entry State: Destination page is selected.
- Success State: An inspiration page is added and one of its top posts can be chosen as the active source.

## Desktop Frames
### Frame 1
- Screen state: outside inspiration is visibly secondary to the destination
- User action: add an inspiration page
- System response: the added page appears with its own context
- What changed: a new optional source branch exists

### Frame 2
- Screen state: top posts from that inspiration page appear
- User action: scan outside winners
- System response: internal and external sources are distinguishable
- What changed: source lineage is visible

### Frame 3
- Screen state: one outside winner is selected
- User action: choose that post
- System response: it becomes the active source while the destination remains the publishing context
- What changed: active source and destination are both legible

### Frame 4
- Screen state: user can switch back to internal winners
- User action: return to destination winners
- System response: source changes without losing session
- What changed: continuity survives source switching

## Medium And Mobile Notes
- Keep destination context persistent.
- Make outside inspiration clearly contextual, not a replacement destination.

## Component Contract Extraction
- Components involved:
  - inspiration page selector
  - inspiration page context card
  - outside source post cards
- Required actions:
  - add inspiration page
  - choose outside source post
  - switch back to internal sources
