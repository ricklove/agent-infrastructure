import type { ReactNode } from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

export type PanZoomViewportHandle = {
  zoomIn: () => void
  zoomOut: () => void
  fitToViewport: () => void
  centerRect: (rect: { left: number; top: number; width: number; height: number }) => void
  getViewportCenter: () => { x: number; y: number }
}

export function clampScale(value: number, minScale: number, maxScale: number) {
  return Math.min(maxScale, Math.max(minScale, Number(value.toFixed(3))))
}

type PanZoomViewportProps = {
  children: ReactNode
  fitKey: string
  minScale?: number
  maxScale?: number
  initialPadding?: number
  className?: string
  contentClassName?: string
  onScaleChange?: (scale: number) => void
}

export const PanZoomViewport = forwardRef<PanZoomViewportHandle, PanZoomViewportProps>(
  function PanZoomViewport(props, ref) {
    const minScale = props.minScale ?? 0.08
    const maxScale = props.maxScale ?? 4
    const initialPadding = props.initialPadding ?? 12

    const viewportRef = useRef<HTMLDivElement | null>(null)
    const translateRef = useRef<HTMLDivElement | null>(null)
    const contentRef = useRef<HTMLDivElement | null>(null)
    const [scale, setScale] = useState(1)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const scaleRef = useRef(1)
    const offsetRef = useRef({ x: 0, y: 0 })
    const dragRef = useRef<null | { startClientX: number; startClientY: number; startOffsetX: number; startOffsetY: number }>(null)
    const pointerPositionsRef = useRef(new Map<number, { clientX: number; clientY: number }>())
    const pinchDistanceRef = useRef<number | null>(null)

    useEffect(() => {
      scaleRef.current = scale
      props.onScaleChange?.(scale)
    }, [props, scale])

    useEffect(() => {
      offsetRef.current = offset
    }, [offset])

    const zoomAroundPoint = useCallback((nextScale: number, point: { x: number; y: number }) => {
      const currentScale = scaleRef.current
      const currentOffset = offsetRef.current
      const boardX = (point.x - currentOffset.x) / currentScale
      const boardY = (point.y - currentOffset.y) / currentScale

      setScale(nextScale)
      setOffset({
        x: point.x - boardX * nextScale,
        y: point.y - boardY * nextScale,
      })
    }, [])

    const zoomFromCenter = useCallback((delta: number) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const nextScale = clampScale(scaleRef.current + delta, minScale, maxScale)
      if (nextScale === scaleRef.current) return
      zoomAroundPoint(nextScale, {
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
      })
    }, [maxScale, minScale, zoomAroundPoint])

    const fitToViewport = useCallback(() => {
      const viewport = viewportRef.current
      const content = contentRef.current
      if (!viewport || !content) return

      const viewportWidth = viewport.clientWidth
      const viewportHeight = viewport.clientHeight
      const boardWidth = content.scrollWidth
      const boardHeight = content.scrollHeight
      if (viewportWidth <= 0 || viewportHeight <= 0 || boardWidth <= 0 || boardHeight <= 0) return

      const nextScale = clampScale(
        Math.min(
          (viewportWidth - initialPadding * 2) / boardWidth,
          (viewportHeight - initialPadding * 2) / boardHeight,
          1,
        ),
        minScale,
        maxScale,
      )

      setScale(nextScale)
      setOffset({
        x: (viewportWidth - boardWidth * nextScale) / 2,
        y: (viewportHeight - boardHeight * nextScale) / 2,
      })
    }, [initialPadding, maxScale, minScale])

    const centerRect = useCallback((rect: { left: number; top: number; width: number; height: number }) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const viewportCenter = {
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
      }
      const rectCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
      const currentScale = scaleRef.current
      setOffset({
        x: viewportCenter.x - rectCenter.x * currentScale,
        y: viewportCenter.y - rectCenter.y * currentScale,
      })
    }, [])

    useImperativeHandle(ref, () => ({
      zoomIn: () => zoomFromCenter(0.12),
      zoomOut: () => zoomFromCenter(-0.12),
      fitToViewport,
      centerRect,
      getViewportCenter: () => {
        const viewport = viewportRef.current
        return {
          x: viewport ? viewport.clientWidth / 2 : 0,
          y: viewport ? viewport.clientHeight / 2 : 0,
        }
      },
    }), [centerRect, fitToViewport, zoomFromCenter])

    useLayoutEffect(() => {
      fitToViewport()
    }, [fitToViewport, props.fitKey])

    function getViewportLocalPoint(clientX: number, clientY: number) {
      const viewport = viewportRef.current
      if (!viewport) return null
      const rect = viewport.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
      return { x, y }
    }

    function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
      const localPoint = getViewportLocalPoint(event.clientX, event.clientY)
      if (!localPoint) return
      event.preventDefault()
      const nextScale = clampScale(
        scaleRef.current + (event.deltaY < 0 ? 0.08 : -0.08),
        minScale,
        maxScale,
      )
      if (nextScale === scaleRef.current) return
      zoomAroundPoint(nextScale, localPoint)
    }

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if (event.pointerType === "mouse" && event.button !== 0) return
      const viewport = viewportRef.current
      if (!viewport) return

      pointerPositionsRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      })

      if (pointerPositionsRef.current.size === 1) {
        dragRef.current = {
          startClientX: event.clientX,
          startClientY: event.clientY,
          startOffsetX: offsetRef.current.x,
          startOffsetY: offsetRef.current.y,
        }
        setDragging(true)
      } else if (pointerPositionsRef.current.size === 2) {
        dragRef.current = null
        setDragging(false)
        const [a, b] = [...pointerPositionsRef.current.values()]
        pinchDistanceRef.current = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      }

      viewport.setPointerCapture(event.pointerId)
      event.preventDefault()
    }

    function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
      if (!pointerPositionsRef.current.has(event.pointerId)) return

      pointerPositionsRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      })

      if (pointerPositionsRef.current.size === 2) {
        const [a, b] = [...pointerPositionsRef.current.values()]
        const nextDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
        const previousDistance = pinchDistanceRef.current
        const centerPoint = getViewportLocalPoint(
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2,
        )
        if (previousDistance && centerPoint && nextDistance > 0) {
          const nextScale = clampScale(scaleRef.current * (nextDistance / previousDistance), minScale, maxScale)
          if (nextScale !== scaleRef.current) {
            zoomAroundPoint(nextScale, centerPoint)
          }
        }
        pinchDistanceRef.current = nextDistance
        event.preventDefault()
        return
      }

      const drag = dragRef.current
      if (!drag) return
      setOffset({
        x: drag.startOffsetX + (event.clientX - drag.startClientX),
        y: drag.startOffsetY + (event.clientY - drag.startClientY),
      })
      event.preventDefault()
    }

    function finishPointer(event: React.PointerEvent<HTMLDivElement>) {
      pointerPositionsRef.current.delete(event.pointerId)
      if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
        viewportRef.current.releasePointerCapture(event.pointerId)
      }
      if (pointerPositionsRef.current.size < 2) {
        pinchDistanceRef.current = null
      }
      if (pointerPositionsRef.current.size === 1) {
        const remaining = [...pointerPositionsRef.current.values()][0]
        dragRef.current = {
          startClientX: remaining.clientX,
          startClientY: remaining.clientY,
          startOffsetX: offsetRef.current.x,
          startOffsetY: offsetRef.current.y,
        }
        setDragging(true)
      } else {
        dragRef.current = null
        setDragging(false)
      }
    }

    return (
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        className={["relative flex-1 overflow-hidden bg-zinc-950 select-none", props.className ?? ""].join(" ")}
        style={{ touchAction: "none" }}
      >
        <div
          ref={translateRef}
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          <div className="origin-top-left" style={{ transform: `scale(${scale})` }}>
            <div ref={contentRef} className={props.contentClassName ?? "w-max"}>
              {props.children}
            </div>
          </div>
        </div>
      </div>
    )
  },
)
