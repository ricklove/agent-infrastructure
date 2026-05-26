import { observer } from "@legendapp/state/react"
import { useEffect, useMemo, useState } from "react"
import { ContentDashboardHeader } from "./components/ContentDashboardHeader"
import { InspirationRail } from "./components/InspirationRail"
import { PublishingRail } from "./components/PublishingRail"
import {
  DraftStudioPanel,
  ReviewGatePanel,
  SourceAnalysisPanel,
} from "./components/WorkbenchPanels"
import {
  FieldPair,
  MetricChip,
  Panel,
  StageBadge,
  StatusBadge,
} from "./components/primitives"
import { fetchContentDashboardSnapshot } from "./content-dashboard-client"
import { createFacebookContentDashboardStore } from "./content-dashboard-store"
import type { DraftRecord, SourcePostRecord } from "./content-dashboard-types"
import {
  ChoiceCardSurface,
  ContextCardSurface,
  SelectedCardSurface,
} from "./components/SelectionCards"

export type FacebookContentDashboardScreenProps = {
  apiRootUrl?: string
}

const contentCreationRoute = "/content-creation"
const contentCreationDebugRoute = `${contentCreationRoute}/debug`

export function FacebookContentDashboardScreen(
  props: FacebookContentDashboardScreenProps,
) {
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith(contentCreationDebugRoute)
  ) {
    return <ContentDebugScreen />
  }

  const [store] = useState(() => createFacebookContentDashboardStore())

  useEffect(() => {
    let cancelled = false

    async function loadSnapshot() {
      store.setLoading("sample")
      try {
        const loaded = await fetchContentDashboardSnapshot({
          apiRootUrl: props.apiRootUrl,
        })
        if (cancelled) {
          return
        }
        store.applySnapshot(loaded.snapshot, loaded.mode, loaded.source)
      } catch (error) {
        if (cancelled) {
          return
        }
        store.setError(
          error instanceof Error ? error.message : "Snapshot loading failed.",
        )
      }
    }

    void loadSnapshot()

    return () => {
      cancelled = true
    }
  }, [props.apiRootUrl, store])

  return <ScreenBody store={store} />
}

