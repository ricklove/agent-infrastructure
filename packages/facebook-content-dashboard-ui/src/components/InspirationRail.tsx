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
    <aside className="space-y-3 xl:sticky xl:top-3">
      <Panel
        title="Step 1 · Winning Posts"
        meta="Pick one winner to drive the rest of the workflow."
      >
        <div className="space-y-3">
          {sourcePosts.map((post) => {
            const active = post.id === activeSourceId
            return (
              <div
                key={post.id}
                className={[
                  "rounded-2xl border p-4 transition",
                  active
                    ? "border-cyan-400/35 bg-cyan-500/10 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]"
                    : "border-zinc-800 bg-zinc-950/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100">
                      {post.title}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {post.sourcePage} · {post.publishDate}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Score
                    </div>
                    <div className="mt-1 text-sm font-semibold text-cyan-200">
                      {post.score.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                  <div>
                    <div className="text-zinc-500">Pattern</div>
                    <div className="mt-1 text-zinc-200">{post.pattern}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Status</div>
                    <div className="mt-1">
                      <StatusBadge status={post.status} />
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-zinc-400">{post.hook}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => props.store.selectSource(post.id)}
                    className={[
                      "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                      active
                        ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-50"
                        : "border-zinc-700 bg-zinc-900/80 text-zinc-100 hover:border-zinc-500",
                    ].join(" ")}
                  >
                    {active ? "Selected source" : "Use this winner"}
                  </button>
                  {post.postUrl ? (
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
                    >
                      Open original post
                    </a>
                  ) : null}
                </div>
              </div>
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
