import type { WorkbenchNodeRecord } from "@agent-infrastructure/agent-workbench-protocol"

export type WorkbenchNodeTypeDefinition = {
  id: WorkbenchNodeRecord["type"]
  label: string
  keywords: string[]
  createRecord(args: { id: string; x: number; y: number }): WorkbenchNodeRecord
}

export const workbenchNodeTypeRegistry: WorkbenchNodeTypeDefinition[] = [
  {
    id: "text",
    label: "Text",
    keywords: ["text", "note", "string"],
    createRecord({ id, x, y }) {
      return {
        id,
        type: "text",
        text: "",
        x,
        y,
      }
    },
  },
  {
    id: "int",
    label: "Int",
    keywords: ["int", "integer", "number"],
    createRecord({ id, x, y }) {
      return {
        id,
        type: "int",
        value: 0,
        x,
        y,
      }
    },
  },
]

export function filterWorkbenchNodeTypes(searchQuery: string) {
  const query = searchQuery.trim().toLowerCase()
  if (!query) {
    return workbenchNodeTypeRegistry
  }
  return workbenchNodeTypeRegistry.filter((entry) => {
    const haystack = `${entry.label} ${entry.id} ${entry.keywords.join(" ")}`
      .trim()
      .toLowerCase()
    return haystack.includes(query)
  })
}
