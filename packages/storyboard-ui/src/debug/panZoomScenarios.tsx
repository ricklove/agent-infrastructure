import { useEffect, useMemo, useRef, useState } from "react"
import {
  PanZoomContainer,
  type PanZoomContainerHandle,
} from "../PanZoomContainer"
import type { StoryboardDebugComponentDefinition } from "./types"

type ScenarioMode = "fit" | "ten-percent-centered" | "ten-percent-top-left"

type SquareSpec = {
  key: "red" | "green" | "blue"
  label: "Red" | "Green" | "Blue"
  color: string
  left: number
  top: number
  size: number
}

const BOARD_WIDTH = 3200
const BOARD_HEIGHT = 2200
const BOARD_PADDING = 24
const TEN_PERCENT_SCALE = 0.1
const SQUARES: SquareSpec[] = [
  {
    key: "red",
    label: "Red",
    color: "#ef4444",
    left: 180,
    top: 180,
    size: 220,
  },
  {
    key: "green",
    label: "Green",
    color: "#22c55e",
    left: 1420,
    top: 920,
    size: 260,
  },
  {
    key: "blue",
    label: "Blue",
    color: "#3b82f6",
    left: 2750,
    top: 1720,
    size: 240,
  },
]

function applyScenarioView(
  handle: PanZoomContainerHandle,
  mode: ScenarioMode,
) {
  if (mode === "fit") {
    handle.fitToViewport()
    return
  }

  const { width, height } = handle.getViewportSize()
  if (width <= 0 || height <= 0) {
    return
  }

  if (mode === "ten-percent-centered") {
    handle.setView({
      scale: TEN_PERCENT_SCALE,
      offset: {
        x: (width - BOARD_WIDTH * TEN_PERCENT_SCALE) / 2,
        y: (height - BOARD_HEIGHT * TEN_PERCENT_SCALE) / 2,
      },
    })
    return
  }

  handle.setView({
    scale: TEN_PERCENT_SCALE,
    offset: {
      x: BOARD_PADDING,
      y: BOARD_PADDING,
    },
  })
}

function centerSquare(
  handle: PanZoomContainerHandle | null,
  square: SquareSpec,
) {
  handle?.centerRect({
    left: square.left,
    top: square.top,
    width: square.size,
    height: square.size,
  })
}

function PanZoomColorFixture({ mode }: { mode: ScenarioMode }) {
  const handleRef = useRef<PanZoomContainerHandle | null>(null)
  const [scale, setScale] = useState(1)
  const fitKey = useMemo(() => `panzoom-color-${mode}`, [mode])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (handleRef.current) {
        applyScenarioView(handleRef.current, mode)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mode])

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-black text-white"
      data-storyboard-debug-capture-root="true"
      data-storyboard-debug-scenario={mode}
    >
      <div className="flex h-10 items-center justify-between gap-3 border-b border-white/10 px-3 text-[11px]">
        <div className="flex items-center gap-2">
          {SQUARES.map((square) => (
            <button
              className="rounded border border-white/15 px-2 py-1 text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
              data-panzoom-focus-target={square.key}
              key={square.key}
              onClick={() => centerSquare(handleRef.current, square)}
              type="button"
            >
              {square.label}
            </button>
          ))}
        </div>
        <div className="text-white/60">
          <span data-panzoom-scale-label="true">
            {Math.round(scale * 100)}%
          </span>
        </div>
      </div>
      <PanZoomContainer
        className="flex-1"
        fitKey={fitKey}
        initialPadding={BOARD_PADDING}
        maxScale={100}
        minScale={0.04}
        onScaleChange={setScale}
        ref={handleRef}
      >
        <ColorBoard />
      </PanZoomContainer>
    </div>
  )
}

function ColorBoard() {
  return (
    <div
      className="relative overflow-hidden border border-white/10"
      data-color-board="true"
      style={{
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        backgroundColor: "#5b708a",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "120px 120px",
      }}
    >
      {SQUARES.map((square) => (
        <div
          className="absolute flex items-center justify-center rounded-sm border border-white/20 text-3xl font-semibold text-white shadow-[0_18px_36px_rgba(0,0,0,0.35)]"
          data-color-target={square.key}
          key={square.key}
          style={{
            left: square.left,
            top: square.top,
            width: square.size,
            height: square.size,
            backgroundColor: square.color,
          }}
        >
          {square.label}
        </div>
      ))}
    </div>
  )
}

