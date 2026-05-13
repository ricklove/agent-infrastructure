import { useRef, useState, type ReactNode } from "react"

export type StoryboardGridFrame = {
  id: string
  title: string
  nextLabel?: string
  branchLabels?: string[]
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

async function copyTextToClipboard(text: string) {
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

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
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
                        />
                      ) : frame && frameIndex < sequence.frames.length - 1 ? (
                        <StoryboardNextCell
                          actionColumnWidth={actionColumnWidth}
                          frame={frame}
                          nextCellHeight={nextCellHeight}
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
      <button
        aria-label={`Copy link to ${frame.title}`}
        className={`nopan nowheel absolute -top-3 right-0 z-10 flex h-7 w-7 items-center justify-center rounded bg-slate-900 shadow-sm transition group-hover:opacity-100 focus:opacity-100 ${
          copyState === "failed"
            ? "border border-rose-300/40 text-rose-100 opacity-100"
            : copyState === "copied"
              ? "border border-emerald-300/40 text-emerald-100 opacity-100"
              : "border border-cyan-300/30 text-cyan-100 opacity-0"
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
      <div
        className={
          isSelected
            ? "rounded shadow-[0_0_0_1px_rgba(125,211,252,0.8),0_0_0_6px_rgba(56,189,248,0.12)]"
            : ""
        }
      >
        {children}
      </div>
    </div>
  )
}

function StoryboardStartCell({
  label,
  actionColumnWidth,
  nextCellHeight,
}: {
  label: string
  actionColumnWidth: number
  nextCellHeight: number
}) {
  return (
    <div
      className="flex w-full items-center justify-center rounded border border-amber-300/20 bg-amber-200/10 text-[11px] uppercase tracking-[0.18em] text-amber-100/80"
      style={{ width: actionColumnWidth, height: nextCellHeight }}
    >
      {label}
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
      <div className="flex h-full w-full flex-col items-center justify-between gap-3">
        <span className="block w-full max-w-full overflow-hidden break-words whitespace-normal">
          {frame.title}
        </span>
        {frame.branchLabels?.length ? (
          <div className="flex w-full flex-col items-center gap-2 pt-2">
            {frame.branchLabels.map((label) => (
              <div
                className="w-full border border-amber-300/30 bg-amber-200/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100/85"
                key={label}
              >
                {label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