const ScreenBody = observer(function ScreenBody(props: {
  store: ReturnType<typeof createFacebookContentDashboardStore>
}) {
  const state = props.store.state$.get()
  const sourcePosts = state.sourcePosts
  const drafts = state.drafts
  const ui = state.ui

  const postsByPage = useMemo(() => {
    const next = new Map<string, SourcePostRecord[]>()
    for (const post of sourcePosts) {
      const pagePosts = next.get(post.sourcePage) ?? []
      pagePosts.push(post)
      next.set(post.sourcePage, pagePosts)
    }
    return next
  }, [sourcePosts])

  const destinationPages = useMemo(
    () =>
      [...ui.connectedDestinationPages].sort(
        (left, right) =>
          (postsByPage.get(right)?.length ?? 0) - (postsByPage.get(left)?.length ?? 0),
      ),
    [postsByPage, ui.connectedDestinationPages],
  )
  const visibleDestinationPages = useMemo(
    () =>
      destinationPages.length > 0
        ? destinationPages
        : Array.from(postsByPage.keys()).slice(0, 4),
    [destinationPages, postsByPage],
  )

  const destinationPosts = ui.destinationPage
    ? postsByPage.get(ui.destinationPage) ?? []
    : []
  const sourcePageOptions = Array.from(postsByPage.keys()).filter(
    (page) => page !== ui.destinationPage,
  )

  const activeSourcePosts =
    ui.sourceMode === "destination"
      ? destinationPosts
      : ui.sourceMode === "outside" && ui.outsidePage
        ? postsByPage.get(ui.outsidePage) ?? []
        : []

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

  function chooseDestination(pageName: string) {
    const hasOwnPosts = (postsByPage.get(pageName) ?? []).length > 0
    props.store.chooseDestination(pageName, hasOwnPosts)
  }

  function chooseOutsidePage(pageName: string) {
    props.store.chooseOutsidePage(pageName)
  }

  function chooseSource(post: SourcePostRecord) {
    props.store.selectSource(post.id)
  }

  function chooseDraft(draft: DraftRecord) {
    props.store.selectDraft(draft.id)
  }

  function reopenDestination() {
    props.store.reopenDestination()
  }

  function reopenOutsidePage() {
    props.store.reopenOutsidePage()
  }

  function reopenSourceList() {
    props.store.reopenSourceList()
  }

  const showOutsideSection =
    ui.destinationPage !== null &&
    (destinationPosts.length === 0 || ui.outsidePage !== null || ui.outsidePagePickerOpen)

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Content Creation
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              {ui.destinationPage ?? "Add a destination page"}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex w-full max-w-[420px] flex-col gap-3">
          <Section className="p-2">
            {ui.destinationPickerOpen || !ui.destinationPage ? (
              <form
                className="flex flex-col gap-2 p-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  props.store.connectDestinationPage()
                }}
                >
                  <input
                    value={ui.destinationDraft}
                    onChange={(event) =>
                      props.store.setDestinationDraft(event.target.value)
                  }
                  placeholder="Page name or URL, e.g. Thin Blue Line Supporters"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/50"
                  />
                  <IconRowButton
                    label="Add page manually"
                    onClick={() => props.store.connectDestinationPage()}
                    icon={<PlusIcon />}
                  />
              </form>
            ) : (
              <SelectedCard
                title={ui.destinationPage}
                meta={
                  selectedSource
                    ? "draft"
                    : ui.outsidePage
                      ? `${ui.outsidePage}`
                      : `${destinationPosts.length} top posts`
                }
                onClick={reopenDestination}
              />
            )}

            {(ui.destinationPickerOpen || !ui.destinationPage) &&
            visibleDestinationPages.length > 0 ? (
              <div className="flex flex-col gap-2 px-1 pb-1">
                {visibleDestinationPages.map((page) => (
                <ChoiceCardSurface
                    key={page}
                    title={page}
                    meta={
                      (postsByPage.get(page) ?? []).length > 0
                        ? `${(postsByPage.get(page) ?? []).length} top posts`
                        : "0 top posts"
                    }
                    onClick={() => chooseDestination(page)}
                  />
                ))}
              </div>
            ) : null}
          </Section>

          {ui.destinationPage && destinationPosts.length > 0 && ui.sourceMode === "destination" ? (
            <Section className="p-2">
              {ui.sourcePickerOpen || !selectedSource || selectedSource.sourcePage !== ui.destinationPage ? (
                <div className="flex flex-col gap-2">
                  {destinationPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      active={post.id === state.selection.activeSourceId}
                      onClick={() => chooseSource(post)}
                    />
                  ))}
                </div>
              ) : (
                <SelectedSourceCard
                  post={selectedSource}
                  onClick={reopenSourceList}
                />
              )}
            </Section>
          ) : null}

          {showOutsideSection ? (
            <Section className="p-2">
              {!ui.outsidePage && !ui.outsidePagePickerOpen ? (
                <IconRowButton
                  label="Source pages"
                  onClick={() => props.store.openOutsidePagePicker()}
                  icon={<PlusIcon />}
                />
              ) : ui.outsidePagePickerOpen || !ui.outsidePage ? (
                <div className="flex flex-col gap-2">
                  {sourcePageOptions.map((page) => (
                    <ChoiceCard
                      key={page}
                      title={page}
                      meta={`${(postsByPage.get(page) ?? []).length} top posts`}
                      onClick={() => chooseOutsidePage(page)}
                    />
                  ))}
                </div>
              ) : (
                <SelectedCard
                  title={ui.outsidePage}
                  meta={
                    selectedSource?.sourcePage === ui.outsidePage
                      ? "using this source page"
                      : `${(postsByPage.get(ui.outsidePage) ?? []).length} top posts`
                  }
                  onClick={reopenOutsidePage}
                />
              )}
            </Section>
          ) : null}

          {ui.sourceMode === "outside" && ui.outsidePage ? (
            <Section className="p-2">
              {ui.sourcePickerOpen || !selectedSource || selectedSource.sourcePage !== ui.outsidePage ? (
                <div className="flex flex-col gap-2">
                  {(postsByPage.get(ui.outsidePage) ?? []).map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      active={post.id === state.selection.activeSourceId}
                      onClick={() => chooseSource(post)}
                    />
                  ))}
                </div>
              ) : (
                <SelectedSourceCard
                  post={selectedSource}
                  onClick={reopenSourceList}
                />
              )}
            </Section>
          ) : null}
        </div>

        <main className="flex min-w-0 flex-col gap-4">
          {!ui.destinationPage || (destinationPosts.length > 0 && !selectedSource) || (destinationPosts.length === 0 && !ui.outsidePage) || (ui.outsidePage && !selectedSource) ? (
            <CanvasMessage />
          ) : selectedSource ? (
            <div className="flex min-w-0 flex-col gap-4">
              <Section className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                    <div>
                      Publishing page
                      <span className="ml-2 text-zinc-200">{ui.destinationPage}</span>
                    </div>
                    <div>
                      Source page
                      <span className="ml-2 text-zinc-200">{selectedSource.sourcePage}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={reopenSourceList}
                    className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                  >
                    Change source post
                  </button>
                </div>
              </Section>

              <div className="grid min-w-0 gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
              <Section className="flex min-w-0 flex-col p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-100">
                    {draftsForSelectedSource.length}{" "}
                    {draftsForSelectedSource.length === 1 ? "idea" : "ideas"}
                  </div>
                  {draftsForSelectedSource.length <= 1 ? (
                    <IconRowButton
                      label="More ideas"
                      onClick={() => props.store.generateDraftVariants()}
                      icon={<SparklesIcon />}
                      compact
                    />
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {draftsForSelectedSource.map((draft) => {
                    const active = draft.id === selectedDraft?.id
                    const saved = draft.id === ui.savedDraftId
                    return (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => chooseDraft(draft)}
                        className={[
                          "rounded-xl border px-3 py-3 text-left transition",
                          saved
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : active
                            ? "border-cyan-500/40 bg-cyan-500/10"
                            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70",
                        ].join(" ")}
                      >
                        <DraftCardPreview draft={draft} />
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            {saved ? (
                              <CheckIcon />
                            ) : active ? (
                              <SelectedDotIcon />
                            ) : (
                              <EmptyDotIcon />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-zinc-100">
                              {compactDraftTitle(draft, selectedSource)}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {draft.positioning}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  {selectedDraft ? (
                    <div className="flex flex-col gap-3">
                      <DraftCardPreview draft={selectedDraft} expanded />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">
                            {compactDraftTitle(selectedDraft, selectedSource)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {selectedDraft.goal}
                          </div>
                        </div>
                        <IconRowButton
                          label={
                            ui.savedDraftId === selectedDraft.id ? "Saved" : "Save draft"
                          }
                          onClick={() => props.store.saveActiveDraft()}
                          icon={<CheckIcon />}
                          compact
                        />
                      </div>
                      <textarea
                        value={selectedDraft.captionPreview}
                        onChange={(event) =>
                          props.store.updateActiveDraftCaption(event.target.value)
                        }
                        className="min-h-[168px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm leading-6 text-zinc-200 outline-none transition focus:border-cyan-500/50"
                      />
                      {ui.savedDraftId === selectedDraft.id ? (
                        <div className="text-xs text-emerald-300">Draft saved</div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                        <span>{selectedDraft.originality}</span>
                        <span>•</span>
                        <span>{selectedDraft.tone}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">No ideas yet.</div>
                  )}
                </div>
              </Section>

              <Section className="min-w-0 p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() =>
                    props.store.setSourceDetailsOpen(!ui.sourceDetailsOpen)
                  }
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">
                      Source details
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {selectedSource.title}
                    </div>
                  </div>
                  {ui.sourceDetailsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </button>

                {ui.sourceDetailsOpen ? (
                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-zinc-100">
                          {selectedSource.title}
                        </div>
                        <div className="mt-1 text-sm text-zinc-500">
                          {selectedSource.sourcePage} · {selectedSource.publishDate}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Score
                        </div>
                        <div className="mt-1 text-sm font-semibold text-cyan-200">
                          {selectedSource.score.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <DataChip label="Likes" value={selectedSource.likes.toLocaleString()} />
                      <DataChip
                        label="Comments"
                        value={selectedSource.comments.toLocaleString()}
                      />
                      <DataChip
                        label="Shares"
                        value={selectedSource.shares.toLocaleString()}
                      />
                    </div>

                    <div className="mt-5 grid gap-4">
                      <DataBlock label="Pattern" value={selectedSource.pattern} />
                      <DataBlock label="Hook" value={selectedSource.hook} />
                      <DataBlock label="Why it worked" value={selectedSource.whyItWorked} />
                      <DataBlock
                        label="Use next"
                        value={selectedSource.adaptationRule}
                      />
                    </div>
                  </div>
                ) : null}
              </Section>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
})

function Section(props: { children?: React.ReactNode; className?: string }) {
  return (
    <section
      className={[
        "rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-[0_0_0_1px_rgba(24,24,27,0.25)]",
        props.className ?? "",
      ].join(" ")}
    >
      {props.children}
    </section>
  )
}

function ChoiceCard(props: {
  title: string
  meta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900/80"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-zinc-100">
          {props.title}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      <ChevronRightIcon />
    </button>
  )
}

function SelectedCard(props: {
  title: string
  meta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-3 text-left transition hover:border-zinc-600"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-zinc-100">
          {props.title}
        </div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      <ChevronDownIcon />
    </button>
  )
}

function PostCard(props: {
  post: SourcePostRecord
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "w-full rounded-lg border px-3 py-3 text-left transition",
        props.active
          ? "border-cyan-500/40 bg-cyan-500/10"
          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/80",
      ].join(" ")}
    >
      <SourcePostPreview post={props.post} />
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>{props.post.pattern}</span>
        <span>{props.post.score.toLocaleString()} score</span>
      </div>
    </button>
  )
}

function SelectedSourceCard(props: {
  post: SourcePostRecord
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
    >
      <SourcePostPreview post={props.post} />
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
        <span>{props.post.pattern}</span>
        <div className="flex items-center gap-2 text-cyan-200">
          <span>✓</span>
          <span className="text-zinc-500">✎</span>
        </div>
      </div>
    </button>
  )
}

function SourcePostPreview(props: { post: SourcePostRecord }) {
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">
          {props.post.sourcePage
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">
            {props.post.sourcePage}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {props.post.publishDate}
          </div>
        </div>
      </div>
      <div className="px-3 pt-3">
        <div className="line-clamp-2 text-sm leading-6 text-zinc-200">
          {props.post.hook}
        </div>
      </div>
      <div
        className={[
          "mt-3 aspect-[16/9] border-y border-zinc-800",
          sourcePostPreviewTone(props.post.pattern),
        ].join(" ")}
      />
      <div className="flex items-center justify-between px-3 py-2 text-[11px] text-zinc-500">
        <span>{props.post.shares.toLocaleString()} shares</span>
        <span>{props.post.comments.toLocaleString()} comments</span>
        <span>{props.post.likes.toLocaleString()} likes</span>
      </div>
    </div>
  )
}

function DraftCardPreview(props: { draft: DraftRecord; expanded?: boolean }) {
  return (
    <div
      className={[
        "overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70",
        props.expanded ? "mb-1" : "mb-3",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold uppercase text-zinc-200">
          BC
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-100">
            Draft preview
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            {props.draft.format}
          </div>
        </div>
      </div>
      <div className="px-3 pt-3">
        <div className="line-clamp-2 text-sm leading-6 text-zinc-200">
          {props.draft.captionPreview}
        </div>
      </div>
      <div
        className={[
          "mt-3 aspect-[4/5] border-y border-zinc-800",
          draftPreviewTone(props.draft.format),
        ].join(" ")}
      />
      <div className="px-3 py-3">
        <div className="truncate text-sm font-semibold text-zinc-100">
          {props.draft.title}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {props.draft.positioning}
        </div>
      </div>
    </div>
  )
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

function draftPreviewTone(format: DraftRecord["format"]): string {
  if (format === "image") {
    return "bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.24),_transparent_34%),linear-gradient(135deg,_rgb(30,41,59),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
  }
  if (format === "quote") {
    return "bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.2),_transparent_34%),linear-gradient(135deg,_rgb(82,24,24),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
  }
  return "bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(135deg,_rgb(20,83,45),_rgb(24,24,27)_55%,_rgb(63,63,70))]"
}

function DataChip(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {props.label}
      </div>
      <div className="mt-1 text-sm font-semibold text-zinc-100">{props.value}</div>
    </div>
  )
}

function DataBlock(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {props.label}
      </div>
      <div className="mt-2 text-sm leading-6 text-zinc-300">{props.value}</div>
    </div>
  )
}

function StagePill(props: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
      {props.children}
    </span>
  )
}

function CanvasMessage() {
  return (
    <Section className="min-h-[240px]" />
  )
}

function IconRowButton(props: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900/80",
        props.compact ? "px-2.5 py-2" : "w-full px-3 py-3",
      ].join(" ")}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-zinc-500"
    >
      <path
        d="M7.5 4.5 12.5 10l-5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-zinc-500"
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-zinc-400"
    >
      <path
        d="M10 4.5v11M4.5 10h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-emerald-300"
    >
      <path
        d="m5 10 3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-cyan-200"
    >
      <path
        d="M10 3.5 11.7 8.3 16.5 10l-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7L10 3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SelectedDotIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-cyan-300"
    >
      <circle cx="10" cy="10" r="3.5" fill="currentColor" />
    </svg>
  )
}

function EmptyDotIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-zinc-600"
    >
      <circle cx="10" cy="10" r="4.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

type DebugFixtureDefinition = {
  slug: string
  title: string
  scenarios: {
    slug: string
    title: string
    render: () => JSX.Element
  }[]
}

function ContentDebugScreen() {
  const fixtures = useMemo(() => buildDebugFixtures(), [])
  const { componentSlug, scenarioSlug } = parseDebugRoute(
    typeof window === "undefined" ? contentCreationDebugRoute : window.location.pathname,
  )
  const fixture = fixtures.find((entry) => entry.slug === componentSlug) ?? null
  const scenario = fixture?.scenarios.find((entry) => entry.slug === scenarioSlug) ?? null

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Content Creation
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">
              Component Debug
            </div>
          </div>
          <a
            href={linkWithSearch(contentCreationRoute)}
            className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            Back to content creation
          </a>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 py-4 sm:px-5">
        {fixture ? (
          <Section className="p-2">
            <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-xs text-zinc-500">
              <a href={linkWithSearch(contentCreationDebugRoute)} className="hover:text-zinc-200">
                components
              </a>
              <span>/</span>
              <a
                href={linkWithSearch(`${contentCreationDebugRoute}/${fixture.slug}`)}
                className="hover:text-zinc-200"
              >
                {fixture.slug}
              </a>
              {scenario ? (
                <>
                  <span>/</span>
                  <span className="text-zinc-300">{scenario.slug}</span>
                </>
              ) : null}
            </div>
          </Section>
        ) : null}

        {!fixture ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fixtures.map((entry) => (
              <a
                key={entry.slug}
                href={linkWithSearch(`${contentCreationDebugRoute}/${entry.slug}`)}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 transition hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="text-sm font-semibold text-zinc-100">{entry.title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {entry.scenarios.length} scenarios
                </div>
              </a>
            ))}
          </div>
        ) : scenario ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {fixture.scenarios.map((entry) => (
                <a
                  key={entry.slug}
                  href={linkWithSearch(
                    `${contentCreationDebugRoute}/${fixture.slug}/${entry.slug}`,
                  )}
                  className={[
                    "rounded-lg border px-3 py-2 text-xs transition",
                    entry.slug === scenario.slug
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  ].join(" ")}
                >
                  {entry.title}
                </a>
              ))}
            </div>
            {scenario.render()}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-semibold text-zinc-100">{fixture.title}</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fixture.scenarios.map((entry) => (
                <a
                  key={entry.slug}
                  href={linkWithSearch(
                    `${contentCreationDebugRoute}/${fixture.slug}/${entry.slug}`,
                  )}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 transition hover:border-zinc-700 hover:bg-zinc-900/80"
                >
                  <div className="text-sm font-semibold text-zinc-100">{entry.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">{entry.slug}</div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function parseDebugRoute(pathname: string): {
  componentSlug: string | null
  scenarioSlug: string | null
} {
  const parts = pathname.split("/").filter(Boolean)
  const debugIndex = parts.indexOf("debug")
  if (debugIndex < 0) {
    return { componentSlug: null, scenarioSlug: null }
  }
  return {
    componentSlug: parts[debugIndex + 1] ?? null,
    scenarioSlug: parts[debugIndex + 2] ?? null,
  }
}

function linkWithSearch(pathname: string): string {
  if (typeof window === "undefined") {
    return pathname
  }
  return `${pathname}${window.location.search}`
}

function createFixtureStore(
  scenario:
    | "no-existing-destinations"
    | "existing-destinations"
    | "selected-destination"
    | "destination-posts"
    | "outside-page-picker"
    | "outside-posts"
    | "draft-single"
    | "draft-multiple"
    | "saved-draft",
) {
  const store = createFacebookContentDashboardStore()
  store.state$.ui.connectedDestinationPages.set([
    "Support Law Enforcement",
    "Thin Blue Line Supporters",
    "Community Safety Network",
  ])
  store.state$.ui.destinationPickerOpen.set(true)
  store.state$.ui.destinationPage.set(null)
  store.state$.selection.activeSourceId.set("")
  store.state$.selection.activeDraftId.set("")
  store.state$.ui.savedDraftId.set(null)

  if (scenario === "no-existing-destinations") {
    store.state$.ui.connectedDestinationPages.set([])
    return store
  }

  if (scenario === "existing-destinations") {
    return store
  }

  store.chooseDestination("Support Law Enforcement", true)

  if (scenario === "selected-destination") {
    store.state$.ui.sourcePickerOpen.set(false)
    return store
  }

  if (scenario === "destination-posts") {
    store.state$.ui.sourcePickerOpen.set(true)
    return store
  }

  if (scenario === "outside-page-picker") {
    store.state$.ui.destinationPage.set("Fresh Civic Page")
    store.state$.ui.connectedDestinationPages.set(["Fresh Civic Page"])
    store.state$.ui.destinationPickerOpen.set(false)
    store.state$.ui.sourceMode.set("outside")
    store.state$.ui.outsidePagePickerOpen.set(true)
    return store
  }

  if (scenario === "outside-posts") {
    store.state$.ui.destinationPage.set("Fresh Civic Page")
    store.state$.ui.connectedDestinationPages.set(["Fresh Civic Page"])
    store.state$.ui.destinationPickerOpen.set(false)
    store.chooseOutsidePage("Support Law Enforcement")
    return store
  }

  const destinationSourceId =
    store.state$.sourcePosts.get().find((post) => post.sourcePage === "Support Law Enforcement")
      ?.id ?? ""
  if (destinationSourceId) {
    store.selectSource(destinationSourceId)
  }

  if (scenario === "draft-single") {
    return store
  }

  if (scenario === "draft-multiple" || scenario === "saved-draft") {
    store.generateDraftVariants()
  }

  if (scenario === "saved-draft") {
    const secondDraftId = store.state$.drafts.get().find((draft) => draft.sourceId === destinationSourceId)?.id
    if (secondDraftId) {
      store.selectDraft(secondDraftId)
      store.saveActiveDraft()
    }
  }

  return store
}

function buildDebugFixtures(): DebugFixtureDefinition[] {
  return [
    {
      slug: "destination-page-selector",
      title: "DestinationPageSelector",
      scenarios: [
        {
          slug: "no-existing-destinations",
          title: "No existing destinations",
          render: () => <DebugDestinationPageSelector scenario="no-existing-destinations" />,
        },
        {
          slug: "existing-destinations",
          title: "Existing destinations",
          render: () => <DebugDestinationPageSelector scenario="existing-destinations" />,
        },
        {
          slug: "selected-destination",
          title: "Selected destination",
          render: () => <DebugDestinationPageSelector scenario="selected-destination" />,
        },
      ],
    },
    {
      slug: "source-page-selector",
      title: "SourcePageSelector",
      scenarios: [
        {
          slug: "outside-page-picker",
          title: "Outside page picker",
          render: () => <DebugSourcePageSelector scenario="outside-page-picker" />,
        },
        {
          slug: "selected-source-page",
          title: "Selected source page",
          render: () => <DebugSourcePageSelector scenario="outside-posts" />,
        },
      ],
    },
    {
      slug: "source-post-selector",
      title: "SourcePostSelector",
      scenarios: [
        {
          slug: "destination-posts",
          title: "Destination posts",
          render: () => <DebugSourcePostSelector scenario="destination-posts" />,
        },
        {
          slug: "outside-posts",
          title: "Outside posts",
          render: () => <DebugSourcePostSelector scenario="outside-posts" />,
        },
      ],
    },
    {
      slug: "draft-ideas-panel",
      title: "DraftIdeasPanel",
      scenarios: [
        {
          slug: "single-idea",
          title: "Single idea",
          render: () => <DebugIdeasPanel scenario="draft-single" />,
        },
        {
          slug: "multiple-ideas",
          title: "Multiple ideas",
          render: () => <DebugIdeasPanel scenario="draft-multiple" />,
        },
        {
          slug: "saved-draft",
          title: "Saved draft",
          render: () => <DebugIdeasPanel scenario="saved-draft" />,
        },
      ],
    },
    {
      slug: "source-details-panel",
      title: "SourceDetailsPanel",
      scenarios: [
        {
          slug: "collapsed",
          title: "Collapsed",
          render: () => <DebugSourceDetailsPanel open={false} />,
        },
        {
          slug: "expanded",
          title: "Expanded",
          render: () => <DebugSourceDetailsPanel open />,
        },
      ],
    },
    {
      slug: "choice-card",
      title: "ChoiceCard",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <ChoiceCard title="Support Law Enforcement" meta="10 top posts" onClick={() => {}} />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "selected-card",
      title: "SelectedCard",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <SelectedCard title="Support Law Enforcement" meta="10 top posts" onClick={() => {}} />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "post-card",
      title: "PostCard",
      scenarios: [
        {
          slug: "idle",
          title: "Idle",
          render: () => (
            <FixtureFrame>
              <PostCard
                post={createFixtureStore("draft-single").state$.sourcePosts.get()[0]!}
                active={false}
                onClick={() => {}}
              />
            </FixtureFrame>
          ),
        },
        {
          slug: "active",
          title: "Active",
          render: () => (
            <FixtureFrame>
              <PostCard
                post={createFixtureStore("draft-single").state$.sourcePosts.get()[0]!}
                active
                onClick={() => {}}
              />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "content-dashboard-header",
      title: "ContentDashboardHeader",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <ContentDashboardHeader store={createFixtureStore("draft-multiple")} />,
        },
      ],
    },
    {
      slug: "inspiration-rail",
      title: "InspirationRail",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <InspirationRail store={createFixtureStore("draft-single")} />,
        },
      ],
    },
    {
      slug: "source-analysis-panel",
      title: "SourceAnalysisPanel",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <SourceAnalysisPanel store={createFixtureStore("draft-single")} />,
        },
      ],
    },
    {
      slug: "draft-studio-panel",
      title: "DraftStudioPanel",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <DraftStudioPanel store={createFixtureStore("draft-multiple")} />,
        },
      ],
    },
    {
      slug: "review-gate-panel",
      title: "ReviewGatePanel",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <ReviewGatePanel store={createFixtureStore("draft-multiple")} />,
        },
      ],
    },
    {
      slug: "publishing-rail",
      title: "PublishingRail",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <PublishingRail store={createFixtureStore("draft-multiple")} />,
        },
      ],
    },
    {
      slug: "metric-chip",
      title: "MetricChip",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <MetricChip label="Imported" value="100 posts" />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "status-badge",
      title: "StatusBadge",
      scenarios: [
        {
          slug: "approved",
          title: "Approved",
          render: () => (
            <FixtureFrame>
              <StatusBadge status="approved" />
            </FixtureFrame>
          ),
        },
        {
          slug: "draft",
          title: "Draft",
          render: () => (
            <FixtureFrame>
              <StatusBadge status="draft" />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "stage-badge",
      title: "StageBadge",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <StageBadge step="01" label="Discover" />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "panel",
      title: "Panel",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <Panel title="Panel title" meta="Panel meta">
                <div className="text-sm text-zinc-300">Panel content</div>
              </Panel>
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "field-pair",
      title: "FieldPair",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <FieldPair label="Pattern" value="Identity-driven share pattern" />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "data-chip",
      title: "DataChip",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <DataChip label="Shares" value="885" />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "data-block",
      title: "DataBlock",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <DataBlock label="Pattern" value="Short identity-first line with strong share impulse." />
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "section",
      title: "Section",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <Section className="p-4">
                <div className="text-sm text-zinc-300">Section content</div>
              </Section>
            </FixtureFrame>
          ),
        },
      ],
    },
    {
      slug: "canvas-message",
      title: "CanvasMessage",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <CanvasMessage />,
        },
      ],
    },
    {
      slug: "icon-row-button",
      title: "IconRowButton",
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => (
            <FixtureFrame>
              <IconRowButton label="More ideas" onClick={() => {}} icon={<SparklesIcon />} />
            </FixtureFrame>
          ),
        },
      ],
    },
    ...[
      ["chevron-right-icon", "ChevronRightIcon", <ChevronRightIcon key="icon" />],
      ["chevron-down-icon", "ChevronDownIcon", <ChevronDownIcon key="icon" />],
      ["plus-icon", "PlusIcon", <PlusIcon key="icon" />],
      ["check-icon", "CheckIcon", <CheckIcon key="icon" />],
      ["sparkles-icon", "SparklesIcon", <SparklesIcon key="icon" />],
      ["selected-dot-icon", "SelectedDotIcon", <SelectedDotIcon key="icon" />],
      ["empty-dot-icon", "EmptyDotIcon", <EmptyDotIcon key="icon" />],
    ].map(([slug, title, node]) => ({
      slug: slug as string,
      title: title as string,
      scenarios: [
        {
          slug: "default",
          title: "Default",
          render: () => <FixtureFrame>{node as JSX.Element}</FixtureFrame>,
        },
      ],
    })),
  ]
}

