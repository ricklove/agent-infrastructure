import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

export type PanelLayoutPanel = {
  id: string
  title?: string
  content: ReactNode
  side?: "left" | "right"
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
}

type PanelLayoutProps = {
  children: ReactNode
  panels: PanelLayoutPanel[]
  className?: string
  contentClassName?: string
  panelClassName?: string
  storageKeyPrefix?: string
  mobileMode?: "nav" | "stack"
}

type ResizeState = {
  panelId: string
  startX: number
  startWidth: number
}

const DEFAULT_PANEL_WIDTH = 360
const DEFAULT_MIN_WIDTH = 280
const DEFAULT_MAX_WIDTH = 640

function clampWidth(
  width: number,
  minWidth: number | undefined,
  maxWidth: number | undefined,
) {
  return Math.max(
    minWidth ?? DEFAULT_MIN_WIDTH,
    Math.min(maxWidth ?? DEFAULT_MAX_WIDTH, width),
  )
}

function storageKeyForPanel(
  storageKeyPrefix: string | undefined,
  panelId: string,
) {
  return storageKeyPrefix ? `${storageKeyPrefix}.${panelId}` : undefined
}

function readStoredWidth(
  storageKey: string | undefined,
  fallbackWidth: number,
  minWidth: number | undefined,
  maxWidth: number | undefined,
) {
  if (!storageKey || typeof window === "undefined") {
    return clampWidth(fallbackWidth, minWidth, maxWidth)
  }
  const raw = window.localStorage.getItem(storageKey)
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN
  if (!Number.isFinite(parsed)) {
    return clampWidth(fallbackWidth, minWidth, maxWidth)
  }
  return clampWidth(parsed, minWidth, maxWidth)
}

function buildInitialWidths(
  panels: PanelLayoutPanel[],
  storageKeyPrefix: string | undefined,
) {
  return Object.fromEntries(
    panels.map((panel) => [
      panel.id,
      readStoredWidth(
        storageKeyForPanel(storageKeyPrefix, panel.id),
        panel.initialWidth ?? DEFAULT_PANEL_WIDTH,
        panel.minWidth,
        panel.maxWidth,
      ),
    ]),
  )
}

