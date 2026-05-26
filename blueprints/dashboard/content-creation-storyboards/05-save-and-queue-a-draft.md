# Storyboard Pack 05: Save And Queue A Draft

## Story Packet
- Name: Save And Queue A Draft
- Category: Save And Approve
- Goal: Keep a chosen draft and move it into the publish workflow with clear confirmation.
- Entry State: A draft is selected and editable.
- Success State: The draft is saved, then queued for a future publish time with visible confirmation.

## Desktop Frames
### Frame 1
- Screen state: draft is ready and save action is visible near it
- User action: save draft
- System response: clear saved confirmation appears
- What changed: the draft state is now durable

### Frame 2
- Screen state: queue controls become the next clear action
- User action: choose a publish time
- System response: invalid times are blocked, valid times are accepted
- What changed: the draft moves toward publication

### Frame 3
- Screen state: queue action is triggered
- User action: queue the draft
- System response: visible queued confirmation appears
- What changed: the draft has moved into the publish pipeline

### Frame 4
- Screen state: user can continue the session without losing that queued state
- User action: return to source or editor
- System response: queued status remains legible
- What changed: continuity and state confidence remain intact

## Medium And Mobile Notes
- Save and queue must remain close to the draft, not in a distant panel.
- Confirmation must be visible without long scrolling.

## Component Contract Extraction
- Components involved:
  - save status banner
  - queue controls
  - queued confirmation surface
- Required actions:
  - save draft
  - choose future time
  - queue draft
  - see visible queued confirmation
