import {
  type SourceWorkspace,
  type WorkspaceState,
} from "@agent-infrastructure/agent-graph-core";
import {
  createWorkspaceStateForSourceWorkspace,
  loadAgentishSourceWorkspace,
} from "./load-agentish-workspace.js";

export type DocumentRepository = {
  getSourceWorkspace(): SourceWorkspace;
  setSourceWorkspace(nextWorkspace: SourceWorkspace): void;
  getWorkspaceState(): WorkspaceState;
  setWorkspaceState(nextState: WorkspaceState): void;
  getPreviousSourceWorkspace(): SourceWorkspace;
  setPreviousSourceWorkspace(nextWorkspace: SourceWorkspace): void;
};

export async function createDocumentRepository(): Promise<DocumentRepository> {
  let sourceWorkspace = await loadAgentishSourceWorkspace();
  let previousSourceWorkspace = structuredClone(sourceWorkspace);
  let workspaceState = createWorkspaceStateForSourceWorkspace(sourceWorkspace);

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
