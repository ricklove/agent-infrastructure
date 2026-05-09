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
    titleOptions: string[]
    captionOptions: string[]
    imageOptions: string[]
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

function nextSchedulingSlot(): string {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const hh = String(date.getUTCHours()).padStart(2, "0")
  const mi = String(date.getUTCMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`
}

function parseScheduledUtc(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC$/)
  if (!match) {
    return null
  }
  const [, yyyy, mm, dd, hh, mi] = match
  return Date.UTC(int(yyyy), int(mm) - 1, int(dd), int(hh), int(mi))
}

function int(value: string): number {
  return Number.parseInt(value, 10)
}

function compactDraftTitleForOptions(draft: DraftRecord, source: SourcePostRecord | null): string {
  if (!source) {
    return draft.title
  }
  return draft.title.startsWith(source.title) ? draft.title : draft.title
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

function buildFieldOptions(
  source: SourcePostRecord | null,
  allSourcePosts: SourcePostRecord[],
  sourceDrafts: DraftRecord[],
  pageName: string,
): { titleOptions: string[]; captionOptions: string[]; imageOptions: string[] } {
  if (!source) {
    return { titleOptions: [], captionOptions: [], imageOptions: [] }
  }

  const titleOptions = uniqueStrings(sourceDrafts.map((draft) => compactDraftTitleForOptions(draft, source)))
  const captionOptions = uniqueStrings(sourceDrafts.map((draft) => draft.captionPreview))
  const imageOptions = uniqueStrings([source.mediaPath, ...availableMediaPathsForSource(allSourcePosts, source), ...sourceDrafts.map((draft) => draft.previewMediaPath)].filter((value): value is string => Boolean(value)))

  return {
    titleOptions,
    captionOptions,
    imageOptions,
  }
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

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildMockImagePreview(
  source: SourcePostRecord,
  caption: string,
  variantIndex: number,
  stamp: number,
): string {
  const palettes = [
    ["#1f2937", "#22c55e", "#86efac"],
    ["#172554", "#38bdf8", "#bae6fd"],
    ["#3f1d2e", "#f97316", "#fdba74"],
  ] as const
  const [bg, accent, accentSoft] = palettes[variantIndex % palettes.length]
  const title = escapeSvgText(source.title.slice(0, 56))
  const detail = escapeSvgText(caption.slice(0, 96))
  const badge = escapeSvgText(`MOCK VARIANT ${variantIndex + 1}`)
  const seed = String(stamp % 10000).padStart(4, "0")
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <rect width="1200" height="1200" fill="${bg}" />
      <rect x="72" y="72" width="1056" height="1056" rx="44" fill="#0a0a0a" fill-opacity="0.22" stroke="${accentSoft}" stroke-width="4" />
      <rect x="108" y="112" width="328" height="56" rx="28" fill="${accent}" />
      <text x="272" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${badge}</text>
      <text x="108" y="280" font-family="Arial, sans-serif" font-size="72" font-weight="800" fill="#ffffff">IMAGE TRANSFORM</text>
      <text x="108" y="360" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="${accentSoft}">${title}</text>
      <text x="108" y="470" font-family="Arial, sans-serif" font-size="34" font-weight="500" fill="#e5e7eb">${detail}</text>
      <rect x="108" y="930" width="984" height="8" rx="4" fill="${accent}" />
      <text x="108" y="1010" font-family="Arial, sans-serif" font-size="28" fill="#d4d4d8">Generated on worker · seed ${seed}</text>
    </svg>
  `.trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createFacebookContentDashboardStore() {
  const defaultTargetPage =
    scheduledPosts[0]?.pageName ?? "Thin Blue Line Supporters"
  const defaultScheduledFor = nextSchedulingSlot()

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
      titleOptions: [],
      captionOptions: [],
      imageOptions: [],
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
      titleOptions: [],
      captionOptions: [],
      imageOptions: [],
      textGenerationProvider: "mock",
      imageGenerationProvider: "mock",
    })
    state$.workflow.set({
      activeStep: "discover",
      statusMessage: "Pick a winning source post to start the workflow.",
    })
    state$.scheduling.set({
      targetPage: snapshot.scheduledPosts[0]?.pageName ?? defaultTargetPage,
      scheduledFor: defaultScheduledFor,
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

    const source = state$.sourcePosts.get().find((post) => post.id === sourceId) ?? null
    const sourceDrafts = state$.drafts.get().filter((draft) => draft.sourceId === sourceId)
    const fieldOptions = buildFieldOptions(
      source,
      state$.sourcePosts.get(),
      sourceDrafts,
      state$.scheduling.targetPage.get(),
    )
    state$.ui.titleOptions.set(fieldOptions.titleOptions)
    state$.ui.captionOptions.set(fieldOptions.captionOptions)
    state$.ui.imageOptions.set(fieldOptions.imageOptions)

    const existingDraft = preferredDraftForSource(state$.drafts.get(), sourceId)
    if (existingDraft) {
      state$.drafts.set(
        state$.drafts
          .get()
          .map((draft): DraftRecord =>
            draft.id === existingDraft.id ? { ...draft, stage: "draft" } : draft,
          ),
      )
      state$.ui.savedDraftId.set(null)
      state$.selection.activeDraftId.set(existingDraft.id)
      state$.workflow.statusMessage.set(
        "Source selected. Edit this draft or generate a fresh set.",
      )
    } else {
      state$.selection.activeDraftId.set("")
      state$.workflow.statusMessage.set(
        "Source selected. Generate text or image ideas to start a new draft.",
      )
    }
    state$.workflow.activeStep.set("create")
    persistStateNow()
  }

  function selectDraft(draftId: string) {
    const selectedDraft = state$.drafts.get().find((draft) => draft.id === draftId)
    state$.selection.activeDraftId.set(draftId)
    state$.ui.savedDraftId.set(
      selectedDraft && selectedDraft.stage !== "draft" ? draftId : null,
    )
    if (selectedDraft) {
      const source = state$.sourcePosts.get().find((post) => post.id === selectedDraft.sourceId) ?? null
      const sourceDrafts = state$.drafts.get().filter((draft) => draft.sourceId === selectedDraft.sourceId)
      const fieldOptions = buildFieldOptions(
        source,
        state$.sourcePosts.get(),
        sourceDrafts,
        state$.scheduling.targetPage.get(),
      )
      state$.ui.titleOptions.set(fieldOptions.titleOptions)
      state$.ui.captionOptions.set(fieldOptions.captionOptions)
      state$.ui.imageOptions.set(fieldOptions.imageOptions)
    }
    state$.ui.draftEditorOpen.set(true)
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set(
      "Draft selected. Edit the fields, save it, or queue it.",
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
        title: `[MOCK] ${source.title} · Community support`,
        format: "image",
        stage: "draft",
        positioning: "Supportive, civic, family-safe",
        captionPreview: `[MOCK TEXT VARIANT 1] Rebuilt from the source into a community-support message. ${source.adaptationRule}`,
        goal: "Generate a visibly transformed supportive derivative",
        originality: provider === "codex" ? "Fresh Codex generation" : "Mock transformation",
        tone: "warm, clear, civic",
        note:
          provider === "codex"
            ? "Generated by Codex for the selected source."
            : "Mock generation visibly transformed the source text.",
        previewMediaPath: buildMockImagePreview(source, "Mock community-support image treatment", 0, timestamp),
        textProvider: provider,
        imageProvider: provider === "mock" ? "mock" : "seed",
        generatedKind: "generated",
      },
      {
        id: `gen-${timestamp}-2`,
        sourceId: source.id,
        title: `[MOCK] ${source.title} · Gratitude statement`,
        format: "quote",
        stage: "draft",
        positioning: "Short gratitude-led statement",
        captionPreview: `[MOCK TEXT VARIANT 2] THANK YOU TO THE PEOPLE WHO KEEP SHOWING UP. ${source.hook.toUpperCase()}`,
        goal: "Fast-scrolling agreement post",
        originality: provider === "codex" ? "Fresh Codex generation" : "Mock transformation",
        tone: "brief, respectful, declarative",
        note:
          provider === "codex"
            ? "Generated by Codex for faster comparison against mock ideas."
            : "Mock generation converted the source into a loud gratitude-led variant.",
        previewMediaPath: buildMockImagePreview(source, "Mock gratitude-led image treatment", 1, timestamp),
        textProvider: provider,
        imageProvider: provider === "mock" ? "mock" : "seed",
        generatedKind: "generated",
      },
      {
        id: `gen-${timestamp}-3`,
        sourceId: source.id,
        title: `[MOCK] ${source.title} · Story-led perspective`,
        format: "story",
        stage: "draft",
        positioning: "Empathy and public-service framing",
        captionPreview: `[MOCK TEXT VARIANT 3] ${source.whyItWorked} This draft deliberately reframes the source into a more protective and story-led post for your page.`,
        goal: "Broader reach beyond core followers",
        originality: provider === "codex" ? "Fresh Codex generation" : "Mock transformation",
        tone: "protective, grounded, useful",
        note:
          provider === "codex"
            ? "Generated by Codex with the current destination page context."
            : "Mock generation widened the structure and visibly changed the source language.",
        previewMediaPath: buildMockImagePreview(source, "Mock story-led image treatment", 2, timestamp),
        textProvider: provider,
        imageProvider: provider === "mock" ? "mock" : "seed",
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

    try {
      generatedDrafts = await generateContentDashboardTextDrafts({
        provider,
        destinationPage: state$.scheduling.targetPage.get(),
        sourcePost: source,
      })
    } catch (error) {
      state$.workflow.statusMessage.set(
        error instanceof Error
          ? error.message
          : provider === "mock"
            ? "Mock text generation failed."
            : "Codex text generation failed.",
      )
      return
    }

    const existingSourceDrafts = state$
      .drafts.get()
      .filter((draft) => draft.sourceId === source.id)
    const remainingDrafts = state$
      .drafts.get()
      .filter((draft) => draft.sourceId !== source.id)
    const nextSourceDrafts = [...generatedDrafts, ...existingSourceDrafts]
    state$.drafts.set([...nextSourceDrafts, ...remainingDrafts])
    const fieldOptions = buildFieldOptions(
      source,
      state$.sourcePosts.get(),
      nextSourceDrafts,
      state$.scheduling.targetPage.get(),
    )
    state$.ui.titleOptions.set(fieldOptions.titleOptions)
    state$.ui.captionOptions.set(fieldOptions.captionOptions)
    state$.ui.imageOptions.set(fieldOptions.imageOptions)
    state$.selection.activeDraftId.set(generatedDrafts[0]?.id ?? "")
    state$.ui.savedDraftId.set(null)
    state$.ui.draftEditorOpen.set(false)
    state$.workflow.activeStep.set("create")
    state$.workflow.statusMessage.set(
      provider === "mock"
        ? `Generated ${generatedDrafts.length} mock text variants.`
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
      await delay(900)
      const stamp = Date.now()
      let draftIndex = 0
      const nextDrafts = state$.drafts.get().map((draft): DraftRecord => {
        if (draft.id !== activeDraftId) {
          return draft
        }

        const nextPreview = buildMockImagePreview(
          source,
          draft.captionPreview,
          draftIndex,
          stamp,
        )
        draftIndex += 1
        return {
          ...draft,
          previewMediaPath: nextPreview,
          imageProvider: "mock",
          note: "Mock image generation applied a visible preview transformation.",
        }
      })
      state$.drafts.set(nextDrafts)
      const sourceDrafts = nextDrafts.filter((draft) => draft.sourceId === source.id)
      const previousImageOptions = state$.ui.imageOptions.get()
      const fieldOptions = buildFieldOptions(
        source,
        state$.sourcePosts.get(),
        sourceDrafts,
        state$.scheduling.targetPage.get(),
      )
      state$.ui.titleOptions.set(fieldOptions.titleOptions)
      state$.ui.captionOptions.set(fieldOptions.captionOptions)
      state$.ui.imageOptions.set(
        mergeOptionLists(previousImageOptions, fieldOptions.imageOptions),
      )
      state$.ui.savedDraftId.set(null)
      state$.workflow.activeStep.set("create")
      state$.workflow.statusMessage.set("Generated a fresh set of mock image transformations.")
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
      const nextDrafts = state$.drafts.get().map((draft): DraftRecord =>
        draft.id === activeDraftId
          ? {
              ...draft,
              previewMediaPath: generated.previewMediaPath ?? draft.previewMediaPath,
              imageProvider: generated.imageProvider ?? provider,
              note: generated.note ?? draft.note,
            }
          : draft,
      )
      state$.drafts.set(nextDrafts)
      const sourceDrafts = nextDrafts.filter((draft) => draft.sourceId === source.id)
      const previousImageOptions = state$.ui.imageOptions.get()
      const fieldOptions = buildFieldOptions(
        source,
        state$.sourcePosts.get(),
        sourceDrafts,
        state$.scheduling.targetPage.get(),
      )
      state$.ui.titleOptions.set(fieldOptions.titleOptions)
      state$.ui.captionOptions.set(fieldOptions.captionOptions)
      state$.ui.imageOptions.set(
        mergeOptionLists(previousImageOptions, fieldOptions.imageOptions),
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

  function selectActiveDraftTitleOption(title: string) {
    updateActiveDraftTitle(title)
    state$.workflow.statusMessage.set("Title option applied.")
    persistStateNow()
  }

  function selectActiveDraftCaptionOption(captionPreview: string) {
    updateActiveDraftCaption(captionPreview)
    state$.workflow.statusMessage.set("Text option applied.")
    persistStateNow()
  }

  function selectActiveDraftImageOption(previewMediaPath: string) {
    updateActiveDraftPreviewMedia(previewMediaPath)
    state$.workflow.statusMessage.set("Image option applied.")
    persistStateNow()
  }

  function deleteDraftById(draftId: string) {
    const draft = state$.drafts.get().find((entry) => entry.id === draftId)
    if (!draft) {
      return
    }

    const remainingDrafts = state$.drafts.get().filter((entry) => entry.id !== draftId)
    state$.drafts.set(remainingDrafts)
    const source = state$.sourcePosts.get().find((post) => post.id === draft.sourceId) ?? null
    const sourceDrafts = remainingDrafts.filter((entry) => entry.sourceId === draft.sourceId)
    const fieldOptions = buildFieldOptions(
      source,
      state$.sourcePosts.get(),
      sourceDrafts,
      state$.scheduling.targetPage.get(),
    )
    state$.ui.titleOptions.set(fieldOptions.titleOptions)
    state$.ui.captionOptions.set(fieldOptions.captionOptions)
    state$.ui.imageOptions.set(fieldOptions.imageOptions)
    const nextDraft = preferredDraftForSource(remainingDrafts, draft.sourceId)
    state$.selection.activeDraftId.set(nextDraft?.id ?? "")
    state$.ui.savedDraftId.set(nextDraft?.stage && nextDraft.stage !== "draft" ? nextDraft.id : null)
    state$.workflow.statusMessage.set("Draft deleted.")
    persistStateNow()
  }

  function deleteActiveDraft() {
    const activeDraftId = state$.selection.activeDraftId.get()
    if (!activeDraftId) {
      return
    }
    deleteDraftById(activeDraftId)
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
          draft.id === activeDraftId ? { ...draft, captionPreview, stage: "draft" } : draft,
        ),
    )
  }

  function updateActiveDraftTitle(title: string) {
    const activeDraftId = state$.selection.activeDraftId.get()
    state$.ui.savedDraftId.set(null)
    state$.ui.draftEditorOpen.set(true)
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId ? { ...draft, title, stage: "draft" } : draft,
        ),
    )
  }

  function updateActiveDraftPreviewMedia(previewMediaPath: string) {
    const activeDraftId = state$.selection.activeDraftId.get()
    state$.ui.savedDraftId.set(null)
    state$.ui.draftEditorOpen.set(true)
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId
            ? { ...draft, previewMediaPath, imageProvider: "mock", stage: "draft" }
            : draft,
        ),
    )
  }

  async function generateFullPost() {
    await generateDraftVariants()
    if (!state$.selection.activeDraftId.get()) {
      return
    }
    await generateImageVariants()
    state$.workflow.statusMessage.set("Generated a fresh post set across text and image.")
    persistStateNow()
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
    state$.ui.draftEditorOpen.set(true)
    state$.drafts.set(
      state$.drafts
        .get()
        .map((draft): DraftRecord =>
          draft.id === activeDraftId
            ? { ...draft, stage: "approved" }
            : draft,
        ),
    )
    state$.workflow.activeStep.set("schedule")
    state$.workflow.statusMessage.set("Draft saved. Choose a time and queue it.")
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

    const scheduledFor = state$.scheduling.scheduledFor.get()
    const scheduledAt = parseScheduledUtc(scheduledFor)
    if (scheduledAt === null) {
      state$.workflow.statusMessage.set(
        "Enter a schedule time in YYYY-MM-DD HH:MM UTC format.",
      )
      return
    }
    if (scheduledAt <= Date.now()) {
      state$.workflow.statusMessage.set(
        "Choose a future UTC time before queueing this draft.",
      )
      return
    }

    state$.selection.activeDraftId.set(activeDraftId)
    state$.ui.savedDraftId.set(activeDraftId)
    state$.ui.draftEditorOpen.set(true)
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
        scheduledFor,
        stage: "scheduled",
      },
      ...state$.scheduledPosts.get(),
    ])
    state$.workflow.activeStep.set("schedule")
    state$.workflow.statusMessage.set("Draft queued.")
    persistStateNow()
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
    queueActiveDraft()
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
    deleteDraftById,
    selectSource,
    selectDraft,
    selectActiveDraftTitleOption,
    selectActiveDraftCaptionOption,
    selectActiveDraftImageOption,
    generateDraftVariants,
    generateTextVariants,
    generateImageVariants,
    moveDraftToReview,
    approveActiveDraft,
    sendBackToDraftStudio,
    setTargetPage,
    updateActiveDraftCaption,
    updateActiveDraftTitle,
    updateActiveDraftPreviewMedia,
    generateFullPost,
    setScheduledFor,
    scheduleActiveDraft,
  }
}
