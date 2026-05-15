# Fixture Requirements: Connect Destination Page

## Components
- DestinationPageSelector
- SelectedDestinationCard
- DestinationContextHeader

## Required Fixture Scenarios
### DestinationPageSelector
- no-existing-destinations
- existing-destinations
- selected-destination
- add-page-loading
- add-page-error

### SelectedDestinationCard
- selected-with-history
- selected-without-history
- selected-reopenable

### DestinationContextHeader
- history-available
- no-history
- destination-changed

## Integrated Story Fixture States
- entry-no-selection
- selection-complete-history-available
- selection-complete-no-history
- reopen-and-reset

## Validation Notes
- Verify broad chooser narrows after selection.
- Verify selected destination remains visible.
- Verify reopening resets downstream source/draft state.
