import { describe, expect, test } from "bun:test"
import type { WorkbenchNodeTypeDefinition } from "@agent-infrastructure/agent-workbench-protocol"
import {
  filterWorkbenchNodeTypes,
  getNextWorkbenchNodeTypeSelection,
  mergeWorkbenchNodeTypes,
  resolveWorkbenchNodeTypeSelection,
} from "./src/workbench-node-types"

const builtInNodeTypes: WorkbenchNodeTypeDefinition[] = [
  {
    id: "text",
    label: "Text",
    keywords: ["text", "note", "string"],
    sortOrder: 0,
    createRecord({ id, x, y }) {
      return { id, type: "text", text: "", x, y }
    },
    renderNode() {
      return null
    },
  },
  {
    id: "int",
    label: "Int",
    keywords: ["int", "integer", "number"],
    sortOrder: 1,
    createRecord({ id, x, y }) {
      return { id, type: "int", value: 0, x, y }
    },
    renderNode() {
      return null
    },
  },
]

const pluginNodeType: WorkbenchNodeTypeDefinition = {
  id: "agent-chat",
  label: "Agent Chat",
  keywords: ["agent", "chat", "session"],
  sortOrder: 100,
  createRecord({ id, x, y }) {
    return { id, type: "agent-chat", sessionId: null, x, y }
  },
  renderNode() {
    return null
  },
}

describe("workbench node definitions", () => {
  test("plugin node types become searchable when composed into the visible set", () => {
    const visibleTypes = mergeWorkbenchNodeTypes(builtInNodeTypes, [
      pluginNodeType,
    ])
    expect(
      filterWorkbenchNodeTypes(visibleTypes, "agent chat").some(
        (entry) => entry.id === "agent-chat",
      ),
    ).toBe(true)
  })

  test("selection stays on the current visible type when still present", () => {
    const visibleTypes = mergeWorkbenchNodeTypes(builtInNodeTypes, [
      pluginNodeType,
    ])
    expect(resolveWorkbenchNodeTypeSelection(visibleTypes, "text")).toBe("text")
  })

  test("keyboard navigation wraps across visible node types", () => {
    const visibleTypes = mergeWorkbenchNodeTypes(builtInNodeTypes, [
      pluginNodeType,
    ])
    expect(getNextWorkbenchNodeTypeSelection(visibleTypes, "text", 1)).toBe(
      "int",
    )
    expect(getNextWorkbenchNodeTypeSelection(visibleTypes, "text", -1)).toBe(
      "agent-chat",
    )
  })
})
