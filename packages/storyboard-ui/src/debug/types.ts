import type { ReactNode } from "react"

export type StoryboardDebugScenarioDefinition = {
  slug: string
  label: string
  description?: string
  render: () => ReactNode
  renderPreview?: () => ReactNode
}

export type StoryboardDebugComponentDefinition = {
  slug: string
  label: string
  description?: string
  scenarios: StoryboardDebugScenarioDefinition[]
  defaultScenarioSlug: string
}

export type StoryboardDebugRoute =
  | { kind: "index" }
  | { kind: "component"; componentSlug: string }
  | { kind: "scenario"; componentSlug: string; scenarioSlug: string }
  | { kind: "component-preview"; componentSlug: string }
  | { kind: "scenario-preview"; componentSlug: string; scenarioSlug: string }
