import type { FacebookContentDashboardStoreState } from "./content-dashboard-store"
import type { DraftRecord, SourcePostRecord } from "./content-dashboard-types"

export function getActiveSource(
  state: FacebookContentDashboardStoreState,
): SourcePostRecord {
  return (
    state.sourcePosts.find((post) => post.id === state.selection.activeSourceId) ??
    state.sourcePosts[0]
  )
}

export function getDraftsForSource(
  state: FacebookContentDashboardStoreState,
  sourceId: string,
): DraftRecord[] {
  return state.drafts.filter((draft) => draft.sourceId === sourceId)
}

export function getActiveDraft(
  state: FacebookContentDashboardStoreState,
): DraftRecord {
  const draftsForSource = getDraftsForSource(state, state.selection.activeSourceId)
  return (
    draftsForSource.find((draft) => draft.id === state.selection.activeDraftId) ??
    draftsForSource[0] ??
    state.drafts[0]
  )
}
