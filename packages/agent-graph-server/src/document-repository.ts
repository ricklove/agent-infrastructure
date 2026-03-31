import { basename, relative } from "node:path"
import type {
  BoardFile,
  BoardSummary,
  DocumentSummary,
  SourceWorkspace,
  WorkspaceState,
} from "@agent-infrastructure/agent-graph-core"
import {
  boardFileWithWorkspaceState,
  loadAgentishBoard,
} from "./load-agentish-workspace.js"

const WORKSPACE_ROOT = "/home/ec2-user/workspace"

export type DocumentRepository = {
  getBoardPath(): string
  getBoardFile(): BoardFile
  setBoardFile(nextBoardFile: BoardFile): void
  getBoardSummary(): BoardSummary
  listBoards(): Promise<BoardSummary[]>
  listDocuments(): Promise<DocumentSummary[]>
  openBoard(boardPath: string): Promise<void>
  getSourceWorkspace(): SourceWorkspace
  setSourceWorkspace(nextWorkspace: SourceWorkspace): void
  getWorkspaceState(): WorkspaceState
  setWorkspaceState(nextState: WorkspaceState): void
  getPreviousSourceWorkspace(): SourceWorkspace
  setPreviousSourceWorkspace(nextWorkspace: SourceWorkspace): void
}

function toBoardSummary(boardPath: string, boardFile: BoardFile): BoardSummary {
  return {
    path: relative(WORKSPACE_ROOT, boardPath) || basename(boardPath),
    id: boardFile.id,
    label: boardFile.label,
  }
}

export async function createDocumentRepository(): Promise<DocumentRepository> {
  const loadedBoard = await loadAgentishBoard()
  let boardPath = loadedBoard.boardPath
  let boardFile = loadedBoard.boardFile
  let sourceWorkspace = loadedBoard.sourceWorkspace
  let previousSourceWorkspace = structuredClone(sourceWorkspace)
  let workspaceState = loadedBoard.workspaceState

  return {
    getBoardPath() {
      return boardPath
    },
    getBoardFile() {
      return boardFile
    },
    setBoardFile(nextBoardFile) {
      boardFile = nextBoardFile
    },
    getBoardSummary() {
      return toBoardSummary(boardPath, boardFile)
    },
    async listBoards() {
      const boardPaths = await Array.fromAsync(
        new Bun.Glob("**/*.board.json").scan({
          cwd: WORKSPACE_ROOT,
          absolute: true,
        }),
      )
      const boards = await Promise.all(
        boardPaths.map(async (nextBoardPath) => {
          const loaded = await loadAgentishBoard(nextBoardPath)
          return toBoardSummary(nextBoardPath, loaded.boardFile)
        }),
      )
      return boards.sort((left, right) => left.label.localeCompare(right.label))
    },
    async listDocuments() {
      const documentPaths = await Array.fromAsync(
        new Bun.Glob("**/*.agentish.ts").scan({
          cwd: WORKSPACE_ROOT,
          absolute: true,
        }),
      )
      return documentPaths
        .map((documentPath) => ({
          path:
            relative(WORKSPACE_ROOT, documentPath) || basename(documentPath),
          label: basename(documentPath),
        }))
        .sort((left, right) => left.path.localeCompare(right.path))
    },
    async openBoard(nextBoardPath) {
      const loaded = await loadAgentishBoard(nextBoardPath)
      boardPath = loaded.boardPath
      boardFile = loaded.boardFile
      sourceWorkspace = loaded.sourceWorkspace
      previousSourceWorkspace = structuredClone(sourceWorkspace)
      workspaceState = loaded.workspaceState
    },
    getSourceWorkspace() {
      return sourceWorkspace
    },
    setSourceWorkspace(nextWorkspace) {
      sourceWorkspace = nextWorkspace
    },
    getWorkspaceState() {
      return workspaceState
    },
    setWorkspaceState(nextState) {
      workspaceState = nextState
      boardFile = boardFileWithWorkspaceState(boardFile, nextState)
    },
    getPreviousSourceWorkspace() {
      return previousSourceWorkspace
    },
    setPreviousSourceWorkspace(nextWorkspace) {
      previousSourceWorkspace = nextWorkspace
    },
  }
}
