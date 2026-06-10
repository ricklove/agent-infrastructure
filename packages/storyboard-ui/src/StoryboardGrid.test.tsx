import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { StoryboardGrid, type StoryboardGridSequence } from "./StoryboardGrid"

function sequenceSection(html: string, sequenceId: string) {
  const marker = `data-storyboard-sequence="${sequenceId}"`
  const start = html.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = html.indexOf("data-storyboard-sequence=", start + marker.length)
  return next === -1 ? html.slice(start) : html.slice(start, next)
}

describe("StoryboardGrid branch transition layout", () => {
  test("renders branch transition labels in the branch row beside their target frame", () => {
    const sequences: StoryboardGridSequence[] = [
      {
        id: "main-story",
        title: "Main story",
        frames: [
          { id: "source-frame", title: "Source", nextLabel: "Primary path" },
          { id: "primary-target", title: "Primary target" },
        ],
      },
      {
        id: "branch-story",
        title: "Branch: Alternate path",
        sourceFrameId: "source-frame",
        startColumn: 1,
        startLabel: "Alternate path",
        frames: [{ id: "branch-target", title: "Branch target" }],
      },
    ]

    const html = renderToStaticMarkup(<StoryboardGrid sequences={sequences} />)
    const mainRow = sequenceSection(html, "main-story")
    const branchRow = sequenceSection(html, "branch-story")

    expect(mainRow).toContain('data-storyboard-next="source-frame"')
    expect(mainRow).not.toContain('data-storyboard-transition="Alternate path"')
    expect(branchRow).toContain('data-storyboard-transition="Alternate path"')
    expect(branchRow.indexOf('data-storyboard-transition="Alternate path"')).toBeLessThan(
      branchRow.indexOf('data-storyboard-frame-shell="branch-target"'),
    )
  })
})
