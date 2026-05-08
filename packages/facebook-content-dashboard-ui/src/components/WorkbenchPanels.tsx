import { observer, useValue } from "@legendapp/state/react"
import { getActiveDraft, getActiveSource, getDraftsForSource } from "../content-dashboard-selectors"
import type { FacebookContentDashboardStore } from "../content-dashboard-store"
import { FieldPair, MetricChip, Panel, StatusBadge } from "./primitives"

export const SourceAnalysisPanel = observer(function SourceAnalysisPanel(props: {
  store: FacebookContentDashboardStore
}) {
  const activeSource = useValue(() => {
    const state = props.store.state$.get()
    return getActiveSource(state)
  })

  return (
    <Panel
      title="Source Analysis"
      meta={`${activeSource.sourcePage} · ${activeSource.publishDate}`}
      action={<StatusBadge status={activeSource.status} />}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricChip label="Likes" value={activeSource.likes.toLocaleString()} />
        <MetricChip
          label="Comments"
          value={activeSource.comments.toLocaleString()}
        />
        <MetricChip label="Shares" value={activeSource.shares.toLocaleString()} />
        <MetricChip
          label="Weighted Score"
          value={activeSource.score.toLocaleString()}
          tone="cyan"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <FieldPair label="Pattern" value={activeSource.pattern} />
        <FieldPair label="Winning Angle" value={activeSource.angle} />
        <FieldPair label="Why It Worked" value={activeSource.whyItWorked} />
        <FieldPair label="Adaptation Rule" value={activeSource.adaptationRule} />
      </div>

      {activeSource.postUrl || activeSource.sourceUrl ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {activeSource.postUrl ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Our post URL
              </div>
              <a
                href={activeSource.postUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block break-all text-sm leading-6 text-cyan-200 hover:text-cyan-100"
              >
                {activeSource.postUrl}
              </a>
            </div>
          ) : null}

          {activeSource.sourceUrl ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Source URL
              </div>
              <a
                href={activeSource.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block break-all text-sm leading-6 text-cyan-200 hover:text-cyan-100"
              >
                {activeSource.sourceUrl}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
          Reuse guardrail
        </div>
        <p className="mt-2 text-sm leading-6 text-amber-50/90">
          {activeSource.caution}
        </p>
      </div>
    </Panel>
  )
})

export const DraftStudioPanel = observer(function DraftStudioPanel(props: {
  store: FacebookContentDashboardStore
}) {
  const activeSourceId = useValue(props.store.state$.selection.activeSourceId)
  const draftsForSource = useValue(() =>
    getDraftsForSource(props.store.state$.get(), activeSourceId),
  )
  const activeDraftId = useValue(props.store.state$.selection.activeDraftId)
  const activeDraft =
    draftsForSource.find((draft) => draft.id === activeDraftId) ??
    draftsForSource[0] ??
    props.store.state$.drafts.get()[0]

  return (
    <Panel
      title="Draft Studio"
      meta="Generate variants from one source, then choose the best derivative instead of shipping the first output."
      action={
        <button
          type="button"
          className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:border-cyan-300/50"
        >
          Generate 3 Variants
        </button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-3">
          {draftsForSource.map((draft) => {
            const active = draft.id === activeDraft.id
            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => props.store.selectDraft(draft.id)}
                className={[
                  "w-full rounded-2xl border px-4 py-4 text-left transition",
                  active
                    ? "border-cyan-400/35 bg-cyan-500/10"
                    : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {draft.title}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                      {draft.format}
                    </div>
                  </div>
                  <StatusBadge status={draft.stage} />
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {draft.positioning}
                </p>
              </button>
            )
          })}
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-zinc-100">
                {activeDraft.title}
              </div>
              <div className="mt-2 text-sm text-zinc-400">{activeDraft.note}</div>
            </div>
            <StatusBadge status={activeDraft.stage} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FieldPair label="Goal" value={activeDraft.goal} />
            <FieldPair label="Tone" value={activeDraft.tone} />
            <FieldPair label="Positioning" value={activeDraft.positioning} />
            <FieldPair label="Originality Estimate" value={activeDraft.originality} />
          </div>

          <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Caption preview
            </div>
            <p className="mt-3 text-sm leading-7 text-zinc-200">
              {activeDraft.captionPreview}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  )
})

export const ReviewGatePanel = observer(function ReviewGatePanel(props: {
  store: FacebookContentDashboardStore
}) {
  const connection = useValue(props.store.state$.connection)
  const activeDraft = useValue(() => {
    const state = props.store.state$.get()
    return getActiveDraft(state)
  })

  return (
    <Panel
      title="Review Gate"
      meta="This is the key UX safeguard: AI generates, but a human still approves before scheduling."
    >
      {connection.status === "error" ? (
        <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
            Snapshot fallback
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-50/90">
            Live dashboard data is not connected yet. The UI is running on the
            built-in sample snapshot until the feature backend is wired.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Source lineage
          </div>
          <p className="mt-2 text-sm leading-6 text-emerald-50/90">
            Linked to one winning source post with pattern notes preserved.
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Originality
          </div>
          <p className="mt-2 text-sm leading-6 text-cyan-50/90">
            {activeDraft.originality} transformed from the source language and
            visual concept.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Brand tone
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{activeDraft.tone}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
            Risk note
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-50/90">
            Favor supportive civic framing over confrontation and avoid synthetic
            real-event cues.
          </p>
        </div>
      </div>
    </Panel>
  )
})