function FixtureFrame(props: { children: React.ReactNode }) {
  return <div className="flex max-w-[520px] flex-col gap-4">{props.children}</div>
}

const DebugDestinationPageSelector = observer(function DebugDestinationPageSelector(props: {
  scenario:
    | "no-existing-destinations"
    | "existing-destinations"
    | "selected-destination"
}) {
  const [store] = useState(() => createFixtureStore(props.scenario))
  const ui = store.state$.ui.get()
  const sourcePosts = store.state$.sourcePosts.get()
  const postsByPage = useMemo(() => {
    const next = new Map<string, SourcePostRecord[]>()
    for (const post of sourcePosts) {
      const pagePosts = next.get(post.sourcePage) ?? []
      pagePosts.push(post)
      next.set(post.sourcePage, pagePosts)
    }
    return next
  }, [sourcePosts])
  const visibleDestinationPages =
    ui.connectedDestinationPages.length > 0
      ? ui.connectedDestinationPages
      : Array.from(postsByPage.keys()).slice(0, 4)
  const selectedSource = sourcePosts.find(
    (post) => post.id === store.state$.selection.activeSourceId.get(),
  )

  return (
    <FixtureFrame>
      <Section className="p-2">
        {ui.destinationPickerOpen || !ui.destinationPage ? (
          <form
            className="flex flex-col gap-2 p-1"
            onSubmit={(event) => {
              event.preventDefault()
              store.connectDestinationPage()
            }}
          >
            <input
              value={ui.destinationDraft}
              onChange={(event) => store.setDestinationDraft(event.target.value)}
              placeholder="Page name or URL, e.g. Thin Blue Line Supporters"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/50"
            />
            <IconRowButton
              label="Add page manually"
              onClick={() => store.connectDestinationPage()}
              icon={<PlusIcon />}
            />
          </form>
        ) : (
          <SelectedCard
            title={ui.destinationPage}
            meta={selectedSource ? "draft" : "selected"}
            onClick={() => store.reopenDestination()}
          />
        )}
        {(ui.destinationPickerOpen || !ui.destinationPage) && visibleDestinationPages.length > 0 ? (
          <div className="flex flex-col gap-2 px-1 pb-1">
            {visibleDestinationPages.map((page) => (
              <ChoiceCard
                key={page}
                title={page}
                meta={`${(postsByPage.get(page) ?? []).length} top posts`}
                onClick={() => store.chooseDestination(page, (postsByPage.get(page) ?? []).length > 0)}
              />
            ))}
          </div>
        ) : null}
      </Section>
    </FixtureFrame>
  )
})

