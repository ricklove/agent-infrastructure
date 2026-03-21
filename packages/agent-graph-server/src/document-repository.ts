import {
  type SourceWorkspace,
  type BoardFile,
  type WorkspaceState,
} from "@agent-infrastructure/agent-graph-core";
import {
  boardFileWithWorkspaceState,
  loadAgentishBoard,
} from "./load-agentish-workspace.js";

export type DocumentRepository = {
  getBoardPath(): string;
  getBoardFile(): BoardFile;
  setBoardFile(nextBoardFile: BoardFile): void;
  getSourceWorkspace(): SourceWorkspace;
  setSourceWorkspace(nextWorkspace: SourceWorkspace): void;
  getWorkspaceState(): WorkspaceState;
  setWorkspaceState(nextState: WorkspaceState): void;
  getPreviousSourceWorkspace(): SourceWorkspace;
  setPreviousSourceWorkspace(nextWorkspace: SourceWorkspace): void;
};

export async function createDocumentRepository(): Promise<DocumentRepository> {
  const loadedBoard = await loadAgentishBoard();
  let boardPath = loadedBoard.boardPath;
  let boardFile = loadedBoard.boardFile;
  let sourceWorkspace = loadedBoard.sourceWorkspace;
  let previousSourceWorkspace = structuredClone(sourceWorkspace);
  let workspaceState = loadedBoard.workspaceState;

  return {
    getBoardPath() {
      return boardPath;
    },
    getBoardFile() {
      return boardFile;
    },
    setBoardFile(nextBoardFile) {
      boardFile = nextBoardFile;
    },
    getSourceWorkspace() {
      return sourceWorkspace;
    },
    setSourceWorkspace(nextWorkspace) {
      sourceWorkspace = nextWorkspace;
    },
    getWorkspaceState() {
      return workspaceState;
    },
    setWorkspaceState(nextState) {
      workspaceState = nextState;
      boardFile = boardFileWithWorkspaceState(boardFile, nextState);
    },
    getPreviousSourceWorkspace() {
      return previousSourceWorkspace;
    },
    setPreviousSourceWorkspace(nextWorkspace) {
      previousSourceWorkspace = nextWorkspace;
    },
  };
}
