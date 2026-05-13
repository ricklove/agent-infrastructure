import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { PanZoomContainer, type PanZoomContainerHandle } from "../PanZoomContainer"
import { StoryboardGrid, type StoryboardGridSequence } from "../StoryboardGrid"
import { ScreenshotFrameCell } from "../ScreenshotFrameCell"
import {
  chatAppLargeGridSequences,
  chatAppStoryboardDocuments,
  type StoryOutline,
  type StoryOutlineStep,
} from "./chatAppStoryboardDataset"
import type { StoryboardDebugComponentDefinition } from "./types"

const singleSequenceDataset: StoryboardGridSequence[] = [
  {
    id: "sequence-a",
    title: "Sequence A",
    frames: [
      { id: "a1", title: "Frame A1", nextLabel: "Next" },
      { id: "a2", title: "Frame A2", nextLabel: "Next" },
      { id: "a3", title: "Frame A3", nextLabel: "Next" },
      { id: "a4", title: "Frame A4" },
    ],
  },
]

const twoSequenceDataset: StoryboardGridSequence[] = [
  {
    id: "sequence-a",
    title: "Sequence A",
    frames: [
      { id: "a1", title: "A1", nextLabel: "Next" },
      { id: "a2", title: "A2", nextLabel: "Next" },
      { id: "a3", title: "A3", nextLabel: "Next" },
      { id: "a4", title: "A4" },
    ],
  },
  {
    id: "sequence-b",
    title: "Sequence B",
    frames: [
      { id: "b1", title: "B1", nextLabel: "Next" },
      { id: "b2", title: "B2", nextLabel: "Next" },
      { id: "b3", title: "B3", nextLabel: "Next" },
      { id: "b4", title: "B4" },
    ],
  },
]

const mixedTitleDataset: StoryboardGridSequence[] = [
  {
    id: "sequence-a",
    title: "Sequence A",
    frames: [
      { id: "a1", title: "Short", nextLabel: "Next" },
      { id: "a2", title: "Medium length title", nextLabel: "Next" },
      {
        id: "a3",
        title: "Very long frame title that should wrap cleanly inside the cell",
        nextLabel: "Next",
      },
      { id: "a4", title: "End" },
    ],
  },
  {
    id: "sequence-b",
    title: "Sequence B",
    frames: [
      { id: "b1", title: "B1", nextLabel: "Next" },
      { id: "b2", title: "B2", nextLabel: "Next" },
      { id: "b3", title: "B3", nextLabel: "Next" },
      { id: "b4", title: "B4" },
    ],
  },
]

const branchingDataset: StoryboardGridSequence[] = [
  {
    id: "account-main",
    title: "Main path",
    frames: [
      { id: "start", title: "Open app", nextLabel: "Enter phone" },
      { id: "phone", title: "Enter phone number", nextLabel: "Verify code" },
      {
        id: "verify",
        title: "Enter verification code",
        nextLabel: "Continue",
        branchLabels: ["Invalid code", "Account exists"],
      },
      { id: "created", title: "Account created" },
    ],
  },
  {
    id: "invalid-code",
    title: "Branch: invalid code",
    startColumn: 3,
    startLabel: "Invalid code",
    frames: [
      { id: "invalid", title: "Show retry and resend options", nextLabel: "Retry" },
      { id: "retry", title: "Return to code entry" },
    ],
  },
  {
    id: "account-exists",
    title: "Branch: account exists",
    startColumn: 3,
    startLabel: "Account exists",
    frames: [
      { id: "exists", title: "Prompt sign in or recover", nextLabel: "Sign in" },
      { id: "signin", title: "Restore existing inbox" },
    ],
  },
]

const chatAppLargeDataset: StoryboardGridSequence[] = chatAppLargeGridSequences()

function normalizeBranchLabel(branchText: string) {
  return branchText.split("->")[0]?.trim() ?? branchText.trim()
}

