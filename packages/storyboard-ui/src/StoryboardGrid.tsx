import type { ReactNode } from "react"

export type StoryboardGridFrame = {
  id: string
  title: string
  nextLabel?: string
}

export type StoryboardGridSequence = {
  id: string
  title?: string
  frames: StoryboardGridFrame[]
}

type StoryboardGridProps = {
  sequences: StoryboardGridSequence[]
  className?: string
  renderFrame?: (frame: StoryboardGridFrame) => ReactNode
  renderFrameHeaderControls?: (frame: StoryboardGridFrame) => ReactNode
}

export function StoryboardGrid({
  sequences,
  className,
  renderFrame,
  renderFrameHeaderControls,
  renderFrameHeaderControls,
}: StoryboardGridProps) {
  return (
    <div className={`flex min-h-0 flex-col gap-6 ${className ?? ""}`}>
      {sequences.map((sequence) => (
        <section
          className="flex min-w-max flex-col gap-3"
          data-storyboard-sequence={sequence.id}
          key={sequence.id}
        >
          {sequence.title ? (
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
              {sequence.title}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {sequence.frames.map((frame, index) => (
              <div className="flex items-center gap-3" key={frame.id}>
                {renderFrame ? (
                  renderFrame(frame)
                ) : (
                  <TitleOnlyStoryboardFrame frame={frame} />
                )}
                {index < sequence.frames.length - 1 ? (
                  <div
                    className="flex h-24 w-20 shrink-0 items-center justify-center rounded border border-dashed border-white/10 bg-black/20 text-[11px] uppercase tracking-[0.18em] text-white/45"
                    data-storyboard-next={frame.id}
                  >
                    {frame.nextLabel ?? "Next"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function TitleOnlyStoryboardFrame({
  frame,
}: {
  frame: StoryboardGridFrame
}) {
  return (
    <article
      className="flex h-24 w-48 shrink-0 items-center justify-center border border-white/10 bg-zinc-900 px-4 text-center text-base font-medium text-white"
      data-storyboard-frame={frame.id}
    >
      <span className="line-clamp-3">{frame.title}</span>
    </article>
  )
}
