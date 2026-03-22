export type SourceNodeKind = string;

export type SourceEdgeKind = string;

export type LayerKind =
  | "overview"
  | "semantic"
  | "diff-old"
  | "diff-new"
  | "diff-changed";

export type GraphNodeKind = "semantic-node" | "hidden-context-portal";
export type GraphEdgeKind = "direct" | "derived" | "hidden-context";

export type HiddenContextPreview = {
  sourceId: string;
  label: string;
  sourcePath?: string;
};

export type SourceNode = {
  id: string;
  documentId: string;
  label: string;
  kind: SourceNodeKind;
  summary: string;
  sourcePath?: string;
};

export type SourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: SourceEdgeKind;
  label: string;
};

export type SourceDocument = {
  id: string;
  label: string;
  path: string;
};

export type SourceWorkspace = {
  id: string;
  label: string;
  revision: number;
  documents: SourceDocument[];
  nodes: SourceNode[];
  edges: SourceEdge[];
};

export type BoardFile = {
  kind: "agent-graph-board";
  id: string;
  label: string;
  documents: string[];
  revision: number;
  layers: LayerDefinition[];
  nodePositions: Record<string, { x: number; y: number }>;
  pinnedNodeIds: string[];
};

export type BoardSummary = {
  path: string;
  id: string;
  label: string;
};

export type DocumentSummary = {
  path: string;
  label: string;
};

export type LayerDefinition = {
  id: string;
  label: string;
  kind: LayerKind;
  nodeIds: string[];
  visible: boolean;
  x: number;
  y: number;
  derivedFromLayerId: string | null;
};

export type WorkspaceState = {
  rootId: string;
  revision: number;
  layers: LayerDefinition[];
  nodePositions: Record<string, { x: number; y: number }>;
  pinnedNodeIds: string[];
};

export type GraphNode = {
  id: string;
  sourceId: string;
  parentLayerId: string;
  ownerNodeId?: string;
  label: string;
  sourcePath?: string;
  kind: GraphNodeKind;
  sourceKind?: SourceNodeKind;
  position: {
    x: number;
    y: number;
  };
  summary: string;
  hiddenCount?: number;
  hiddenKinds?: string[];
  hiddenNodes?: HiddenContextPreview[];
  independentlyPositioned?: boolean;
};

export type GraphEdge = {
  id: string;
  sourceId: string | null;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label: string;
  multiplicity: number;
  supportingPathIds: string[];
};

export type GraphLayer = LayerDefinition & {
  width: number;
  height: number;
};

export type GraphSnapshot = {
  workspaceId: string;
  revision: number;
  layers: GraphLayer[];
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphDiffSnapshot = {
  revision: number;
  layers: LayerDefinition[];
  changedNodeIds: string[];
  changedEdgeIds: string[];
};

export type WorkspaceSnapshot = {
  board: BoardSummary;
  workspace: {
    id: string;
    label: string;
    revision: number;
  };
  documents: SourceDocument[];
  nodes: SourceNode[];
  pinnedNodeIds: string[];
  workspaceStateRevision: number;
};

export type EditNodeMeaningIntent = {
  kind: "edit-node-meaning";
  intentId: string;
  expectedRevision: number;
  sourceNodeId: string;
  label: string;
};

export type ConnectVisibleNodesIntent = {
  kind: "connect-visible-nodes";
  intentId: string;
  expectedRevision: number;
  sourceNodeId: string;
  targetNodeId: string;
};

export type CloneLayerIntent = {
  kind: "clone-layer";
  layerId: string;
};

export type MoveLayerIntent = {
  kind: "move-layer";
  layerId: string;
  x: number;
  y: number;
};

export type SetLayerVisibilityIntent = {
  kind: "set-layer-visibility";
  layerId: string;
  visible: boolean;
};

export type MoveNodeIntent = {
  kind: "move-node";
  nodeId: string;
  x: number;
  y: number;
};

export type MoveNodesIntent = {
  kind: "move-nodes";
  positions: Array<{
    nodeId: string;
    x: number;
    y: number;
  }>;
};

export type SetNodePinnedIntent = {
  kind: "set-node-pinned";
  nodeId: string;
  pinned: boolean;
};

export type ToggleLayerNodeIntent = {
  kind: "toggle-layer-node";
  layerId: string;
  sourceNodeId: string;
  include: boolean;
};

export type ToggleLayerNodesIntent = {
  kind: "toggle-layer-nodes";
  layerId: string;
  sourceNodeIds: string[];
  include: boolean;
};

export type RevealHiddenContextIntent = {
  kind: "reveal-hidden-context";
  portalNodeId: string;
};

export type RevealHiddenNodeIntent = {
  kind: "reveal-hidden-node";
  portalNodeId: string;
  hiddenNodeId: string;
  position?: {
    x: number;
    y: number;
  };
};

export type RevealConnectedHiddenContextIntent = {
  kind: "reveal-connected-hidden-context";
  sourceNodeId: string;
  layerId: string;
};

export type RequestDiffIntent = {
  kind: "request-diff";
};

export type GraphIntent =
  | EditNodeMeaningIntent
  | ConnectVisibleNodesIntent
  | CloneLayerIntent
  | MoveLayerIntent
  | SetLayerVisibilityIntent
  | MoveNodeIntent
  | MoveNodesIntent
  | SetNodePinnedIntent
  | ToggleLayerNodeIntent
  | ToggleLayerNodesIntent
  | RevealHiddenContextIntent
  | RevealHiddenNodeIntent
  | RevealConnectedHiddenContextIntent
  | RequestDiffIntent;

export type ValidationPayload = {
  accepted: boolean;
  intentId: string;
  message: string;
};

export type ConflictPayload = {
  intentId: string;
  code: "stale-revision" | "ambiguous" | "duplicate-relationship" | "unsupported";
  message: string;
};

export type PlannedMutation =
  | {
      kind: "rename-node";
      sourceNodeId: string;
      label: string;
    }
  | {
      kind: "connect-nodes";
      sourceNodeId: string;
      targetNodeId: string;
    };
