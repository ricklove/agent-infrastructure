import { observer } from "@legendapp/state/react"
import { useEffect, useMemo, useState } from "react"
import { fetchContentDashboardSnapshot } from "./content-dashboard-client"
import { DraftEditorSurface } from "./components/DraftEditorSurface"
import { createFacebookContentDashboardStore } from "./content-dashboard-store"
import type { DraftRecord, SourcePostRecord } from "./content-dashboard-types"

export type FacebookContentDashboardScreenProps = {
  apiRootUrl?: string
}

const contentCreationRoute = "/content-creation"
const contentCreationDebugRoute = `${contentCreationRoute}/debug`
const contentCreationPersistKey = "content-creation:state"

type Store = ReturnType<typeof createFacebookContentDashboardStore>

export function FacebookContentDashboardScreen(
  props: FacebookContentDashboardScreenProps,
) {
  const [store] = useState(() => createFacebookContentDashboardStore())

  useEffect(() => {
    let cancelled = false

    async function loadSnapshot() {
      store.setLoading("sample")
      try {
        const loaded = await fetchContentDashboardSnapshot({
          apiRootUrl: props.apiRootUrl,
        })
        if (!cancelled) {
          store.applySnapshot(loaded.snapshot, loaded.mode, loaded.source)
          if (typeof window !== "undefined") {
            const persisted = window.sessionStorage.getItem(contentCreationPersistKey)
            if (persisted) {
              try {
                store.restorePersistedState(JSON.parse(persisted))
              } catch {}
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          store.setError(
            error instanceof Error ? error.message : "Snapshot loading failed.",
          )
        }
      }
    }

    void loadSnapshot()
    return () => {
      cancelled = true
    }
  }, [props.apiRootUrl, store])

  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith(contentCreationDebugRoute)
  ) {
    return <ContentCreationDebugScreen store={store} />
  }

  return <ContentCreationMainScreen store={store} />
}

const ContentCreationMainScreen = observer(function ContentCreationMainScreen(props: {
  store: Store
}) {
  const reactiveFrame = observeContentCreationFrame(props.store)
  const state = props.store.state$.get()
  const derived = useDerived(state)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1600,
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const onResize = () => setViewportWidth(window.innerWidth)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    window.sessionStorage.setItem(
      contentCreationPersistKey,
      JSON.stringify(props.store.getPersistedState()),
    )
  }, [props.store, state])

  const isWideDesktop = viewportWidth >= 1536
  const isMediumDesktop = viewportWidth >= 768
  const hasSelectedSource = Boolean(derived.selectedSource)
  const showScheduleRail = Boolean(
    derived.selectedDraft &&
      !state.scheduledPosts.find(
        (post) =>
          post.creative === derived.selectedDraft?.title &&
          post.pageName === state.scheduling.targetPage &&
          post.stage === "scheduled",
      ),
  )
  const mobileStage = hasSelectedSource ? "draft" : "browse"

  return (
    <PageShell title="Content Creation">
      <div data-reactive-frame={reactiveFrame} className="contents">
        <StatusBanner message={state.workflow.statusMessage} />
      {!isMediumDesktop ? (
        <div className="flex flex-col gap-4">
          {mobileStage === "browse" ? (
            <div className="flex flex-col gap-4">
              <DestinationPanel store={props.store} derived={derived} />
              <SourcePanel store={props.store} derived={derived} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <IconButton label="Back" onClick={() => props.store.reopenSourceList()}>
                    <BackIcon />
                  </IconButton>
                  {state.ui.destinationPage ? (
                    <div className="min-w-0 text-sm font-medium text-zinc-300">{state.ui.destinationPage}</div>
                  ) : null}
                </div>
                {derived.selectedSource ? (
                  <div className="truncate text-xs text-zinc-500">{derived.selectedSource.sourcePage}</div>
                ) : null}
              </div>
              <DraftPanel store={props.store} derived={derived} />
              <SchedulePanel store={props.store} derived={derived} />
            </div>
          )}
        </div>
      ) : null}

      {isMediumDesktop && !isWideDesktop ? (
        <div className="grid items-start gap-4 grid-cols-[300px_minmax(0,1fr)]">
          <div className="sticky top-[76px] flex max-h-[calc(100vh-96px)] flex-col gap-4 overflow-y-auto pr-1">
            <DestinationPanel store={props.store} derived={derived} />
            <SourcePanel store={props.store} derived={derived} />
          </div>
          <div className="min-w-0 flex flex-col gap-4">
            <DraftPanel store={props.store} derived={derived} />
            <SchedulePanel store={props.store} derived={derived} />
          </div>
        </div>
      ) : null}

      {isWideDesktop ? (
        <div
          className={[
            "grid items-start gap-5",
            showScheduleRail
              ? "grid-cols-[320px_minmax(0,760px)_320px]"
              : "grid-cols-[320px_minmax(0,760px)]",
          ].join(" ")}
        >
          <div className="sticky top-[76px] flex max-h-[calc(100vh-96px)] flex-col gap-4 overflow-y-auto pr-1">
            <DestinationPanel store={props.store} derived={derived} />
            <SourcePanel store={props.store} derived={derived} />
          </div>
          <div className="min-w-0">
            <DraftPanel store={props.store} derived={derived} />
          </div>
          {showScheduleRail ? (
            <div className="sticky top-[76px] min-w-0">
              <SchedulePanel store={props.store} derived={derived} />
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </PageShell>
  )
})

const ContentCreationDebugScreen = observer(function ContentCreationDebugScreen(props: {
  store: Store
}) {
  const pathname = typeof window === "undefined" ? contentCreationDebugRoute : window.location.pathname
  const parts = pathname.split("/").filter(Boolean)
  const debugIndex = parts.indexOf("debug")
  const componentSlug = parts[debugIndex + 1] ?? ""
  const scenarioSlug = parts[debugIndex + 2] ?? ""
  const scenarios = debugScenarios(props.store)
  const active = scenarios.find((entry) => entry.slug === componentSlug)
  const activeScenario = active?.scenarios.find((entry) => entry.slug === scenarioSlug)

  return (
    <PageShell title="Content Creation Debug">
      {!active ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((entry) => (
            <a
              key={entry.slug}
              href={`${contentCreationDebugRoute}/${entry.slug}`}
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 hover:border-zinc-700"
            >
              <div className="text-sm font-semibold text-zinc-100">{entry.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{entry.scenarios.length} scenarios</div>
            </a>
          ))}
        </div>
      ) : !activeScenario ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.scenarios.map((entry) => (
            <a
              key={entry.slug}
              href={`${contentCreationDebugRoute}/${active.slug}/${entry.slug}`}
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 hover:border-zinc-700"
            >
              <div className="text-sm font-semibold text-zinc-100">{entry.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{entry.slug}</div>
            </a>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] text-zinc-600">
            <a href={contentCreationDebugRoute} className="hover:text-zinc-300">components</a>
            <span>/</span>
            <a href={`${contentCreationDebugRoute}/${active.slug}`} className="hover:text-zinc-300">{active.slug}</a>
          </div>
          {activeScenario.render()}
        </div>
      )}
    </PageShell>
  )
})

function debugScenarios(store: Store) {
  return [
    {
      slug: "destination-page-selector",
      title: "Destination page selector",
      scenarios: [
        {
          slug: "existing-destinations",
          title: "Existing destinations",
          render: () => <FixtureDestination mode="existing" />,
        },
        {
          slug: "no-existing-destinations",
          title: "No existing destinations",
          render: () => <FixtureDestination mode="empty" />,
        },
        {
          slug: "selected-destination",
          title: "Selected destination",
          render: () => <FixtureDestination mode="selected" />,
        },
      ],
    },
    {
      slug: "source-page-selector",
      title: "Source page selector",
      scenarios: [
        {
          slug: "outside-pages",
          title: "Outside pages",
          render: () => <FixtureOutsidePages mode="picker" />,
        },
        {
          slug: "selected-source-page",
          title: "Selected source page",
          render: () => <FixtureOutsidePages mode="selected" />,
        },
      ],
    },
    {
      slug: "source-post-selector",
      title: "Source post selector",
      scenarios: [
        {
          slug: "destination-posts",
          title: "Destination posts",
          render: () => <FixtureDestinationPosts mode="destination" />,
        },
        {
          slug: "destination-posts-expanded",
          title: "Expanded destination posts",
          render: () => <FixtureDestinationPosts mode="destination-expanded" />,
        },
        {
          slug: "outside-posts",
          title: "Outside posts",
          render: () => <FixtureDestinationPosts mode="outside" />,
        },
      ],
    },
    {
      slug: "draft-ideas-panel",
      title: "Draft ideas panel",
      scenarios: [
        {
          slug: "single-idea",
          title: "Single idea",
          render: () => <FixtureDraftIdeas mode="single" />,
        },
        {
          slug: "multiple-ideas",
          title: "Multiple ideas",
          render: () => <FixtureDraftIdeas mode="multiple" />,
        },
        {
          slug: "saved-draft",
          title: "Saved draft",
          render: () => <FixtureDraftIdeas mode="saved" />,
        },
        {
          slug: "queued-draft",
          title: "Queued draft",
          render: () => <FixtureDraftIdeas mode="queued" />,
        },
      ],
    },
    {
      slug: "draft-editor-surface",
      title: "Draft editor surface",
      scenarios: [
        {
          slug: "editing",
          title: "Editing",
          render: () => <FixtureDraftEditorSurface mode="editing" />,
        },
        {
          slug: "saved",
          title: "Saved",
          render: () => <FixtureDraftEditorSurface mode="saved" />,
        },
        {
          slug: "queued",
          title: "Queued",
          render: () => <FixtureDraftEditorSurface mode="queued" />,
        },
      ],
    },
  ]
}

function createFixtureStore(
  scenario:
    | "destination-existing"
    | "destination-empty"
    | "destination-selected"
    | "outside-pages"
    | "outside-selected"
    | "destination-posts"
    | "destination-posts-expanded"
    | "outside-posts"
    | "draft-single"
    | "draft-ideas"
    | "draft-saved"
    | "draft-queued",
) {
  const store = createFacebookContentDashboardStore()

  store.reopenDestination()
  store.state$.ui.connectedDestinationPages.set([
    "Support Law Enforcement",
    "Thin Blue Line Supporters",
    "Community Safety Network",
  ])
  store.state$.ui.destinationPage.set(null)
  store.state$.ui.destinationDraft.set("")
  store.state$.ui.outsidePage.set(null)
  store.state$.ui.outsidePagePickerOpen.set(false)
  store.state$.ui.sourceMode.set(null)
  store.state$.ui.sourcePickerOpen.set(false)
  store.state$.ui.savedDraftId.set(null)
  store.state$.selection.activeSourceId.set("")
  store.state$.selection.activeDraftId.set("")

  if (scenario === "destination-empty") {
    store.state$.ui.connectedDestinationPages.set([])
    return store
  }

  if (scenario === "destination-existing") {
    return store
  }

  if (scenario === "destination-selected") {
    store.chooseDestination("Support Law Enforcement", true)
    store.state$.ui.sourcePickerOpen.set(false)
    return store
  }

  if (scenario === "outside-pages") {
    store.chooseDestination("Fresh Civic Page", false)
    return store
  }

  if (scenario === "outside-selected") {
    store.chooseDestination("Fresh Civic Page", false)
    store.chooseOutsidePage("Support Law Enforcement")
    store.state$.ui.sourcePickerOpen.set(false)
    return store
  }

  if (scenario === "destination-posts") {
    store.chooseDestination("Support Law Enforcement", true)
    return store
  }

  if (scenario === "destination-posts-expanded") {
    store.chooseDestination("Support Law Enforcement", true)
    store.setSourceListExpanded(true)
    return store
  }

  if (scenario === "outside-posts") {
    store.chooseDestination("Fresh Civic Page", false)
    store.chooseOutsidePage("Support Law Enforcement")
    store.state$.ui.sourcePickerOpen.set(true)
    return store
  }

  store.chooseDestination("Support Law Enforcement", true)
  const source = store.state$.sourcePosts
    .get()
    .find((post) => post.sourcePage === "Support Law Enforcement")
  if (source) {
    store.selectSource(source.id)
  }
  if (scenario === "draft-single") {
    return store
  }
  store.generateDraftVariants()
  if (scenario === "draft-saved") {
    store.saveActiveDraft()
  }
  if (scenario === "draft-queued") {
    store.saveActiveDraft()
    store.queueActiveDraft()
  }
  return store
}

const FixtureDestination = observer(function FixtureDestination(props: { mode: "existing" | "empty" | "selected" }) {
  const [store] = useState(() =>
    createFixtureStore(
      props.mode === "empty" ? "destination-empty" : props.mode === "selected" ? "destination-selected" : "destination-existing",
    ),
  )
  const reactiveFrame = observeContentCreationFrame(store)
  const derived = useDerived(store.state$.get())
  const nextDerived =
    props.mode === "empty"
      ? { ...derived, visibleDestinationPages: [] as string[] }
      : derived
  return <div data-reactive-frame={reactiveFrame}><DestinationPanel store={store} derived={nextDerived} /></div>
})

const FixtureOutsidePages = observer(function FixtureOutsidePages(props: { mode: "picker" | "selected" }) {
  const [store] = useState(() => createFixtureStore(props.mode === "selected" ? "outside-selected" : "outside-pages"))
  const reactiveFrame = observeContentCreationFrame(store)
  const derived = useDerived(store.state$.get())
  return <div data-reactive-frame={reactiveFrame}><SourcePanel store={store} derived={derived} /></div>
})

const FixtureDestinationPosts = observer(function FixtureDestinationPosts(props: { mode: "destination" | "destination-expanded" | "outside" }) {
  const [store] = useState(() =>
    createFixtureStore(
      props.mode === "outside"
        ? "outside-posts"
        : props.mode === "destination-expanded"
          ? "destination-posts-expanded"
          : "destination-posts",
    ),
  )
  const reactiveFrame = observeContentCreationFrame(store)
  const derived = useDerived(store.state$.get())
  return <div data-reactive-frame={reactiveFrame}><SourcePanel store={store} derived={derived} /></div>
})

const FixtureDraftEditorSurface = observer(function FixtureDraftEditorSurface(props: { mode: "editing" | "saved" | "queued" }) {
  const [store] = useState(() =>
    createFixtureStore(
      props.mode === "saved"
        ? "draft-saved"
        : props.mode === "queued"
          ? "draft-queued"
          : "draft-ideas",
    ),
  )
  const reactiveFrame = observeContentCreationFrame(store)
  const derived = useDerived(store.state$.get())
  const selectedDraft = derived.selectedDraft
  const selectedSource = derived.selectedSource
  if (!selectedDraft || !selectedSource) {
    return null
  }
  const queuedPost =
    props.mode === "queued"
      ? derived.state.scheduledPosts.find(
          (post) =>
            post.creative === selectedDraft.title &&
            post.pageName === derived.state.scheduling.targetPage &&
            post.stage === "scheduled",
        )
      : null
  const generationTag = selectedDraft.id.match(/gen-(\d+)-/)?.[1]?.slice(-4) ?? null
  const draftSaved =
    props.mode !== "editing" ||
    derived.ui.savedDraftId === selectedDraft.id ||
    selectedDraft.stage !== "draft"

  return (
    <div data-reactive-frame={reactiveFrame} className="flex flex-col gap-4">
      <DraftEditorSurface
        title={compactDraftTitle(selectedDraft, selectedSource)}
        subtitle={`${selectedDraft.format} · ${selectedDraft.positioning}`}
        generationTag={generationTag}
        draftSaved={draftSaved}
        caption={selectedDraft.captionPreview}
        onCaptionChange={(value) => store.updateActiveDraftCaption(value)}
        onGenerateText={() => store.generateTextVariants()}
        onGenerateImage={() => store.generateImageVariants()}
        onSave={() => store.saveActiveDraft(selectedDraft.id)}
        preview={<DraftCardPreview draft={selectedDraft} pageName={derived.ui.destinationPage ?? "Your page"} expanded />}
        queuedMeta={queuedPost ? `${queuedPost.pageName} · ${queuedPost.scheduledFor}` : null}
      />
    </div>
  )
})

const FixtureDraftIdeas = observer(function FixtureDraftIdeas(props: { mode: "single" | "multiple" | "saved" | "queued" }) {
  const [store] = useState(() =>
    createFixtureStore(
      props.mode === "single"
        ? "draft-single"
        : props.mode === "saved"
          ? "draft-saved"
          : props.mode === "queued"
            ? "draft-queued"
            : "draft-ideas",
    ),
  )
  const reactiveFrame = observeContentCreationFrame(store)
  const derived = useDerived(store.state$.get())
  return (
    <div data-reactive-frame={reactiveFrame} className="flex flex-col gap-4">
      <DraftPanel store={store} derived={derived} />
      <SchedulePanel store={store} derived={derived} />
    </div>
  )
})

function compactDraftTitle(draft: DraftRecord, selectedSource: SourcePostRecord | null): string {
  if (!selectedSource) {
    return draft.title
  }
  const prefix = `${selectedSource.title} · `
  return draft.title.startsWith(prefix) ? draft.title.slice(prefix.length) : draft.title
}

function useDerived(state: Store["state$"]["get"] extends () => infer T ? T : never) {
  const sourcePosts = state.sourcePosts
  const drafts = state.drafts
  const ui = state.ui
  const postsByPage = new Map<string, SourcePostRecord[]>()
  for (const post of sourcePosts) {
    const current = postsByPage.get(post.sourcePage) ?? []
    current.push(post)
    postsByPage.set(post.sourcePage, current)
  }
  const destinationPages = [...ui.connectedDestinationPages].sort(
    (left, right) =>
      (postsByPage.get(right)?.length ?? 0) - (postsByPage.get(left)?.length ?? 0),
  )
  const visibleDestinationPages =
    destinationPages.length > 0
      ? destinationPages
      : Array.from(postsByPage.keys()).slice(0, 4)
  const destinationPosts = ui.destinationPage ? postsByPage.get(ui.destinationPage) ?? [] : []
  const sourcePageOptions = Array.from(postsByPage.keys())
    .filter((page) => page !== ui.destinationPage)
    .sort(
      (left, right) =>
        (postsByPage.get(right)?.length ?? 0) - (postsByPage.get(left)?.length ?? 0),
    )
    .filter((page) => (postsByPage.get(page)?.length ?? 0) > 0)
  const activeSourcePosts =
    ui.sourceMode === "destination"
      ? destinationPosts
      : ui.sourceMode === "outside" && ui.outsidePage
        ? postsByPage.get(ui.outsidePage) ?? []
        : []
  const visibleSourcePosts =
    ui.sourcePickerOpen && !ui.sourceListExpanded
      ? activeSourcePosts.slice(0, 3)
      : activeSourcePosts
  const selectedSource =
    activeSourcePosts.find((post) => post.id === state.selection.activeSourceId) ??
    sourcePosts.find((post) => post.id === state.selection.activeSourceId) ??
    null
  const draftsForSelectedSource = selectedSource
    ? drafts.filter((draft) => draft.sourceId === selectedSource.id)
    : []
  const selectedDraft =
    draftsForSelectedSource.find((draft) => draft.id === state.selection.activeDraftId) ??
    draftsForSelectedSource[0] ??
    null

  return {
    state,
    ui,
    postsByPage,
    visibleDestinationPages,
    destinationPosts,
    sourcePageOptions,
    selectedSource,
    visibleSourcePosts,
    draftsForSelectedSource,
    selectedDraft,
  }
}

function observeContentCreationFrame(store: Store) {
  const draftStageKey = store.state$.drafts
    .get()
    .map((draft) => `${draft.id}:${draft.stage}`)
    .join("|")

  return [
    store.state$.selection.activeSourceId.get(),
    store.state$.selection.activeDraftId.get(),
    store.state$.ui.savedDraftId.get() ?? "",
    store.state$.ui.sourcePickerOpen.get() ? "source-open" : "source-closed",
    store.state$.ui.outsidePagePickerOpen.get() ? "outside-open" : "outside-closed",
    store.state$.ui.destinationPickerOpen.get() ? "destination-open" : "destination-closed",
    store.state$.workflow.activeStep.get(),
    store.state$.workflow.statusMessage.get() ?? "",
    draftStageKey,
  ].join("::")
}

function StatusBanner(props: { message: string | null }) {
  if (!props.message) {
    return null
  }

  const tone = props.message.includes("queued")
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
    : props.message.includes("saved")
      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
      : "border-zinc-800 bg-zinc-900/50 text-zinc-300"

  return (
    <div className={["rounded-lg border px-3 py-2 text-sm font-medium", tone].join(" ")}>{props.message}</div>
  )
}

function PageShell(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {props.title}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1980px] min-h-0 flex-col gap-4 px-4 pb-4 pt-16 sm:px-5 md:px-6 md:pt-4 2xl:px-8">
        {props.children}
      </div>
    </div>
  )
}

function DestinationPanel(props: { store: Store; derived: ReturnType<typeof useDerived> }) {
  const { ui, visibleDestinationPages, postsByPage, selectedSource, destinationPosts } = props.derived
  return (
    <Section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-100">Destination</div>
        {ui.destinationPage && !ui.destinationPickerOpen ? (
          <div className="text-[11px] text-zinc-500">{destinationPosts.length} top posts</div>
        ) : null}
      </div>
      {ui.destinationPickerOpen || !ui.destinationPage ? (
        <div className="flex flex-col gap-3">
          {visibleDestinationPages.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {visibleDestinationPages.map((page) => (
                <ChoiceCard
                  key={page}
                  title={page}
                  meta={`${(postsByPage.get(page) ?? []).length} top posts`}
                  onClick={() => props.store.chooseDestination(page, (postsByPage.get(page) ?? []).length > 0)}
                />
              ))}
            </div>
          ) : null}
          <div className={["flex flex-col gap-2", visibleDestinationPages.length > 0 ? "border-t border-zinc-800 pt-3" : ""].join(" ")}>
            <div className="flex items-center gap-2">
              <input
                value={ui.destinationDraft}
                onChange={(event) => props.store.setDestinationDraft(event.target.value)}
                placeholder="Page name or URL"
                className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-100 outline-none"
              />
              <IconButton label="Add page" onClick={() => props.store.connectDestinationPage()}><PlusIcon /></IconButton>
            </div>
          </div>
        </div>
      ) : (
        <SelectedCard
          title={ui.destinationPage}
          meta={`${destinationPosts.length} top posts`}
          onClick={() => props.store.reopenDestination()}
        />
      )}
    </Section>
  )
}