export function PanelLayout({
  children,
  panels,
  className,
  contentClassName,
  panelClassName,
  storageKeyPrefix,
  mobileMode = "nav",
}: PanelLayoutProps) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 768px)").matches,
  )
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>(() =>
    buildInitialWidths(panels, storageKeyPrefix),
  )
  const [activeMobilePanelId, setActiveMobilePanelId] = useState(
    panels[0]?.id ?? "",
  )
  const resizeRef = useRef<ResizeState | null>(null)
  const panelMap = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel])),
    [panels],
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const media = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    setPanelWidths((current) => {
      const next = { ...current }
      for (const panel of panels) {
        if (next[panel.id] != null) {
          next[panel.id] = clampWidth(
            next[panel.id],
            panel.minWidth,
            panel.maxWidth,
          )
        } else {
          next[panel.id] = readStoredWidth(
            storageKeyForPanel(storageKeyPrefix, panel.id),
            panel.initialWidth ?? DEFAULT_PANEL_WIDTH,
            panel.minWidth,
            panel.maxWidth,
          )
        }
      }
      for (const panelId of Object.keys(next)) {
        if (!panelMap[panelId]) {
          delete next[panelId]
        }
      }
      return next
    })
    if (!panels.some((panel) => panel.id === activeMobilePanelId)) {
      setActiveMobilePanelId(panels[0]?.id ?? "")
    }
  }, [activeMobilePanelId, panelMap, panels, storageKeyPrefix])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const resizeState = resizeRef.current
      if (!resizeState) {
        return
      }
      const panel = panelMap[resizeState.panelId]
      if (!panel) {
        return
      }
      const delta =
        panel.side === "left"
          ? event.clientX - resizeState.startX
          : resizeState.startX - event.clientX
      const nextWidth = clampWidth(
        resizeState.startWidth + delta,
        panel.minWidth,
        panel.maxWidth,
      )
      setPanelWidths((current) => ({
        ...current,
        [resizeState.panelId]: nextWidth,
      }))
      const storageKey = storageKeyForPanel(storageKeyPrefix, resizeState.panelId)
      if (storageKey) {
        window.localStorage.setItem(storageKey, String(Math.round(nextWidth)))
      }
    }

    function handlePointerUp() {
      resizeRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [panelMap, storageKeyPrefix])

  const leftPanels = panels.filter((panel) => panel.side === "left")
  const rightPanels = panels.filter((panel) => panel.side !== "left")
  const activeMobilePanel =
    panels.find((panel) => panel.id === activeMobilePanelId) ?? panels[0] ?? null

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className ?? ""}`}>
      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
        {leftPanels.map((panel) => (
          <aside
            className={`relative flex min-h-0 flex-none flex-col border-r border-white/10 ${panelClassName ?? ""}`}
            key={panel.id}
            style={{
              width:
                panelWidths[panel.id] ??
                panel.initialWidth ??
                DEFAULT_PANEL_WIDTH,
            }}
          >
            {panel.content}
            <button
              aria-label={`Resize ${panel.title ?? panel.id} panel`}
              className="absolute inset-y-0 right-0 hidden w-3 translate-x-1/2 cursor-col-resize md:block"
              onPointerDown={(event) => {
                resizeRef.current = {
                  panelId: panel.id,
                  startX: event.clientX,
                  startWidth:
                    panelWidths[panel.id] ??
                    panel.initialWidth ??
                    DEFAULT_PANEL_WIDTH,
                }
                event.currentTarget.setPointerCapture(event.pointerId)
                event.preventDefault()
              }}
              type="button"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />
            </button>
          </aside>
        ))}
        <div className={`min-h-0 min-w-0 flex-1 ${contentClassName ?? ""}`}>
          {children}
        </div>
        {rightPanels.map((panel) => (
          <aside
            className={`relative flex min-h-0 flex-none flex-col border-l border-white/10 ${panelClassName ?? ""}`}
            key={panel.id}
            style={{
              width:
                panelWidths[panel.id] ??
                panel.initialWidth ??
                DEFAULT_PANEL_WIDTH,
            }}
          >
            <button
              aria-label={`Resize ${panel.title ?? panel.id} panel`}
              className="absolute inset-y-0 left-0 hidden w-3 -translate-x-1/2 cursor-col-resize md:block"
              onPointerDown={(event) => {
                resizeRef.current = {
                  panelId: panel.id,
                  startX: event.clientX,
                  startWidth:
                    panelWidths[panel.id] ??
                    panel.initialWidth ??
                    DEFAULT_PANEL_WIDTH,
                }
                event.currentTarget.setPointerCapture(event.pointerId)
                event.preventDefault()
              }}
              type="button"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />
            </button>
            {panel.content}
          </aside>
        ))}
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`min-h-0 flex-1 ${contentClassName ?? ""}`}>{children}</div>
        {panels.length > 0 ? (
          <>
            {mobileMode === "nav" ? (
              <div className="flex items-center gap-2 border-t border-white/10 bg-zinc-950 px-3 py-2">
                {panels.map((panel) => {
                  const isActive = panel.id === activeMobilePanel?.id
                  return (
                    <button
                      className={`rounded border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                        isActive
                          ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
                          : "border-white/10 bg-white/5 text-white/55"
                      }`}
                      key={panel.id}
                      onClick={() => setActiveMobilePanelId(panel.id)}
                      type="button"
                    >
                      {panel.title ?? panel.id}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div
              className={`border-t border-white/10 bg-zinc-950 ${
                mobileMode === "stack" ? "" : "max-h-[46vh]"
              } overflow-auto ${panelClassName ?? ""}`}
            >
              {mobileMode === "stack"
                ? panels.map((panel) => (
                    <section
                      className="border-b border-white/10 last:border-b-0"
                      key={panel.id}
                    >
                      {panel.content}
                    </section>
                  ))
                : activeMobilePanel?.content}
            </div>
          </>
        ) : null}
      </div>
      )}
    </div>
  )
}
