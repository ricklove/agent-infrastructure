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
    sourceListExpanded: boolean
    draftEditorOpen: boolean
    textGenerationProvider: Exclude<AssetGenerationProvider, "seed">
    imageGenerationProvider: Exclude<AssetGenerationProvider, "seed">
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

function firstAvailableOutsidePage(
  allSourcePosts: SourcePostRecord[],
  destinationPage: string,
): string | null {
  const page = allSourcePosts.find(
    (post) => post.sourcePage !== destinationPage,
  )?.sourcePage

  return page ?? null
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
      activeSourceId: "",
      activeDraftId: "",
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
      sourceListExpanded: false,
      draftEditorOpen: false,
      textGenerationProvider: "mock",
      imageGenerationProvider: "mock",
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

    state$.selection.set({
      activeSourceId: "",
      activeDraftId: "",
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
      sourceListExpanded: false,
      draftEditorOpen: false,
      textGenerationProvider: "mock",
      imageGenerationProvider: "mock",
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

  function persistStateNow() {
    if (typeof window === "undefined") {
      return
    }
    window.sessionStorage.setItem(
      persistKey,
      JSON.stringify(getPersistedState()),
    )
  }

  function getPersistedState() {
    return {
      drafts: state$.drafts.get(),
      scheduledPosts: state$.scheduledPosts.get(),
      selection: state$.selection.get(),
      ui: state$.ui.get(),
      workflow: state$.workflow.get(),
      scheduling: state$.scheduling.get(),
    }
  }

  function restorePersistedState(
    persisted: Partial<Pick<FacebookContentDashboardStoreState, "drafts" | "scheduledPosts" | "selection" | "ui" | "workflow" | "scheduling">>,
  ) {
    if (persisted.drafts) {
      state$.drafts.set(persisted.drafts)
    }
    if (persisted.scheduledPosts) {
      state$.scheduledPosts.set(persisted.scheduledPosts)
    }
    if (persisted.selection) {
      state$.selection.set(persisted.selection)
    }
    if (persisted.ui) {
      state$.ui.set({
        ...state$.ui.get(),
        ...persisted.ui,
      })
    }
    if (persisted.workflow) {
      state$.workflow.set({
        ...state$.workflow.get(),
        ...persisted.workflow,
      })
    }
    if (persisted.scheduling) {
      state$.scheduling.set({
        ...state$.scheduling.get(),
        ...persisted.scheduling,
      })
    }
  }

  function selectSource(sourceId: string) {
    state$.selection.activeSourceId.set(sourceId)
    state$.ui.sourcePickerOpen.set(false)
    state$.ui.sourceListExpanded.set(false)
    state$.ui.sourceDetailsOpen.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)

    const source = state$.sourcePosts.get().find((post) => post.id === sourceId)
    if (source) {
      const generatedDrafts = buildGeneratedDrafts(source, state$.ui.textGenerationProvider.get())
      const remainingDrafts = state$
        .drafts.get()
        .filter((draft) => draft.sourceId !== source.id)
      state$.drafts.set([...generatedDrafts, ...remainingDrafts])
      state$.selection.activeDraftId.set(generatedDrafts[0].id)
    } else {
      const nextDraft = preferredDraftForSource(state$.drafts.get(), sourceId)
      if (nextDraft) {
        state$.ui.savedDraftId.set(
          nextDraft.stage === "draft" ? null : nextDraft.id,
        )
        state$.selection.activeDraftId.set(nextDraft.id)
      }
    }
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set(
      "Source selected. Review why it worked, then generate or choose a draft.",
    )
    persistStateNow()
  }

  function selectDraft(draftId: string) {
    const selectedDraft = state$.drafts.get().find((draft) => draft.id === draftId)
    state$.selection.activeDraftId.set(draftId)
    state$.ui.savedDraftId.set(
      selectedDraft && selectedDraft.stage !== "draft" ? draftId : null,
    )
    state$.ui.draftEditorOpen.set(false)
    state$.workflow.activeStep.set("review")
    state$.workflow.statusMessage.set(
      "Draft selected. Review originality, tone, and approval readiness.",
    )
    persistStateNow()
  }

  function buildGeneratedDrafts(
    source: SourcePostRecord,
    provider: Exclude<AssetGenerationProvider, "seed">,
  ) {
    const timestamp = Date.now()
    return [
      {
        id: `gen-${timestamp}-1`,
        sourceId: source.id,
        title: `${source.title} · Community variant ${timestamp % 10000}`,
        format: "image",
        stage: "draft",
        positioning: "Supportive, civic, family-safe",
        captionPreview: `Support looks strongest when it is visible in everyday community life. ${source.adaptationRule}`,
        goal: "Generate a high-share supportive derivative",
        originality: provider === "codex" ? "Fresh Codex generation" : "81% transformed",
        tone: "warm, clear, civic",
        note:
          provider === "codex"
            ? "Generated by Codex for the selected source."
            : "Generated from the selected source with a stronger community-service lens.",
        previewMediaPath: source.mediaPath,
        textProvider: provider,
        imageProvider: "seed",
        generatedKind: "generated",
      },
      {
        id: `gen-${timestamp}-2`,
        sourceId: source.id,
        title: `${source.title} · Gratitude variant ${(timestamp + 1) % 10000}`,
        format: "quote",
        stage: "draft",
        positioning: "Short gratitude-led statement",
        captionPreview: `Respect the people who keep showing up for our neighborhoods. ${source.hook}`,
        goal: "Fast-scrolling agreement post",
        originality: provider === "codex" ? "Fresh Codex generation" : "77% transformed",
        tone: "brief, respectful, declarative",
        note:
          provider === "codex"
            ? "Generated by Codex for faster comparison against mock ideas."
            : "Generated for low-friction reposting with more explicit gratitude.",
        previewMediaPath: source.mediaPath,
        textProvider: provider,
        imageProvider: "seed",
        generatedKind: "generated",
      },
      {
        id: `gen-${timestamp}-3`,
        sourceId: source.id,
        title: `${source.title} · Story variant ${(timestamp + 2) % 10000}`,
        format: "story",
        stage: "draft",
        positioning: "Empathy and public-service framing",
        captionPreview: `${source.whyItWorked} Reframed into a safer, more original story-led draft for your page.`,
        goal: "Broader reach beyond core followers",
        originality: provider === "codex" ? "Fresh Codex generation" : "86% transformed",
        tone: "protective, grounded, useful",
        note:
          provider === "codex"
            ? "Generated by Codex with the current destination page context."
            : "Generated to preserve the winning pattern while widening audience fit.",
        previewMediaPath: source.mediaPath,
        textProvider: provider,
        imageProvider: "seed",
        generatedKind: "generated",
      },
    ] satisfies DraftRecord[]
  }

  async function generateDraftVariants() {
    const sourceId = state$.selection.activeSourceId.get()
    const source = state$.sourcePosts.get().find((post) => post.id === sourceId)
    if (!source) {
      return
    }

    const provider = state$.ui.textGenerationProvider.get()
    let generatedDrafts: DraftRecord[]

    if (provider === "mock") {
      generatedDrafts = buildGeneratedDrafts(source, provider)
    } else {
      try {
        generatedDrafts = await generateContentDashboardTextDrafts({
          provider,
          destinationPage: state$.scheduling.targetPage.get(),
          sourcePost: source,
        })
      } catch (error) {
        state$.workflow.statusMessage.set(
          error instanceof Error ? error.message : "Codex text generation failed.",
        )
        return
      }
    }

    const remainingDrafts = state$
      .drafts.get()
      .filter((draft) => draft.sourceId !== source.id)
    state$.drafts.set([...generatedDrafts, ...remainingDrafts])
    state$.selection.activeDraftId.set(generatedDrafts[0]?.id ?? "")
    state$.ui.savedDraftId.set(null)
    state$.ui.draftEditorOpen.set(false)
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set(
      provider === "mock"
        ? `Generated ${generatedDrafts.length} mock text ideas.`
        : `Generated ${generatedDrafts.length} Codex text ideas.`,
    )
    persistStateNow()
  }

  async function generateTextVariants() {
    await generateDraftVariants()
  }

  async function generateImageVariants() {
    const sourceId = state$.selection.activeSourceId.get()
    const source = state$.sourcePosts.get().find((post) => post.id === sourceId)
    const activeDraftId = state$.selection.activeDraftId.get()
    if (!source || !activeDraftId) {
      return
    }

    const provider = state$.ui.imageGenerationProvider.get()

    if (provider === "mock") {
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
            imageProvider: "mock",
            note: "Preview image refreshed from the current inspiration set.",
          }
        }),
      )
      state$.ui.savedDraftId.set(null)
      state$.workflow.activeStep.set("create")
      state$.workflow.statusMessage.set("Generated a fresh set of mock image ideas.")
      persistStateNow()
      return
    }

    const activeDraft = state$.drafts.get().find((draft) => draft.id === activeDraftId)
    if (!activeDraft) {
      return
    }

    try {
      const generated = await generateContentDashboardImageDraft({
        provider,
        destinationPage: state$.scheduling.targetPage.get(),
        sourcePost: source,
        draft: activeDraft,
      })
      state$.drafts.set(
        state$.drafts.get().map((draft): DraftRecord =>
          draft.id === activeDraftId
            ? {
                ...draft,
                previewMediaPath: generated.previewMediaPath ?? draft.previewMediaPath,
                imageProvider: generated.imageProvider ?? provider,
                note: generated.note ?? draft.note,
              }
            : draft,
        ),
      )
      state$.ui.savedDraftId.set(null)
      state$.workflow.activeStep.set("create")
      state$.workflow.statusMessage.set("Generated a fresh Codex image.")
      persistStateNow()
    } catch (error) {
      state$.workflow.statusMessage.set(
        error instanceof Error ? error.message : "Codex image generation failed.",
      )
    }
  }

  function setTextGenerationProvider(provider: Exclude<AssetGenerationProvider, "seed">) {
    state$.ui.textGenerationProvider.set(provider)
    persistStateNow()
  }

  function setImageGenerationProvider(provider: Exclude<AssetGenerationProvider, "seed">) {
    state$.ui.imageGenerationProvider.set(provider)
    persistStateNow()
  }

  function resetActiveDraftImage() {
    const activeDraftId = state$.selection.activeDraftId.get()
    const activeDraft = state$.drafts.get().find((draft) => draft.id === activeDraftId)
    if (!activeDraft) {
      return
    }
    const source = state$.sourcePosts.get().find((post) => post.id === activeDraft.sourceId)
    state$.drafts.set(
      state$.drafts.get().map((draft): DraftRecord =>
        draft.id === activeDraftId
          ? {
              ...draft,
              previewMediaPath: source?.mediaPath ?? draft.previewMediaPath,
              imageProvider: "seed",
              note: "Preview image reset to the source post image.",
            }
          : draft,
      ),
    )
    state$.workflow.statusMessage.set("Preview image reset.")
    persistStateNow()
  }

  function deleteActiveDraft() {
    const activeDraftId = state$.selection.activeDraftId.get()
    const activeDraft = state$.drafts.get().find((draft) => draft.id === activeDraftId)
    if (!activeDraft) {
      return
    }

    const remainingDrafts = state$.drafts.get().filter((draft) => draft.id !== activeDraftId)
    state$.drafts.set(remainingDrafts)
    const nextDraft = preferredDraftForSource(remainingDrafts, activeDraft.sourceId)
    state$.selection.activeDraftId.set(nextDraft?.id ?? "")
    state$.ui.savedDraftId.set(nextDraft?.stage && nextDraft.stage !== "draft" ? nextDraft.id : null)
    state$.workflow.statusMessage.set("Draft deleted.")
    persistStateNow()
  }

  function deleteGeneratedDraftsByProvider(provider: Exclude<AssetGenerationProvider, "seed">) {
    const activeSourceId = state$.selection.activeSourceId.get()
    const remainingDrafts = state$.drafts.get().filter((draft) => !(draft.sourceId === activeSourceId && draft.textProvider === provider && draft.generatedKind === "generated"))
    state$.drafts.set(remainingDrafts)
    const nextDraft = preferredDraftForSource(remainingDrafts, activeSourceId)
    state$.selection.activeDraftId.set(nextDraft?.id ?? "")
    state$.ui.savedDraftId.set(nextDraft?.stage && nextDraft.stage !== "draft" ? nextDraft.id : null)
    state$.workflow.statusMessage.set(`Deleted ${provider} generated drafts.`)
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
    state$.ui.draftEditorOpen.set(true)
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

    const outsidePage = hasOwnPosts
      ? null
      : firstAvailableOutsidePage(state$.sourcePosts.get(), pageName)

    state$.ui.destinationPage.set(pageName)
    state$.ui.destinationDraft.set("")
    state$.ui.destinationPickerOpen.set(false)
    state$.ui.knownPagesOpen.set(false)
    state$.ui.outsidePage.set(outsidePage)
    state$.ui.outsidePagePickerOpen.set(!hasOwnPosts && !outsidePage)
    state$.ui.sourceMode.set(hasOwnPosts ? "destination" : "outside")
    state$.ui.sourcePickerOpen.set(hasOwnPosts || Boolean(outsidePage))
    state$.ui.sourceListExpanded.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.scheduling.targetPage.set(pageName)
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set(
      hasOwnPosts
        ? "Choose one of your top posts."
        : outsidePage
          ? "Choose one source post."
          : "Choose a source page with history.",
    )
    persistStateNow()
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

    const outsidePage = firstAvailableOutsidePage(
      state$.sourcePosts.get(),
      rawValue,
    )

    state$.ui.destinationDraft.set("")
    state$.ui.destinationPage.set(rawValue)
    state$.ui.destinationPickerOpen.set(false)
    state$.ui.knownPagesOpen.set(false)
    state$.ui.outsidePage.set(outsidePage)
    state$.ui.outsidePagePickerOpen.set(!outsidePage)
    state$.ui.sourceMode.set("outside")
    state$.ui.sourcePickerOpen.set(Boolean(outsidePage))
    state$.ui.sourceListExpanded.set(false)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.ui.savedDraftId.set(null)
    state$.scheduling.targetPage.set(rawValue)
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set(
      outsidePage
        ? "Choose one source post."
        : "Choose a source page with history.",
    )
    persistStateNow()
  }

  function chooseOutsidePage(pageName: string) {
    state$.ui.outsidePage.set(pageName)
    state$.ui.outsidePagePickerOpen.set(false)
    state$.ui.sourceMode.set("outside")
    state$.ui.sourcePickerOpen.set(true)
    state$.ui.sourceListExpanded.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set("Choose one source post.")
    persistStateNow()
  }

  function openOutsidePagePicker() {
    state$.ui.outsidePagePickerOpen.set(true)
    state$.ui.sourcePickerOpen.set(false)
    state$.ui.sourceListExpanded.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
  }

  function setKnownPagesOpen(open: boolean) {
    state$.ui.knownPagesOpen.set(open)
  }

  function saveActiveDraft(draftId?: string) {
    const activeDraftId = draftId ?? state$.selection.activeDraftId.get()
    if (!activeDraftId) {
      return
    }
    state$.selection.activeDraftId.set(activeDraftId)
    state$.ui.savedDraftId.set(activeDraftId)
    state$.ui.draftEditorOpen.set(false)
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId
            ? { ...draft, stage: draft.stage === "approved" ? "approved" : "review" }
            : draft,
        ),
    )
    state$.workflow.activeStep.set("review")
    state$.workflow.statusMessage.set("Draft saved. Ready to queue.")
    persistStateNow()
  }

  function queueActiveDraft(draftId?: string) {
    const activeDraftId = draftId ?? state$.selection.activeDraftId.get()
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
    state$.ui.sourceListExpanded.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set("Choose a destination page.")
  }

  function reopenOutsidePage() {
    state$.ui.outsidePagePickerOpen.set(true)
    state$.ui.sourcePickerOpen.set(false)
    state$.ui.sourceListExpanded.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
  }

  function reopenSourceList() {
    state$.ui.sourcePickerOpen.set(true)
    state$.ui.sourceListExpanded.set(false)
    state$.ui.draftEditorOpen.set(false)
    state$.ui.savedDraftId.set(null)
    state$.selection.activeSourceId.set("")
    state$.selection.activeDraftId.set("")
    state$.workflow.activeStep.set("discover")
    state$.workflow.statusMessage.set("Choose one source post.")
    persistStateNow()
  }

  function setSourceListExpanded(expanded: boolean) {
    state$.ui.sourceListExpanded.set(expanded)
  }

  function setDraftEditorOpen(open: boolean, draftId?: string) {
    if (draftId) {
      state$.selection.activeDraftId.set(draftId)
    }
    state$.ui.draftEditorOpen.set(open)
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
    getPersistedState,
    restorePersistedState,
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
    setSourceListExpanded,
    setDraftEditorOpen,
    setTextGenerationProvider,
    setImageGenerationProvider,
    resetActiveDraftImage,
    deleteActiveDraft,
    deleteGeneratedDraftsByProvider,
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