function PanZoomColorPreview() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070b]">
      <div
        className="absolute inset-[8px] border border-white/10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="absolute left-[12px] top-[12px] h-[18px] w-[18px] bg-red-500" />
      <div className="absolute left-[43px] top-[38px] h-[22px] w-[22px] bg-green-500" />
      <div className="absolute right-[12px] bottom-[12px] h-[20px] w-[20px] bg-blue-500" />
    </div>
  )
}

function PanZoomReactFixture() {
  return (
    <div
      className="h-full"
      data-storyboard-debug-capture-root="true"
      data-storyboard-debug-scenario="simple-react-component"
    >
      <PanZoomContainer className="h-full" fitKey="simple-react-component">
        <div
          className="relative flex items-start justify-center p-10"
          style={{ width: 860, height: 460, backgroundColor: "#6b7280" }}
        >
          <div className="w-[720px] rounded-xl border border-white/12 bg-zinc-900/90 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">
                Simple React Fixture
              </div>
              <h1 className="text-2xl font-semibold text-white">
                Pan and zoom this component
              </h1>
              <p className="max-w-xl text-sm leading-6 text-white/65">
                This scenario keeps a plain React component inside the same
                container so the behavior can be checked without the proof-harness
                board.
              </p>
            </div>
            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm text-white/80">
                Title
                <input
                  className="rounded border border-white/12 bg-black/40 px-3 py-2 text-white outline-none"
                  defaultValue="Neighborhood support campaign"
                />
              </label>
              <label className="grid gap-2 text-sm text-white/80">
                Notes
                <textarea
                  className="min-h-40 rounded border border-white/12 bg-black/40 px-3 py-2 text-white outline-none"
                  defaultValue="Wheel zoom should stay anchored over content while drag-pan remains predictable."
                />
              </label>
              <div className="flex items-center gap-3">
                <button className="rounded bg-cyan-300 px-4 py-2 text-sm font-medium text-black">
                  Save draft
                </button>
                <button className="rounded border border-white/15 px-4 py-2 text-sm text-white/80">
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </PanZoomContainer>
    </div>
  )
}

function PanZoomReactPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 p-3">
      <div className="w-full rounded-lg border border-white/12 bg-zinc-900/90 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
        <div className="space-y-1">
          <div className="text-[8px] uppercase tracking-[0.2em] text-cyan-200/80">
            React
          </div>
          <div className="text-xs font-semibold text-white">
            Pan and zoom this component
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="rounded border border-white/10 bg-black/35 px-2 py-1 text-[10px] text-white/65">
            Neighborhood support campaign
          </div>
          <div className="min-h-20 rounded border border-white/10 bg-black/35 px-2 py-1 text-[10px] leading-4 text-white/55">
            Wheel zoom stays anchored over normal form content.
          </div>
        </div>
      </div>
    </div>
  )
}

export const panZoomContainerDebugDefinition: StoryboardDebugComponentDefinition =
  {
    slug: "panZoomContainer",
    label: "panZoomContainer",
    description: "Simple pan/zoom proof harness and React fixture.",
    defaultScenarioSlug: "red-green-blue-squares-fit",
    scenarios: [
      {
        slug: "red-green-blue-squares-fit",
        label: "red green blue squares fit",
        render: () => <PanZoomColorFixture mode="fit" />,
        renderPreview: () => <PanZoomColorPreview />,
      },
      {
        slug: "red-green-blue-squares-10-centered",
        label: "red green blue squares 10% centered",
        render: () => <PanZoomColorFixture mode="ten-percent-centered" />,
        renderPreview: () => <PanZoomColorPreview />,
      },
      {
        slug: "red-green-blue-squares-10-top-left",
        label: "red green blue squares 10% top left",
        render: () => <PanZoomColorFixture mode="ten-percent-top-left" />,
        renderPreview: () => <PanZoomColorPreview />,
      },
      {
        slug: "simple-react-component",
        label: "simple react component",
        render: () => <PanZoomReactFixture />,
        renderPreview: () => <PanZoomReactPreview />,
      },
    ],
  }
