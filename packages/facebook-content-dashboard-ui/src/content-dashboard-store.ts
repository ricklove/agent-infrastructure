import { observable } from "@legendapp/state"
import { drafts, learningSignals, scheduledPosts, sourcePosts, workflowSteps } from "./content-dashboard-data"
import type { ContentDashboardSnapshot } from "./content-dashboard-contract"
import type {
  ContentWorkflowStep,
  DraftRecord,
  LearningRecord,
  ScheduledPostRecord,
  SourcePostRecord,
} from "./content-dashboard-types"

export type FacebookContentDashboardStoreState = {
  connection: {
    status: "idle" | "loading" | "ready" | "error"
    mode: "sample" | "snapshot-file"
    source: string | null
    error: string | null
  }
  workflowSteps: ContentWorkflowStep[]
  sourcePosts: SourcePostRecord[]
  drafts: DraftRecord[]
  scheduledPosts: ScheduledPostRecord[]
  learningSignals: LearningRecord[]
  selection: {
    activeSourceId: string
    activeDraftId: string
  }
}

export type FacebookContentDashboardStore = ReturnType<
  typeof createFacebookContentDashboardStore
>

export function createFacebookContentDashboardStore() {
  const state$ = observable<FacebookContentDashboardStoreState>({
    connection: {
      status: "idle",
      mode: "sample",
      source: "seedSnapshot",
      error: null,
    },
    workflowSteps: [...workflowSteps],
    sourcePosts: [...sourcePosts],
    drafts: [...drafts],
    scheduledPosts: [...scheduledPosts],
    learningSignals: [...learningSignals],
    selection: {
      activeSourceId: sourcePosts[0]?.id ?? "",
      activeDraftId: drafts[0]?.id ?? "",
    },
  })

  function applySnapshot(
    snapshot: ContentDashboardSnapshot,
    mode: "sample" | "snapshot-file",
    source: string,
  ) {
    state$.workflowSteps.set(snapshot.workflowSteps)
    state$.sourcePosts.set(snapshot.sourcePosts)
    state$.drafts.set(snapshot.drafts)
    state$.scheduledPosts.set(snapshot.scheduledPosts)
    state$.learningSignals.set(snapshot.learningSignals)
    state$.connection.set({
      status: "ready",
      mode,
      source,
      error: null,
    })

    const nextSourceId = snapshot.sourcePosts[0]?.id ?? ""
    const nextDraftId = snapshot.drafts[0]?.id ?? ""
    state$.selection.set({
      activeSourceId: nextSourceId,
      activeDraftId: nextDraftId,
    })
  }

  function setLoading(mode: "sample" | "snapshot-file") {
    state$.connection.set({
      status: "loading",
      mode,
      source: state$.connection.source.get(),
      error: null,
    })
  }

  function setError(error: string) {
    state$.connection.status.set("error")
    state$.connection.error.set(error)
  }

  function selectSource(sourceId: string) {
    state$.selection.activeSourceId.set(sourceId)
    const nextDraft = state$
      .drafts.get()
      .find((draft) => draft.sourceId === sourceId)
    if (nextDraft) {
      state$.selection.activeDraftId.set(nextDraft.id)
    }
  }

  function selectDraft(draftId: string) {
    state$.selection.activeDraftId.set(draftId)
  }

  return {
    state$,
    applySnapshot,
    setLoading,
    setError,
    selectSource,
    selectDraft,
  }
}
