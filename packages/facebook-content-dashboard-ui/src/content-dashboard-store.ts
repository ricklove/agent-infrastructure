import { observable } from "@legendapp/state"
import {
  generateContentDashboardImageDraft,
  generateContentDashboardTextDrafts,
} from "./content-dashboard-client"
import {
  drafts,
  learningSignals,
  scheduledPosts,
  sourcePosts,
  workflowSteps,
} from "./content-dashboard-data"
import type { ContentDashboardSnapshot } from "./content-dashboard-contract"
import type {
  AssetGenerationProvider,
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
  ui: {
    connectedDestinationPages: string[]
    destinationDraft: string
    destinationPage: string | null
    destinationPickerOpen: boolean
    outsidePage: string | null
    outsidePagePickerOpen: boolean
    sourceMode: "destination" | "outside" | null
    sourcePickerOpen: boolean
    savedDraftId: string | null
    sourceDetailsOpen: boolean
    knownPagesOpen: boolean
  }
    generationInFlight: "title" | "caption" | "image" | "post" | null
    titleFeedback: string | null
    captionFeedback: string | null
    imageFeedback: string | null
    saveFeedback: string | null
  }
  workflow: {
    activeStep: "discover" | "create" | "review" | "schedule"
    statusMessage: string | null
  }
  scheduling: {
    targetPage: string
    scheduledFor: string
  }
}

export type FacebookContentDashboardStore = ReturnType<
  typeof createFacebookContentDashboardStore
>

const persistKey = "content-creation:state"

function preferredDraftForSource(
  allDrafts: DraftRecord[],
  sourceId: string,
): DraftRecord | undefined {
  return (
    allDrafts.find((draft) => draft.sourceId === sourceId) ??
    allDrafts[0]
  )
}

