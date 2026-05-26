import { observer } from "@legendapp/state/react"
import { getActiveDraft } from "../content-dashboard-selectors"
import type { FacebookContentDashboardStore } from "../content-dashboard-store"
import { Panel, StatusBadge } from "./primitives"

const pageOptions = [
  "Thin Blue Line Supporters",
  "Support Law Enforcement",
  "Community Safety Network",
]

export const PublishingRail = observer(function PublishingRail(props: {
  store: FacebookContentDashboardStore
}) {
  const state = props.store.state$.get()
  const scheduledPosts = state.scheduledPosts
  const activeDraft = getActiveDraft(state)
  const workflow = state.workflow
  const scheduling = state.scheduling

  return (
    <aside className="space-y-3 xl:sticky xl:top-3">
      <Panel
        title="Step 5 · Schedule The Approved Draft"
        meta="Confirm the page and queue slot here instead of inferring it from static text."
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Selected creative
            </div>
            <div className="mt-2 text-sm font-semibold text-cyan-50">
              {activeDraft.title}
            </div>
            <p className="mt-2 text-sm leading-6 text-cyan-50/85">
              Current step: {workflow.activeStep}. Approval and scheduling now
              happen through explicit controls.
            </p>
          </div>

          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Target page
            </div>
            <select
              value={scheduling.targetPage}
              onChange={(event) => props.store.setTargetPage(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
            >
              {pageOptions.map((pageName) => (
                <option key={pageName} value={pageName}>
                  {pageName}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Scheduled slot
            </div>
            <input
              type="text"
              value={scheduling.scheduledFor}
              onChange={(event) =>
                props.store.setScheduledFor(event.target.value)
              }
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
            />
          </label>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Approval status
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-zinc-200">
                  Human approval remains required before scheduling
                </div>
                <StatusBadge status={activeDraft.stage} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Next publish action
              </div>
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => props.store.scheduleActiveDraft()}
                  className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-left text-sm font-semibold text-cyan-50 hover:border-cyan-300/50"
                >
                  Approve and schedule
                </button>
                <button
                  type="button"
                  onClick={() => props.store.sendBackToDraftStudio()}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-500"
                >
                  Send back to Draft Studio
                </button>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Publish Queue"
        meta="Statuses matter: draft, needs review, approved, scheduled, published."
      >
        <div className="space-y-3">
          {scheduledPosts.map((post) => (
            <div
              key={post.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {post.creative}
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">{post.pageName}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                    {post.scheduledFor}
                  </div>
                </div>
                <StatusBadge status={post.stage} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Learning Loop"
        meta="Publishing should improve the next prompt, queue, and scoring pass."
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              After publish
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Pull back shares, comments, hide rate, and schedule timing so the
              next source ranking and prompt template reflect what actually
              performed.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Product principle
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              This should feel like an editor&apos;s bench, not an autoposter:
              source transparency, human review, then measured scheduling.
            </p>
          </div>
        </div>
      </Panel>
    </aside>
  )
})
