import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { StoryboardScreen } from "./StoryboardScreen"

function renderForLocation(pathname: string, search = "") {
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { pathname, search },
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    },
  })
  try {
    return renderToStaticMarkup(<StoryboardScreen />)
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    })
  }
}

describe("StoryboardScreen route wiring", () => {
  test("uses the remote-storyboard editor for the primary /storyboard route", () => {
    const html = renderForLocation("/storyboard")

    expect(html).toContain("Remote storyboard")
    expect(html).toContain("Connect a storyboard access server")
    expect(html).not.toContain("Storyboard route not found")
  })

  test("preserves storyboardUrl and frameId query params on /storyboard", () => {
    const html = renderForLocation(
      "/storyboard",
      "?storyboardUrl=http%3A%2F%2F10.0.0.239%3A8898%2Fonboarding&frameId=story-c-01-existing-base-selected",
    )

    expect(html).toContain("http://10.0.0.239:8898/onboarding")
    expect(html).toContain(
      "/health?profileId=storyboard_source_health&amp;storyboardUrl=http%3A%2F%2F10.0.0.239%3A8898%2Fonboarding",
    )
  })
})
