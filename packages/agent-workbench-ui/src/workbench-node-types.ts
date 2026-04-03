import type {
  WorkbenchNodeRecord,
  WorkbenchNodeTypeDefinition,
} from "@agent-infrastructure/agent-workbench-protocol"

export function sortWorkbenchNodeTypes(entries: WorkbenchNodeTypeDefinition[]) {
  return [...entries].sort((left, right) => {
    const leftOrder = left.sortOrder ?? 100
    const rightOrder = right.sortOrder ?? 100
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.label.localeCompare(right.label)
  })
}

export function mergeWorkbenchNodeTypes(
  ...groups: WorkbenchNodeTypeDefinition[][]
) {
  const byId = new Map<
    WorkbenchNodeRecord["type"],
    WorkbenchNodeTypeDefinition
  >()
  for (const group of groups) {
    for (const definition of group) {
      byId.set(definition.id, definition)
    }
  }
  return sortWorkbenchNodeTypes([...byId.values()])
}

export function getWorkbenchNodeType(
  entries: WorkbenchNodeTypeDefinition[],
  typeId: WorkbenchNodeRecord["type"],
) {
  return entries.find((entry) => entry.id === typeId) ?? null
}

export function filterWorkbenchNodeTypes(
  entries: WorkbenchNodeTypeDefinition[],
  searchQuery: string,
) {
  const query = searchQuery.trim().toLowerCase()
  if (!query) {
    return entries
  }
  return entries.filter((entry) => {
    const haystack = `${entry.label} ${entry.id} ${entry.keywords.join(" ")}`
      .trim()
      .toLowerCase()
    return haystack.includes(query)
  })
}

export function resolveWorkbenchNodeTypeSelection(
  visibleTypes: WorkbenchNodeTypeDefinition[],
  selectedTypeId: WorkbenchNodeRecord["type"] | null,
) {
  if (visibleTypes.length === 0) {
    return null
  }
  if (selectedTypeId) {
    const matching = visibleTypes.find((entry) => entry.id === selectedTypeId)
    if (matching) {
      return matching.id
    }
  }
  return visibleTypes[0]?.id ?? null
}

export function getNextWorkbenchNodeTypeSelection(
  visibleTypes: WorkbenchNodeTypeDefinition[],
  selectedTypeId: WorkbenchNodeRecord["type"] | null,
  offset: 1 | -1,
) {
  const resolvedSelection = resolveWorkbenchNodeTypeSelection(
    visibleTypes,
    selectedTypeId,
  )
  if (!resolvedSelection) {
    return null
  }
  const currentIndex = visibleTypes.findIndex(
    (entry) => entry.id === resolvedSelection,
  )
  if (currentIndex < 0) {
    return visibleTypes[0]?.id ?? null
  }
  const nextIndex =
    (currentIndex + offset + visibleTypes.length) % visibleTypes.length
  return visibleTypes[nextIndex]?.id ?? null
}
