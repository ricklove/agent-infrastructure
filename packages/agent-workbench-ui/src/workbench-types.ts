import type {
  WorkbenchNodeRecord,
  WorkbenchNodeTypeDefinition,
} from "@agent-infrastructure/agent-workbench-protocol"

export type WorkbenchFlowNodeData = {
  record: WorkbenchNodeRecord
  definition: WorkbenchNodeTypeDefinition
  onRecordChange(nodeId: string, nextRecord: WorkbenchNodeRecord): void
  onResize(nodeId: string, width: number, height: number): void
}
