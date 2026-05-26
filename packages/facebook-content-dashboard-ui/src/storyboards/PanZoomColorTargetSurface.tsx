import { useMemo, useRef, useState } from "react"
import { PanZoomViewport, type PanZoomViewportHandle } from "./PanZoomViewport"

type ScenarioKey = "small-content" | "large-content"

type SquareSpec = {
  key: string
  color: string
  left: number
  top: number
  size: number
}

export function PanZoomColorTargetSurface(props: { scenario: ScenarioKey }) {
  const viewportRef = useRef<PanZoomViewportHandle | null>(null)
  const [scale, setScale] = useState(1)
  const config = useMemo(() => getScenarioConfig(props.scenario), [props.scenario])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950">
      <div className="flex h-8 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-2">
        <div className="flex items-center gap-1">
          {config.squares.map((square) => (
            <button
              key={square.key}
              type="button"
              onClick={() => viewportRef.current?.centerRect({
                left: square.left,
                top: square.top,
                width: square.size,
                height: square.size,
              })}
              className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300"
            >
              {square.key}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => viewportRef.current?.zoomOut()} className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300">-</button>
          <div className="min-w-[48px] text-center text-[11px] text-zinc-400">{Math.round(scale * 100)}%</div>
          <button type="button" onClick={() => viewportRef.current?.zoomIn()} className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300">+</button>
          <button type="button" onClick={() => viewportRef.current?.fitToViewport()} className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300">Fit</button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <PanZoomViewport
          ref={viewportRef}
          fitKey={`pan-zoom-color-target:${props.scenario}`}
          minScale={0.04}
          maxScale={6}
          initialPadding={20}
          onScaleChange={setScale}
        >
          <ColorTargetBoard width={config.width} height={config.height} squares={config.squares} />
        </PanZoomViewport>
        <CenterBrackets />
      </div>
    </div>
  )
}

function ColorTargetBoard(props: { width: number; height: number; squares: SquareSpec[] }) {
  return (
    <div
      className="relative overflow-hidden border border-zinc-800 bg-[#05070b]"
      style={{
        width: props.width,
        height: props.height,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
      }}
    >
      {props.squares.map((square) => (
        <div
          key={square.key}
          data-color-target={square.key}
          className="absolute"
          style={{
            left: square.left,
            top: square.top,
            width: square.size,
            height: square.size,
            backgroundColor: square.color,
          }}
        />
      ))}
    </div>
  )
}

function CenterBrackets() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-0 top-0 h-3 w-3 border-l border-t border-white/80" />
        <div className="absolute right-0 top-0 h-3 w-3 border-r border-t border-white/80" />
        <div className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-white/80" />
        <div className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-white/80" />
      </div>
    </div>
  )
}

function getScenarioConfig(scenario: ScenarioKey) {
  if (scenario === "small-content") {
    return {
      width: 720,
      height: 480,
      squares: [
        { key: "Red", color: "#ef4444", left: 80, top: 80, size: 96 },
        { key: "Blue", color: "#3b82f6", left: 500, top: 120, size: 96 },
        { key: "Green", color: "#22c55e", left: 520, top: 300, size: 96 },
      ],
    }
  }

  return {
    width: 3600,
    height: 2400,
    squares: [
      { key: "Red", color: "#ef4444", left: 180, top: 180, size: 160 },
      { key: "Blue", color: "#3b82f6", left: 2820, top: 320, size: 180 },
      { key: "Green", color: "#22c55e", left: 3000, top: 1880, size: 220 },
    ],
  }
}
