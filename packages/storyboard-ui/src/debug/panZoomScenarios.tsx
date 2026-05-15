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
          className="relative flex items-start justify-center"
          style={{
            width: 860,
            height: 620,
            padding: 40,
            backgroundColor: "#6b7280",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: 720,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              backgroundColor: "rgba(24,24,27,0.92)",
              padding: 24,
              boxShadow: "0 20px 80px rgba(0,0,0,0.35)",
              color: "#ffffff",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.24em",
                  color: "rgba(165,243,252,0.8)",
                }}
              >
                Simple React Fixture
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                Pan and zoom this component
              </h1>
              <p
                style={{
                  margin: 0,
                  maxWidth: 560,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                This scenario keeps a plain React component inside the same
                container so the behavior can be checked without the proof-harness
                board.
              </p>
            </div>
            <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
              <label
                style={{
                  display: "grid",
                  gap: 8,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                Title
                <input
                  defaultValue="Neighborhood support campaign"
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(0,0,0,0.4)",
                    padding: "10px 12px",
                    color: "#ffffff",
                    outline: "none",
                  }}
                />
              </label>
              <label
                style={{
                  display: "grid",
                  gap: 8,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                Notes
                <textarea
                  defaultValue="Wheel zoom should stay anchored over content while drag-pan remains predictable."
                  style={{
                    minHeight: 120,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(0,0,0,0.4)",
                    padding: "10px 12px",
                    color: "#ffffff",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  style={{
                    borderRadius: 8,
                    backgroundColor: "#67e8f9",
                    padding: "10px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#000000",
                    border: "none",
                  }}
                >
                  Save draft
                </button>
                <button
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.15)",
                    backgroundColor: "transparent",
                    padding: "10px 16px",
                    fontSize: 14,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
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
