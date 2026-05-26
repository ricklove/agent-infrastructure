# Storyboard Pack 01: Connect Destination Page

## Story Packet
- Name: Connect Destination Page
- Category: Destination
- Goal: Start a content session by choosing or adding the page I publish to.
- Entry State: User arrives with no selected destination page.
- Success State: One destination page is clearly selected and the rest of the workflow narrows around it.
- Required Actions:
  1. choose an existing page or add a new page
  2. confirm the page context
  3. continue into page history or inspiration

## Desktop Frames
### Frame 1
- Screen state: destination choices are visible immediately
- User action: scan existing pages or enter a new page
- System response: no hidden prerequisite step
- What changed: the first decision is obvious

### Frame 2
- Screen state: one page is selected
- User action: click the selected page
- System response: page identity becomes the active context
- What changed: competing page choices collapse

### Frame 3
- Screen state: selected page remains visible in a compact persistent surface
- User action: continue
- System response: own-history or outside-inspiration branch appears
- What changed: the user is now in a narrower workflow

### Frame 4
- Screen state: page can still be reopened or changed without refresh
- User action: reopen destination
- System response: downstream state resets safely
- What changed: continuity is preserved

## Medium Frames
- Same flow as desktop, but the selected page remains pinned above the next step instead of in a side rail.

## Mobile Frames
- Frame 1: full-width page chooser
- Frame 2: selected page collapses into a compact top card
- Frame 3: next step appears directly beneath
- Frame 4: back or reselection keeps context and does not trap the user

## Component Contract Extraction
- Components involved:
  - destination selector
  - selected destination card
  - page context header
- Required actions:
  - select existing page
  - add page
  - reopen selected page
  - reset downstream state safely
