import {
  findStoryboardDebugComponent,
  findStoryboardDebugScenario,
  storyboardDebugComponentArtifactPath,
  storyboardDebugComponents,
  storyboardDebugScenarioArtifactPath,
} from "./registry"
import { DebugImageCard } from "./DebugCards"
import type { ReactNode } from "react"
import type { StoryboardDebugComponentDefinition } from "./types"

function thinHeader(trail: Array<{ label: string; href?: string }>) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1 text-[11px] text-white/70">
      {trail.map((segment, index) => (
        <span className="contents" key={`${segment.label}-${index}`}>
          {index > 0 ? <span className="text-white/30">&gt;</span> : null}
          {segment.href ? (
            <a
              className="text-white/70 hover:text-cyan-100"
              href={segment.href}
            >
              {segment.label}
            </a>
          ) : (
            <span className={index === trail.length - 1 ? "text-cyan-200/90" : ""}>
              {segment.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function previewFrame(content: ReactNode) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-black p-6">
      <div
        className="overflow-hidden border border-white/10 bg-zinc-950"
        data-storyboard-preview-root="true"
        style={{
          width: "min(80vmin, 640px)",
          height: "min(80vmin, 640px)",
        }}
      >
        {content}
      </div>
    </div>
  )
}

function componentPreview(component: StoryboardDebugComponentDefinition) {
  const primaryScenario =
    component.scenarios.find(
      (scenario) => scenario.slug === component.defaultScenarioSlug,
    ) ?? component.scenarios[0]
  return primaryScenario?.renderPreview?.() ?? (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-[11px] text-white/45">
      No preview
    </div>
  )
}

function scenarioPreview(componentSlug: string, scenarioSlug: string) {
  const resolved = findStoryboardDebugScenario(componentSlug, scenarioSlug)
  if (!resolved) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-[11px] text-white/45">
        Missing scenario
      </div>
    )
  }
  return resolved.scenario.renderPreview?.() ?? (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-[11px] text-white/45">
      No preview
    </div>
  )
}

function runTargetHealthHref() {
  if (typeof window === "undefined") {
    return "/storyboard/debug/storyboardRunTargetHealth/"
  }

  const storyboardUrl = new URLSearchParams(window.location.search).get("storyboardUrl")
  if (!storyboardUrl) {
    return "/storyboard/debug/storyboardRunTargetHealth/"
  }

  return `/storyboard/debug/storyboardRunTargetHealth/?storyboardUrl=${encodeURIComponent(storyboardUrl)}`
}

function runTargetHealthPreview() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-cyan-950/60 p-3 text-center">
      <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/70">run target</div>
      <div className="mt-2 text-xs font-semibold text-white">Health</div>
      <div className="mt-1 text-[10px] text-cyan-100/65">config + checks</div>
    </div>
  )
}

export function StoryboardDebugIndexScreen() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      {thinHeader([{ label: "components" }])}
      <div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-4 overflow-auto p-4">
        <DebugImageCard
          fallback={runTargetHealthPreview()}
          href={runTargetHealthHref()}
          key="storyboardRunTargetHealth"
          subtitle="Standalone provider-named run target config and health check tool. Accepts storyboardUrl."
          title="Run Target Health"
        />
        {storyboardDebugComponents.map((component) => (
          <DebugImageCard
            fallback={componentPreview(component)}
            href={`/storyboard/debug/${component.slug}/`}
            imageSrc={storyboardDebugComponentArtifactPath(component.slug)}
            key={component.slug}
            subtitle={component.description}
            title={component.label}
          />
        ))}
      </div>
    </div>
  )
}

export function StoryboardDebugComponentScreen({
  componentSlug,
}: {
  componentSlug: string
}) {
  const component = findStoryboardDebugComponent(componentSlug)
  if (!component) {
    return <StoryboardDebugNotFoundScreen label={`component ${componentSlug}`} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      {thinHeader([
        { label: "components", href: "/storyboard/debug/" },
        { label: component.slug },
      ])}
      <div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-4 overflow-auto p-4">
        {component.scenarios.map((scenario) => (
          <DebugImageCard
            fallback={scenarioPreview(component.slug, scenario.slug)}
            href={`/storyboard/debug/${component.slug}/${scenario.slug}/`}
            imageSrc={storyboardDebugScenarioArtifactPath(
              component.slug,
              scenario.slug,
            )}
            key={scenario.slug}
            subtitle={scenario.description ?? component.description}
            title={scenario.label}
          />
        ))}
      </div>
    </div>
  )
}

export function StoryboardDebugScenarioScreen({
  componentSlug,
  scenarioSlug,
}: {
  componentSlug: string
  scenarioSlug: string
}) {
  const resolved = findStoryboardDebugScenario(componentSlug, scenarioSlug)
  if (!resolved) {
    return (
      <StoryboardDebugNotFoundScreen
        label={`scenario ${componentSlug}/${scenarioSlug}`}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      {thinHeader([
        { label: "components", href: "/storyboard/debug/" },
        { label: componentSlug, href: `/storyboard/debug/${componentSlug}/` },
        { label: scenarioSlug },
      ])}
      <div className="min-h-0 flex-1">{resolved.scenario.render()}</div>
    </div>
  )
}

export function StoryboardDebugPreviewScreen({
  componentSlug,
  scenarioSlug,
}: {
  componentSlug: string
  scenarioSlug?: string
}) {
  if (scenarioSlug) {
    const resolved = findStoryboardDebugScenario(componentSlug, scenarioSlug)
    if (!resolved) {
      return (
        <StoryboardDebugNotFoundScreen
          label={`scenario preview ${componentSlug}/${scenarioSlug}`}
        />
      )
    }
    return previewFrame(
      resolved.scenario.renderPreview?.() ?? resolved.scenario.render(),
    )
  }

  const component = findStoryboardDebugComponent(componentSlug)
  if (!component) {
    return (
      <StoryboardDebugNotFoundScreen
        label={`component preview ${componentSlug}`}
      />
    )
  }
  return previewFrame(componentPreview(component))
}

export function StoryboardDebugNotFoundScreen({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-black text-white">
      <div className="text-sm text-white/65">Missing debug {label}.</div>
    </div>
  )
}
