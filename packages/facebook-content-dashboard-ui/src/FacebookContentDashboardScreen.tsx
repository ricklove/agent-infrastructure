import { useEffect, useState } from "react"
import { ContentDashboardHeader } from "./components/ContentDashboardHeader"
import { InspirationRail } from "./components/InspirationRail"
import { PublishingRail } from "./components/PublishingRail"
import {
  DraftStudioPanel,
  ReviewGatePanel,
  SourceAnalysisPanel,
} from "./components/WorkbenchPanels"
import { fetchContentDashboardSnapshot } from "./content-dashboard-client"
import { createFacebookContentDashboardStore } from "./content-dashboard-store"

export type FacebookContentDashboardScreenProps = {
  apiRootUrl?: string
}

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ContentDashboardHeader store={store} />

        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-5">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto 2xl:grid-cols-[300px_minmax(0,1fr)_340px] 2xl:overflow-hidden">
            <InspirationRail store={store} />

            <main className="min-h-0 space-y-3 2xl:overflow-y-auto 2xl:pr-1">
              <SourceAnalysisPanel store={store} />
              <DraftStudioPanel store={store} />
              <ReviewGatePanel store={store} />
            </main>

            <PublishingRail store={store} />
          </div>
        </div>
      </div>
    </div>
  )
}
