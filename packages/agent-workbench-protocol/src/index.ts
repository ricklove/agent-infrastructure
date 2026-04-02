export type WorkbenchTextNodeRecord = {
  id: string
  type: "text"
  x: number
  y: number
  width?: number
  height?: number
  text: string
}

export type WorkbenchIntNodeRecord = {
  id: string
  type: "int"
  x: number
  y: number
  width?: number
  height?: number
  value: number
}

export type WorkbenchNodeRecord =
  | WorkbenchTextNodeRecord
  | WorkbenchIntNodeRecord

export type WorkbenchEdgeRecord = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceHandleId?: string
  targetHandleId?: string
  text?: string
}

export type WorkbenchHandleRecord = {
  id: string
  nodeId: string
  placement: "top" | "right" | "bottom" | "left"
  text?: string
}

export type WorkbenchViewportRecord = {
  x: number
  y: number
  zoom: number
}

export type WorkbenchDocumentRecord = {
  id: string
  title: string
  nodes: WorkbenchNodeRecord[]
  edges: WorkbenchEdgeRecord[]
  handles: WorkbenchHandleRecord[]
  viewport: WorkbenchViewportRecord
}

export type WorkbenchSummary = {
  id: string
  title: string
  path: string
  updatedAtMs: number
}

export type WorkbenchSnapshotResponse = {
  ok: true
  workbench: WorkbenchDocumentRecord
  availableWorkbenches: WorkbenchSummary[]
}
