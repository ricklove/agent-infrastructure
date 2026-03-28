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

const minWindowWidth = 320
const minWindowHeight = 180
const minScale = 0.6
const maxScale = 2.25

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
          ? {
              ...entry,
              ...patch,
              icon: patch.icon === undefined ? entry.icon : patch.icon,
            }
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
            ? {
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
            : entry,
        )
      }
      const offsetIndex = current.length % 6
      return [
        ...current,
        {
          windowId: nextWindowId,
          title: definition.title,
          body: definition.body,
          icon: definition.icon ?? null,
          minimized: definition.minimized ?? false,
          x: definition.x ?? 96 + offsetIndex * 24,
          y: definition.y ?? 76 + offsetIndex * 20,
          width: definition.width ?? 520,
          height: definition.height ?? 420,
          scale: definition.scale ?? 1,
          zIndex: zIndexRef.current,
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
            return {
              ...entry,
              x: Math.max(0, interaction.startWindow.x + dx),
              y: Math.max(0, interaction.startWindow.y + dy),
            }
          }
          if (interaction.mode === "resize") {
            return {
              ...entry,
              width: Math.max(minWindowWidth, interaction.startWindow.width + dx),
              height: Math.max(minWindowHeight, interaction.startWindow.height + dy),
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
      windows.map((entry) => (
        <div
          key={entry.windowId}
          className="pointer-events-auto absolute"
          style={{
            left: entry.x,
            top: entry.y,
            width: entry.width,
            height: entry.minimized ? 54 : entry.height,
            zIndex: entry.zIndex,
          }}
          onPointerDown={() => focusWindow(entry.windowId)}
        >
          <div className="pointer-events-none absolute -top-3 left-3 right-3 z-[2] flex items-center justify-between gap-2">
            <div
              className="pointer-events-auto inline-flex cursor-grab items-center gap-2 rounded-full border border-white/10 bg-slate-950/95 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] active:cursor-grabbing"
              onPointerDown={(event) => beginInteraction("move", event, entry)}
              title="Drag window"
            >
              {entry.icon ? <span className="text-cyan-200">{entry.icon}</span> : null}
              <span className="max-w-[18rem] truncate">{entry.title}</span>
            </div>
            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={() => updateWindow(entry.windowId, { scale: 1 })}
                disabled={Math.abs(entry.scale - 1) < 0.01}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] disabled:opacity-40"
                title="Reset zoom"
              >
                <ResetZoomIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onPointerDown={(event) => beginInteraction("zoom", event, entry)}
                className="inline-flex h-8 min-w-[5.25rem] items-center justify-center rounded-full border border-white/10 bg-slate-950/95 px-3 text-[10px] font-medium text-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] touch-none"
                title="Drag left or right to zoom"
              >
                {Math.round(entry.scale * 100)}%
              </button>
              <button
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={() =>
                  updateWindow(entry.windowId, { minimized: !entry.minimized })
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-950/95 text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                title={entry.minimized ? "Restore window" : "Minimize window"}
              >
                <MinimizeIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation()
                }}
                onClick={() => closeWindow(entry.windowId)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/25 bg-slate-950/95 text-rose-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                title="Close window"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="h-full overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            {entry.minimized ? (
              <div className="flex h-full items-center px-4 text-xs text-slate-300">
                {entry.title}
              </div>
            ) : (
              <div className="h-full overflow-auto">
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
              className="absolute -bottom-2 -right-2 h-7 w-7 cursor-se-resize touch-none rounded-full border border-white/10 bg-slate-950/95 text-slate-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
              title="Resize window"
              onPointerDown={(event) => beginInteraction("resize", event, entry)}
            >
              <span className="absolute bottom-[5px] right-[5px] block h-2.5 w-2.5 border-b border-r border-current" />
            </button>
          ) : null}
        </div>
      )),
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