const DebugSourcePageSelector = observer(function DebugSourcePageSelector(props: {
  scenario: "outside-page-picker" | "outside-posts"
}) {
  const [store] = useState(() => createFixtureStore(props.scenario))
  const ui = store.state$.ui.get()
  const sourcePosts = store.state$.sourcePosts.get()
  const postsByPage = useMemo(() => {
    const next = new Map<string, SourcePostRecord[]>()
    for (const post of sourcePosts) {
      const pagePosts = next.get(post.sourcePage) ?? []
      pagePosts.push(post)
      next.set(post.sourcePage, pagePosts)
    }
    return next
  }, [sourcePosts])
  const sourcePageOptions = Array.from(postsByPage.keys()).filter(
    (page) => page !== ui.destinationPage,
  )

  return (
    <FixtureFrame>
      <Section className="p-2">
        {!ui.outsidePage && !ui.outsidePagePickerOpen ? (
          <IconRowButton
            label="Source pages"
            onClick={() => store.openOutsidePagePicker()}
            icon={<PlusIcon />}
          />
        ) : ui.outsidePagePickerOpen || !ui.outsidePage ? (
          <div className="flex flex-col gap-2">
            {sourcePageOptions.map((page) => (
              <ChoiceCard
                key={page}
                title={page}
                meta={`${(postsByPage.get(page) ?? []).length} top posts`}
                onClick={() => store.chooseOutsidePage(page)}
              />
            ))}
          </div>
        ) : (
          <SelectedCard
            title={ui.outsidePage}
            meta={`${(postsByPage.get(ui.outsidePage) ?? []).length} top posts`}
            onClick={() => store.reopenOutsidePage()}
          />
        )}
      </Section>
    </FixtureFrame>
  )
})

