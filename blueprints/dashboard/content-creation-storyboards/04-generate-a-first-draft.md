# Storyboard Pack 04: Generate A First Draft

## Story Packet
- Name: Generate A First Draft
- Category: Draft Generation
- Goal: Turn the selected source into one primary draft that I can inspect and edit.
- Entry State: Destination and source post are selected.
- Success State: A first generated draft is visible with a coherent editor and preview.

## Desktop Frames
### Frame 1
- Screen state: source is selected and the generation action is visible
- User action: generate a first draft
- System response: loading state appears immediately
- What changed: the system is visibly working

### Frame 2
- Screen state: first draft appears
- User action: inspect the generated draft
- System response: one primary draft is emphasized instead of a confusing pile
- What changed: generation has produced a usable output

### Frame 3
- Screen state: title, text, and image fields are editable
- User action: modify one field or request more options
- System response: field-level editing and field-level generation are both available
- What changed: the draft becomes an editable creative, not only a static output

### Frame 4
- Screen state: alternatives are still available but secondary
- User action: compare another full-post option
- System response: alternatives are visible as smaller previews without stealing focus
- What changed: exploration is possible without losing the main draft

## Medium And Mobile Notes
- Mobile should keep one primary draft visible with deeper navigation if necessary.
- Desktop should allow editor and preview to coexist cleanly.

## Component Contract Extraction
- Components involved:
  - draft editor surface
  - field editors
  - preview panel
  - alternative draft grid
- Required actions:
  - generate first draft
  - edit title/text/image
  - generate field-level options
  - select a full alternative