function SourcePanel(props: { store: Store; derived: ReturnType<typeof useDerived> }) {
  const { ui, destinationPosts, sourcePageOptions, postsByPage, selectedSource, visibleSourcePosts } = props.derived
  const outsidePosts = ui.outsidePage ? postsByPage.get(ui.outsidePage) ?? [] : []
  const showingDestinationPosts =
    ui.destinationPage && destinationPosts.length > 0 && ui.sourceMode === "destination"
  const destinationTopScore = destinationPosts[0]?.score ?? 0
  const outsideTopScore = outsidePosts[0]?.score ?? 0
  const showingOutsidePicker =
    ui.destinationPage &&
    !ui.outsidePage &&
    (destinationPosts.length === 0 || ui.outsidePagePickerOpen)
  const showingOutsidePosts = ui.sourceMode === "outside" && ui.outsidePage

  return (
    <div className="flex flex-col gap-4">
      {showingDestinationPosts ? (
        <Section>
          {ui.sourcePickerOpen || !selectedSource || selectedSource.sourcePage !== ui.destinationPage ? (
            <div className="flex flex-col gap-2">
              {visibleSourcePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  active={post.id === props.derived.state.selection.activeSourceId}
                  onClick={() => props.store.selectSource(post.id)}
                />
              ))}
              {ui.sourcePickerOpen && !ui.sourceListExpanded && destinationPosts.length > visibleSourcePosts.length ? (
                <div className="mt-3 flex justify-center">
                  <ExpandButton
                    count={destinationPosts.length - visibleSourcePosts.length}
                    onClick={() => props.store.setSourceListExpanded(true)}
                  />
                </div>
              ) : null}
            </div>
          ) : selectedSource ? (
            <CompactSelectedSourceCard post={selectedSource} onClick={() => props.store.reopenSourceList()} />
          ) : null}
        </Section>
      ) : null}

      {showingOutsidePicker ? (
        <Section>
          {!ui.outsidePage ? (
            <div className="grid gap-2 md:grid-cols-2">
              {sourcePageOptions.map((page) => (
                <ChoiceCard
                  key={page}
                  title={page}
                  meta={(postsByPage.get(page) ?? []).length + " top posts"}
                  onClick={() => props.store.chooseOutsidePage(page)}
                />
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}
      {showingOutsidePosts ? (
        <Section>
          {ui.sourcePickerOpen || !selectedSource || selectedSource.sourcePage !== ui.outsidePage ? (
            <div className="flex flex-col gap-3">
              <ContextCard
                title={ui.outsidePage ?? ""}
                meta={`${outsidePosts.length} top posts`}
                onClick={() => props.store.reopenOutsidePage()}
              />
              {destinationPosts.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
                    <div className="text-[11px] text-zinc-500">{ui.destinationPage}</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{destinationPosts.length} winners</div>
                    <div className="mt-1 text-[11px] text-zinc-400">top score {formatCompactCount(destinationTopScore)}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
                    <div className="text-[11px] text-zinc-500">{ui.outsidePage}</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{outsidePosts.length} winners</div>
                    <div className="mt-1 text-[11px] text-zinc-400">top score {formatCompactCount(outsideTopScore)}</div>
                  </div>
                </div>
              ) : null}
              <div className="border-t border-zinc-800 pt-3">
                <div className="flex flex-col gap-2">
                  {visibleSourcePosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      active={post.id === props.derived.state.selection.activeSourceId}
                      onClick={() => props.store.selectSource(post.id)}
                    />
                  ))}
                </div>
                {ui.sourcePickerOpen && !ui.sourceListExpanded && outsidePosts.length > visibleSourcePosts.length ? (
                  <div className="mt-3 flex justify-center">
                    <ExpandButton
                      count={outsidePosts.length - visibleSourcePosts.length}
                      onClick={() => props.store.setSourceListExpanded(true)}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : selectedSource ? (
            <div className="flex flex-col gap-3">
              <ContextCard
                title={ui.outsidePage ?? ""}
                meta={`${outsidePosts.length} top posts`}
                onClick={() => props.store.reopenOutsidePage()}
              />
              <CompactSelectedSourceCard post={selectedSource} onClick={() => props.store.reopenSourceList()} />
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  )
}

function DraftPanel(props: { store: Store; derived: ReturnType<typeof useDerived> }) {
  const { selectedSource, draftsForSelectedSource, selectedDraft, ui, state } = props.derived
  if (!selectedSource) {
    return <Section className="min-h-[240px]" />
  }

  const alternativeDrafts = selectedDraft
    ? draftsForSelectedSource.filter((draft) => draft.id !== selectedDraft.id)
    : draftsForSelectedSource
  const draftSaved = Boolean(
    selectedDraft &&
      (ui.savedDraftId === selectedDraft.id || selectedDraft.stage !== "draft"),
  )
  const savedDraft = ui.savedDraftId
    ? state.drafts.find((draft) => draft.id === ui.savedDraftId) ?? null
    : null
  const queuedPost = selectedDraft
    ? state.scheduledPosts.find(
        (post) =>
          post.creative === selectedDraft.title &&
          post.pageName === state.scheduling.targetPage &&
          post.stage === "scheduled",
      )
    : undefined
  const generationTag = selectedDraft?.id.match(/gen-(\d+)-/)?.[1]?.slice(-4) ?? null

  return (
    <div className="flex min-w-0 flex-col gap-4 items-start">
      <Section>
        <div className="flex w-full max-w-[840px] flex-col gap-4">
          <CompactSelectedSourceCard post={selectedSource} onClick={() => props.store.reopenSourceList()} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-zinc-300">{selectedSource.pattern}</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-zinc-300">{selectedSource.angle}</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-zinc-400">{formatCompactCount(selectedSource.score)} score</span>
            </div>
            <button
              type="button"
              onClick={() => props.store.setSourceDetailsOpen(!ui.sourceDetailsOpen)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700"
            >
              <span>{ui.sourceDetailsOpen ? "Hide details" : "Source details"}</span>
              <span className={ui.sourceDetailsOpen ? "rotate-180 transition-transform" : "transition-transform"}><ChevronDownIcon /></span>
            </button>
          </div>
          {ui.sourceDetailsOpen ? (
            <div className="grid gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-3 text-sm leading-6">
              <div className="text-zinc-200">{selectedSource.whyItWorked}</div>
              <div className="text-zinc-400">{selectedSource.adaptationRule}</div>
              <div className="text-amber-200/70">{selectedSource.caution}</div>
            </div>
          ) : null}
          {selectedDraft ? (
            <>
              {savedDraft ? (
                <div className={[
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
                  savedDraft.id === selectedDraft.id
                    ? "border-cyan-500/30 bg-cyan-500/10"
                    : "border-zinc-800 bg-zinc-900/40",
                ].join(" ")}>
                  <div className="min-w-0">
                    <div className={savedDraft.id === selectedDraft.id ? "text-sm font-semibold text-cyan-100" : "text-sm font-semibold text-zinc-200"}>
                      Saved draft
                    </div>
                    <div className="mt-1 truncate text-xs text-zinc-400">{savedDraft.title}</div>
                  </div>
                  <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
                    {savedDraft.id === selectedDraft.id ? "current" : "previous"}
                  </div>
                </div>
              ) : null}
              <DraftEditorSurface
                title={compactDraftTitle(selectedDraft, selectedSource)}
                subtitle={`${selectedDraft.format} · ${selectedDraft.positioning}`}
                generationTag={generationTag}
                draftSaved={draftSaved}
                caption={selectedDraft.captionPreview}
                onCaptionChange={(value) => props.store.updateActiveDraftCaption(value)}
                onGenerateText={() => props.store.generateTextVariants()}
                onGenerateImage={() => props.store.generateImageVariants()}
                onSave={() => props.store.saveActiveDraft(selectedDraft.id)}
                preview={<DraftCardPreview draft={selectedDraft} pageName={ui.destinationPage ?? "Your page"} expanded />}
                queuedMeta={queuedPost ? `${queuedPost.pageName} · ${queuedPost.scheduledFor}` : null}
              />
              {alternativeDrafts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-100">Alternatives</div>
                    {generationTag ? (
                      <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500">
                        set {generationTag}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => props.store.generateTextVariants()}
                      className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700"
                    >
                      Regenerate set
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {alternativeDrafts.map((draft) => (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => props.store.selectDraft(draft.id)}
                        className="flex min-w-[240px] max-w-[240px] shrink-0 flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left transition hover:border-zinc-700"
                      >
                        <img
                          src={draftPreviewImage(draft, ui.destinationPage ?? "Your page")}
                          alt={draft.title}
                          className="h-28 w-full rounded-md border border-zinc-800 object-cover"
                        />
                        <div className="text-sm font-semibold text-zinc-100">{compactDraftTitle(draft, selectedSource)}</div>
                        <div className="line-clamp-4 text-sm leading-5 text-zinc-300">{draft.captionPreview}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
function SchedulePanel(props: { store: Store; derived: ReturnType<typeof useDerived> }) {
  const { selectedDraft, ui, state } = props.derived
  if (!selectedDraft) {
    return null
  }

  const queuedPost = state.scheduledPosts.find(
    (post) =>
      post.creative === selectedDraft.title &&
      post.pageName === state.scheduling.targetPage &&
      post.stage === "scheduled",
  )

  if (queuedPost) {
    return null
  }

  return (
    <Section>
      <div className="grid gap-3 sm:grid-cols-1">
        <div className="grid gap-3">
          <select
            value={state.scheduling.targetPage}
            onChange={(event) => props.store.setTargetPage(event.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm text-zinc-100 outline-none"
          >
            {state.ui.connectedDestinationPages.length > 0
              ? state.ui.connectedDestinationPages.map((pageName) => (
                  <option key={pageName} value={pageName}>
                    {pageName}
                  </option>
                ))
              : [state.scheduling.targetPage].map((pageName) => (
                  <option key={pageName} value={pageName}>
                    {pageName}
                  </option>
                ))}
          </select>
          <input
            type="text"
            value={state.scheduling.scheduledFor}
            onChange={(event) => props.store.setScheduledFor(event.target.value)}
            placeholder="When"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm text-zinc-100 outline-none"
          />
        </div>
        <div className="flex justify-end">
          <IconButton label="Queue draft" onClick={() => props.store.queueActiveDraft(selectedDraft.id)} tone="success"><QueueIcon /></IconButton>
        </div>
      </div>
    </Section>
  )
}

function Section(props: { children?: React.ReactNode; className?: string }) {
  return (
    <section className={["rounded-xl border border-zinc-800 bg-zinc-900/70 p-4", props.className ?? ""].join(" ")}>
      {props.children}
    </section>
  )
}

function IconButton(props: {
  children: React.ReactNode
  label: string
  onClick: () => void
  tone?: "default" | "success"
}) {
  const tone = props.tone ?? "default"
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className={[
        "flex h-9 w-9 items-center justify-center rounded-lg border transition",
        tone === "success"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100",
      ].join(" ")}
    >
      {props.children}
    </button>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 3.5 5.5 8l5 4.5" />
      <path d="M6 8h4.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 3.5v9" />
      <path d="M3.5 8h9" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5 2.5 5.5 8 8.5l5.5-3L8 2.5Z" />
      <path d="M2.5 8.25 8 11.25l5.5-3" />
      <path d="M2.5 11 8 14l5.5-3" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5.5V2.75H10.25" />
      <path d="M13 2.75 9.75 6" />
      <path d="M12 8A4 4 0 1 1 8 4" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.25 11.75 3.75 9l6.9-6.9a1.25 1.25 0 0 1 1.77 0l1.48 1.48a1.25 1.25 0 0 1 0 1.77L7 12.25l-2.75.5Z" />
      <path d="M9.75 3 13 6.25" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.25 3.25h7.5v9.5L8 10.5l-3.75 2.25v-9.5Z" />
    </svg>
  )
}

function ExpandButton(props: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => { event.preventDefault(); props.onClick() }}
      onClick={props.onClick}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
    >
      <ChevronDownIcon />
      <span>{props.count} more</span>
    </button>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4.5 6.5 3.5 3 3.5-3" />
    </svg>
  )
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.25h10" />
      <path d="M3 8h10" />
      <path d="M3 11.75h6.5" />
      <path d="m11 10.25 2 1.75 3-3.25" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 8.5 2.75 2.75 6-6" />
    </svg>
  )
}

function ChoiceCard(props: { title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => { event.preventDefault(); props.onClick() }}
      onClick={props.onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-left hover:border-zinc-700"
    >
      <div>
        <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      <span className="text-zinc-500">›</span>
    </button>
  )
}

function ContextCard(props: { title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => { event.preventDefault(); props.onClick() }}
      onClick={props.onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/10 px-3 py-2 text-left transition hover:border-zinc-700 hover:bg-zinc-950/20"
    >
      <div>
        <div className="text-sm font-semibold text-zinc-200">{props.title}</div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      <span className="text-zinc-600">•</span>
    </button>
  )
}

function SelectedCard(props: {
  title: string
  meta: string
  onClick: () => void
  tone?: "active" | "context"
}) {
  const tone = props.tone ?? "active"
  return (
    <button
      type="button"
      onPointerDown={(event) => { event.preventDefault(); props.onClick() }}
      onClick={props.onClick}
      className={[
        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition",
        tone === "active"
          ? "border border-cyan-500/30 bg-cyan-500/[0.08] hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
          : "border border-zinc-800/80 bg-zinc-950/20 hover:border-zinc-700 hover:bg-zinc-950/30",
      ].join(" ")}
    >
      <div>
        <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      {tone === "active" ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-200"><EditIcon /></div>
      ) : (
        <span className="text-zinc-600">•</span>
      )}
    </button>
  )
}

function SelectedSourceCard(props: { post: SourcePostRecord; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
    >
      <SourcePostPreview post={props.post} />
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
        <span>{formatCompactFeedDate(props.post.publishDate)}</span>
        <div className="flex items-center gap-3 text-zinc-500">
          <span>{formatCompactCount(props.post.likes)} likes</span>
          <span>{formatCompactCount(props.post.comments)} comments</span>
          <span>{formatCompactCount(props.post.shares)} shares</span>
        </div>
      </div>
    </button>
  )
}

function CompactSelectedSourceCard(props: { post: SourcePostRecord; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex w-full max-w-[760px] items-start gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
    >
      <img
        src={sourcePostPreviewImage(props.post)}
        alt={props.post.title}
        className="h-16 w-16 shrink-0 rounded-md border border-zinc-800 object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
          <span className="truncate font-medium text-zinc-200">{props.post.sourcePage}</span>
          <span>{formatCompactFeedDate(props.post.publishDate)}</span>
        </div>
        <div className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-100">
          {sourcePostPrimaryText(props.post)}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
          <span>{formatCompactCount(props.post.likes)} likes</span>
          <span>{formatCompactCount(props.post.comments)} comments</span>
          <span>{formatCompactCount(props.post.shares)} shares</span>
        </div>
      </div>
    </button>
  )
}

function PostCard(props: { post: SourcePostRecord; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "w-full rounded-lg border px-3 py-3 text-left transition",
        props.active
          ? "border-cyan-500/40 bg-cyan-500/10"
          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <img
          src={sourcePostPreviewImage(props.post)}
          alt={props.post.title}
          className="mt-0.5 block h-24 w-20 shrink-0 rounded-md border border-zinc-800 object-cover sm:h-28 sm:w-24"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
            <span className="truncate font-medium text-zinc-300">{props.post.sourcePage}</span>
            <span>{formatFacebookDate(props.post.publishDate)}</span>
          </div>
          <div className="mt-2 line-clamp-4 text-sm leading-5 text-zinc-100">
            {sourcePostPrimaryText(props.post)}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-zinc-500">
            <span>{formatCompactCount(props.post.likes)} likes</span>
            <span>{formatCompactCount(props.post.comments)} comments</span>
            <span>{formatCompactCount(props.post.shares)} shares</span>
          </div>
        </div>
      </div>
    </button>
  )
}

function SourcePostPreview(props: { post: SourcePostRecord }) {
  const previewImage = sourcePostPreviewImage(props.post)
  const previewText = sourcePostPrimaryText(props.post)
  const previewLink = sourcePostSecondaryText(props.post)
  return (
    <div className="mb-3 w-full max-w-[680px] overflow-hidden rounded-[18px] border border-slate-300 bg-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-4 py-3">
        <div className="w-8" />
        <div className="text-[18px] font-semibold text-slate-900">{props.post.sourcePage}'s Post</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1877f2] text-[22px] leading-none text-[#1877f2]">×</div>
      </div>
      <div className="bg-white">
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1877f2] text-sm font-semibold text-white">
          {pageInitials(props.post.sourcePage)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold text-slate-900">
            {props.post.sourcePage}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
            <span>{formatFacebookDate(props.post.publishDate)}</span>
            <span>·</span>
            <span>Shared with Public</span>
          </div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-5 text-slate-900">
          {previewText}
        </div>
        {previewLink ? (
          <div className="mt-2 truncate text-[12px] text-slate-500">{previewLink}</div>
        ) : null}
      </div>
      <div className="overflow-hidden border-y border-slate-200 bg-black">
        <img
          src={previewImage}
          alt={props.post.title}
          className="block aspect-[4/5] w-full object-contain"
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-slate-500">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">👍</div>
          <span>{formatCompactCount(props.post.likes)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{formatCompactCount(props.post.comments)} comments</span>
          <span>{formatCompactCount(props.post.shares)} shares</span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-slate-200 text-[14px] font-medium text-slate-500">
        <div className="flex items-center justify-center gap-2 px-3 py-2.5">👍 <span>Like</span></div>
        <div className="flex items-center justify-center gap-2 border-l border-slate-200 px-3 py-2.5">💬 <span>Comment</span></div>
        <div className="flex items-center justify-center gap-2 border-l border-slate-200 px-3 py-2.5">↗ <span>Share</span></div>
      </div>
      </div>
    </div>
  )
}

function DraftCardPreview(props: { draft: DraftRecord; pageName?: string; expanded?: boolean }) {
  const pageName = props.pageName ?? "Your page"
  const previewImage = draftPreviewImage(props.draft, pageName)
  return (
    <div
      className={[
        "w-full max-w-[680px] overflow-hidden rounded-[18px] border border-slate-300 bg-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.18)]",
        props.expanded ? "mb-1" : "mb-3",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-4 py-3">
        <div className="w-8" />
        <div className="text-[18px] font-semibold text-slate-900">{pageName}'s Post</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1877f2] text-[22px] leading-none text-[#1877f2]">×</div>
      </div>
      <div className="bg-white">
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1877f2] text-sm font-semibold uppercase text-white">
          {pageInitials(pageName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold text-slate-900">
            {pageName}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
            <span>now</span>
            <span>·</span>
            <span>Public</span>
          </div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className={[props.expanded ? "line-clamp-5" : "line-clamp-3", "text-[15px] leading-5 text-slate-900"].join(" ")}>
          {props.draft.captionPreview}
        </div>
      </div>
      <div className="overflow-hidden border-y border-slate-200 bg-black">
        <img
          src={previewImage}
          alt={props.draft.title}
          className={[
            "block w-full object-contain",
            props.expanded ? "aspect-[16/10]" : "aspect-[4/5]",
          ].join(" ")}
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-slate-500">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">👍</div>
          <span>0</span>
        </div>
        <div className="flex items-center gap-3">
          <span>0 comments</span>
          <span>0 shares</span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-slate-200 text-[14px] font-medium text-slate-500">
        <div className="flex items-center justify-center gap-2 px-3 py-2.5">👍 <span>Like</span></div>
        <div className="flex items-center justify-center gap-2 border-l border-slate-200 px-3 py-2.5">💬 <span>Comment</span></div>
        <div className="flex items-center justify-center gap-2 border-l border-slate-200 px-3 py-2.5">↗ <span>Share</span></div>
      </div>
      </div>
    </div>
  )
}

function formatCompactCount(value: number): string {
  if (value >= 1000) {
    const compact = value / 1000
    return `${compact >= 10 ? compact.toFixed(0) : compact.toFixed(1)}K`
  }
  return String(value)
}

function formatFacebookDate(value: string): string {
  const date = new Date(value)
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" })
  const day = date.getUTCDate()
  const hours24 = date.getUTCHours()
  const minutes = date.getUTCMinutes().toString().padStart(2, "0")
  const suffix = hours24 >= 12 ? "PM" : "AM"
  const hours12 = ((hours24 + 11) % 12) + 1
  return `${month} ${day} at ${hours12}:${minutes} ${suffix}`
}

function formatCompactFeedDate(value: string): string {
  const date = new Date(value)
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
  const day = date.getUTCDate()
  return `${month} ${day}`
}

function sourcePostPrimaryText(post: SourcePostRecord): string {
  return post.hook || post.title
}

function sourcePostSecondaryText(post: SourcePostRecord): string | null {
  return post.sourceUrl ?? post.postUrl ?? null
}
function sourcePostPreviewTone(pattern: string): string {
  if (pattern.includes("graphic")) {
    return "bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.26),_transparent_34%),linear-gradient(135deg,_rgb(8,47,73),_rgb(24,24,27)_58%,_rgb(63,63,70))]"
  }
  if (pattern.includes("story")) {
    return "bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.22),_transparent_30%),linear-gradient(135deg,_rgb(92,45,12),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
  }
  return "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_30%),linear-gradient(135deg,_rgb(22,78,99),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
}

function sourcePostPreviewImage(post: SourcePostRecord): string {
  if (post.mediaPath) {
    return contentDashboardMediaUrl(post.mediaPath)
  }
  return socialPreviewDataUri({
    title: post.title,
    subtitle: post.sourcePage,
    badge: `${post.shares.toLocaleString()} shares`,
    tone: post.pattern.includes("graphic")
      ? "cyan"
      : post.pattern.includes("story")
        ? "amber"
        : "emerald",
    media: post.pattern.includes("story") ? "video" : "image",
  })
}

function draftPreviewImage(draft: DraftRecord, pageName: string): string {
  if (draft.previewMediaPath) {
    return contentDashboardMediaUrl(draft.previewMediaPath)
  }
  return socialPreviewDataUri({
    title: draft.title,
    subtitle: pageName,
    badge: draft.format.toUpperCase(),
    tone:
      draft.format === "image"
        ? "cyan"
        : draft.format === "quote"
          ? "amber"
          : "emerald",
    media: draft.format === "story" ? "video" : "image",
  })
}

function pageInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function contentDashboardMediaUrl(path: string): string {
  const url = new URL("/api/facebook-content-dashboard/media", contentDashboardApiOrigin())
  url.searchParams.set("path", path)
  return url.toString()
}

function contentDashboardApiOrigin(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8796"
  }

  const url = new URL(window.location.origin)
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    url.port = "8796"
  }
  return url.origin
}

function socialPreviewDataUri(input: {
  title: string
  subtitle: string
  badge: string
  tone: "cyan" | "amber" | "emerald"
  media: "image" | "video"
}): string {
  const palette =
    input.tone === "cyan"
      ? {
          a: "#082f49",
          b: "#0f172a",
          c: "#22d3ee",
          d: "#67e8f9",
        }
      : input.tone === "amber"
        ? {
            a: "#78350f",
            b: "#111827",
            c: "#f59e0b",
            d: "#fde68a",
          }
        : {
            a: "#14532d",
            b: "#0f172a",
            c: "#22c55e",
            d: "#bbf7d0",
          }

  const esc = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")

  const mediaBadge =
    input.media === "video"
      ? `<g transform="translate(904 48)"><circle cx="32" cy="32" r="32" fill="rgba(15,23,42,0.68)"/><path d="M24 20.5v23L44 32 24 20.5Z" fill="#ffffff"/></g>`
      : ""

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.a}"/>
        <stop offset="55%" stop-color="${palette.b}"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.2" cy="0.18" r="0.75">
        <stop offset="0%" stop-color="${palette.c}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="750" fill="url(#bg)"/>
    <rect width="1200" height="750" fill="url(#glow)"/>
    <rect x="62" y="58" width="164" height="164" rx="82" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)"/>
    <text x="144" y="154" font-family="Inter, Arial, sans-serif" font-size="56" font-weight="700" text-anchor="middle" fill="#f4f4f5">${esc(input.subtitle.split(' ').slice(0,2).map(part => part[0] || '').join(''))}</text>
    <text x="266" y="128" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" fill="#fafafa">${esc(input.subtitle)}</text>
    <text x="266" y="176" font-family="Inter, Arial, sans-serif" font-size="22" fill="rgba(244,244,245,0.72)">Generated preview</text>
    <rect x="864" y="86" width="262" height="64" rx="22" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)"/>
    <text x="995" y="127" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" text-anchor="middle" fill="#fafafa">${esc(input.badge)}</text>
    <foreignObject x="72" y="290" width="760" height="270">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter, Arial, sans-serif;font-size:58px;line-height:1.1;font-weight:800;color:#fafafa;letter-spacing:-0.02em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">
        ${esc(input.title)}
      </div>
    </foreignObject>
    <rect x="72" y="602" width="306" height="18" rx="9" fill="rgba(255,255,255,0.12)"/>
    <rect x="72" y="642" width="226" height="18" rx="9" fill="rgba(255,255,255,0.08)"/>
    <rect x="856" y="232" width="278" height="392" rx="34" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)"/>
    <rect x="886" y="266" width="218" height="250" rx="26" fill="rgba(255,255,255,0.10)"/>
    <rect x="910" y="290" width="170" height="18" rx="9" fill="${palette.d}" fill-opacity="0.92"/>
    <rect x="910" y="326" width="144" height="18" rx="9" fill="rgba(255,255,255,0.72)"/>
    <rect x="910" y="362" width="122" height="18" rx="9" fill="rgba(255,255,255,0.56)"/>
    <circle cx="952" cy="562" r="22" fill="rgba(255,255,255,0.14)"/>
    <circle cx="1016" cy="562" r="22" fill="rgba(255,255,255,0.12)"/>
    <circle cx="1080" cy="562" r="22" fill="rgba(255,255,255,0.10)"/>
    ${mediaBadge}
  </svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function draftPreviewTone(format: DraftRecord["format"]): string {
  if (format === "image") {
    return "bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.24),_transparent_34%),linear-gradient(135deg,_rgb(30,41,59),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
  }
  if (format === "quote") {
    return "bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.2),_transparent_34%),linear-gradient(135deg,_rgb(82,24,24),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
  }
  return "bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(135deg,_rgb(20,83,45),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
}
