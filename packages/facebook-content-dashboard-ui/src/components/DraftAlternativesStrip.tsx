export type DraftAlternativeCard = {
  id: string
  title: string
  caption: string
  previewImage: string
}

type DraftAlternativesStripProps = {
  generationTag: string | null
  alternatives: DraftAlternativeCard[]
  onSelectDraft: (draftId: string) => void
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
            onClick={props.onRegenerateSet}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700"
          >
            Regenerate set
          </button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {props.alternatives.map((draft) => (
          <button
            key={draft.id}
            type="button"
            onClick={() => props.onSelectDraft(draft.id)}
            className="flex min-w-[240px] max-w-[240px] shrink-0 flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left transition hover:border-zinc-700"
          >
            <img
              src={draft.previewImage}
              alt={draft.title}
              className="h-28 w-full rounded-md border border-zinc-800 object-cover"
            />
            <div className="text-sm font-semibold text-zinc-100">{draft.title}</div>
            <div className="line-clamp-4 text-sm leading-5 text-zinc-300">{draft.caption}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
