import type { AgentTicket } from "@agent-infrastructure/agent-chat-ui"
import { TicketView } from "@agent-infrastructure/agent-chat-ui"
import { useDashboardWindowLayer } from "@agent-infrastructure/dashboard-ui"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { useEffect, useRef, useState } from "react"

type DebugComponentId = "floating-window"
type FixtureId =
  | "fixed-block"
  | "full-width-scroll"
  | "long-text"
  | "unbreakable-text"
  | "nested-flex"
  | "form-controls"
  | "ticket-view"
type PresetId =
  | "baseline"
  | "narrow-50"
  | "narrow-30"
  | "mobile-fit"
  | "tall-scroll"
  | "ticket-small"

type FixtureOption = {
  id: FixtureId
  label: string
  description: string
}

type PresetOption = {
  id: PresetId
  label: string
  width: number
  height: number
  scale: number
  x?: number
  y?: number
}

type DraftState = {
  title: string
  fixtureId: FixtureId
  width: string
  height: string
  scale: string
  x: string
  y: string
}

type SpecimenRecord = {
  windowId: string
  title: string
  fixtureId: FixtureId
  width: number
  height: number
  scale: number
  x?: number
  y?: number
  createdAtMs: number
}

type MeasurementRecord = {
  present: boolean
  outerWidth: number
  outerHeight: number
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
  scrollWidth: number
  scrollHeight: number
  overflowX: boolean
  overflowY: boolean
}

const componentOptions: Array<{ id: DebugComponentId; label: string; description: string }> = [
  {
    id: "floating-window",
    label: "Floating Window View",
    description:
      "Spawn shared dashboard floating windows with controlled content, geometry, and scale.",
  },
]

const fixtureOptions: FixtureOption[] = [
  {
    id: "fixed-block",
    label: "Fixed Size Block",
    description: "Centered fixed-size block for shell-only baseline width and height checks.",
  },
  {
    id: "full-width-scroll",
    label: "Full Width Scroll",
    description: "A full-width column with explicit vertical overflow and repeated rows.",
  },
  {
    id: "long-text",
    label: "Long Wrapped Text",
    description: "Paragraph-heavy content for wrap behavior in narrow scaled windows.",
  },
  {
    id: "unbreakable-text",
    label: "Unbreakable Text",
    description: "Long tokens that force horizontal overflow pressure without real product UI.",
  },
  {
    id: "nested-flex",
    label: "Nested Flex",
    description: "A min-h-0 and min-w-0 fixture with nested scroll regions and side rails.",
  },
  {
    id: "form-controls",
    label: "Form Controls",
    description: "Inputs, textarea, toggles, and button rows under constrained widths.",
  },
  {
    id: "ticket-view",
    label: "Ticket View",
    description: "Local TicketView fixture to compare real product content against shell-only cases.",
  },
]

const presetOptions: PresetOption[] = [
  { id: "baseline", label: "520 x 420 @ 100%", width: 520, height: 420, scale: 1 },
  { id: "narrow-50", label: "300 x 220 @ 50%", width: 300, height: 220, scale: 0.5, x: 8, y: 8 },
  { id: "narrow-30", label: "200 x 220 @ 30%", width: 200, height: 220, scale: 0.3, x: 8, y: 8 },
  { id: "mobile-fit", label: "188 x 240 @ 35%", width: 188, height: 240, scale: 0.35, x: 8, y: 8 },
  { id: "tall-scroll", label: "280 x 440 @ 65%", width: 280, height: 440, scale: 0.65, x: 36, y: 24 },
  { id: "ticket-small", label: "260 x 280 @ 40%", width: 260, height: 280, scale: 0.4, x: 24, y: 24 },
]

