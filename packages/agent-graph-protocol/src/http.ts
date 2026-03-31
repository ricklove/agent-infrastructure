import type {
  BoardSummary,
  DocumentSummary,
  GraphDiffSnapshot,
  GraphSnapshot,
  WorkspaceSnapshot,
} from "@agent-infrastructure/agent-graph-core"

export type GetWorkspaceResponse = {
  workspace: WorkspaceSnapshot
  graph: GraphSnapshot
  diff: GraphDiffSnapshot | null
}

export type GetBoardsResponse = {
  boards: BoardSummary[]
  currentBoardPath: string
}

export type GetDocumentsResponse = {
  documents: DocumentSummary[]
}
