import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

const minWindowWidth = 220
const minWindowHeight = 120
const minScale = 0.35
const maxScale = 2.25
const viewportPadding = 8
const mobileBreakpointPx = 768
const mobileControlButtonSizePx = 26
const desktopControlButtonSizePx = 30
const mobileHeaderHeightPx = 34
const desktopHeaderHeightPx = 40
const minimizedBodyPaddingPx = 8

type DashboardWindowDefinition = {
  id?: string
  title: string
  body: ReactNode
  icon?: ReactNode
  width?: number
  height?: number
  x?: number
  y?: number
  scale?: number
  minimized?: boolean
}

type DashboardWindowPatch = Partial<
  Pick<
    DashboardWindowState,
    "title" | "body" | "icon" | "width" | "height" | "x" | "y" | "scale" | "minimized"
  >
>

type DashboardWindowState = {
  windowId: string
  title: string
  body: ReactNode
  icon: ReactNode | null
  minimized: boolean
  x: number
  y: number
  width: number
  height: number
  scale: number
  zIndex: number
}

type WindowInteraction =
  | {
      mode: "move" | "resize" | "zoom"
      windowId: string
      pointerId: number
      startX: number
      startY: number
      startWindow: Pick<
        DashboardWindowState,
        "x" | "y" | "width" | "height" | "scale"
      >
    }
  | null

type DashboardWindowLayerContextValue = {
  openWindow: (definition: DashboardWindowDefinition) => string
  updateWindow: (windowId: string, patch: DashboardWindowPatch) => void
  closeWindow: (windowId: string) => void
  focusWindow: (windowId: string) => void
}

const DashboardWindowLayerContext =
  createContext<DashboardWindowLayerContextValue | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function viewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 }
  }
  const viewport = window.visualViewport
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  }
}

function viewportMetrics() {
  const { width, height } = viewportSize()
  const mobile = width < mobileBreakpointPx
  const headerHeight = mobile ? mobileHeaderHeightPx : desktopHeaderHeightPx
  const maxWidth = Math.max(minWindowWidth, width - viewportPadding * 2)
  const maxHeight = Math.max(
    headerHeight + minimizedBodyPaddingPx,
    height - viewportPadding * 2,
  )
  return {
    width,
    height,
    mobile,
    headerHeight,
    maxWidth,
    maxHeight,
  }
}

function defaultWindowFrame(offsetIndex: number) {
  const metrics = viewportMetrics()
  if (metrics.mobile) {
    return {
      x: viewportPadding,
      y: viewportPadding,
      width: metrics.maxWidth,
      height: Math.min(420, metrics.maxHeight),
    }
  }
  return {
    x: 96 + offsetIndex * 24,
    y: 76 + offsetIndex * 20,
    width: 520,
    height: 420,
  }
}

function clampWindowState(
  input: Pick<DashboardWindowState, "x" | "y" | "width" | "height" | "scale">,
  minimized: boolean,
) {
  const metrics = viewportMetrics()
  const width = Math.min(Math.max(minWindowWidth, input.width), metrics.maxWidth)
  const expandedMinHeight = Math.min(minWindowHeight, metrics.maxHeight)
  const targetMinHeight = minimized
    ? Math.min(metrics.headerHeight + minimizedBodyPaddingPx, metrics.maxHeight)
    : expandedMinHeight
  const height = Math.min(Math.max(targetMinHeight, input.height), metrics.maxHeight)
  const maxX = Math.max(viewportPadding, metrics.width - viewportPadding - width)
  const maxY = Math.max(viewportPadding, metrics.height - viewportPadding - height)
  return {
    ...input,
    width,
    height,
    x: clamp(input.x, viewportPadding, maxX),
    y: clamp(input.y, viewportPadding, maxY),
    scale: clamp(input.scale, minScale, maxScale),
  }
}

function buildWindowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `dashboard-window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function CloseIcon(props: { className?: string }) {
  useRenderCounter("DashboardWindowLayer.CloseIcon")
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

function MinimizeIcon(props: { className?: string }) {
  useRenderCounter("DashboardWindowLayer.MinimizeIcon")
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M6 12h12" />
    </svg>
  )
}

function ResetZoomIcon(props: { className?: string }) {
  useRenderCounter("DashboardWindowLayer.ResetZoomIcon")
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="5.5" />
      <path d="m16 16 3.5 3.5" />
      <path d="M11 8v6M8 11h6" />
    </svg>
  )
}

export function useDashboardWindowLayer() {
  const context = useContext(DashboardWindowLayerContext)
  if (!context) {
    throw new Error("Dashboard window layer is unavailable.")
  }
  return context
}

export function DashboardWindowLayer(props: { children: ReactNode }) {
  useRenderCounter("DashboardWindowLayer")
  const [windows, setWindows] = useState<DashboardWindowState[]>([])
  const interactionRef = useRef<WindowInteraction>(null)
  const zIndexRef = useRef(180)

  const focusWindow = useCallback((windowId: string) => {
    zIndexRef.current += 1
    setWindows((current) =>
      current.map((entry) =>
        entry.windowId === windowId
          ? {
              ...entry,
              zIndex: zIndexRef.current,
            }
          : entry,
      ),
    )
  }, [])

  const closeWindow = useCallback((windowId: string) => {
    setWindows((current) => current.filter((entry) => entry.windowId !== windowId))
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dashboard-window-closed", {
          detail: { windowId },
        }),
      )
    }
  }, [])

  const updateWindow = useCallback((windowId: string, patch: DashboardWindowPatch) => {
    setWindows((current) =>
      current.map((entry) =>
        entry.windowId === windowId
          ? (() => {
              const nextEntry = {
                ...entry,
                ...patch,
                icon: patch.icon === undefined ? entry.icon : patch.icon,
              }
              const frame = clampWindowState(nextEntry, nextEntry.minimized)
              return {
                ...nextEntry,
                ...frame,
              }
            })()
          : entry,
      ),
    )
  }, [])

  const beginInteraction = useCallback(
    (
      mode: NonNullable<WindowInteraction>["mode"],
      event: React.PointerEvent,
      entry: DashboardWindowState,
    ) => {
      event.preventDefault()
      focusWindow(entry.windowId)
      interactionRef.current = {
        mode,
        windowId: entry.windowId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWindow: {
          x: entry.x,
          y: entry.y,
          width: entry.width,
          height: entry.height,
          scale: entry.scale,
        },
      }
    },
    [focusWindow],
  )

  const openWindow = useCallback((definition: DashboardWindowDefinition) => {
    zIndexRef.current += 1
    const nextWindowId = definition.id?.trim() || buildWindowId()
    setWindows((current) => {
      const existing = current.find((entry) => entry.windowId === nextWindowId)
      if (existing) {
        return current.map((entry) =>
          entry.windowId === nextWindowId
            ? (() => {
                const nextEntry = {
                  ...entry,
                  title: definition.title,
                  body: definition.body,
                  icon: definition.icon ?? entry.icon,
                  minimized: definition.minimized ?? entry.minimized,
                  width: definition.width ?? entry.width,
                  height: definition.height ?? entry.height,
                  x: definition.x ?? entry.x,
                  y: definition.y ?? entry.y,
                  scale: definition.scale ?? entry.scale,
                  zIndex: zIndexRef.current,
                }
                const frame = clampWindowState(nextEntry, nextEntry.minimized)
                return {
                  ...nextEntry,
                  ...frame,
                }
              })()
            : entry,
        )
      }
      const offsetIndex = current.length % 6
      const defaultFrame = defaultWindowFrame(offsetIndex)
      const nextEntry = {
        windowId: nextWindowId,
        title: definition.title,
        body: definition.body,
        icon: definition.icon ?? null,
        minimized: definition.minimized ?? false,
        x: definition.x ?? defaultFrame.x,
        y: definition.y ?? defaultFrame.y,
        width: definition.width ?? defaultFrame.width,
        height: definition.height ?? defaultFrame.height,
        scale: definition.scale ?? 1,
        zIndex: zIndexRef.current,
      }
      const frame = clampWindowState(nextEntry, nextEntry.minimized)
      return [
        ...current,
        {
          ...nextEntry,
          ...frame,
        },
      ]
    })
    return nextWindowId
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current
      if (!interaction) {
        return
      }
      const dx = event.clientX - interaction.startX
      const dy = event.clientY - interaction.startY
      setWindows((current) =>
        current.map((entry) => {
          if (entry.windowId !== interaction.windowId) {
            return entry
          }
          if (interaction.mode === "move") {
            const frame = clampWindowState(
              {
                x: interaction.startWindow.x + dx,
                y: interaction.startWindow.y + dy,
                width: entry.width,
                height: entry.height,
                scale: entry.scale,
              },
              entry.minimized,
            )
            return {
              ...entry,
              ...frame,
            }
          }
          if (interaction.mode === "resize") {
            const frame = clampWindowState(
              {
                x: entry.x,
                y: entry.y,
                width: interaction.startWindow.width + dx,
                height: interaction.startWindow.height + dy,
                scale: entry.scale,
              },
              entry.minimized,
            )
            return {
              ...entry,
              ...frame,
            }
          }
          return {
            ...entry,
            scale: clamp(interaction.startWindow.scale + dx / 240, minScale, maxScale),
          }
        }),
      )
    }

    function handlePointerUp(event: PointerEvent) {
      const interaction = interactionRef.current
      if (!interaction || interaction.pointerId !== event.pointerId) {
        return
      }
      interactionRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [])

  useEffect(() => {
    function reclampWindows() {
      setWindows((current) =>
        current.map((entry) => {
          const frame = clampWindowState(entry, entry.minimized)
          return {
            ...entry,
            ...frame,
          }
        }),
      )
    }

    window.addEventListener("resize", reclampWindows)
    window.visualViewport?.addEventListener("resize", reclampWindows)
    window.visualViewport?.addEventListener("scroll", reclampWindows)
    return () => {
      window.removeEventListener("resize", reclampWindows)
      window.visualViewport?.removeEventListener("resize", reclampWindows)
      window.visualViewport?.removeEventListener("scroll", reclampWindows)
    }
  }, [])

  const contextValue = useMemo<DashboardWindowLayerContextValue>(
    () => ({
      openWindow,
      updateWindow,
      closeWindow,
      focusWindow,
    }),
    [closeWindow, focusWindow, openWindow, updateWindow],
  )

  const renderedWindows = useMemo(
    () =>
      windows.map((entry) => {
        const mobile = typeof window !== "undefined" ? window.innerWidth < mobileBreakpointPx : false
        const controlButtonSize = mobile
          ? mobileControlButtonSizePx
          : desktopControlButtonSizePx
        const headerHeight = mobile ? mobileHeaderHeightPx : desktopHeaderHeightPx
        const titleFontSize = clamp(11 * entry.scale, 8, 14)
        return (
          <div
            key={entry.windowId}
            className="pointer-events-auto absolute"
            style={{
              left: entry.x,
              top: entry.y,
              width: entry.width,
              height: entry.minimized ? headerHeight + minimizedBodyPaddingPx : entry.height,
              zIndex: entry.zIndex,
            }}
            onPointerDown={() => focusWindow(entry.windowId)}
          >
            <div className="flex h-full flex-col overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
              <div
                className="flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/88 px-2"
                style={{ height: `${headerHeight}px` }}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
                  onPointerDown={(event) => beginInteraction("move", event, entry)}
                  title="Drag window"
                >
                  <div className="flex min-w-0 items-center gap-1.5 text-cyan-100">
                    {entry.icon ? <span className="shrink-0">{entry.icon}</span> : null}
                    <span
                      className="truncate uppercase tracking-[0.14em]"
                      style={{ fontSize: `${titleFontSize}px` }}
                    >
                      {entry.title}
                    </span>
                  </div>
                </button>
                <div className="flex items-center gap-1 text-[11px] text-slate-200">
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    onClick={() => updateWindow(entry.windowId, { scale: 1 })}
                    disabled={Math.abs(entry.scale - 1) < 0.01}
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] disabled:opacity-40"
                    title="Reset zoom"
                    style={{ width: `${controlButtonSize}px`, height: `${controlButtonSize}px` }}
                  >
                    <ResetZoomIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => beginInteraction("zoom", event, entry)}
                    className="inline-flex shrink-0 touch-none items-center justify-center rounded-full border border-white/10 bg-slate-950/95 font-medium text-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                    title="Drag left or right to zoom"
                    style={{ width: `${controlButtonSize}px`, height: `${controlButtonSize}px` }}
                  >
                    <span style={{ fontSize: mobile ? "7px" : "8px" }}>
                      {Math.round(entry.scale * 100)}%
                    </span>
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    onClick={() =>
                      updateWindow(entry.windowId, { minimized: !entry.minimized })
                    }
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                    title={entry.minimized ? "Restore window" : "Minimize window"}
                    style={{ width: `${controlButtonSize}px`, height: `${controlButtonSize}px` }}
                  >
                    <MinimizeIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    onClick={() => closeWindow(entry.windowId)}
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-rose-400/25 bg-slate-950/95 text-rose-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                    title="Close window"
                    style={{ width: `${controlButtonSize}px`, height: `${controlButtonSize}px` }}
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {entry.minimized ? (
                <div className="flex h-full items-center px-3 text-xs text-slate-300">
                  {entry.title}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto p-2 pt-1">
                  <div
                    style={{
                      transform: `scale(${entry.scale})`,
                      transformOrigin: "top left",
                      width: "100%",
                      minHeight: "100%",
                    }}
                  >
                    {entry.body}
                  </div>
                </div>
              )}
            </div>

            {!entry.minimized ? (
              <button
                type="button"
                className="absolute bottom-2 right-2 cursor-se-resize touch-none rounded-full border border-white/10 bg-slate-950/95 text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                title="Resize window"
                onPointerDown={(event) => beginInteraction("resize", event, entry)}
                style={{ width: `${controlButtonSize}px`, height: `${controlButtonSize}px` }}
              >
                <span className="absolute bottom-[5px] right-[5px] block h-2.5 w-2.5 border-b border-r border-current" />
              </button>
            ) : null}
          </div>
        )
      }),
    [closeWindow, focusWindow, updateWindow, windows],
  )

  return (
    <DashboardWindowLayerContext.Provider value={contextValue}>
      {props.children}
      {typeof document !== "undefined" && windows.length > 0
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[160] overflow-hidden">
              {renderedWindows}
            </div>,
            document.body,
          )
        : null}
    </DashboardWindowLayerContext.Provider>
  )
}
