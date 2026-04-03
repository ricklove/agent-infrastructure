import { describe, expect, it } from "bun:test"
import {
  filterWorkbenchNodeTypes,
  getNextWorkbenchNodeTypeSelection,
  resolveWorkbenchNodeTypeSelection,
} from "./workbench-node-types"

describe("workbench node type registry", () => {
  it("returns text first by default", () => {
    const visibleTypes = filterWorkbenchNodeTypes("")
    expect(visibleTypes.map((entry) => entry.id)).toEqual(["text", "int"])
    expect(resolveWorkbenchNodeTypeSelection(visibleTypes, null)).toBe("text")
  })

  it("filters by search query", () => {
    expect(filterWorkbenchNodeTypes("num").map((entry) => entry.id)).toEqual([
      "int",
    ])
    expect(filterWorkbenchNodeTypes("string").map((entry) => entry.id)).toEqual(
      ["text"],
    )
  })

  it("keeps the current selection when it is still visible", () => {
    const visibleTypes = filterWorkbenchNodeTypes("")
    expect(resolveWorkbenchNodeTypeSelection(visibleTypes, "int")).toBe("int")
  })

  it("falls back to the first visible type when the current selection is filtered out", () => {
    const visibleTypes = filterWorkbenchNodeTypes("text")
    expect(resolveWorkbenchNodeTypeSelection(visibleTypes, "int")).toBe("text")
  })

  it("cycles selection with arrow navigation", () => {
    const visibleTypes = filterWorkbenchNodeTypes("")
    expect(
      getNextWorkbenchNodeTypeSelection(visibleTypes, "text", "next"),
    ).toBe("int")
    expect(getNextWorkbenchNodeTypeSelection(visibleTypes, "int", "next")).toBe(
      "text",
    )
    expect(
      getNextWorkbenchNodeTypeSelection(visibleTypes, "text", "previous"),
    ).toBe("int")
  })
})
