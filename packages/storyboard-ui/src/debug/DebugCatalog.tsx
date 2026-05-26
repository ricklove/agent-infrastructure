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

export function StoryboardDebugIndexScreen() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white">
      {thinHeader([{ label: "components" }])}
      <div className="grid min-h-0 flex-1 auto-rows-max gap-4 overflow-auto p-4 md:grid-cols-2 xl:grid-cols-3">
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
      <div className="grid min-h-0 flex-1 auto-rows-max gap-4 overflow-auto p-4 md:grid-cols-2 xl:grid-cols-3">
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
