import {
  StoryboardDebugComponentScreen,
  StoryboardDebugIndexScreen,
  StoryboardDebugNotFoundScreen,
  StoryboardDebugPreviewScreen,
  StoryboardDebugScenarioScreen,
} from "./debug/DebugCatalog"
import { RemoteStoryboardEditorScreen, readStoryboardEditorQuery } from "./debug/storyboardEditorScenarios"
import { parseStoryboardDebugRoute } from "./debug/routes"

export function StoryboardScreen() {
  const pathname =
    typeof window === "undefined" ? "/storyboard" : window.location.pathname
  const debugRoute = parseStoryboardDebugRoute(pathname)
  const query =
    typeof window === "undefined"
      ? { storyboardUrl: "", frameId: "" }
      : readStoryboardEditorQuery(window.location.search)

  if (pathname.replace(/\/+$/, "") === "/storyboard" && (query.storyboardUrl || query.frameId)) {
    return <RemoteStoryboardEditorScreen />
  }

  if (debugRoute?.kind === "index") {
    return <StoryboardDebugIndexScreen />
  }

  if (debugRoute?.kind === "component") {
    return (
      <StoryboardDebugComponentScreen
        componentSlug={debugRoute.componentSlug}
      />
    )
  }

  if (debugRoute?.kind === "scenario") {
    return (
      <StoryboardDebugScenarioScreen
        componentSlug={debugRoute.componentSlug}
        scenarioSlug={debugRoute.scenarioSlug}
      />
    )
  }

  if (debugRoute?.kind === "component-preview") {
    return (
      <StoryboardDebugPreviewScreen
        componentSlug={debugRoute.componentSlug}
      />
    )
  }

  if (debugRoute?.kind === "scenario-preview") {
    return (
      <StoryboardDebugPreviewScreen
        componentSlug={debugRoute.componentSlug}
        scenarioSlug={debugRoute.scenarioSlug}
      />
    )
  }

  return <StoryboardDebugNotFoundScreen label="route" />
}
