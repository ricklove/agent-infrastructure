export type SourceNodeKind =
  | "document"
  | "scenario-family"
  | "scenario"
  | "component"
  | "contract"
  | "runtime"
  | "workspace-op";

export type SourceEdgeKind =
  | "contains"
  | "supports"
  | "depends-on"
  | "implements"
  | "traces-to";

export type LayerKind =
  | "overview"
  | "semantic"
  | "diff-old"
  | "diff-new"
  | "diff-changed";

export type GraphNodeKind = "semantic-node" | "hidden-context-portal";
export type GraphEdgeKind = "direct" | "derived" | "hidden-context";

export type SourceNode = {
  id: string;
  documentId: string;
  label: string;
  kind: SourceNodeKind;
  summary: string;
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
};

export type GraphNode = {
  id: string;
  sourceId: string;
  parentLayerId: string;
  label: string;
  kind: GraphNodeKind;
  position: {
    x: number;
    y: number;
  };
  summary: string;
  hiddenCount?: number;
  hiddenKinds?: string[];
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
  workspace: {
    id: string;
    label: string;
    revision: number;
  };
  documents: SourceDocument[];
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

export type ToggleLayerNodeIntent = {
  kind: "toggle-layer-node";
  layerId: string;
  sourceNodeId: string;
  include: boolean;
};

export type RevealHiddenContextIntent = {
  kind: "reveal-hidden-context";
  portalNodeId: string;
};

export type RequestDiffIntent = {
  kind: "request-diff";
};

export type GraphIntent =
  | EditNodeMeaningIntent
  | ConnectVisibleNodesIntent
  | CloneLayerIntent
  | MoveLayerIntent
  | ToggleLayerNodeIntent
  | RevealHiddenContextIntent
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