function normalizeBranchOutcome(branchText: string) {
  return branchText.split("->").slice(1).join("->").trim() || branchText.trim()
}

function stepLabel(step: StoryOutlineStep) {
  return step.kind === "verify" ? `Verify: ${step.text}` : step.text
}

function anchorScore(step: StoryOutlineStep, branchLabel: string) {
  const label = branchLabel.toLowerCase()
  const text = step.text.toLowerCase()
  let score = 0
  const contains = (value: string) => label.includes(value) || text.includes(value)

  if ((contains("code") || contains("verification")) && text.includes("code")) score += 5
  if ((contains("permission") || contains("contacts")) && (text.includes("permission") || text.includes("contacts"))) score += 5
  if ((contains("search") || contains("results")) && text.includes("search")) score += 5
  if ((contains("join") || contains("link") || contains("approval")) && (text.includes("join") || text.includes("link"))) score += 5
  if ((contains("camera") || contains("gallery") || contains("file") || contains("upload")) && (text.includes("camera") || text.includes("photo") || text.includes("file") || text.includes("upload") || text.includes("attachment"))) score += 5
  if ((contains("send") || contains("request") || contains("offline") || contains("network") || contains("delivery")) && (text.includes("send") || text.includes("message") || text.includes("request") || text.includes("deliver") || text.includes("network"))) score += 5
  if ((contains("edit") || contains("delete") || contains("retry")) && (text.includes("edit") || text.includes("delete") || text.includes("send"))) score += 4
  if (text.includes("system:")) score += 1
  if (step.kind === "verify") score -= 2

  return score
}

function buildBranchFollowups(branchLabel: string, branchOutcome: string): string[] {
  const label = branchLabel.toLowerCase()
  const outcome = branchOutcome || branchLabel

  if (label.includes("invalid code")) {
    return [outcome, "Choose retry or resend"]
  }
  if (label.includes("phone already in use") || label.includes("account exists")) {
    return [outcome, "Choose sign in or recovery"]
  }
  if (label.includes("permission denied")) {
    return [outcome, "Offer manual fallback"]
  }
  if (label.includes("no results")) {
    return [outcome, "Offer invite/share option"]
  }
  if (label.includes("message request") || label.includes("follow gate")) {
    return [outcome, "Choose send request or follow"]
  }
  if (label.includes("network") || label.includes("offline") || label.includes("retry state")) {
    return [outcome, "Queue locally and retry on reconnect"]
  }
  if (label.includes("expired")) {
    return [outcome, "Return to prior chooser"]
  }
  if (label.includes("upload fails") || label.includes("upload failed")) {
    return [outcome, "Show retry on media tile"]
  }
  if (label.includes("camera permission denied")) {
    return [outcome, "Route to settings or gallery fallback"]
  }
  if (label.includes("too large") || label.includes("prohibited file type") || label.includes("blocked type")) {
    return [outcome, "Block send and explain why"]
  }
  if (label.includes("approval required")) {
    return [outcome, "Show pending approval state"]
  }
  if (label.includes("join immediately") || label.includes("delivered normally") || label.includes("match found") || label.includes("sign in")) {
    return [outcome]
  }

  return [outcome]
}

