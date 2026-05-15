import { useRef, useState, type ReactNode } from "react"

export type StoryboardGridFrame = {
  id: string
  title: string
  description?: string
  nextLabel?: string
}

function storyboardFrameAnchorId(frameId: string) {
  return `storyboard-frame-${frameId}`
}

function preferredStoryboardOrigin() {
  if (typeof window === "undefined") {
    return ""
  }
  return window.location.origin
}

function isEphemeralStoryboardOrigin(origin: string) {
  if (!origin) {
    return true
  }
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return true
  }

  const hostname = url.hostname.toLowerCase()
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".trycloudflare.com") ||
    hostname.endsWith(".baseconnect-agents.com")
  )
}

function storyboardFrameLink(frameId: string) {
  const origin = preferredStoryboardOrigin()
  const url = new URL("/storyboard", origin || "http://127.0.0.1:3000")
  const storyboardId = currentStoryboardId()

  if (storyboardId) {
    url.searchParams.set("storyboardId", storyboardId)
  }
  url.searchParams.set("frameId", frameId)

  return origin && !isEphemeralStoryboardOrigin(origin)
    ? `${url.origin}${url.pathname}${url.search}${url.hash}`
    : `${url.pathname}${url.search}${url.hash}`
}

function currentStoryboardId() {
  if (typeof window === "undefined") {
    return ""
  }
  const parts = window.location.pathname.split("/").filter(Boolean)

  if (parts[0] !== "storyboard") {
    return ""
  }

  if (parts[1] === "debug") {
    const componentSlug = parts[2] ?? ""
    const scenarioSlug = parts[3] ?? ""
    return scenarioSlug
      ? `debug:${componentSlug}:${scenarioSlug}`
      : componentSlug
        ? `debug:${componentSlug}`
        : "debug"
  }

  const pathRemainder = parts.slice(1).join(":")
  if (pathRemainder) {
    return pathRemainder
  }

  return parts[0]
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back to document copy below when the live surface blocks clipboard writes.
    }
  }

  if (typeof document === "undefined") {
    return false
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.setAttribute("aria-hidden", "true")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "-9999px"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let copied = false
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  }

  document.body.removeChild(textarea)
  if (selection) {
    selection.removeAllRanges()
    if (previousRange) selection.addRange(previousRange)
  }

  return copied
}

function LinkIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M10.5 13.5L13.5 10.5M8.25 15.75L6.75 17.25A3.182 3.182 0 1021.75 6.25l-1.5 1.5M15.75 8.25l1.5-1.5A3.182 3.182 0 106.25 17.75l1.5-1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M5 12.5l4.2 4.2L19 7.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  )
}

export type StoryboardGridSequence = {
  id: string
  title?: string
  frames: StoryboardGridFrame[]
  startColumn?: number
  startLabel?: string
  sourceFrameId?: string
}

type StoryboardGridProps = {
  sequences: StoryboardGridSequence[]
  className?: string
  renderFrame?: (frame: StoryboardGridFrame) => ReactNode
  frameWidth?: number
  frameHeight?: number
  actionColumnWidth?: number
  nextCellHeight?: number
  selectedFrameId?: string
  onFrameClick?: (frame: StoryboardGridFrame) => void
  selectedSequenceId?: string
  onSequenceTitleClick?: (sequence: StoryboardGridSequence) => void
  onTransitionClick?: (transition: {
    sourceFrameId: string
    label: string
    sequenceId: string
  }) => void
}

const FRAME_CELL_SIZE = 220
const FRAME_CELL_HEIGHT = 220
const ACTION_COLUMN_WIDTH = 72
const NEXT_CELL_HEIGHT = 96
const GRID_GAP = 16