function availableMediaPathsForSource(
  allSourcePosts: SourcePostRecord[],
  source: SourcePostRecord,
): string[] {
  const unique = new Set<string>()
  const samePage = allSourcePosts.filter((post) => post.sourcePage === source.sourcePage)
  const samePattern = allSourcePosts.filter((post) => post.pattern === source.pattern)
  const pool = [source, ...samePage, ...samePattern, ...allSourcePosts]

  for (const post of pool) {
    if (post.mediaPath) {
      unique.add(post.mediaPath)
    }
  }

  return [...unique]
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mergeOptionLists(current: string[], next: string[]): string[] {
  return uniqueStrings([...next, ...current])
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createFacebookContentDashboardStore() {
  const defaultTargetPage =
    scheduledPosts[0]?.pageName ?? "Thin Blue Line Supporters"
  const defaultScheduledFor =
    scheduledPosts[0]?.scheduledFor ?? "2026-05-08 14:00 UTC"

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
    ui: {
      connectedDestinationPages: [],
      destinationDraft: "",
      destinationPage: null,
      destinationPickerOpen: true,
      outsidePage: null,
      outsidePagePickerOpen: false,
      sourceMode: null,
      sourcePickerOpen: false,
      savedDraftId: null,
      sourceDetailsOpen: false,
      knownPagesOpen: false,
    },
    workflow: {
      activeStep: "discover",
      statusMessage: "Pick a winning source post to start the workflow.",
    },
    scheduling: {
      targetPage: defaultTargetPage,
      scheduledFor: defaultScheduledFor,
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
    const nextDraftId = preferredDraftForSource(snapshot.drafts, nextSourceId)?.id ?? ""
    state$.selection.set({
      activeSourceId: nextSourceId,
      activeDraftId: nextDraftId,
    })
    state$.ui.set({
      connectedDestinationPages: [],
      destinationDraft: "",
      destinationPage: null,
      destinationPickerOpen: true,
      outsidePage: null,
      outsidePagePickerOpen: false,
      sourceMode: null,
      sourcePickerOpen: false,
      savedDraftId: null,
      sourceDetailsOpen: false,
      knownPagesOpen: false,
    })
    state$.workflow.set({
      activeStep: "discover",
      statusMessage: "Pick a winning source post to start the workflow.",
    })
    state$.scheduling.set({
      targetPage: snapshot.scheduledPosts[0]?.pageName ?? defaultTargetPage,
      scheduledFor:
        snapshot.scheduledPosts[0]?.scheduledFor ?? defaultScheduledFor,
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
    state$.ui.sourcePickerOpen.set(false)
    state$.ui.sourceDetailsOpen.set(false)
    const nextDraft = preferredDraftForSource(state$.drafts.get(), sourceId)
    if (nextDraft) {
      state$.selection.activeDraftId.set(nextDraft.id)
    }
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set(
      "Source selected. Review why it worked, then generate or choose a draft.",
    )
  }

  function selectDraft(draftId: string) {
    state$.selection.activeDraftId.set(draftId)
    state$.ui.savedDraftId.set(null)
    state$.workflow.activeStep.set("review")
    state$.workflow.statusMessage.set(
      "Draft selected. Review originality, tone, and approval readiness.",
    )
  }

  function generateDraftVariants() {
    const sourceId = state$.selection.activeSourceId.get()
    const source = state$.sourcePosts.get().find((post) => post.id === sourceId)
    if (!source) {
      return
    }

    const timestamp = Date.now()
    const currentDrafts = state$.drafts.get().filter((draft) => draft.sourceId === source.id)
    const activeDraftId = state$.selection.activeDraftId.get()
    const generatedDrafts: DraftRecord[] = [
      {
        id: `gen-${timestamp}-1`,
        sourceId: source.id,
        title: "Community",
        format: "image",
        stage: "draft",
        positioning: "Supportive, civic, family-safe",
        captionPreview: `Support looks strongest when it is visible in everyday community life. ${source.adaptationRule}`,
        goal: "Generate a high-share supportive derivative",
        originality: "81% transformed",
        tone: "warm, clear, civic",
        note:
          "Generated from the selected source with a stronger community-service lens.",
      },
      {
        id: `gen-${timestamp}-2`,
        sourceId: source.id,
        title: "Gratitude",
        format: "quote",
        stage: "draft",
        positioning: "Short gratitude-led statement",
        captionPreview: `Respect the people who keep showing up for our neighborhoods. ${source.hook}`,
        goal: "Fast-scrolling agreement post",
        originality: "77% transformed",
        tone: "brief, respectful, declarative",
        note: "Generated for low-friction reposting with more explicit gratitude.",
      },
      {
        id: `gen-${timestamp}-3`,
        sourceId: source.id,
        title: "Story",
        format: "story",
        stage: "draft",
        positioning: "Empathy and public-service framing",
        captionPreview: `${source.whyItWorked} Reframed into a safer, more original story-led draft for your page.`,
        goal: "Broader reach beyond core followers",
        originality: "86% transformed",
        tone: "protective, grounded, useful",
        note:
          "Generated to preserve the winning pattern while widening audience fit.",
      },
    ]

    const draftsToKeep = currentDrafts.filter(
      (draft) => !generatedDrafts.some((generated) => generated.title === draft.title),
    )
    const remainingDrafts = state$
      .drafts.get()
      .filter((draft) => draft.sourceId !== source.id)
    state$.drafts.set([...draftsToKeep, ...generatedDrafts, ...remainingDrafts])
    if (!activeDraftId) {
      state$.selection.activeDraftId.set(draftsToKeep[0]?.id ?? generatedDrafts[0].id)
    }
    state$.workflow.activeStep.set("review")
    state$.workflow.statusMessage.set(
      `Generated ${generatedDrafts.length} new draft variants from the selected winner.`,
    )
  }

  function generateTextVariants() {
    generateDraftVariants()
    state$.workflow.statusMessage.set("Generated a fresh set of text ideas.")
    persistStateNow()
  }

  function generateImageVariants() {
    const sourceId = state$.selection.activeSourceId.get()
    const source = state$.sourcePosts.get().find((post) => post.id === sourceId)
    if (!source) {
      return
    }

    const mediaPool = availableMediaPathsForSource(state$.sourcePosts.get(), source)
    if (mediaPool.length === 0) {
      return
    }

    let draftIndex = 0
    const offset = Date.now() % mediaPool.length
    state$.drafts.set(
      state$.drafts.get().map((draft): DraftRecord => {
        if (draft.sourceId !== source.id) {
          return draft
        }

        const nextMediaPath = mediaPool[(offset + draftIndex) % mediaPool.length]
        draftIndex += 1
        return {
          ...draft,
          previewMediaPath: nextMediaPath,
          note: "Preview image refreshed from the current inspiration set.",
        }
      }),
    )
    state$.ui.savedDraftId.set(null)
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set("Generated a fresh set of image ideas.")
    persistStateNow()
  }

  function moveDraftToReview() {
    const activeDraftId = state$.selection.activeDraftId.get()
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId ? { ...draft, stage: "review" } : draft,
        ),
    )
    state$.workflow.activeStep.set("review")
    state$.workflow.statusMessage.set(
      "Draft moved to review. Check originality, tone, and scheduling readiness.",
    )
  }

  function approveActiveDraft() {
    const activeDraftId = state$.selection.activeDraftId.get()
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId ? { ...draft, stage: "approved" } : draft,
        ),
    )
    state$.workflow.activeStep.set("schedule")
    state$.workflow.statusMessage.set(
      "Draft approved. Confirm page and time, then place it in the queue.",
    )
  }

  function sendBackToDraftStudio() {
    const activeDraftId = state$.selection.activeDraftId.get()
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId ? { ...draft, stage: "draft" } : draft,
        ),
    )
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set(
      "Draft returned to creation. Adjust the concept before review.",
    )
  }

  function setTargetPage(targetPage: string) {
    state$.scheduling.targetPage.set(targetPage)
  }

  function updateActiveDraftCaption(captionPreview: string) {
    const activeDraftId = state$.selection.activeDraftId.get()
    state$.ui.savedDraftId.set(null)
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId ? { ...draft, captionPreview } : draft,
        ),
    )
  }

  function chooseDestination(pageName: string, hasOwnPosts: boolean) {
    const existing = state$.ui.connectedDestinationPages.get()
    if (!existing.includes(pageName)) {
      state$.ui.connectedDestinationPages.set([pageName, ...existing])
    }
    state$.ui.destinationPage.set(pageName)
    state$.ui.destinationDraft.set("")
    state$.ui.destinationPickerOpen.set(false)
    state$.ui.knownPagesOpen.set(false)
    state$.ui.outsidePage.set(null)
    state$.ui.outsidePagePickerOpen.set(!hasOwnPosts)
    state$.ui.sourceMode.set(hasOwnPosts ? "destination" : "outside")
    state$.ui.sourcePickerOpen.set(hasOwnPosts)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.scheduling.targetPage.set(pageName)
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set(
      hasOwnPosts
        ? "Choose one of your top posts."
        : "Choose a source page with history.",
    )
  }

  function setDestinationDraft(destinationDraft: string) {
    state$.ui.destinationDraft.set(destinationDraft)
  }

  function connectDestinationPage() {
    const rawValue = state$.ui.destinationDraft.get().trim()
    if (!rawValue) {
      return
    }

    const existing = state$.ui.connectedDestinationPages.get()
    if (!existing.includes(rawValue)) {
      state$.ui.connectedDestinationPages.set([rawValue, ...existing])
    }

    state$.ui.destinationDraft.set("")
    state$.ui.destinationPage.set(rawValue)
    state$.ui.destinationPickerOpen.set(false)
    state$.ui.knownPagesOpen.set(false)
    state$.ui.outsidePage.set(null)
    state$.ui.outsidePagePickerOpen.set(true)
    state$.ui.sourceMode.set("outside")
    state$.ui.sourcePickerOpen.set(false)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.ui.savedDraftId.set(null)
    state$.scheduling.targetPage.set(rawValue)
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set("Choose a source page with history.")
  }

  function chooseOutsidePage(pageName: string) {
    state$.ui.outsidePage.set(pageName)
    state$.ui.outsidePagePickerOpen.set(false)
    state$.ui.sourceMode.set("outside")
    state$.ui.sourcePickerOpen.set(true)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set("Choose one source post.")
  }

  function openOutsidePagePicker() {
    state$.ui.outsidePagePickerOpen.set(true)
  }

  function setKnownPagesOpen(open: boolean) {
    state$.ui.knownPagesOpen.set(open)
  }

  function saveActiveDraft() {
    const activeDraftId = state$.selection.activeDraftId.get()
    if (!activeDraftId) {
      return
    }
    state$.ui.savedDraftId.set(activeDraftId)
    state$.workflow.activeStep.set("review")
    state$.workflow.statusMessage.set("Draft saved.")
  }

  function queueActiveDraft() {
    const activeDraftId = state$.selection.activeDraftId.get()
    if (!activeDraftId) {
      return
    }

    const activeDraft = state$
      .drafts.get()
      .find((draft) => draft.id === activeDraftId)
    if (!activeDraft) {
      return
    }

    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId ? { ...draft, stage: "approved" } : draft,
        ),
    )
    state$.scheduledPosts.set([
      {
        id: `sched-${Date.now()}`,
        pageName: state$.scheduling.targetPage.get(),
        creative: activeDraft.title,
        scheduledFor: state$.scheduling.scheduledFor.get(),
        stage: "scheduled",
      },
      ...state$.scheduledPosts.get(),
    ])
    state$.workflow.activeStep.set("schedule")
    state$.workflow.statusMessage.set("Draft queued.")
  }

  function setSourceDetailsOpen(open: boolean) {
    state$.ui.sourceDetailsOpen.set(open)
  }

  function reopenDestination() {
    state$.ui.destinationPickerOpen.set(true)
    state$.ui.outsidePagePickerOpen.set(false)
    state$.ui.sourcePickerOpen.set(false)
  }

  function reopenOutsidePage() {
    state$.ui.outsidePagePickerOpen.set(true)
    state$.ui.sourcePickerOpen.set(false)
  }

  function reopenSourceList() {
    state$.ui.sourcePickerOpen.set(true)
  }

  function setScheduledFor(scheduledFor: string) {
    state$.scheduling.scheduledFor.set(scheduledFor)
  }

  function scheduleActiveDraft() {
    const activeDraft = state$
      .drafts.get()
      .find((draft) => draft.id === state$.selection.activeDraftId.get())
    if (!activeDraft || activeDraft.stage !== "approved") {
      state$.workflow.statusMessage.set(
        "Approve the active draft before scheduling it.",
      )
      return
    }

    state$.scheduledPosts.set([
      {
        id: `sched-${Date.now()}`,
        pageName: state$.scheduling.targetPage.get(),
        creative: activeDraft.title,
        scheduledFor: state$.scheduling.scheduledFor.get(),
        stage: "scheduled",
      },
      ...state$.scheduledPosts.get(),
    ])
    state$.workflow.activeStep.set("schedule")
    state$.workflow.statusMessage.set(
      "Draft scheduled successfully. The queue now reflects the new slot.",
    )
  }

  return {
    state$,
    applySnapshot,
    setLoading,
    setError,
    setDestinationDraft,
    connectDestinationPage,
    chooseDestination,
    chooseOutsidePage,
    openOutsidePagePicker,
    setKnownPagesOpen,
    saveActiveDraft,
    queueActiveDraft,
    setSourceDetailsOpen,
    reopenDestination,
    reopenOutsidePage,
    reopenSourceList,
    selectSource,
    selectDraft,
    generateDraftVariants,
    generateTextVariants,
    generateImageVariants,
    moveDraftToReview,
    approveActiveDraft,
    sendBackToDraftStudio,
    setTargetPage,
    updateActiveDraftCaption,
    setScheduledFor,
    scheduleActiveDraft,
  }
}
