# Component Contracts: Add Inspiration Page

## Story
- Name: Add Inspiration Page

## InspirationPageSelector
- Responsibility: Let the user add or choose an outside inspiration page without making it feel like a replacement destination.
- Inputs:
  - destination page identity
  - existing inspiration page options
  - add-inspiration input value
  - add-inspiration loading state
  - selected inspiration page id
- Outputs:
  - change add-page input
  - submit add-inspiration page
  - select inspiration page
  - clear inspiration page
- Visual States:
  - no inspiration pages yet
  - existing inspiration pages
  - add-page loading
  - add-page error
  - inspiration page selected
- Responsive Rules:
  - narrow mobile: destination remains visible while inspiration selection stays secondary beneath it
  - medium: selector can sit beneath destination context with a short list of inspiration choices
  - wide desktop: inspiration selector can live in the browse rail as a separate contextual section
- Fixture Scenarios:
  - no inspiration pages
  - existing inspiration pages
  - selected inspiration page
  - loading add-page
  - invalid add-page

## InspirationPageContextCard
- Responsibility: Preserve outside-source context after the page is added so the user understands which page the outside posts come from.
- Inputs:
  - inspiration page name
  - inspiration page summary
  - outside top-post count
  - active or contextual state
- Outputs:
  - reopen inspiration page selection
  - remove or change inspiration page
- Visual States:
  - contextual card
  - active card
  - no-history fallback
- Responsive Rules:
  - narrow mobile: compact context block above outside winners
  - medium: context block remains adjacent to outside winner list
  - wide desktop: context block sits above or beside outside winner previews without competing with the destination page
- Fixture Scenarios:
  - contextual card
  - active card
  - no-history outside page

## OutsideSourcePostCards
- Responsibility: Present outside winners as valid source options while keeping their lineage distinct from the destination page.
- Inputs:
  - outside source post identity
  - outside page name
  - post preview text
  - media thumbnail
  - engagement stats
  - selected state
- Outputs:
  - select outside source post
  - change back to internal winners
- Visual States:
  - compact outside option
  - selected outside option
  - broken-media fallback
  - long-text preview
- Responsive Rules:
  - narrow mobile: short initial list with clear outside-page attribution
  - medium: outside cards remain visually distinct from internal winner cards
  - wide desktop: outside cards can share the same preview grammar but must preserve source attribution clearly
- Fixture Scenarios:
  - default outside option
  - selected outside option
  - broken-media outside option
  - long-text outside option

## SourceModeSwitcher
- Responsibility: Let the user move between internal winners and outside inspiration without losing continuity.
- Inputs:
  - current source mode
  - internal winner availability
  - outside inspiration availability
- Outputs:
  - switch to internal winners
  - switch to outside inspiration
- Visual States:
  - internal active
  - outside active
  - outside unavailable
- Responsive Rules:
  - narrow mobile: source mode switch must not feel like a full reset or hidden branch
  - medium: mode switch should sit near the source list header
  - wide desktop: mode switch can live above the source browse surfaces
- Fixture Scenarios:
  - internal active
  - outside active
  - outside unavailable

## Acceptance
- Adding an inspiration page is possible without obscuring the destination context.
- Outside winners are visibly distinct from destination winners.
- The user can choose an outside source and still understand the publishing destination.
- The user can switch back to internal winners without losing session continuity.
