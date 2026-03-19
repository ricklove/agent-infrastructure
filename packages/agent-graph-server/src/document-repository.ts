import {
  createInitialWorkspaceState,
  createSampleSourceWorkspace,
  type SourceWorkspace,
  type WorkspaceState,
} from "@agent-infrastructure/agent-graph-core";

export type DocumentRepository = {
  getSourceWorkspace(): SourceWorkspace;
  setSourceWorkspace(nextWorkspace: SourceWorkspace): void;
  getWorkspaceState(): WorkspaceState;
  setWorkspaceState(nextState: WorkspaceState): void;
  getPreviousSourceWorkspace(): SourceWorkspace;
  setPreviousSourceWorkspace(nextWorkspace: SourceWorkspace): void;
};

export function createDocumentRepository(): DocumentRepository {
  let sourceWorkspace = createSampleSourceWorkspace();
  let previousSourceWorkspace = structuredClone(sourceWorkspace);
  let workspaceState = createInitialWorkspaceState();

  return {
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
    },
    getPreviousSourceWorkspace() {
      return previousSourceWorkspace;
    },
    setPreviousSourceWorkspace(nextWorkspace) {
      previousSourceWorkspace = nextWorkspace;
    },
  };
}
