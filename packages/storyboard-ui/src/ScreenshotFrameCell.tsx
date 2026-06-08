import { memo, type ReactNode } from "react"

type ScreenshotPaneProps = {
  label: string
  sizeLabel: string
  width: number
  height: number
  scale: number
  action?: ReactNode
  children?: ReactNode
}

type ScreenshotFrameCellProps = {
  title?: string
  description?: string
  desktop?: ReactNode
  mobile?: ReactNode
  square?: ReactNode
  desktopAction?: ReactNode
  mobileAction?: ReactNode
  squareAction?: ReactNode
}

const TOP_WIDTH = 480
const TOP_HEIGHT = 240
const MOBILE_WIDTH = 141
const MOBILE_HEIGHT = 240
const SQUARE_WIDTH = 240
const SQUARE_HEIGHT = 240
const PANE_GAP = 8
const BODY_PADDING = 8
const COMPOSITE_WIDTH = TOP_WIDTH
const COMPOSITE_HEIGHT = TOP_HEIGHT + PANE_GAP + MOBILE_HEIGHT
const COMPOSITE_SCALE = Math.min(
  (720 - BODY_PADDING * 2) / COMPOSITE_WIDTH,
  (720 - BODY_PADDING * 2) / COMPOSITE_HEIGHT,
)

export const ScreenshotFrameCell = memo(function ScreenshotFrameCell({
  title,
  description,
  desktop,
  mobile,
  square,
  desktopAction,
  mobileAction,
  squareAction,
}: ScreenshotFrameCellProps) {
  return (
    <article className="flex h-[720px] w-[720px] flex-col bg-zinc-800 text-white">
      <div className="flex flex-1 items-center justify-center p-0.5">
        <div
          className="origin-center"
          style={{
            height: COMPOSITE_HEIGHT,
            transform: `scale(${COMPOSITE_SCALE})`,
            transformOrigin: "center center",
            width: COMPOSITE_WIDTH,
          }}
        >
          <div className="flex justify-center">
            <ScreenshotPane
              action={desktopAction}
              height={TOP_HEIGHT}
              label="Desktop"
              scale={0.25}
              sizeLabel="1920 x 960"
              width={TOP_WIDTH}
            >
              {desktop}
            </ScreenshotPane>
          </div>
          <div className="mt-2 flex items-start justify-center gap-2">
            <ScreenshotPane
              action={mobileAction}
              height={MOBILE_HEIGHT}
              label="Mobile"
              scale={0.375}
              sizeLabel="375 x 640"
              width={MOBILE_WIDTH}
            >
              {mobile}
            </ScreenshotPane>
            <ScreenshotPane
              action={squareAction}
              height={SQUARE_HEIGHT}
              label="Square"
              scale={0.25}
              sizeLabel="960 x 960"
              width={SQUARE_WIDTH}
            >
              {square}
            </ScreenshotPane>
          </div>
        </div>
      </div>
    </article>
  )
})

function ScreenshotPane({
  action,
  label,
  sizeLabel,
  width,
  height,
  scale,
  children,
}: ScreenshotPaneProps) {
  return (
    <section
      className="relative overflow-hidden border border-zinc-500/70 bg-zinc-900"
      style={{ width, height }}
    >
      {children ? (
        <div className="box-border h-full w-full px-1 pb-1 pt-7">{children}</div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-center">
          <div className="space-y-2 px-4 text-[11px] uppercase tracking-[0.18em] text-white/55">
            <div>{label}</div>
            <div>{sizeLabel}</div>
            <div>{Math.round(scale * 100)}%</div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute left-2 top-2 rounded border border-white/10 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/65">
        {label}
      </div>
      {action ? <div className="absolute right-2 top-2 z-10">{action}</div> : null}
    </section>
  )
}
