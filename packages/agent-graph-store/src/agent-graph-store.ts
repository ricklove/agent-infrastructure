import { observable } from "@legendapp/state";
import type {
  BoardSummary,
  ConflictPayload,
  DocumentSummary,
  GraphDiffSnapshot,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  GraphIntent,
  ValidationPayload,
  WorkspaceSnapshot,
} from "@agent-infrastructure/agent-graph-core";

export type AgentGraphStoreState = {
  connection: {
    status: "idle" | "loading" | "ready" | "error";
    apiRootUrl: string;
    wsRootUrl: string;
    error: string | null;
  };
  workspace: WorkspaceSnapshot | null;
  boards: BoardSummary[];
  documents: DocumentSummary[];
  graph: GraphSnapshot | null;
  diff: GraphDiffSnapshot | null;
  activeLayerId: string | null;
  selection: {
    nodeId: string | null;
    nodeIds: string[];
    edgeId: string | null;
  };
  layout: {
    physicsEnabled: boolean;
    pinnedNodeIds: string[];
    springStrength: number;
    springLength: number;
    repulsionStrength: number;
  };
  inspection: {
    derivedEdgePathIds: string[];
    revealedPortalIds: string[];
  };
  validation: ValidationPayload | null;
  conflict: ConflictPayload | null;
  pendingIntents: string[];
};

export type AgentGraphStore = ReturnType<typeof createAgentGraphStore>;

export function createAgentGraphStore(apiRootUrl: string, wsRootUrl: string) {
  const state$ = observable<AgentGraphStoreState>({
    connection: {
      status: "idle",
      apiRootUrl,
      wsRootUrl,
      error: null,
    },
    workspace: null,
    boards: [],
    documents: [],
    graph: null,
    diff: null,
    activeLayerId: null,
    selection: {
      nodeId: null,
      nodeIds: [],
      edgeId: null,
    },
    layout: {
      physicsEnabled: false,
      pinnedNodeIds: [],
      springStrength: 0.35,
      springLength: 110,
      repulsionStrength: 420,
    },
    inspection: {
      derivedEdgePathIds: [],
      revealedPortalIds: [],
    },
    validation: null,
    conflict: null,
    pendingIntents: [],
  });

  return { state$ };
}

export function findSelectedNode(state: AgentGraphStoreState): GraphNode | null {
  if (!state.graph || !state.selection.nodeId) {
    return null;
  }

  return state.graph.nodes.find((node) => node.id === state.selection.nodeId) ?? null;
}

export function findSelectedEdge(state: AgentGraphStoreState): GraphEdge | null {
  if (!state.graph || !state.selection.edgeId) {
    return null;
  }

  return state.graph.edges.find((edge) => edge.id === state.selection.edgeId) ?? null;
}

export function nextIntentId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function queueIntent(state$: AgentGraphStore["state$"], intent: GraphIntent): void {
  state$.pendingIntents.set([...state$.pendingIntents.get(), "intentId" in intent ? intent.intentId : intent.kind]);
}
