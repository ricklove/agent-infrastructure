import { observer } from "@legendapp/state/react"
import type { FacebookContentDashboardStore } from "../content-dashboard-store"
import { MetricChip, StageBadge } from "./primitives"

export const ContentDashboardHeader = observer(function ContentDashboardHeader(
  props: {
    store: FacebookContentDashboardStore
  },
) {
  const steps = props.store.state$.workflowSteps.get()
  const sourceCount = props.store.state$.sourcePosts.get().length
  const draftCount = props.store.state$.drafts.get().length
  const queuedCount = props.store.state$.scheduledPosts.get().length
  const connection = props.store.state$.connection.get()
  const workflow = props.store.state$.workflow.get()

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-3 py-3 sm:px-4 lg:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Dashboard: FacebookMarketing
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Editorial Copilot
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Start by picking a winning post. Then generate a derivative,
              review it, and place it into the publishing queue.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricChip label="Imported" value={`${sourceCount} posts`} />
            <MetricChip label="Drafts" value={`${draftCount} active`} />
            <MetricChip label="Queued" value={`${queuedCount} scheduled`} />
            <MetricChip
              label={
                connection.mode === "snapshot-file" ? "Data source" : "Preview mode"
              }
              value={
                connection.mode === "snapshot-file"
                  ? "Imported snapshot"
                  : "Sample snapshot"
              }
              tone="cyan"
            />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Current task
            </div>
            <div className="mt-2 text-sm font-semibold text-cyan-50">
              {workflow.activeStep === "discover"
                ? "Step 1: Choose a winner"
                : workflow.activeStep === "create"
                  ? "Step 2: Turn it into a draft"
                  : workflow.activeStep === "review"
                    ? "Step 3: Review the active draft"
                    : "Step 4: Confirm page and schedule"}
            </div>
            <p className="mt-2 text-sm leading-6 text-cyan-50/85">
              {workflow.statusMessage}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            {connection.status === "loading"
              ? "Loading content snapshot from the feature backend."
              : connection.status === "ready" &&
                  connection.mode === "snapshot-file"
                ? `Loaded imported content snapshot from ${connection.source ?? "configured source"}.`
                : connection.status === "error"
                  ? "Using the built-in sample snapshot because the live feature backend is not yet reachable from the current session."
                  : "Rendering the feature shell with packaged sample data."}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {steps.map((step, index) => (
            <div key={step.id} className="space-y-2">
              <StageBadge step={`0${index + 1}`} label={step.label} />
              <p className="px-1 text-xs leading-5 text-zinc-500">{step.note}</p>
            </div>
          ))}
        </div>
      </div>
    </header>
  )
})
