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

  return (
    <header className="shrink-0 border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-3 py-3 sm:px-4 lg:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Dashboard: FacebookMarketing
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Editorial Copilot
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Turn proven Facebook patterns into original drafts, review them
              against tone and originality, then schedule them with clear human
              approval.
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

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
          {connection.status === "loading"
            ? "Loading content snapshot from the feature backend."
            : connection.status === "ready" && connection.mode === "snapshot-file"
              ? `Loaded imported content snapshot from ${connection.source ?? "configured source"}.`
              : connection.status === "error"
                ? "Using the built-in sample snapshot because the live feature backend is not yet reachable from the current session."
                : "Rendering the feature shell with packaged sample data."}
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
