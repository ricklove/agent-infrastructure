import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

export type PanZoomContainerHandle = {
  zoomIn: () => void
  zoomOut: () => void
  fitToViewport: () => void
  centerRect: (rect: { left: number; top: number; width: number; height: number }) => void
  getViewportCenter: () => { x: number; y: number }
  getViewportSize: () => { width: number; height: number }
  setView: (view: { scale: number; offset: { x: number; y: number } }) => void
}

type ViewState = {
  scale: number
  offsetX: number
  offsetY: number
}

type PanZoomContainerProps = {
  children: ReactNode
  fitKey?: string
  minScale?: number
  maxScale?: number
  initialPadding?: number
  className?: string
  contentClassName?: string
  onScaleChange?: (scale: number) => void
  onViewChange?: (view: {
    scale: number
    offset: { x: number; y: number }
    viewport: { width: number; height: number }
  }) => void
}

const ZOOM_STEP = 1.12

export function clampScale(value: number, minScale: number, maxScale: number) {
  return Math.min(maxScale, Math.max(minScale, Number(value.toFixed(4))))
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

export const PanZoomContainer = forwardRef<
  PanZoomContainerHandle,
  PanZoomContainerProps
>(function PanZoomContainer(
  {
    children,
    fitKey,
    minScale = 0.005,
    maxScale = 100,
    initialPadding = 20,
    className,
    contentClassName,
    onScaleChange,
    onViewChange,
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  })
  const dragRef = useRef<null | {
    pointerId: number
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  }>(null)
  const [view, setView] = useState<ViewState>(viewRef.current)
  const [dragging, setDragging] = useState(false)

  const commitView = useCallback(
    (nextView: ViewState) => {
      const normalized = {
        scale: clampScale(nextView.scale, minScale, maxScale),
        offsetX: nextView.offsetX,
        offsetY: nextView.offsetY,
      }
      viewRef.current = normalized
      setView(normalized)
    },
    [maxScale, minScale],
  )

  useEffect(() => {
    onScaleChange?.(view.scale)
  }, [onScaleChange, view.scale])

  useEffect(() => {
    if (!onViewChange) {
      return
    }
    const viewport = viewportRef.current
    onViewChange({
      scale: view.scale,
      offset: {
        x: view.offsetX,
        y: view.offsetY,
      },
      viewport: {
        width: viewport?.clientWidth ?? 0,
        height: viewport?.clientHeight ?? 0,
      },
    })
  }, [onViewChange, view])

  const getViewportSize = useCallback(() => {
    const viewport = viewportRef.current
    return {
      width: viewport?.clientWidth ?? 0,
      height: viewport?.clientHeight ?? 0,
    }
  }, [])

  const getContentSize = useCallback(() => {
    const content = contentRef.current
    return {
      width: content?.offsetWidth ?? 0,
      height: content?.offsetHeight ?? 0,
    }
  }, [])

  const zoomAroundPoint = useCallback(
    (nextScale: number, point: { x: number; y: number }) => {
      const currentView = viewRef.current
      const contentX = (point.x - currentView.offsetX) / currentView.scale
      const contentY = (point.y - currentView.offsetY) / currentView.scale
      commitView({
        scale: nextScale,
        offsetX: point.x - contentX * nextScale,
        offsetY: point.y - contentY * nextScale,
      })
    },
    [commitView],
  )

  const zoomFromViewportCenter = useCallback(
    (factor: number) => {
      const { width, height } = getViewportSize()
      if (width <= 0 || height <= 0) {
        return
      }
      const nextScale = clampScale(
        viewRef.current.scale * factor,
        minScale,
        maxScale,
      )
      if (nextScale === viewRef.current.scale) {
        return
      }
      zoomAroundPoint(nextScale, {
        x: width / 2,
        y: height / 2,
      })
    },
    [getViewportSize, maxScale, minScale, zoomAroundPoint],
  )

  const fitToViewport = useCallback(() => {
    const { width: viewportWidth, height: viewportHeight } = getViewportSize()
    const { width: contentWidth, height: contentHeight } = getContentSize()
    if (
      viewportWidth <= 0 ||
      viewportHeight <= 0 ||
      contentWidth <= 0 ||
      contentHeight <= 0
    ) {
      return
    }

    const availableWidth = Math.max(viewportWidth - initialPadding * 2, 1)
    const availableHeight = Math.max(viewportHeight - initialPadding * 2, 1)
    const nextScale = clampScale(
      Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
      minScale,
      maxScale,
    )

    commitView({
      scale: nextScale,
      offsetX: (viewportWidth - contentWidth * nextScale) / 2,
      offsetY: (viewportHeight - contentHeight * nextScale) / 2,
    })
  }, [commitView, getContentSize, getViewportSize, initialPadding, maxScale, minScale])

  const centerRect = useCallback(
    (rect: { left: number; top: number; width: number; height: number }) => {
      const { width, height } = getViewportSize()
      if (width <= 0 || height <= 0) {
        return
      }
      const currentScale = viewRef.current.scale
      const rectCenterX = rect.left + rect.width / 2
      const rectCenterY = rect.top + rect.height / 2
      commitView({
        scale: currentScale,
        offsetX: width / 2 - rectCenterX * currentScale,
        offsetY: height / 2 - rectCenterY * currentScale,
      })
    },
    [commitView, getViewportSize],
  )

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomFromViewportCenter(ZOOM_STEP),
      zoomOut: () => zoomFromViewportCenter(1 / ZOOM_STEP),
      fitToViewport,
      centerRect,
      getViewportCenter: () => {
        const { width, height } = getViewportSize()
        return {
          x: width / 2,
          y: height / 2,
        }
      },
      getViewportSize,
      setView: (nextView) => {
        commitView({
          scale: nextView.scale,
          offsetX: nextView.offset.x,
          offsetY: nextView.offset.y,
        })
      },
    }),
    [centerRect, commitView, fitToViewport, getViewportSize, zoomFromViewportCenter],
  )

  useIsomorphicLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fitToViewport()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fitKey, fitToViewport])

  function getViewportLocalPoint(clientX: number, clientY: number) {
    const viewport = viewportRef.current
    if (!viewport) {
      return null
    }
    const rect = viewport.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      return null
    }
    return { x, y }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const point = getViewportLocalPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }
    event.preventDefault()
    const nextScale = clampScale(
      viewRef.current.scale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      minScale,
      maxScale,
    )
    if (nextScale === viewRef.current.scale) {
      return
    }
    zoomAroundPoint(nextScale, point)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return
    }
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: viewRef.current.offsetX,
      startOffsetY: viewRef.current.offsetY,
    }
    viewport.setPointerCapture(event.pointerId)
    setDragging(true)
    event.preventDefault()
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    commitView({
      scale: viewRef.current.scale,
      offsetX: drag.startOffsetX + (event.clientX - drag.startClientX),
      offsetY: drag.startOffsetY + (event.clientY - drag.startClientY),
    })
    event.preventDefault()
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setDragging(false)
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-black text-white ${className ?? ""}`}
      data-panzoom-root="true"
    >
      <div className="flex items-center justify-end border-b border-white/10 px-2 py-1">
        <div className="flex items-center gap-1 text-xs">
          <button
            className="rounded border border-white/15 px-2 py-1 text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() => zoomFromViewportCenter(1 / ZOOM_STEP)}
            type="button"
          >
            -
          </button>
          <div className="min-w-12 text-center text-white/65">
            {Math.round(view.scale * 100)}%
          </div>
          <button
            className="rounded border border-white/15 px-2 py-1 text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() => zoomFromViewportCenter(ZOOM_STEP)}
            type="button"
          >
            +
          </button>
          <button
            className="rounded border border-white/15 px-2 py-1 text-white/80 hover:border-cyan-300/70 hover:text-cyan-100"
            onClick={() => fitToViewport()}
            type="button"
          >
            Fit
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden bg-zinc-950 select-none"
        data-panzoom-viewport="true"
        onPointerCancel={finishPointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onWheel={handleWheel}
        style={{
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <div
          className="absolute left-0 top-0"
          data-panzoom-offset-x={String(view.offsetX)}
          data-panzoom-offset-y={String(view.offsetY)}
          data-panzoom-scale={String(view.scale)}
          data-panzoom-stage="true"
          style={{
            transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div
            ref={contentRef}
            className={contentClassName ?? "w-max"}
            data-panzoom-content="true"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
})
