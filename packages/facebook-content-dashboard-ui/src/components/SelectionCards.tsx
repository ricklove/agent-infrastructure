type SelectionCardBaseProps = {
  title: string
  meta: string
  onClick: () => void
}

export function ChoiceCardSurface(props: SelectionCardBaseProps) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault()
        props.onClick()
      }}
      onClick={props.onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-left transition hover:border-zinc-700"
    >
      <div>
        <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      <span className="text-zinc-500">›</span>
    </button>
  )
}

export function ContextCardSurface(props: SelectionCardBaseProps) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault()
        props.onClick()
      }}
      onClick={props.onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/10 px-3 py-2 text-left transition hover:border-zinc-700 hover:bg-zinc-950/20"
    >
      <div>
        <div className="text-sm font-semibold text-zinc-200">{props.title}</div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      <span className="text-zinc-600">•</span>
    </button>
  )
}

export function SelectedCardSurface(
  props: SelectionCardBaseProps & { tone?: "active" | "context" },
) {
  const tone = props.tone ?? "active"

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault()
        props.onClick()
      }}
      onClick={props.onClick}
      className={[
        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition",
        tone === "active"
          ? "border border-cyan-500/30 bg-cyan-500/[0.08] hover:border-cyan-400/40 hover:bg-cyan-500/[0.11]"
          : "border border-zinc-800/80 bg-zinc-950/20 hover:border-zinc-700 hover:bg-zinc-950/30",
      ].join(" ")}
    >
      <div>
        <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
        <div className="mt-1 text-xs text-zinc-500">{props.meta}</div>
      </div>
      {tone === "active" ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-200">
          <EditIcon />
        </div>
      ) : (
        <span className="text-zinc-600">•</span>
      )}
    </button>
  )
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m11.75 2.75 1.5 1.5" />
      <path d="m3 13 2.75-.5 6.75-6.75-2.25-2.25L3.5 10.25 3 13Z" />
    </svg>
  )
}