function gridTemplateColumns(
  maxFrames: number,
  frameWidth: number,
  actionColumnWidth: number,
) {
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
  selectedFrameId,
  onFrameClick,
  selectedSequenceId,
  onSequenceTitleClick,
  onTransitionClick,
}: StoryboardGridProps) {
  const maxFrames = Math.max(
    0,
    ...sequences.map(
      (sequence) => (sequence.startColumn ?? 0) + sequence.frames.length,
    ),
  )
  const templateColumns = gridTemplateColumns(
    maxFrames,
    frameWidth,
    actionColumnWidth,
  )

  return (
    <div className={`flex min-h-0 flex-col gap-6 ${className ?? ""}`}>
      {sequences.map((sequence) => (
        <section
          className="flex min-w-max flex-col gap-3"
          data-storyboard-sequence={sequence.id}
          key={sequence.id}
        >
          {sequence.title ? (
            onSequenceTitleClick ? (
              <button
                className={`self-start bg-transparent p-0 text-left text-[11px] uppercase tracking-[0.22em] transition ${
                  selectedSequenceId === sequence.id
                    ? "text-cyan-100"
                    : "text-white/45 hover:text-cyan-100"
                }`}
                data-storyboard-sequence-title={sequence.id}
                onClick={() => onSequenceTitleClick(sequence)}
                type="button"
              >
                {sequence.title}
              </button>
            ) : (
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                {sequence.title}
              </div>
            )
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
              const frameIndex = index - (sequence.startColumn ?? 0)
              const frame = frameIndex >= 0 ? sequence.frames[frameIndex] : undefined
              const shouldRenderStartLabel =
                !!sequence.startLabel && index === (sequence.startColumn ?? 0) - 1

              return (
                <>
                  <div key={`${sequence.id}-frame-${index}`}>
                    {frame ? (
                      <StoryboardGridFrameShell
                        frame={frame}
                        isSelected={selectedFrameId === frame.id}
                        onClick={onFrameClick}
                      >
                        {renderFrame ? (
                          renderFrame(frame)
                        ) : (
                          <TitleOnlyStoryboardFrame
                            frame={frame}
                            height={frameHeight}
                            width={frameWidth}
                          />
                        )}
                      </StoryboardGridFrameShell>
                    ) : null}
                  </div>
                  {index < maxFrames - 1 ? (
                    <div key={`${sequence.id}-next-${index}`}>
                      {shouldRenderStartLabel ? (
                        <StoryboardStartCell
                          actionColumnWidth={actionColumnWidth}
                          label={sequence.startLabel!}
                          nextCellHeight={nextCellHeight}
                          onClick={
                            sequence.sourceFrameId
                              ? () =>
                                  onTransitionClick?.({
                                    sourceFrameId: sequence.sourceFrameId!,
                                    label: sequence.startLabel!,
                                    sequenceId: sequence.id,
                                  })
                              : undefined
                          }
                        />
                      ) : frame && frameIndex < sequence.frames.length - 1 ? (
                        <StoryboardNextCell
                          actionColumnWidth={actionColumnWidth}
                          frame={frame}
                          nextCellHeight={nextCellHeight}
                          onClick={() =>
                            onTransitionClick?.({
                              sourceFrameId: frame.id,
                              label: frame.nextLabel ?? "Next",
                              sequenceId: sequence.id,
                            })
                          }
                        />
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

function StoryboardGridFrameShell({
  frame,
  isSelected = false,
  onClick,
  children,
}: {
  frame: StoryboardGridFrame
  isSelected?: boolean
  onClick?: (frame: StoryboardGridFrame) => void
  children: ReactNode
}) {
  const timeoutRef = useRef<number | undefined>(undefined)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  )
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [descriptionPinned, setDescriptionPinned] = useState(false)

  async function handleCopyLink() {
    const link = storyboardFrameLink(frame.id)

    try {
      const copied = await copyTextToClipboard(link)
      if (!copied) {
        throw new Error("Clipboard copy failed")
      }
      setCopyState("copied")
      if (typeof window !== "undefined") {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(() => setCopyState("idle"), 1200)
      }
    } catch {
      setCopyState("failed")
      if (typeof window !== "undefined") {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(() => setCopyState("idle"), 1200)
      }
    }
  }

  function handleSelect() {
    onClick?.(frame)
  }

  return (
    <div
      aria-label={onClick ? `Select frame ${frame.title}` : undefined}
      className={`group relative scroll-mt-8 ${onClick ? "cursor-pointer" : ""}`}
      data-storyboard-frame-shell={frame.id}
      id={storyboardFrameAnchorId(frame.id)}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (!onClick) {
          return
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          handleSelect()
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div
        className={`overflow-hidden border border-zinc-500/70 bg-zinc-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] ${
          isSelected
            ? "rounded ring-2 ring-cyan-300/80 ring-offset-2 ring-offset-[#546072] shadow-[0_0_0_1px_rgba(125,211,252,0.8),0_0_0_6px_rgba(56,189,248,0.12)]"
            : ""
        }`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium leading-tight text-white">
          <div className="flex-1">{frame.title}</div>
          {frame.description ? (
            <button
              aria-expanded={descriptionOpen}
              aria-label={`Show frame description for ${frame.title}`}
              className={`nopan nowheel inline-flex h-6 w-6 items-center justify-center rounded border text-[11px] font-semibold ${
                descriptionOpen
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-white/10 bg-black/30 text-white/60"
              }`}
              onClick={(event) => {
                event.stopPropagation()
                setDescriptionPinned((current) => {
                  const next = !current
                  setDescriptionOpen(next)
                  return next
                })
              }}
              onMouseEnter={() => setDescriptionOpen(true)}
              onMouseLeave={() => {
                if (!descriptionPinned) {
                  setDescriptionOpen(false)
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              i
            </button>
          ) : null}
          <button
            aria-label={`Copy link to ${frame.title}`}
            className={`nopan nowheel inline-flex h-6 w-6 items-center justify-center rounded bg-slate-900/95 shadow-sm ${
              copyState === "failed"
                ? "border border-rose-300/40 text-rose-100"
                : copyState === "copied"
                  ? "border border-emerald-300/40 text-emerald-100"
                  : "border border-cyan-300/30 text-cyan-100"
            }`}
            data-storyboard-copy-link={frame.id}
            onClick={(event) => {
              event.stopPropagation()
              void handleCopyLink()
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title={
              copyState === "copied"
                ? "Copied link"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy frame link"
            }
            type="button"
          >
            {copyState === "copied" ? <CheckIcon /> : <LinkIcon />}
          </button>
        </div>
        {descriptionOpen && frame.description ? (
          <div
            className="pointer-events-none absolute inset-x-3 top-11 z-20"
            onMouseEnter={() => setDescriptionOpen(true)}
            onMouseLeave={() => {
              if (!descriptionPinned) {
                setDescriptionOpen(false)
              }
            }}
          >
            <div className="pointer-events-auto rounded border border-cyan-300/30 bg-zinc-950/98 px-3 py-2 text-xs leading-relaxed text-white/80 shadow-[0_12px_28px_rgba(0,0,0,0.38)]">
              {frame.description}
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

function StoryboardStartCell({
  label,
  actionColumnWidth,
  nextCellHeight,
  onClick,
}: {
  label: string
  actionColumnWidth: number
  nextCellHeight: number
  onClick?: () => void
}) {
  const Component = onClick ? "button" : "div"
  return (
    <Component
      className={`flex w-full items-center justify-center rounded border border-amber-300/20 bg-amber-200/10 text-[11px] uppercase tracking-[0.18em] text-amber-100/80 ${
        onClick
          ? "nopan nowheel cursor-pointer transition hover:border-amber-200/40 hover:bg-amber-200/15"
          : ""
      }`}
      data-storyboard-transition={label}
      onClick={onClick}
      onPointerDown={onClick ? (event) => event.stopPropagation() : undefined}
      style={{ width: actionColumnWidth, height: nextCellHeight }}
      type={onClick ? "button" : undefined}
    >
      {label}
    </Component>
  )
}

function StoryboardNextCell({
  frame,
  actionColumnWidth,
  nextCellHeight,
  onClick,
}: {
  frame: StoryboardGridFrame
  actionColumnWidth: number
  nextCellHeight: number
  onClick?: () => void
}) {
  const Component = onClick ? "button" : "div"
  return (
    <Component
      className={`flex h-24 w-full items-center justify-center rounded border border-dashed border-white/10 bg-black/20 text-[11px] uppercase tracking-[0.18em] text-white/45 ${
        onClick
          ? "nopan nowheel cursor-pointer transition hover:border-cyan-300/30 hover:bg-white/5 hover:text-cyan-100"
          : ""
      }`}
      data-storyboard-next={frame.id}
      onClick={onClick}
      onPointerDown={onClick ? (event) => event.stopPropagation() : undefined}
      style={{ width: actionColumnWidth, height: nextCellHeight }}
      type={onClick ? "button" : undefined}
    >
      {frame.nextLabel ?? "Next"}
    </Component>
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
      className="flex items-center justify-center overflow-hidden bg-zinc-800 px-4 py-3 text-center text-xs font-medium leading-snug text-white"
      data-storyboard-frame={frame.id}
      style={{ width: width ?? FRAME_CELL_SIZE, height: height ?? FRAME_CELL_HEIGHT }}
    >
      <div className="h-full w-full rounded border border-white/10 bg-black/10" />
    </article>
  )
}