const mockTicket: AgentTicket = {
  id: "debug-ticket-001",
  sessionId: "debug-session-001",
  title: "Floating window ticket specimen",
  description: "Exercise TicketView inside the shared floating-window shell.",
  processBlueprintId: "full_development_process",
  processSnapshotId: null,
  processTitle: "Full Development Process",
  status: "active",
  currentStepId: "run_local_verification",
  nextStepId: "commit_milestone",
  nextStepLabel: "Commit the stable milestone on the feature branch",
  resolution: null,
  createdAtMs: Date.UTC(2026, 2, 29, 0, 0, 0),
  updatedAtMs: Date.UTC(2026, 2, 29, 5, 30, 0),
  checklist: [
    {
      id: "review_relevant_blueprints",
      title: "Review and update relevant blueprints",
      kind: "task",
      status: "completed",
      doneToken: null,
      blockedToken: null,
      decision: null,
      steps: [],
    },
    {
      id: "implement_revision",
      title: "Implement the floating-window debug lab",
      kind: "task",
      status: "completed",
      doneToken: null,
      blockedToken: null,
      decision: null,
      steps: [
        {
          id: "debug_tab",
          title: "Register a first-party dashboard debug tab",
          kind: "task",
          status: "completed",
          doneToken: null,
          blockedToken: null,
          decision: null,
          steps: [],
        },
        {
          id: "fixture_catalog",
          title: "Add shell-only and TicketView fixtures",
          kind: "task",
          status: "completed",
          doneToken: null,
          blockedToken: null,
          decision: null,
          steps: [],
        },
      ],
    },
    {
      id: "run_local_verification",
      title: "Run local verification with screenshots",
      kind: "task",
      status: "active",
      doneToken: null,
      blockedToken: null,
      decision: null,
      steps: [
        {
          id: "narrow_shell",
          title: "Verify 200 x 220 at 30 percent with shell-only fixtures",
          kind: "task",
          status: "active",
          doneToken: null,
          blockedToken: null,
          decision: null,
          steps: [],
        },
        {
          id: "ticket_fixture",
          title: "Verify TicketView stays constrained and scrollable",
          kind: "task",
          status: "pending",
          doneToken: null,
          blockedToken: null,
          decision: null,
          steps: [],
        },
      ],
    },
    {
      id: "screenshot_decision",
      title: "Assess screenshot verification outcome",
      kind: "decision",
      status: "pending",
      doneToken: null,
      blockedToken: null,
      decision: {
        prompt: "What is the screenshot verification outcome?",
        options: [
          {
            id: "pass",
            title: "Passed",
            goto: null,
            next: true,
            block: false,
            complete: false,
            steps: [],
          },
          {
            id: "rollback",
            title: "Rollback",
            goto: null,
            next: false,
            block: true,
            complete: false,
            steps: [],
          },
        ],
      },
      steps: [],
    },
  ],
}

const longParagraph =
  "Floating windows should keep inner content width constrained to the viewport after scale is applied, while still letting the operator inspect realistic wrapping, scrolling, and nested layout pressure without mixing shell bugs with unrelated product semantics."

function fixtureLabel(fixtureId: FixtureId) {
  return fixtureOptions.find((fixture) => fixture.id === fixtureId)?.label ?? fixtureId
}

function readNumericInput(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readOptionalNumericInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function draftFromPreset(preset: PresetOption, fixtureId: FixtureId): DraftState {
  return {
    title: `${fixtureLabel(fixtureId)} specimen`,
    fixtureId,
    width: String(preset.width),
    height: String(preset.height),
    scale: String(preset.scale),
    x: preset.x === undefined ? "" : String(preset.x),
    y: preset.y === undefined ? "" : String(preset.y),
  }
}

function specimenFromDraft(windowId: string, draft: DraftState): SpecimenRecord {
  return {
    windowId,
    title: draft.title.trim() || `${fixtureLabel(draft.fixtureId)} specimen`,
    fixtureId: draft.fixtureId,
    width: readNumericInput(draft.width, 520),
    height: readNumericInput(draft.height, 420),
    scale: readNumericInput(draft.scale, 1),
    x: readOptionalNumericInput(draft.x),
    y: readOptionalNumericInput(draft.y),
    createdAtMs: Date.now(),
  }
}

function classForMeasurementFlag(flag: boolean) {
  return flag ? "text-amber-200" : "text-emerald-200"
}

function DebugLabIcon(props: { className?: string }) {
  useRenderCounter("FloatingWindowDebugScreen.DebugLabIcon")
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
      <path d="M4 5.5h16" />
      <path d="M4 18.5h16" />
      <rect x="5" y="7" width="9" height="9" rx="1.8" />
      <path d="M17 8v7" />
      <path d="M15 11.5h4" />
    </svg>
  )
}

function FixtureFrame(props: { windowId: string; children: JSX.Element | JSX.Element[] }) {
  return (
    <div
      data-floating-window-fixture-root={props.windowId}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-auto rounded-[0.95rem] border border-cyan-200/15 bg-slate-900/90 text-slate-100"
    >
      {props.children}
    </div>
  )
}

function FixedBlockFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.FixedBlockFixture")
  return (
    <FixtureFrame windowId={props.windowId}>
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="flex h-[160px] w-[240px] items-center justify-center rounded-[1rem] border border-cyan-300/25 bg-cyan-300/10 text-center text-sm font-medium text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          Fixed 240 x 160 content block
        </div>
      </div>
    </FixtureFrame>
  )
}

function FullWidthScrollFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.FullWidthScrollFixture")
  return (
    <FixtureFrame windowId={props.windowId}>
      <div className="border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">
        Full width scroll specimen
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <div className="space-y-2">
          {Array.from({ length: 18 }, (_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-slate-200"
            >
              Row {index + 1}: full-width scroll content that should remain constrained to the scaled viewport and take over vertical scrolling cleanly.
            </div>
          ))}
        </div>
      </div>
    </FixtureFrame>
  )
}

function LongTextFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.LongTextFixture")
  return (
    <FixtureFrame windowId={props.windowId}>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm leading-7 text-slate-200">
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">
          Wrapped text specimen
        </div>
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, index) => (
            <p key={index}>{longParagraph}</p>
          ))}
        </div>
      </div>
    </FixtureFrame>
  )
}

function UnbreakableTextFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.UnbreakableTextFixture")
  return (
    <FixtureFrame windowId={props.windowId}>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm leading-6 text-slate-200">
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">
          Unbreakable width pressure
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
            short-label short-label short-label
          </div>
          <div className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-3 py-3 font-mono text-[11px] text-amber-100">
            this_is_a_deliberately_unbreakable_token_for_horizontal_overflow_pressure_testing_inside_scaled_floating_windows_without_real_product_markup
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
            {longParagraph}
          </div>
        </div>
      </div>
    </FixtureFrame>
  )
}

function NestedFlexFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.NestedFlexFixture")
  return (
    <FixtureFrame windowId={props.windowId}>
      <div className="flex min-h-0 flex-1 min-w-0 flex-col">
        <div className="border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">
          Nested flex min-h-0 specimen
        </div>
        <div className="flex min-h-0 flex-1 min-w-0">
          <div className="w-28 shrink-0 border-r border-white/10 bg-slate-950/60 px-3 py-3 text-xs text-slate-400">
            <div className="mb-2 uppercase tracking-[0.16em] text-cyan-100/75">rail</div>
            <div className="space-y-2">
              <div>alpha</div>
              <div>beta</div>
              <div>gamma</div>
              <div>delta</div>
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b border-white/10 px-4 py-3 text-sm text-slate-200">
              Main pane should flex and scroll without rail width breaking the viewport.
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 10 }, (_, index) => (
                  <div key={index} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-slate-200">
                    Flex card {index + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </FixtureFrame>
  )
}

function FormControlsFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.FormControlsFixture")
  return (
    <FixtureFrame windowId={props.windowId}>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm text-slate-200">
        <div className="mb-4 text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">
          Control density specimen
        </div>
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Title</span>
            <input className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none" defaultValue="Floating window lab" />
          </label>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Notes</span>
            <textarea className="min-h-[140px] w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none" defaultValue={longParagraph} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Width</span>
              <input className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none" defaultValue="300" />
            </label>
            <label className="block space-y-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Scale</span>
              <input className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none" defaultValue="0.5" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-cyan-100">
              Apply preset
            </button>
            <button type="button" className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-200">
              Duplicate
            </button>
          </div>
        </div>
      </div>
    </FixtureFrame>
  )
}

function TicketViewFixture(props: { windowId: string }) {
  useRenderCounter("FloatingWindowDebugScreen.TicketViewFixture")
  return (
    <div
      data-floating-window-fixture-root={props.windowId}
      className="h-full min-h-0 min-w-0 overflow-auto rounded-[0.95rem] border border-cyan-200/15 bg-slate-900/90"
    >
      <TicketView ticket={mockTicket} />
    </div>
  )
}

function FloatingWindowFixtureBody(props: { windowId: string; fixtureId: FixtureId }) {
  useRenderCounter("FloatingWindowDebugScreen.FloatingWindowFixtureBody")
  if (props.fixtureId === "fixed-block") {
    return <FixedBlockFixture windowId={props.windowId} />
  }
  if (props.fixtureId === "full-width-scroll") {
    return <FullWidthScrollFixture windowId={props.windowId} />
  }
  if (props.fixtureId === "long-text") {
    return <LongTextFixture windowId={props.windowId} />
  }
  if (props.fixtureId === "unbreakable-text") {
    return <UnbreakableTextFixture windowId={props.windowId} />
  }
  if (props.fixtureId === "nested-flex") {
    return <NestedFlexFixture windowId={props.windowId} />
  }
  if (props.fixtureId === "form-controls") {
    return <FormControlsFixture windowId={props.windowId} />
  }
  return <TicketViewFixture windowId={props.windowId} />
}