const DebugSourcePostSelector = observer(function DebugSourcePostSelector(props: {
  scenario: "destination-posts" | "outside-posts"
}) {
  const [store] = useState(() => createFixtureStore(props.scenario))
  const ui = store.state$.ui.get()
  const sourcePosts = store.state$.sourcePosts.get()
  const postsByPage = useMemo(() => {
    const next = new Map<string, SourcePostRecord[]>()
    for (const post of sourcePosts) {
      const pagePosts = next.get(post.sourcePage) ?? []
      pagePosts.push(post)
      next.set(post.sourcePage, pagePosts)
    }
    return next
  }, [sourcePosts])
  const posts =
    props.scenario === "destination-posts"
      ? postsByPage.get(ui.destinationPage ?? "") ?? []
      : postsByPage.get(ui.outsidePage ?? "") ?? []
  const selectedSource = sourcePosts.find(
    (post) => post.id === store.state$.selection.activeSourceId.get(),
  )

  return (
    <FixtureFrame>
      <Section className="p-2">
        {ui.sourcePickerOpen || !selectedSource ? (
          <div className="flex flex-col gap-2">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                active={post.id === store.state$.selection.activeSourceId.get()}
                onClick={() => store.selectSource(post.id)}
              />
            ))}
          </div>
        ) : (
          <SelectedCard
            title={selectedSource.title}
            meta={`${selectedSource.publishDate} · ${selectedSource.score.toLocaleString()}`}
            onClick={() => store.reopenSourceList()}
          />
        )}
      </Section>
    </FixtureFrame>
  )
})

