# Storyboard: Connect Destination Page

## Goal
Start a content session by choosing or adding the page I publish to.

## Desktop
### Frame 1: Entry
- Visible:
  - destination page choices
  - add-page input
  - add-page action
- User intent:
  - understand where to begin immediately
- Emphasis:
  - existing pages first
  - add-page input second
- Change from previous frame:
  - none; initial state

### Frame 2: Selection
- User action:
  - select an existing destination page
- System response:
  - selected page becomes active
  - other page choices collapse or de-emphasize
- Emphasis:
  - chosen page identity
  - clear active state
- Change from previous frame:
  - one page is now the publishing context

### Frame 3: Context Locked
- Visible:
  - compact selected destination card
  - page context summary
  - next branch entry: winners or inspiration
- User intent:
  - verify the correct destination and continue
- Emphasis:
  - selected page persists
  - next step is now obvious
- Change from previous frame:
  - broad chooser narrows into active context

### Frame 4: Reopen
- User action:
  - reopen the selected destination
- System response:
  - chooser reappears
  - downstream state is safely reset
- Emphasis:
  - safe reversibility
- Change from previous frame:
  - user can correct the destination without refresh

## Medium
### Frame 1: Entry
- Same functional entry as desktop
- Layout rule:
  - destination chooser and add input stay in one vertical zone

### Frame 2: Selection
- Selected page becomes active
- Layout rule:
  - selected card remains above the next step, not off to a side rail

### Frame 3: Context Locked
- Compact selected destination sits above winners/inspiration branch
- Layout rule:
  - no excessive empty space between selection and next action

### Frame 4: Reopen
- Reopening the destination returns to the chooser in place
- Layout rule:
  - no jump to a different screen unless the viewport forces it

## Mobile
### Frame 1: Entry
- Visible:
  - full-width destination choices or add-page input
- Emphasis:
  - one obvious starting action

### Frame 2: Selection
- Selected page collapses into a compact top card
- Emphasis:
  - current destination is preserved without crowding the screen

### Frame 3: Context Locked
- Next branch appears directly under the selected card
- Emphasis:
  - no need to hunt for where to continue

### Frame 4: Reopen
- User can reopen destination from the compact card
- System response:
  - chooser returns in the same session
  - downstream state resets safely

## Edge States
- no existing destinations
- add-page loading
- add-page validation error
- destination with no history
- destination with history

## Acceptance Notes
- Existing destination pages are visible immediately when they exist.
- Adding a destination page does not require leaving the current surface.
- Once selected, the destination remains visible and trusted.
- Reopening is reversible and safe.
