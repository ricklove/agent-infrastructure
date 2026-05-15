import { useState } from "react"

import { PanelLayout, type PanelLayoutPanel } from "../PanelLayout"
import type { StoryboardDebugComponentDefinition } from "./types"

function SidePanelPreview({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-white">
      <div className="w-[85%] rounded border border-white/10 bg-zinc-900 p-4">
        <div className="mb-2 text-sm font-semibold">{title}</div>
        <div className="space-y-2 text-xs text-white/55">
          <div>Multi-panel layout with resizable desktop rails.</div>
          <div>Mobile mode converts panels into navigation below the main board.</div>
        </div>
      </div>
    </div>
  )
}

function DemoCanvas({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#546072] p-6 text-white">
      <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/70">
        Main canvas
      </div>
      <div className="mt-3 text-xl font-semibold">{title}</div>
      <div className="mt-4 grid flex-1 grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="flex aspect-square items-center justify-center border border-zinc-500/70 bg-zinc-800 text-sm text-white/80"
            key={index}
          >
            Frame {index + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoPanel({
  heading,
  copy,
  dense,
  sectionLabel = "Inspector",
}: {
  heading: string
  copy: string
  dense?: boolean
  sectionLabel?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-zinc-950 p-4 text-white">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
          {sectionLabel}
        </div>
        <div className="mt-2 text-sm text-white/55">{copy}</div>
      </div>
      <label className="block">
        <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
          Title
        </div>
        <input
          className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
          defaultValue={heading}
        />
      </label>
      <label className="block">
        <div className="mb-2 text-xs uppercase tracking-[0.14em] text-white/45">
          Notes
        </div>
        <textarea
          className={`w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none ${dense ? "min-h-[240px]" : "min-h-[160px]"}`}
          defaultValue="Use this surface to test panel resize behavior, text density, and min/max widths."
        />
      </label>
      {dense ? (
        <div className="grid grid-cols-2 gap-3 text-xs text-white/60">
          <div className="rounded border border-white/10 bg-white/5 p-3">Transition label</div>
          <div className="rounded border border-white/10 bg-white/5 p-3">Target frame</div>
          <div className="rounded border border-white/10 bg-white/5 p-3">Description</div>
          <div className="rounded border border-white/10 bg-white/5 p-3">Human notes</div>
        </div>
      ) : null}
      <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/55">
        Panel content should stay readable while the main canvas retains most of the screen.
      </div>
    </div>
  )
}

function PanelLayoutScenario({
  title,
  panels,
  storageKey,
  mobileMode,
  forceMobile,
  captureRoot = true,
}: {
  title: string
  panels: PanelLayoutPanel[]
  storageKey: string
  mobileMode?: "nav" | "stack"
  forceMobile?: boolean
  captureRoot?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-1" data-storyboard-debug-capture-root={captureRoot ? "true" : undefined}>
      <PanelLayout
        className="bg-zinc-950"
        contentClassName="p-4"
        forceMobile={forceMobile}
        mobileMode={mobileMode}
        panelClassName="bg-zinc-950"
        panels={panels}
        storageKeyPrefix={storageKey}
      >
        <DemoCanvas title={title} />
      </PanelLayout>
    </div>
  )
}

function buildPanel(
  id: string,
  heading: string,
  copy: string,
  options?: {
    dense?: boolean
    sectionLabel?: string
    side?: "left" | "right"
    initialWidth?: number
    minWidth?: number
    maxWidth?: number
  },
): PanelLayoutPanel {
  return {
    id,
    title: heading,
    side: options?.side,
    initialWidth: options?.initialWidth,
    minWidth: options?.minWidth,
    maxWidth: options?.maxWidth,
    content: (
      <DemoPanel
        copy={copy}
        dense={options?.dense}
        heading={heading}
        sectionLabel={options?.sectionLabel}
      />
    ),
  }
}

function MobilePanelNavigationScenario() {
  const [mode, setMode] = useState<"mobile" | "normal">("mobile")
  const panels = [
    buildPanel(
      "navigator",
      "Story navigator",
      "Quickly switch between root stories and branches.",
      {
        side: "left",
        initialWidth: 240,
        minWidth: 220,
        maxWidth: 320,
        sectionLabel: "Navigator",
      },
    ),
    buildPanel(
      "project",
      "Project outline",
      "A second left rail can hold project sections, documents, or storyboard collections.",
      {
        side: "left",
        initialWidth: 220,
        minWidth: 180,
        maxWidth: 300,
        sectionLabel: "Project",
      },
    ),
    buildPanel(
      "inspector",
      "Frame inspector",
      "Edit title, description, and transition details for the selected frame.",
      { dense: true, initialWidth: 360, minWidth: 300, maxWidth: 620, sectionLabel: "Inspector" },
    ),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-black p-6" data-storyboard-debug-capture-root="true">
      <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/55">
        <button
          className={`rounded border px-3 py-2 ${
            mode === "mobile"
              ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
              : "border-white/10 bg-white/5 text-white/55"
          }`}
          onClick={() => setMode("mobile")}
          type="button"
        >
          Mobile viewport
        </button>
        <button
          className={`rounded border px-3 py-2 ${
            mode === "normal"
              ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
              : "border-white/10 bg-white/5 text-white/55"
          }`}
          onClick={() => setMode("normal")}
          type="button"
        >
          Normal layout
        </button>
      </div>

      {mode === "mobile" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex h-[667px] w-[375px] overflow-hidden border border-white/10 bg-zinc-950">
            <PanelLayoutScenario
              captureRoot={false}
              forceMobile
              mobileMode="nav"
              panels={panels}
              storageKey="storyboard.debug.panel.mobileNav"
              title="Mobile storyboard workspace"
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <PanelLayoutScenario
            panels={panels}
            storageKey="storyboard.debug.panel.mobileNav.normal"
            title="Mobile storyboard workspace"
          />
        </div>
      )}
    </div>
  )
}

export const sidePanelLayoutDebugDefinition: StoryboardDebugComponentDefinition = {
  slug: "panelLayout",
  label: "panelLayout",
  description:
    "Reusable multi-panel layout with resizable desktop rails and mobile panel navigation.",
  defaultScenarioSlug: "default-inspector-width",
  scenarios: [
    {
      slug: "default-inspector-width",
      label: "default-inspector-width",
      description: "Balanced default right-side inspector width.",
      render: () => (
        <PanelLayoutScenario
          panels={[
            buildPanel(
              "inspector",
              "Storyboard inspector",
              "Default inspector width for storyboard editing.",
              { initialWidth: 360 },
            ),
          ]}
          storageKey="storyboard.debug.sidePanel.default"
          title="Storyboard frame board"
        />
      ),
      renderPreview: () => <SidePanelPreview title="Default inspector width" />,
    },
    {
      slug: "three-panel-editor",
      label: "three-panel-editor",
      description: "Left rail, main board, and right inspector.",
      render: () => (
        <PanelLayoutScenario
          panels={[
            buildPanel(
              "navigator",
              "Story navigator",
              "Use this narrower rail for story and frame outline navigation.",
              {
                side: "left",
                initialWidth: 260,
                minWidth: 220,
                maxWidth: 340,
                sectionLabel: "Navigator",
              },
            ),
            buildPanel(
              "inspector",
              "Frame inspector",
              "Primary editing panel for the selected storyboard frame.",
              { dense: true, initialWidth: 380, minWidth: 300, maxWidth: 760 },
            ),
          ]}
          storageKey="storyboard.debug.panel.threePanel"
          title="Three-panel storyboard workspace"
        />
      ),
      renderPreview: () => <SidePanelPreview title="Three panel editor" />,
    },
    {
      slug: "four-panel-workspace",
      label: "four-panel-workspace",
      description: "Two left rails, main board, and one right inspector.",
      render: () => (
        <PanelLayoutScenario
          panels={[
            buildPanel(
              "navigator",
              "Story navigator",
              "Quickly switch between root stories and branches.",
              {
                side: "left",
                initialWidth: 240,
                minWidth: 220,
                maxWidth: 320,
                sectionLabel: "Navigator",
              },
            ),
            buildPanel(
              "project",
              "Project outline",
              "A second left rail can hold project sections, documents, or storyboard collections.",
              {
                side: "left",
                initialWidth: 220,
                minWidth: 180,
                maxWidth: 300,
                sectionLabel: "Project",
              },
            ),
            buildPanel(
              "inspector",
              "Frame inspector",
              "Edit title, description, and transition details for the selected frame.",
              { dense: true, initialWidth: 360, minWidth: 300, maxWidth: 620 },
            ),
          ]}
          storageKey="storyboard.debug.panel.fourPanel"
          title="Four-panel storyboard workspace"
        />
      ),
      renderPreview: () => <SidePanelPreview title="Four panel workspace" />,
    },
    {
      slug: "mobile-panel-navigation",
      label: "mobile-panel-navigation",
      description: "Mobile mode where panels become switchable navigation below the board.",
      render: () => <MobilePanelNavigationScenario />,
      renderPreview: () => <SidePanelPreview title="Mobile panel navigation" />,
    },
  ],
}