const DebugIdeasPanel = observer(function DebugIdeasPanel(props: {
  scenario: "draft-single" | "draft-multiple" | "saved-draft"
}) {
  const [store] = useState(() => createFixtureStore(props.scenario))
  const state = store.state$.get()
  const selectedSource = state.sourcePosts.find(
    (post) => post.id === state.selection.activeSourceId,
  )
  const draftsForSelectedSource = selectedSource
    ? state.drafts.filter((draft) => draft.sourceId === selectedSource.id)
    : []
  const selectedDraft =
    draftsForSelectedSource.find((draft) => draft.id === state.selection.activeDraftId) ??
    draftsForSelectedSource[0] ??
    null

  return (
    <FixtureFrame>
      <Section className="flex min-w-0 flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-100">
            {draftsForSelectedSource.length}{" "}
            {draftsForSelectedSource.length === 1 ? "idea" : "ideas"}
          </div>
          {draftsForSelectedSource.length <= 1 ? (
            <IconRowButton
              label="More ideas"
              onClick={() => store.generateDraftVariants()}
              icon={<SparklesIcon />}
              compact
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {draftsForSelectedSource.map((draft) => {
            const active = draft.id === selectedDraft?.id
            const saved = draft.id === state.ui.savedDraftId
            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => store.selectDraft(draft.id)}
                className={[
                  "rounded-xl border px-3 py-3 text-left transition",
                  saved
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : active
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70",
                ].join(" ")}
              >
                <DraftCardPreview draft={draft} />
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {saved ? <CheckIcon /> : active ? <SelectedDotIcon /> : <EmptyDotIcon />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-100">
                      {draft.title}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {draft.format} · {draft.positioning}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          {selectedDraft ? (
            <div className="flex flex-col gap-3">
              <DraftCardPreview draft={selectedDraft} expanded />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {selectedDraft.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{selectedDraft.goal}</div>
                </div>
                <IconRowButton
                  label={state.ui.savedDraftId === selectedDraft.id ? "Saved" : "Save draft"}
                  onClick={() => store.saveActiveDraft()}
                  icon={<CheckIcon />}
                  compact
                />
              </div>
              <textarea
                value={selectedDraft.captionPreview}
                onChange={(event) => store.updateActiveDraftCaption(event.target.value)}
                className="min-h-[168px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm leading-6 text-zinc-200 outline-none transition focus:border-cyan-500/50"
              />
            </div>
          ) : null}
        </div>
      </Section>
    </FixtureFrame>
  )
})

const DebugSourceDetailsPanel = observer(function DebugSourceDetailsPanel(props: {
  open: boolean
}) {
  const [store] = useState(() => createFixtureStore("draft-single"))
  const state = store.state$.get()
  const selectedSource = state.sourcePosts.find(
    (post) => post.id === state.selection.activeSourceId,
  )
  if (!selectedSource) {
    return null
  }

  return (
    <FixtureFrame>
      <Section className="min-w-0 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => {}}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <div className="text-sm font-semibold text-zinc-100">Source details</div>
            <div className="mt-1 text-xs text-zinc-500">{selectedSource.title}</div>
          </div>
          {props.open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
        {props.open ? (
          <div className="mt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-zinc-100">
                  {selectedSource.title}
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {selectedSource.sourcePage} · {selectedSource.publishDate}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Score
                </div>
                <div className="mt-1 text-sm font-semibold text-cyan-200">
                  {selectedSource.score.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Section>
    </FixtureFrame>
  )
})