function storyToBranchingSequences(
  entry: StoryOutline,
  title: string,
  sequencePrefix: string,
): StoryboardGridSequence[] {
  const flowSteps = entry.steps.filter((step) => step.kind !== "branch")
  const branchSteps = entry.steps.filter((step) => step.kind === "branch")
  const branchMap = new Map<number, StoryOutlineStep[]>()

  for (const branch of branchSteps) {
    const branchLabel = normalizeBranchLabel(branch.text)
    let bestIndex = Math.max(flowSteps.length - 1, 0)
    let bestScore = -Infinity
    for (let index = 0; index < flowSteps.length; index += 1) {
      const score = anchorScore(flowSteps[index]!, branchLabel)
      if (score >= bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
    const bucket = branchMap.get(bestIndex) ?? []
    bucket.push(branch)
    branchMap.set(bestIndex, bucket)
  }

  const mainFrames: StoryboardGridSequence["frames"] = [
    {
      id: `${entry.id}-title`,
      title: entry.title,
      nextLabel: flowSteps.length > 0 ? "Start" : undefined,
    },
    ...flowSteps.map((step, stepIndex) => ({
      id: `${entry.id}-step-${stepIndex}`,
      title: stepLabel(step),
      nextLabel: stepIndex < flowSteps.length - 1 ? "Next" : undefined,
      branchLabels: (branchMap.get(stepIndex) ?? []).map((branch) => normalizeBranchLabel(branch.text)),
    })),
  ]

  const branchSequences: StoryboardGridSequence[] = []
  for (const [stepIndex, branches] of branchMap.entries()) {
    for (const [branchIndex, branch] of branches.entries()) {
      const branchLabel = normalizeBranchLabel(branch.text)
      const branchOutcome = normalizeBranchOutcome(branch.text)
      const followups = buildBranchFollowups(branchLabel, branchOutcome)
      branchSequences.push({
        id: `${sequencePrefix}-${entry.id}-branch-${stepIndex}-${branchIndex}`,
        title: `Branch: ${branchLabel}`,
        startColumn: stepIndex + 2,
        startLabel: branchLabel,
        frames: followups.map((stepTitle, followupIndex) => ({
          id: `${entry.id}-branch-${stepIndex}-${branchIndex}-step-${followupIndex}`,
          title: stepTitle,
          nextLabel: followupIndex < followups.length - 1 ? "Next" : undefined,
        })),
      })
    }
  }

  return [
    {
      id: `${sequencePrefix}-${entry.id}`,
      title,
      frames: mainFrames,
    },
    ...branchSequences,
  ]
}

const chatAppLargeBranchingDataset: StoryboardGridSequence[] = chatAppStoryboardDocuments.flatMap(
  (document, documentIndex) =>
    document.stories.flatMap((entry, storyIndex) =>
      storyToBranchingSequences(
        entry,
        `${documentIndex + 1}.${storyIndex + 1} ${document.title}`,
        `doc-${documentIndex + 1}-story-${storyIndex + 1}`,
      ),
    ),
)

const SCREENSHOT_FRAME_WIDTH = 720
const SCREENSHOT_FRAME_HEIGHT = 720
const SCREENSHOT_ACTION_WIDTH = 96
const SCREENSHOT_NEXT_HEIGHT = 120
const GRID_PADDING = 40
const PERFORMANCE_GRID_GAP = 16
const PERF_DURATION_MS = 3000
const ROW_OVERSCAN = 3

type FrameDetailLevel = "far" | "mid" | "full"
type ViewportViewState = {
  scale: number
  offset: { x: number; y: number }
  viewport: { width: number; height: number }
}
type CullingWindow = {
  start: number
  end: number
  paddingTop: number
  paddingBottom: number
}

function StoryboardGridFixture({
  sequences,
  scenarioSlug,
  renderFrame,
  frameWidth,
  frameHeight,
  actionColumnWidth,
  nextCellHeight,
}: {
  sequences: StoryboardGridSequence[]
  scenarioSlug: string
  renderFrame?: (frame: { id: string; title: string; nextLabel?: string }) => JSX.Element
  frameWidth?: number
  frameHeight?: number
  actionColumnWidth?: number
  nextCellHeight?: number
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-debug-capture-root="true"
    >
      <PanZoomContainer className="flex-1" fitKey={`storyboard-grid-${scenarioSlug}`}>
        <div
          className="min-w-max p-10"
          style={{ backgroundColor: "#5f6775" }}
        >
          <StoryboardGrid
            actionColumnWidth={actionColumnWidth}
            frameHeight={frameHeight}
            frameWidth={frameWidth}
            nextCellHeight={nextCellHeight}
            renderFrame={renderFrame}
            sequences={sequences}
          />
        </div>
      </PanZoomContainer>
    </div>
  )
}

function MockScreenshotScreen({
  accent,
  heading,
  lines,
}: {
  accent: string
  heading: string
  lines: string[]
}) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0b1018] text-white">
      <div className="flex items-center justify-end border-b border-white/10 px-4 py-3">
        <div className="h-2 w-12 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="flex-1 space-y-3 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{heading}</div>
        {lines.map((line, index) => (
          <div
            className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75"
            key={`${heading}-${index}-${line}`}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function screenshotLines(title: string, count: number) {
  const words = title.split(/\s+/).filter(Boolean)

  return Array.from({ length: count }, (_, index) => {
    const start = (index * 2) % words.length
    return words.slice(start, start + 4).join(" ") || title
  })
}

function accentForFrame(id: string) {
  const accents = ["#67e8f9", "#f59e0b", "#a78bfa", "#22c55e", "#ef4444", "#3b82f6"]
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return accents[hash % accents.length]
}

function ScreenshotGridFrame({
  frame,
}: {
  frame: { id: string; title: string; nextLabel?: string }
}) {
  const accent = accentForFrame(frame.id)
  return (
    <ScreenshotFrameCell
      desktop={<MockScreenshotScreen accent={accent} heading="Desktop" lines={screenshotLines(frame.title, 3)} />}
      mobile={<MockScreenshotScreen accent={accent} heading="Mobile" lines={screenshotLines(frame.title, 2)} />}
      square={<MockScreenshotScreen accent={accent} heading="Square" lines={screenshotLines(frame.title, 2)} />}
      title={frame.title}
    />
  )
}

function detailLevelForScale(scale: number): FrameDetailLevel {
  if (scale < 0.03) {
    return "far"
  }
  if (scale < 0.09) {
    return "mid"
  }
  return "full"
}

function FarPanePlaceholder() {
  return <div className="h-full w-full bg-zinc-900/90" />
}

function MidPanePlaceholder({
  accent,
}: {
  accent: string
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-900">
      <div className="absolute inset-x-0 top-0 h-8 border-b border-white/10 bg-[#0b1018]">
        <div className="absolute right-4 top-3 h-2 w-10 rounded-full" style={{ backgroundColor: accent }} />
      </div>
    </div>
  )
}

function renderScreenshotGridFrame(
  frame: { id: string; title: string; nextLabel?: string },
  detailLevel: FrameDetailLevel,
) {
  const accent = accentForFrame(frame.id)
  if (detailLevel === "far") {
    return (
      <ScreenshotFrameCell
        desktop={<FarPanePlaceholder />}
        mobile={<FarPanePlaceholder />}
        square={<FarPanePlaceholder />}
        title={frame.title}
      />
    )
  }
  if (detailLevel === "mid") {
    return (
      <ScreenshotFrameCell
        desktop={<MidPanePlaceholder accent={accent} />}
        mobile={<MidPanePlaceholder accent={accent} />}
        square={<MidPanePlaceholder accent={accent} />}
        title={frame.title}
      />
    )
  }
  return <ScreenshotGridFrame frame={frame} />
}

function useFrameDetailLevel(initialScale = 1) {
  const [detailLevel, setDetailLevel] = useState<FrameDetailLevel>(detailLevelForScale(initialScale))

  const handleScaleChange = (scale: number) => {
    setDetailLevel((current) => {
      const next = detailLevelForScale(scale)
      return current === next ? current : next
    })
  }

  return {
    detailLevel,
    handleScaleChange,
  }
}

function estimateSequenceRowHeight(frameHeight: number) {
  return frameHeight + PERFORMANCE_GRID_GAP * 2 + 14 + 24
}

function useCulledSequences(
  sequences: StoryboardGridSequence[],
  frameHeight: number,
) {
  const rowHeight = estimateSequenceRowHeight(frameHeight)
  const [windowState, setWindowState] = useState<CullingWindow>({
    start: 0,
    end: sequences.length - 1,
    paddingTop: 0,
    paddingBottom: 0,
  })

  const onViewChange = useCallback((nextView: ViewportViewState) => {
    if (nextView.scale <= 0 || nextView.viewport.height <= 0) {
      return
    }

    const visibleTop = Math.max(0, (-nextView.offset.y + 0) / nextView.scale)
    const visibleBottom = Math.max(
      visibleTop,
      (-nextView.offset.y + nextView.viewport.height) / nextView.scale,
    )

    const firstVisibleRow = Math.max(0, Math.floor(visibleTop / rowHeight) - ROW_OVERSCAN)
    const lastVisibleRow = Math.min(
      sequences.length - 1,
      Math.ceil(visibleBottom / rowHeight) + ROW_OVERSCAN,
    )

    const nextWindow = {
      start: firstVisibleRow,
      end: lastVisibleRow,
      paddingTop: firstVisibleRow * rowHeight,
      paddingBottom: Math.max(0, (sequences.length - lastVisibleRow - 1) * rowHeight),
    }

    setWindowState((current) => {
      if (
        current.start === nextWindow.start &&
        current.end === nextWindow.end &&
        current.paddingTop === nextWindow.paddingTop &&
        current.paddingBottom === nextWindow.paddingBottom
      ) {
        return current
      }
      return nextWindow
    })
  }, [rowHeight, sequences])

  return {
    sequences: sequences.slice(windowState.start, windowState.end + 1),
    paddingTop: windowState.paddingTop,
    paddingBottom: windowState.paddingBottom,
    onViewChange,
  }
}

function ScreenshotStoryboardGridFixture({
  sequences,
  scenarioSlug,
}: {
  sequences: StoryboardGridSequence[]
  scenarioSlug: string
}) {
  const { detailLevel, handleScaleChange } = useFrameDetailLevel(0.02)
  const { sequences: visibleSequences, paddingTop, paddingBottom, onViewChange } = useCulledSequences(
    sequences,
    SCREENSHOT_FRAME_HEIGHT,
  )

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-debug-capture-root="true"
      data-storyboard-frame-detail-level={detailLevel}
    >
      <PanZoomContainer
        className="flex-1"
        fitKey={`storyboard-grid-${scenarioSlug}`}
        onScaleChange={handleScaleChange}
        onViewChange={onViewChange}
      >
        <div className="min-w-max p-10" style={{ backgroundColor: "#5f6775" }}>
          <div style={{ paddingBottom, paddingTop }}>
          <StoryboardGrid
            actionColumnWidth={SCREENSHOT_ACTION_WIDTH}
            frameHeight={SCREENSHOT_FRAME_HEIGHT}
            frameWidth={SCREENSHOT_FRAME_WIDTH}
            nextCellHeight={SCREENSHOT_NEXT_HEIGHT}
            renderFrame={(frame) => renderScreenshotGridFrame(frame, detailLevel)}
            sequences={visibleSequences}
          />
          </div>
        </div>
      </PanZoomContainer>
    </div>
  )
}

function maxFrameCount(sequences: StoryboardGridSequence[]) {
  return Math.max(0, ...sequences.map((sequence) => sequence.frames.length))
}

function estimateGridContentSize(
  sequences: StoryboardGridSequence[],
  frameWidth: number,
  frameHeight: number,
  actionColumnWidth: number,
  nextCellHeight: number,
) {
  const rows = sequences.length
  const columns = maxFrameCount(sequences)
  const columnWidth = columns > 0
    ? columns * frameWidth + Math.max(columns - 1, 0) * (actionColumnWidth + PERFORMANCE_GRID_GAP * 2)
    : 0
  const rowHeight = frameHeight + PERFORMANCE_GRID_GAP * 2 + 14
  const totalHeight = rows > 0
    ? rows * rowHeight + Math.max(rows - 1, 0) * (PERFORMANCE_GRID_GAP * 2)
    : nextCellHeight

  return {
    width: columnWidth + GRID_PADDING * 2,
    height: totalHeight + GRID_PADDING * 2,
  }
}

type PerfRunState = {
  running: boolean
  fps: number | null
  frames: number
  elapsedMs: number
  longestFrameMs: number
  consoleErrorCount: number
  consoleErrorSamples: string[]
}

declare global {
  interface Window {
    __storyboardPerformanceResult?: PerfRunState
  }
}

function StoryboardPerformanceFixture({
  sequences,
}: {
  sequences: StoryboardGridSequence[]
}) {
  const panZoomRef = useRef<PanZoomContainerHandle | null>(null)
  const frameRef = useRef<number | null>(null)
  const [runId, setRunId] = useState(0)
  const { detailLevel, handleScaleChange } = useFrameDetailLevel(0.018)
  const { sequences: visibleSequences, paddingTop, paddingBottom, onViewChange } = useCulledSequences(
    sequences,
    SCREENSHOT_FRAME_HEIGHT,
  )
  const [runState, setRunState] = useState<PerfRunState>({
    running: true,
    fps: null,
    frames: 0,
    elapsedMs: 0,
    longestFrameMs: 0,
    consoleErrorCount: 0,
    consoleErrorSamples: [],
  })
  const consoleErrorCountRef = useRef(0)
  const consoleErrorSamplesRef = useRef<string[]>([])

  useEffect(() => {
    const originalConsoleError = console.error
    const handleWindowError = () => {
      consoleErrorCountRef.current += 1
    }
    const handleUnhandledRejection = () => {
      consoleErrorCountRef.current += 1
    }

    console.error = (...args: unknown[]) => {
      consoleErrorCountRef.current += 1
      if (consoleErrorSamplesRef.current.length < 5) {
        consoleErrorSamplesRef.current.push(
          args.map((arg) => {
            if (typeof arg === "string") return arg
            try {
              return JSON.stringify(arg)
            } catch {
              return String(arg)
            }
          }).join(" "),
        )
      }
      originalConsoleError(...args)
    }

    window.addEventListener("error", handleWindowError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)

    return () => {
      console.error = originalConsoleError
      window.removeEventListener("error", handleWindowError)
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
    }
  }, [])

  const contentSize = useMemo(
    () => estimateGridContentSize(
      sequences,
      SCREENSHOT_FRAME_WIDTH,
      SCREENSHOT_FRAME_HEIGHT,
      SCREENSHOT_ACTION_WIDTH,
      SCREENSHOT_NEXT_HEIGHT,
    ),
    [sequences],
  )

  useEffect(() => {
    window.__storyboardPerformanceResult = runState
  }, [runState])

  useEffect(() => {
    const handle = panZoomRef.current
    if (!handle) {
      return
    }

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    const viewport = handle.getViewportSize()
    if (viewport.width <= 0 || viewport.height <= 0) {
      const retry = window.setTimeout(() => setRunId((value) => value + 1), 100)
      return () => window.clearTimeout(retry)
    }

    const fitScale = Math.min(
      Math.max((viewport.width - 40) / contentSize.width, 0.005),
      Math.max((viewport.height - 40) / contentSize.height, 0.005),
    )
    const fullScale = 1
    const fitOffset = {
      x: (viewport.width - contentSize.width * fitScale) / 2,
      y: (viewport.height - contentSize.height * fitScale) / 2,
    }
    const fullCenterOffset = {
      x: (viewport.width - contentSize.width * fullScale) / 2,
      y: (viewport.height - contentSize.height * fullScale) / 2,
    }
    const fullPanRangeX = Math.max(contentSize.width * fullScale - viewport.width, 1)
    const fullPanRangeY = Math.max(contentSize.height * fullScale - viewport.height, 1)
    const start = performance.now()
    let last = start
    let frames = 0

    setRunState({
      running: true,
      fps: null,
      frames: 0,
      elapsedMs: 0,
      longestFrameMs: 0,
      consoleErrorCount: consoleErrorCountRef.current,
      consoleErrorSamples: [],
    })
    consoleErrorCountRef.current = 0
    consoleErrorSamplesRef.current = []

    let longestFrameMs = 0

    const tick = (now: number) => {
      if (frames > 0) {
        longestFrameMs = Math.max(longestFrameMs, now - last)
      }

      const elapsed = now - start
      const progress = Math.min(elapsed / PERF_DURATION_MS, 1)

      let scale = fitScale
      let offsetX = fitOffset.x
      let offsetY = fitOffset.y

      if (progress < 0.25) {
        const t = 0.5 - Math.cos((progress / 0.25) * Math.PI) / 2
        scale = fitScale + (fullScale - fitScale) * t
        offsetX = fitOffset.x + (fullCenterOffset.x - fitOffset.x) * t
        offsetY = fitOffset.y + (fullCenterOffset.y - fitOffset.y) * t
      } else if (progress < 0.75) {
        const t = (progress - 0.25) / 0.5
        const panX = fullPanRangeX * t
        const panY = fullPanRangeY * (0.5 - Math.cos(t * Math.PI * 2) / 2)
        scale = fullScale
        offsetX = -panX + 32
        offsetY = -panY + 24
      } else {
        const t = 0.5 - Math.cos(((progress - 0.75) / 0.25) * Math.PI) / 2
        const startOffsetX = -fullPanRangeX + 32
        const startOffsetY = 24
        scale = fullScale + (fitScale - fullScale) * t
        offsetX = startOffsetX + (fitOffset.x - startOffsetX) * t
        offsetY = startOffsetY + (fitOffset.y - startOffsetY) * t
      }

      handle.setView({
        scale,
        offset: {
          x: offsetX,
          y: offsetY,
        },
      })

      frames += 1
      last = now

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick)
        return
      }

      frameRef.current = null
      const totalElapsed = last - start
      setRunState({
        running: false,
        fps: totalElapsed > 0 ? frames / (totalElapsed / 1000) : null,
        frames,
        elapsedMs: totalElapsed,
        longestFrameMs,
        consoleErrorCount: consoleErrorCountRef.current,
        consoleErrorSamples: [...consoleErrorSamplesRef.current],
      })
    }

    frameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [contentSize.height, contentSize.width, runId, sequences])

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-debug-capture-root="true"
      data-storyboard-perf-elapsed-ms={String(Math.round(runState.elapsedMs))}
      data-storyboard-perf-fps={runState.fps ? runState.fps.toFixed(2) : ""}
      data-storyboard-perf-frames={String(runState.frames)}
      data-storyboard-perf-longest-frame-ms={runState.longestFrameMs.toFixed(2)}
      data-storyboard-perf-console-error-count={String(runState.consoleErrorCount)}
      data-storyboard-frame-detail-level={detailLevel}
      data-storyboard-perf-running={runState.running ? "true" : "false"}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-white/70">
        <div className="flex items-center gap-4">
          <span>deterministic 3s pan/zoom sweep</span>
          <span>frames {runState.frames}</span>
          <span>elapsed {Math.round(runState.elapsedMs)}ms</span>
          <span>fps {runState.fps ? runState.fps.toFixed(1) : "running"}</span>
          <span>longest frame {runState.longestFrameMs ? `${runState.longestFrameMs.toFixed(1)}ms` : "running"}</span>
          <span>console errors {runState.consoleErrorCount}</span>
        </div>
        <button
          className="rounded border border-white/15 px-2 py-1 text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
          onClick={() => setRunId((value) => value + 1)}
          type="button"
        >
          Rerun
        </button>
      </div>
      <PanZoomContainer
        className="flex-1"
        fitKey={`storyboard-grid-perf-${runId}`}
        onScaleChange={handleScaleChange}
        onViewChange={onViewChange}
        ref={panZoomRef}
      >
        <div className="min-w-max p-10" style={{ backgroundColor: "#5f6775" }}>
          <div style={{ paddingBottom, paddingTop }}>
          <StoryboardGrid
            actionColumnWidth={SCREENSHOT_ACTION_WIDTH}
            frameHeight={SCREENSHOT_FRAME_HEIGHT}
            frameWidth={SCREENSHOT_FRAME_WIDTH}
            nextCellHeight={SCREENSHOT_NEXT_HEIGHT}
            renderFrame={(frame) => renderScreenshotGridFrame(frame, detailLevel)}
            sequences={visibleSequences}
          />
          </div>
        </div>
      </PanZoomContainer>
    </div>
  )
}

function StoryboardGridPreview({
  sequences,
}: {
  sequences: StoryboardGridSequence[]
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black p-3">
      <div className="flex w-full flex-col gap-2">
        {sequences.slice(0, 3).map((sequence) => (
          <div className="flex items-center gap-1.5" key={sequence.id}>
            {sequence.frames.slice(0, 4).map((frame, index) => (
              <div className="flex items-center gap-1.5" key={frame.id}>
                <div className="flex h-8 w-12 items-center justify-center bg-zinc-800 text-[9px] text-white/70">
                  {frame.title}
                </div>
                {index < sequence.frames.length - 1 ? (
                  <div className="text-[9px] uppercase tracking-[0.14em] text-white/40">
                    &gt;
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export const storyboardGridDebugDefinition: StoryboardDebugComponentDefinition =
  {
    slug: "storyboardGrid",
    label: "storyboardGrid",
    description: "Title-only storyboard grid sequences",
    defaultScenarioSlug: "single-sequence",
    scenarios: [
      {
        slug: "single-sequence",
        label: "single-sequence",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="single-sequence"
            sequences={singleSequenceDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={singleSequenceDataset} />
        ),
      },
      {
        slug: "two-sequences",
        label: "two-sequences",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="two-sequences"
            sequences={twoSequenceDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={twoSequenceDataset} />
        ),
      },
      {
        slug: "mixed-title-lengths",
        label: "mixed-title-lengths",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="mixed-title-lengths"
            sequences={mixedTitleDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={mixedTitleDataset} />
        ),
      },
      {
        slug: "branching-user-flow",
        label: "branching-user-flow",
        description: "Main row with two branch rows aligned under the branching frame.",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="branching-user-flow"
            sequences={branchingDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={branchingDataset} />
        ),
      },
      {
        slug: "chat-app-large-grid",
        label: "chat-app-large-grid",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="chat-app-large-grid"
            sequences={chatAppLargeDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={chatAppLargeDataset.slice(0, 3)} />
        ),
      },
      {
        slug: "chat-app-large-grid-with-branching",
        label: "chat-app-large-grid-with-branching",
        description: "Full chat corpus with branch rows aligned under the branching step.",
        render: () => (
          <StoryboardGridFixture
            scenarioSlug="chat-app-large-grid-with-branching"
            sequences={chatAppLargeBranchingDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={chatAppLargeBranchingDataset.slice(0, 4)} />
        ),
      },
      {
        slug: "chat-app-large-grid-screenshot-frames",
        label: "chat-app-large-grid-screenshot-frames",
        render: () => (
          <ScreenshotStoryboardGridFixture
            scenarioSlug="chat-app-large-grid-screenshot-frames"
            sequences={chatAppLargeDataset}
          />
        ),
        renderPreview: () => (
          <StoryboardGridPreview sequences={chatAppLargeDataset.slice(0, 2)} />
        ),
      },
      {
        slug: "chat-app-large-grid-performance-sweep",
        label: "chat-app-large-grid-performance-sweep",
        description: "Deterministic 3-second pan/zoom FPS sweep on the large screenshot-frame grid.",
        render: () => <StoryboardPerformanceFixture sequences={chatAppLargeDataset} />,
        renderPreview: () => (
          <StoryboardGridPreview sequences={chatAppLargeDataset.slice(0, 2)} />
        ),
      },
    ],
  }
