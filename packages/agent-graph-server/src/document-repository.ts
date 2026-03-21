import {
  type SourceWorkspace,
  type BoardFile,
  type WorkspaceState,
} from "@agent-infrastructure/agent-graph-core";
import {
  boardFileWithWorkspaceState,
  DEFAULT_AGENT_GRAPH_BOARD_PATH,
  loadAgentishBoard,
} from "./load-agentish-workspace.js";
import type { BoardSummary } from "@agent-infrastructure/agent-graph-core";
import { basename, dirname, relative } from "node:path";

export type DocumentRepository = {
  getBoardPath(): string;
  getBoardFile(): BoardFile;
  setBoardFile(nextBoardFile: BoardFile): void;
  getBoardSummary(): BoardSummary;
  listBoards(): Promise<BoardSummary[]>;
  openBoard(boardPath: string): Promise<void>;
  getSourceWorkspace(): SourceWorkspace;
  setSourceWorkspace(nextWorkspace: SourceWorkspace): void;
  getWorkspaceState(): WorkspaceState;
  setWorkspaceState(nextState: WorkspaceState): void;
  getPreviousSourceWorkspace(): SourceWorkspace;
  setPreviousSourceWorkspace(nextWorkspace: SourceWorkspace): void;
};

function toBoardSummary(boardPath: string, boardFile: BoardFile): BoardSummary {
  const baseDir = dirname(DEFAULT_AGENT_GRAPH_BOARD_PATH);
  return {
    path: relative(baseDir, boardPath) || basename(boardPath),
    id: boardFile.id,
    label: boardFile.label,
  };
}

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
    getBoardSummary() {
      return toBoardSummary(boardPath, boardFile);
    },
    async listBoards() {
      const boardRoot = dirname(DEFAULT_AGENT_GRAPH_BOARD_PATH);
      const boardPaths = await Array.fromAsync(
        new Bun.Glob("**/*.board.json").scan({
          cwd: boardRoot,
          absolute: true,
        }),
      );
      const boards = await Promise.all(
        boardPaths.map(async (nextBoardPath) => {
          const loaded = await loadAgentishBoard(nextBoardPath);
          return toBoardSummary(nextBoardPath, loaded.boardFile);
        }),
      );
      return boards.sort((left, right) => left.label.localeCompare(right.label));
    },
    async openBoard(nextBoardPath) {
      const loaded = await loadAgentishBoard(nextBoardPath);
      boardPath = loaded.boardPath;
      boardFile = loaded.boardFile;
      sourceWorkspace = loaded.sourceWorkspace;
      previousSourceWorkspace = structuredClone(sourceWorkspace);
      workspaceState = loaded.workspaceState;
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
