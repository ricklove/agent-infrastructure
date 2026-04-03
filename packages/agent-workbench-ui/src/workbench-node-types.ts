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

export function resolveWorkbenchNodeTypeSelection(
  availableTypes: WorkbenchNodeTypeDefinition[],
  selectedTypeId: WorkbenchNodeRecord["type"] | null,
) {
  if (availableTypes.length === 0) {
    return null
  }
  if (
    selectedTypeId != null &&
    availableTypes.some((entry) => entry.id === selectedTypeId)
  ) {
    return selectedTypeId
  }
  return availableTypes[0]?.id ?? null
}

export function getNextWorkbenchNodeTypeSelection(
  availableTypes: WorkbenchNodeTypeDefinition[],
  selectedTypeId: WorkbenchNodeRecord["type"] | null,
  direction: "next" | "previous",
) {
  const resolvedSelection = resolveWorkbenchNodeTypeSelection(
    availableTypes,
    selectedTypeId,
  )
  if (resolvedSelection == null) {
    return null
  }
  const currentIndex = availableTypes.findIndex(
    (entry) => entry.id === resolvedSelection,
  )
  if (currentIndex < 0) {
    return resolvedSelection
  }
  const offset = direction === "next" ? 1 : -1
  const nextIndex =
    (currentIndex + offset + availableTypes.length) % availableTypes.length
  return availableTypes[nextIndex]?.id ?? resolvedSelection
}