function readMeasurement(windowId: string): MeasurementRecord | null {
  const outer = document.querySelector(`[data-dashboard-window-id="${windowId}"]`)
  const viewport = document.querySelector(`[data-dashboard-window-viewport="${windowId}"]`)
  const contentRoot = document.querySelector(`[data-floating-window-fixture-root="${windowId}"]`)
  if (!(outer instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(contentRoot instanceof HTMLElement)) {
    return null
  }

  const viewportRect = viewport.getBoundingClientRect()
  const contentRect = contentRoot.getBoundingClientRect()
  const scaleX = contentRoot.clientWidth > 0 ? contentRect.width / contentRoot.clientWidth : 1
  const scaleY = contentRoot.clientHeight > 0 ? contentRect.height / contentRoot.clientHeight : 1
  const scrollWidth = Math.max(Math.round(contentRect.width), Math.round(contentRoot.scrollWidth * scaleX))
  const scrollHeight = Math.max(Math.round(contentRect.height), Math.round(contentRoot.scrollHeight * scaleY))

  return {
    present: true,
    outerWidth: Math.round(outer.getBoundingClientRect().width),
    outerHeight: Math.round(outer.getBoundingClientRect().height),
    viewportWidth: Math.round(viewportRect.width),
    viewportHeight: Math.round(viewportRect.height),
    contentWidth: Math.round(contentRect.width),
    contentHeight: Math.round(contentRect.height),
    scrollWidth,
    scrollHeight,
    overflowX: scrollWidth > Math.round(viewportRect.width) + 1,
    overflowY: scrollHeight > Math.round(viewportRect.height) + 1,
  }
}

export function FloatingWindowDebugScreen() {
  useRenderCounter("FloatingWindowDebugScreen")
  const { openWindow, updateWindow, closeWindow, focusWindow } = useDashboardWindowLayer()
  const nextWindowIdRef = useRef(1)
  const [selectedComponentId] = useState<DebugComponentId>("floating-window")
  const [draft, setDraft] = useState<DraftState>(() =>
    draftFromPreset(presetOptions[0], "fixed-block"),
  )
  const [specimens, setSpecimens] = useState<SpecimenRecord[]>([])
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<Record<string, MeasurementRecord>>({})

  useEffect(() => {
    function handleClosedWindow(event: Event) {
      const detail = (event as CustomEvent<{ windowId?: string }>).detail
      const closedWindowId = detail?.windowId?.trim()
      if (!closedWindowId) {
        return
      }
      setSpecimens((current) => current.filter((specimen) => specimen.windowId !== closedWindowId))
      setMeasurements((current) => {
        const nextMeasurements = { ...current }
        delete nextMeasurements[closedWindowId]
        return nextMeasurements
      })
      setSelectedWindowId((current) => (current === closedWindowId ? null : current))
    }

    window.addEventListener("dashboard-window-closed", handleClosedWindow as EventListener)
    return () => {
      window.removeEventListener("dashboard-window-closed", handleClosedWindow as EventListener)
    }
  }, [])

  useEffect(() => {
    const statusItems = [
      { label: "Fixture", value: fixtureLabel(draft.fixtureId) },
      { label: "Windows", value: String(specimens.length), tone: specimens.length > 0 ? "good" : "neutral" },
      { label: "Scale", value: `${Math.round(readNumericInput(draft.scale, 1) * 100)}%` },
    ]
    window.dispatchEvent(
      new CustomEvent("dashboard-feature-status", {
        detail: {
          featureId: "debug",
          items: statusItems,
        },
      }),
    )
  }, [draft.fixtureId, draft.scale, specimens.length])

  useEffect(() => {
    function refreshMeasurements() {
      setMeasurements(() => {
        const nextMeasurements: Record<string, MeasurementRecord> = {}
        for (const specimen of specimens) {
          const nextMeasurement = readMeasurement(specimen.windowId)
          if (nextMeasurement) {
            nextMeasurements[specimen.windowId] = nextMeasurement
          }
        }
        return nextMeasurements
      })
    }

    refreshMeasurements()
    const interval = window.setInterval(refreshMeasurements, 250)
    window.addEventListener("resize", refreshMeasurements)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("resize", refreshMeasurements)
    }
  }, [specimens])

  function openSpecimen(nextDraft: DraftState) {
    const windowId = `floating-window-debug-${nextWindowIdRef.current++}`
    const specimen = specimenFromDraft(windowId, nextDraft)
    openWindow({
      id: windowId,
      title: specimen.title,
      icon: <DebugLabIcon className="h-3.5 w-3.5" />,
      body: (
        <FloatingWindowFixtureBody
          windowId={windowId}
          fixtureId={specimen.fixtureId}
        />
      ),
      width: specimen.width,
      height: specimen.height,
      scale: specimen.scale,
      x: specimen.x,
      y: specimen.y,
    })
    setSpecimens((current) => [...current, specimen])
    setSelectedWindowId(windowId)
  }

  function updateSelectedWindow() {
    if (!selectedWindowId) {
      return
    }
    const nextSpecimen = specimenFromDraft(selectedWindowId, draft)
    updateWindow(selectedWindowId, {
      title: nextSpecimen.title,
      body: (
        <FloatingWindowFixtureBody
          windowId={selectedWindowId}
          fixtureId={nextSpecimen.fixtureId}
        />
      ),
      width: nextSpecimen.width,
      height: nextSpecimen.height,
      scale: nextSpecimen.scale,
      x: nextSpecimen.x,
      y: nextSpecimen.y,
    })
    setSpecimens((current) =>
      current.map((specimen) =>
        specimen.windowId === selectedWindowId ? nextSpecimen : specimen,
      ),
    )
  }

  function openCurrentFixtureComparison() {
    const comparisonPresetIds: PresetId[] = ["baseline", "narrow-50", "narrow-30", "ticket-small"]
    for (const presetId of comparisonPresetIds) {
      const preset = presetOptions.find((candidate) => candidate.id === presetId)
      if (!preset) {
        continue
      }
      openSpecimen({
        ...draftFromPreset(preset, draft.fixtureId),
        title: `${fixtureLabel(draft.fixtureId)} ${preset.label}`,
      })
    }
  }

  function openFixtureMatrix() {
    const preset = presetOptions.find((candidate) => candidate.id === "narrow-30") ?? presetOptions[0]
    for (const fixture of fixtureOptions) {
      openSpecimen({
        ...draftFromPreset(preset, fixture.id),
        title: `${fixture.label} ${preset.label}`,
      })
    }
  }

  function closeAllWindows() {
    for (const specimen of specimens) {
      closeWindow(specimen.windowId)
    }
    setSpecimens([])
    setMeasurements({})
    setSelectedWindowId(null)
  }

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(15,23,42,0.98))] text-slate-100">
      <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="rounded-[1.4rem] border border-cyan-300/12 bg-slate-950/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">
                Floating Window Debug Lab
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Shared floating-window shell verification
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                Use shell-only fixtures, real TicketView content, and narrow-scale presets to prove whether a bug belongs to the window host or the content inside it.
              </p>
            </div>
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Current fixture</div>
                <div className="mt-1 text-sm text-white">{fixtureLabel(draft.fixtureId)}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Requested geometry</div>
                <div className="mt-1 text-sm text-white">{draft.width} x {draft.height}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Requested scale</div>
                <div className="mt-1 text-sm text-white">{Math.round(readNumericInput(draft.scale, 1) * 100)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_420px]">
          <section className="rounded-[1.25rem] border border-white/8 bg-slate-950/65 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Components</div>
            <div className="mt-3 space-y-3">
              {componentOptions.map((component) => (
                <button
                  key={component.id}
                  type="button"
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    component.id === selectedComponentId
                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                      : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="text-sm font-medium">{component.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">
                    {component.description}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Fixtures</div>
            <div className="mt-3 space-y-2">
              {fixtureOptions.map((fixture) => (
                <button
                  key={fixture.id}
                  type="button"
                  data-debug-fixture={fixture.id}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      fixtureId: fixture.id,
                      title: `${fixture.label} specimen`,
                    }))
                  }
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    draft.fixtureId === fixture.id
                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                      : "border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="text-sm font-medium">{fixture.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">
                    {fixture.description}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[1.25rem] border border-white/8 bg-slate-950/65 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Specimen controls</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Title</span>
                    <input
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Width</span>
                      <input
                        value={draft.width}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, width: event.target.value }))
                        }
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Height</span>
                      <input
                        value={draft.height}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, height: event.target.value }))
                        }
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Scale</span>
                    <input
                      value={draft.scale}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, scale: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">X</span>
                      <input
                        value={draft.x}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, x: event.target.value }))
                        }
                        placeholder="auto"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Y</span>
                      <input
                        value={draft.y}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, y: event.target.value }))
                        }
                        placeholder="auto"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600"
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-open-floating-window-specimen="true"
                    onClick={() => openSpecimen(draft)}
                    className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-cyan-100"
                  >
                    Open specimen
                  </button>
                  <button
                    type="button"
                    onClick={updateSelectedWindow}
                    disabled={!selectedWindowId}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-100 disabled:opacity-40"
                  >
                    Update selected
                  </button>
                  <button
                    type="button"
                    onClick={() => openSpecimen(draft)}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-100"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={openCurrentFixtureComparison}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-100"
                  >
                    Open comparison set
                  </button>
                  <button
                    type="button"
                    onClick={openFixtureMatrix}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-100"
                  >
                    Open fixture matrix
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedWindowId) {
                        return
                      }
                      closeWindow(selectedWindowId)
                    }}
                    disabled={!selectedWindowId}
                    className="rounded-full border border-rose-400/25 bg-rose-400/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-rose-100 disabled:opacity-40"
                  >
                    Close selected
                  </button>
                </div>
              </div>

              <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Presets</div>
                <div className="mt-3 space-y-2">
                  {presetOptions.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-debug-preset={preset.id}
                      onClick={() => setDraft(draftFromPreset(preset, draft.fixtureId))}
                      className="w-full rounded-2xl border border-white/8 bg-slate-950/70 px-3 py-3 text-left transition hover:bg-slate-950"
                    >
                      <div className="text-sm font-medium text-slate-100">{preset.label}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {preset.x === undefined && preset.y === undefined
                          ? "auto placement"
                          : `x ${preset.x ?? 0} / y ${preset.y ?? 0}`}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-amber-200/12 bg-amber-300/10 px-3 py-3 text-xs leading-6 text-amber-100/90">
                  Start with shell-only fixtures at 300 x 220 @ 50 percent and 200 x 220 @ 30 percent, then compare the same geometry with TicketView.
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.25rem] border border-white/8 bg-slate-950/65 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Active specimens</div>
                <div className="mt-1 text-sm text-slate-300">Visible measurements come from the live DOM, not hard-coded assumptions.</div>
              </div>
              <button
                type="button"
                onClick={closeAllWindows}
                disabled={specimens.length === 0}
                className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-100 disabled:opacity-40"
              >
                Close all
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {specimens.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                  No specimens open yet.
                </div>
              ) : (
                specimens.map((specimen) => {
                  const measurement = measurements[specimen.windowId]
                  const isSelected = specimen.windowId === selectedWindowId
                  return (
                    <div
                      key={specimen.windowId}
                      className={`rounded-[1.1rem] border px-4 py-4 ${
                        isSelected
                          ? "border-cyan-300/30 bg-cyan-300/10"
                          : "border-white/8 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedWindowId(specimen.windowId)
                              focusWindow(specimen.windowId)
                            }}
                            className="text-left"
                          >
                            <div className="truncate text-sm font-medium text-white">{specimen.title}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {fixtureLabel(specimen.fixtureId)} | requested {specimen.width} x {specimen.height} @ {Math.round(specimen.scale * 100)}%
                            </div>
                          </button>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-slate-500">
                          {specimen.windowId.replace("floating-window-debug-", "#")}
                        </div>
                      </div>
                      {measurement ? (
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Window</div>
                            <div className="mt-1 text-slate-100">{measurement.outerWidth} x {measurement.outerHeight}</div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">Viewport</div>
                            <div className="mt-1 text-slate-100">{measurement.viewportWidth} x {measurement.viewportHeight}</div>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Content</div>
                            <div className="mt-1 text-slate-100">{measurement.contentWidth} x {measurement.contentHeight}</div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">Scroll</div>
                            <div className="mt-1 text-slate-100">{measurement.scrollWidth} x {measurement.scrollHeight}</div>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3 sm:col-span-2">
                            <div className="flex flex-wrap gap-3 text-[11px]">
                              <span className={classForMeasurementFlag(!measurement.overflowX)}>
                                Horizontal overflow: {measurement.overflowX ? "yes" : "no"}
                              </span>
                              <span className={classForMeasurementFlag(!measurement.overflowY)}>
                                Vertical overflow: {measurement.overflowY ? "yes" : "no"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-white/10 px-3 py-3 text-xs text-slate-500">
                          Measurement pending. Focus the window or wait for the DOM probe to refresh.
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
