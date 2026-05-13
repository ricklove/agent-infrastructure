import type { StoryboardDebugRoute } from "./types"

export function parseStoryboardDebugRoute(pathname: string): StoryboardDebugRoute | null {
  const trimmedPath = pathname.replace(/\/+$/, "") || "/"
  if (trimmedPath === "/storyboard/debug") {
    return { kind: "index" }
  }

  const prefixes = [
    "/storyboard/debug/components/",
    "/storyboard/debug/",
  ]

  for (const prefix of prefixes) {
    if (!trimmedPath.startsWith(prefix)) {
      continue
    }
    const remainder = trimmedPath.slice(prefix.length)
    if (!remainder) {
      return { kind: "index" }
    }
    const segments = remainder.split("/").filter(Boolean)
    if (segments.length === 2 && segments[1] === "_preview") {
      return { kind: "component-preview", componentSlug: segments[0] ?? "" }
    }
    if (segments.length === 3 && segments[2] === "_preview") {
      return {
        kind: "scenario-preview",
        componentSlug: segments[0] ?? "",
        scenarioSlug: segments[1] ?? "",
      }
    }
    if (segments.length === 1) {
      return { kind: "component", componentSlug: segments[0] ?? "" }
    }
    return {
      kind: "scenario",
      componentSlug: segments[0] ?? "",
      scenarioSlug: segments[1] ?? "",
    }
  }

  return null
}
