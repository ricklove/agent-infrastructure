import type {
  GraphDiffSnapshot,
  GraphSnapshot,
  WorkspaceSnapshot,
} from "@agent-infrastructure/agent-graph-core";

export type GetWorkspaceResponse = {
  workspace: WorkspaceSnapshot;
  graph: GraphSnapshot;
  diff: GraphDiffSnapshot | null;
};
