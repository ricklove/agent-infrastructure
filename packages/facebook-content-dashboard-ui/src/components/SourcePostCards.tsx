type SourcePostCardData = {
  title: string
  sourcePage: string
  dateLabel: string
  previewText: string
  imageSrc: string
  likesLabel: string
  commentsLabel: string
  sharesLabel: string
}

type SourcePostCardBaseProps = {
  post: SourcePostCardData
  onClick: () => void
}

export function CompactSelectedSourceCardSurface(props: SourcePostCardBaseProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex w-full max-w-[760px] items-start gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
        <img
          src={props.post.imageSrc}
          alt={props.post.title}
          className="h-full max-h-full w-full max-w-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
          <span className="truncate font-medium text-zinc-200">{props.post.sourcePage}</span>
          <span>{props.post.dateLabel}</span>
        </div>
        <div className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-100">{props.post.previewText}</div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
          <span>{props.post.likesLabel} likes</span>
          <span>{props.post.commentsLabel} comments</span>
          <span>{props.post.sharesLabel} shares</span>
        </div>
      </div>
    </button>
  )
}

export function SelectedSourceCardSurface(props: SourcePostCardBaseProps & { preview: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500/[0.08] p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
    >
      {props.preview}
      <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
        <span>{props.post.dateLabel}</span>
        <div className="flex items-center gap-3 text-zinc-500">
          <span>{props.post.likesLabel} likes</span>
          <span>{props.post.commentsLabel} comments</span>
          <span>{props.post.sharesLabel} shares</span>
        </div>
      </div>
    </button>
  )
}

export function SourcePostOptionCardSurface(props: SourcePostCardBaseProps & { active: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "w-full rounded-lg border px-3 py-3 text-left transition",
        props.active
          ? "border-cyan-500/40 bg-cyan-500/10"
          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 sm:h-28 sm:w-28">
          <img
            src={props.post.imageSrc}
            alt={props.post.title}
            className="h-full max-h-full w-full max-w-full object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
            <span className="truncate font-medium text-zinc-300">{props.post.sourcePage}</span>
            <span>{props.post.dateLabel}</span>
          </div>
          <div className="mt-2 line-clamp-4 text-sm leading-5 text-zinc-100">{props.post.previewText}</div>
          <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-zinc-500">
            <span>{props.post.likesLabel} likes</span>
            <span>{props.post.commentsLabel} comments</span>
            <span>{props.post.sharesLabel} shares</span>
          </div>
        </div>
      </div>
    </button>
  )
}
