import { memo, type ReactNode } from "react"

type ScreenshotPaneProps = {
  label: string
  sizeLabel: string
  width: number
  height: number
  scale: number
  children?: ReactNode
}

type ScreenshotFrameCellProps = {
  title?: string
  desktop?: ReactNode
  mobile?: ReactNode
  square?: ReactNode
}

const TOP_WIDTH = 480
const TOP_HEIGHT = 240
const MOBILE_WIDTH = 141
const MOBILE_HEIGHT = 240
const SQUARE_WIDTH = 240
const SQUARE_HEIGHT = 240

export const ScreenshotFrameCell = memo(function ScreenshotFrameCell({
  title,
  desktop,
  mobile,
  square,
}: ScreenshotFrameCellProps) {
  return (
    <article className="flex h-[720px] w-[720px] flex-col border border-zinc-500/70 bg-zinc-800 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      {title ? (
        <div className="border-b border-white/10 px-4 py-3 text-sm font-medium leading-tight text-white">
          {title}
        </div>
      ) : null}
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <div className="flex flex-col gap-6">
          <div className="flex justify-center">
            <ScreenshotPane
              height={TOP_HEIGHT}
              label="Desktop"
              scale={0.25}
              sizeLabel="1920 x 960"
              width={TOP_WIDTH}
            >
              {desktop}
            </ScreenshotPane>
          </div>
          <div className="flex items-start justify-center gap-6">
            <ScreenshotPane
              height={MOBILE_HEIGHT}
              label="Mobile"
              scale={0.375}
              sizeLabel="375 x 640"
              width={MOBILE_WIDTH}
            >
              {mobile}
            </ScreenshotPane>
            <ScreenshotPane
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
        <div className="box-border h-full w-full px-4 pb-4 pt-11">{children}</div>
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
    </section>
  )
}
