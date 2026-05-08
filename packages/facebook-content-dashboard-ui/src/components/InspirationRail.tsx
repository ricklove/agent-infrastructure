import { observer, useValue } from "@legendapp/state/react"
import type { FacebookContentDashboardStore } from "../content-dashboard-store"
import { Panel, StatusBadge } from "./primitives"

export const InspirationRail = observer(function InspirationRail(props: {
  store: FacebookContentDashboardStore
}) {
  const sourcePosts = useValue(props.store.state$.sourcePosts)
  const learningSignals = useValue(props.store.state$.learningSignals)
  const activeSourceId = useValue(props.store.state$.selection.activeSourceId)

  return (
    <aside className="min-h-0 space-y-3 2xl:overflow-y-auto 2xl:pr-1">
      <Panel
        title="Inspiration Queue"
        meta="Source posts ranked for reuse potential, not just raw reactions."
      >
        <div className="space-y-3">
          {sourcePosts.map((post) => {
            const active = post.id === activeSourceId
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => props.store.selectSource(post.id)}
                className={[
                  "w-full rounded-2xl border px-4 py-4 text-left transition",
                  active
                    ? "border-cyan-400/35 bg-cyan-500/10"
                    : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-100">
                      {post.title}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {post.sourcePage} · {post.publishDate}
                    </div>
                  </div>
                  <StatusBadge status={post.status} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                  <div>
                    <div className="text-zinc-500">Pattern</div>
                    <div className="mt-1 text-zinc-200">{post.pattern}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Score</div>
                    <div className="mt-1 text-cyan-200">
                      {post.score.toLocaleString()}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-zinc-400">{post.hook}</p>

                {post.postUrl ? (
                  <div className="mt-3 text-[11px]">
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-cyan-200/90 hover:text-cyan-100"
                    >
                      Open post
                    </a>
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel
        title="Pattern Memory"
        meta="What the system should keep learning from each publish cycle."
      >
        <div className="space-y-3">
          {learningSignals.map((signal) => (
            <div
              key={signal.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-100">
                  {signal.label}
                </div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  {signal.value}
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{signal.note}</p>
            </div>
          ))}
        </div>
      </Panel>
    </aside>
  )
})
