import { DraftPostPreviewFrame } from "./DraftPostPreviewFrame"

export type DraftAlternativeCard = {
  id: string
  title: string
  caption: string
  previewImage: string
}

type DraftAlternativesStripProps = {
  generationTag: string | null
  pageName: string
  alternatives: DraftAlternativeCard[]
  onSelectDraft: (draftId: string) => void
  onDeleteDraft: (draftId: string) => void
  onRegenerateSet: () => void
}

export function DraftAlternativesStrip(props: DraftAlternativesStripProps) {
  if (props.alternatives.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-100">Alternatives</div>
        <div className="flex items-center gap-2">
          {props.generationTag ? (
            <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500">
              set {props.generationTag}
            </div>
          ) : null}
          <button
            type="button"
            title="Regenerate set"
            onClick={props.onRegenerateSet}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 transition hover:border-zinc-700"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {props.alternatives.map((draft) => (
          <div
            key={draft.id}
            className="flex w-[356px] min-w-[356px] shrink-0 flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => props.onSelectDraft(draft.id)}
                className="inline-flex min-h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-100 transition hover:border-zinc-600"
              >
                Use
              </button>
              <button
                type="button"
                title="Delete draft"
                onClick={() => props.onDeleteDraft(draft.id)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-200"
              >
                <TrashIcon />
              </button>
            </div>
            <button
              type="button"
              onClick={() => props.onSelectDraft(draft.id)}
              className="block overflow-hidden rounded-lg text-left"
            >
              <div className="h-[252px] w-[340px] overflow-hidden">
                <div className="origin-top-left scale-50">
                  <DraftPostPreviewFrame
                    pageName={props.pageName}
                    previewImage={draft.previewImage}
                    title={draft.title}
                    caption={draft.caption}
                  />
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 5.5h4v4" />
      <path d="M16 14.5h-4v-4" />
      <path d="M6.5 13.5A5 5 0 0 0 15 10" />
      <path d="M13.5 6.5A5 5 0 0 0 5 10" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 5.5h13" />
      <path d="M8 3.5h4" />
      <path d="M6 5.5v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-10" />
      <path d="M8 8.5v5" />
      <path d="M12 8.5v5" />
    </svg>
  )
}
