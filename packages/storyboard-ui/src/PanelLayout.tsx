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
  forceMobile?: boolean
}

type ResizeState = {
  panelId: string
  startX: number
  startWidth: number
}

const DEFAULT_PANEL_WIDTH = 360
const DEFAULT_MIN_WIDTH = 280
const DEFAULT_MAX_WIDTH = 640

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  )
}

function panelBadgeLabel(panel: PanelLayoutPanel) {
  const title = panel.title?.trim() || panel.id
  const words = title.split(/\s+/).filter(Boolean)
  return (words[0]?.[0] ?? title[0] ?? "?").toUpperCase()
}

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
  forceMobile = false,
}: PanelLayoutProps) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 768px)").matches,
  )
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>(() =>
    buildInitialWidths(panels, storageKeyPrefix),
  )
  const [activeMobilePanelId, setActiveMobilePanelId] = useState<string | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const panelMap = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel])),
    [panels],
  )

  useEffect(() => {
    if (forceMobile) {
      setIsDesktop(false)
      return
    }
    if (typeof window === "undefined") {
      return
    }
    const media = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [forceMobile])

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
    if (activeMobilePanelId && !panels.some((panel) => panel.id === activeMobilePanelId)) {
      setActiveMobilePanelId(null)
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
    panels.find((panel) => panel.id === activeMobilePanelId) ?? null

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className ?? ""}`}>
      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
        {leftPanels.map((panel) => (
          <aside
            className={`relative flex min-h-0 flex-none flex-col overflow-hidden border-r border-white/10 ${panelClassName ?? ""}`}
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
            className={`relative flex min-h-0 flex-none flex-col overflow-hidden border-l border-white/10 ${panelClassName ?? ""}`}
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
        {mobileMode === "nav" ? (
          <>
            <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-3 py-2">
              {activeMobilePanel ? (
                <>
                  <button
                    aria-label="Back"
                    className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-white/70"
                    onClick={() => setActiveMobilePanelId(null)}
                    type="button"
                  >
                    <BackIcon className="h-4 w-4" />
                  </button>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">
                    {activeMobilePanel.title ?? activeMobilePanel.id}
                  </div>
                  <div className="w-[52px]" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {leftPanels.map((panel) => (
                      <button
                        aria-label={panel.title ?? panel.id}
                        className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] font-semibold text-white/70"
                        key={panel.id}
                        onClick={() => setActiveMobilePanelId(panel.id)}
                        type="button"
                      >
                        {panelBadgeLabel(panel)}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">
                    Main view
                  </div>
                  <div className="flex items-center gap-2">
                    {rightPanels.map((panel) => (
                      <button
                        aria-label={panel.title ?? panel.id}
                        className="flex h-8 w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-[11px] font-semibold text-white/70"
                        key={panel.id}
                        onClick={() => setActiveMobilePanelId(panel.id)}
                        type="button"
                      >
                        {panelBadgeLabel(panel)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className={`min-h-0 flex-1 ${contentClassName ?? ""}`}>
              {activeMobilePanel ? (
                <div className={`h-full overflow-auto bg-zinc-950 ${panelClassName ?? ""}`}>
                  {activeMobilePanel.content}
                </div>
              ) : (
                children
              )}
            </div>
          </>
        ) : (
          <>
            <div className={`min-h-0 flex-1 ${contentClassName ?? ""}`}>{children}</div>
            {panels.length > 0 ? (
              <div className={`border-t border-white/10 bg-zinc-950 overflow-auto ${panelClassName ?? ""}`}>
                {panels.map((panel) => (
                  <section
                    className="border-b border-white/10 last:border-b-0"
                    key={panel.id}
                  >
                    {panel.content}
                  </section>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
      )}
    </div>
  )
}
