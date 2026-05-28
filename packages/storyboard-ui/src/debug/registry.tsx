import { panZoomContainerDebugDefinition } from "./panZoomScenarios"
import { screenshotFrameCellDebugDefinition } from "./screenshotFrameCellScenarios"
import { sidePanelLayoutDebugDefinition } from "./sidePanelLayoutScenarios"
import { storyboardEditorDebugDefinition } from "./storyboardEditorScenarios"
import { storyboardGridDebugDefinition } from "./storyboardGridScenarios"
import type {
  StoryboardDebugComponentDefinition,
  StoryboardDebugScenarioDefinition,
} from "./types"

export const storyboardDebugComponents: StoryboardDebugComponentDefinition[] = [
  panZoomContainerDebugDefinition,
  screenshotFrameCellDebugDefinition,
  sidePanelLayoutDebugDefinition,
  storyboardGridDebugDefinition,
  storyboardEditorDebugDefinition,
]

export function findStoryboardDebugComponent(componentSlug: string) {
  return storyboardDebugComponents.find(
    (component) => component.slug === componentSlug,
  )
}

export function findStoryboardDebugScenario(
  componentSlug: string,
  scenarioSlug: string,
): {
  component: StoryboardDebugComponentDefinition
  scenario: StoryboardDebugScenarioDefinition
} | null {
  const component = findStoryboardDebugComponent(componentSlug)
  if (!component) {
    return null
  }
  const scenario = component.scenarios.find(
    (entry) => entry.slug === scenarioSlug,
  )
  if (!scenario) {
    return null
  }
  return { component, scenario }
}

export function storyboardDebugComponentArtifactPath(componentSlug: string) {
  return `/storyboard-debug/${componentSlug}/component.png`
}

export function storyboardDebugScenarioArtifactPath(
  componentSlug: string,
  scenarioSlug: string,
) {
  return `/storyboard-debug/${componentSlug}/${scenarioSlug}.png`
}

export function storyboardDebugScenarioHtmlArtifactPath(
  componentSlug: string,
  scenarioSlug: string,
) {
  return `/storyboard-debug/${componentSlug}/${scenarioSlug}.html`
}
