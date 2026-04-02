export type WorkbenchUiNodeType = "text" | "int"

export type WorkbenchBaseNodeData = {
  nodeType: WorkbenchUiNodeType
  onResize(nodeId: string, width: number, height: number): void
}

export type WorkbenchTextNodeData = WorkbenchBaseNodeData & {
  nodeType: "text"
  text: string
  onTextChange(nodeId: string, text: string): void
}

export type WorkbenchIntNodeData = WorkbenchBaseNodeData & {
  nodeType: "int"
  value: number
  onValueChange(nodeId: string, value: number): void
}

export type WorkbenchFlowNodeData = WorkbenchTextNodeData | WorkbenchIntNodeData
