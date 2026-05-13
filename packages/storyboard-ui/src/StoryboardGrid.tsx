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
  frameWidth?: number
  frameHeight?: number
  actionColumnWidth?: number
  nextCellHeight?: number
}

const FRAME_CELL_SIZE = 220
const FRAME_CELL_HEIGHT = 220
const ACTION_COLUMN_WIDTH = 72
const NEXT_CELL_HEIGHT = 96
const GRID_GAP = 16

function gridTemplateColumns(maxFrames: number, frameWidth: number, actionColumnWidth: number) {
  return Array.from({ length: maxFrames }, (_, index) =>
    index === maxFrames - 1
      ? `${frameWidth}px`
      : `${frameWidth}px ${actionColumnWidth}px`,
  ).join(" ")
}

export function StoryboardGrid({
  sequences,
  className,
  renderFrame,
  frameWidth = FRAME_CELL_SIZE,
  frameHeight = FRAME_CELL_HEIGHT,
  actionColumnWidth = ACTION_COLUMN_WIDTH,
  nextCellHeight = NEXT_CELL_HEIGHT,
}: StoryboardGridProps) {
  const maxFrames = Math.max(0, ...sequences.map((sequence) => sequence.frames.length))
  const templateColumns = gridTemplateColumns(maxFrames, frameWidth, actionColumnWidth)

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
          <div
            className="grid items-center"
            style={{
              columnGap: GRID_GAP,
              gridTemplateColumns: templateColumns,
              rowGap: GRID_GAP,
            }}
          >
            {Array.from({ length: maxFrames }, (_, index) => {
              const frame = sequence.frames[index]

              return (
                <>
                  <div key={`${sequence.id}-frame-${index}`}>
                    {frame
                      ? renderFrame
                        ? renderFrame(frame)
                        : <TitleOnlyStoryboardFrame frame={frame} height={frameHeight} width={frameWidth} />
                      : null}
                  </div>
                  {index < maxFrames - 1 ? (
                    <div key={`${sequence.id}-next-${index}`}>
                      {frame && index < sequence.frames.length - 1 ? (
                        <StoryboardNextCell actionColumnWidth={actionColumnWidth} frame={frame} nextCellHeight={nextCellHeight} />
                      ) : null}
                    </div>
                  ) : null}
                </>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function StoryboardNextCell({
  frame,
  actionColumnWidth,
  nextCellHeight,
}: {
  frame: StoryboardGridFrame
  actionColumnWidth: number
  nextCellHeight: number
}) {
  return (
    <div
      className="flex h-24 w-full items-center justify-center rounded border border-dashed border-white/10 bg-black/20 text-[11px] uppercase tracking-[0.18em] text-white/45"
      data-storyboard-next={frame.id}
      style={{ width: actionColumnWidth, height: nextCellHeight }}
    >
      {frame.nextLabel ?? "Next"}
    </div>
  )
}

export function TitleOnlyStoryboardFrame({
  frame,
  width,
  height,
}: {
  frame: StoryboardGridFrame
  width?: number
  height?: number
}) {
  return (
    <article
      className="flex items-start justify-center overflow-hidden border border-zinc-500/70 bg-zinc-800 px-4 py-3 text-center text-xs font-medium leading-snug text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
      data-storyboard-frame={frame.id}
      style={{ width: width ?? FRAME_CELL_SIZE, height: height ?? FRAME_CELL_HEIGHT }}
    >
        <span className="block w-full max-w-full overflow-hidden break-words whitespace-normal">
        {frame.title}
      </span>
    </article>
  )
}
