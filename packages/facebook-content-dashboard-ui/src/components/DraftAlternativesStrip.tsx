import { DraftPostPreviewFrame } from "./DraftPostPreviewFrame"
import { OptionGrid } from "./OptionGrid"
import { IconOnlyButton } from "./primitives"

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
          <IconOnlyButton
            onClick={props.onRegenerateSet}
            title="Regenerate set"
            compact
          >
            <RefreshIcon />
          </IconOnlyButton>
        </div>
      </div>
      <OptionGrid
        label="Alternative drafts"
        columnsClassName="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
      >
        {props.alternatives.map((draft) => (
          <button
            key={draft.id}
            type="button"
            onClick={() => props.onSelectDraft(draft.id)}
            className="relative flex h-[154px] w-[180px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 text-left transition hover:border-zinc-700"
          >
            <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-2">
              <div className="inline-flex min-h-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950/88 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[0_8px_18px_rgba(0,0,0,0.35)]">
                Use
              </div>
              <IconOnlyButton
                onClick={(event) => {
                  event.stopPropagation()
                  props.onDeleteDraft(draft.id)
                }}
                title="Delete draft"
                tone="danger"
                compact
              >
                <TrashIcon />
              </IconOnlyButton>
            </div>
            <div className="relative h-[126px] w-[170px] overflow-hidden rounded-lg">
              <div className="absolute left-0 top-0 origin-top-left scale-50">
                <DraftPostPreviewFrame
                  pageName={props.pageName}
                  previewImage={draft.previewImage}
                  title={draft.title}
                  caption={draft.caption}
                />
              </div>
            </div>
          </button>
        ))}
      </OptionGrid>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 5.5h4v4" />
      <path d="M16 14.5h-4v-4" />
      <path d="M6.5 13.5A5 5 0 0 0 15 10" />
      <path d="M13.5 6.5A5 5 0 0 0 5 10" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 5.5h13" />
      <path d="M8 3.5h4" />
      <path d="M6 5.5v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-10" />
      <path d="M8 8.5v5" />
      <path d="M12 8.5v5" />
    </svg>
  )
}
