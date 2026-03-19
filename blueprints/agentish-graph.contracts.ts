export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type StableId = Brand<string, "StableId">;
export type Revision = Brand<number, "Revision">;
export type MutationId = Brand<string, "MutationId">;
export type ConflictId = Brand<string, "ConflictId">;
export type SessionId = Brand<string, "SessionId">;
export type SessionToken = Brand<string, "SessionToken">;
export type RootId = Brand<string, "RootId">;
export type DocumentPath = Brand<string, "DocumentPath">;

export type AttributeValue = string | number | boolean | null;

export type SourceRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type WorkspaceRootConfig = {
  rootId: RootId;
  label: string;
  absolutePath: string;
  writable: boolean;
  includeGlobs: string[];
  excludeGlobs: string[];
  defaultEntryDocumentPath: DocumentPath | null;
};

export type WorkspaceEntry = {
  path: DocumentPath;
  name: string;
  kind: "file" | "directory";
  extension: string | null;
  children: WorkspaceEntry[] | null;
  documentKind: "agentish" | "typescript" | "unknown";
  isOpenable: boolean;
};

export type AgentishDocumentRef = {
  documentId: StableId;
  rootId: RootId;
  relativePath: DocumentPath;
  absolutePath: string;
  language: "agentish-ts";
  revision: Revision;
};

export type AgentishDocumentText = {
  documentId: StableId;
  text: string;
  savedRevision: Revision;
  unsavedRevision: Revision;
  lineCount: number;
};

export type SemanticNodeKind =
  | "language"
  | "actor"
  | "system"
  | "entity"
  | "event"
  | "state"
  | "concept";

export type SemanticNodeRecord = {
  id: StableId;
  documentId: StableId;
  kind: SemanticNodeKind;
  name: string;
  attributes: Record<string, AttributeValue>;
  sourceRange: SourceRange;
};

export type SemanticEdgeRecord = {
  id: StableId;
  documentId: StableId;
  kind: string;
  fromId: StableId;
  toId: StableId;
  attributes: Record<string, AttributeValue>;
  sourceRuleId: StableId | null;
};

export type SemanticRuleTrigger = {
  actorId: StableId | null;
  verb: string;
  objectIds: StableId[];
};

export type SemanticRuleEffect = {
  targetId: StableId | null;
  verb: string;
  objectIds: StableId[];
  attributes: Record<string, AttributeValue>;
};

export type SemanticRuleRecord = {
  id: StableId;
  documentId: StableId;
  trigger: SemanticRuleTrigger;
  effects: SemanticRuleEffect[];
  sourceRange: SourceRange;
};

export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationIssue = {
  issueId: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  documentId: StableId | null;
  entityId: StableId | null;
  sourceRange: SourceRange | null;
};

export type AgentishParseResult = {
  document: AgentishDocumentRef;
  imports: string[];
  declarations: Array<{
    kind: string;
    id: string;
    attributes: Record<string, unknown>;
  }>;
  rules: SemanticRuleRecord[];
  diagnostics: ValidationIssue[];
};

export type GraphLayer = {
  id: StableId;
  label: string;
  documentId: StableId;
  order: number;
};

export type GraphHandle = {
  id: StableId;
  side: "top" | "right" | "bottom" | "left";
  role: "source" | "target" | "bidirectional";
};

export type GraphNodeKind = SemanticNodeKind | "group";

export type GraphProjectionNode = {
  id: StableId;
  semanticId: StableId;
  documentId: StableId;
  layerId: StableId;
  nodeKind: GraphNodeKind;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  handles: GraphHandle[];
  badges: string[];
  collapsed: boolean;
};

export type GraphEdgeKind = "structural" | "causal" | "ownership" | "reference";

export type GraphProjectionEdge = {
  id: StableId;
  semanticId: StableId;
  sourceNodeId: StableId;
  targetNodeId: StableId;
  sourceHandleId: StableId | null;
  targetHandleId: StableId | null;
  edgeKind: GraphEdgeKind;
  label: string | null;
  hidden: boolean;
};

export type GraphProjectionPortal = {
  id: StableId;
  semanticId: StableId;
  sourceLayerId: StableId;
  targetLayerId: StableId;
  sourceNodeId: StableId;
  targetNodeId: StableId;
  label: string | null;
};

export type GraphSelection = {
  nodeIds: StableId[];
  edgeIds: StableId[];
  portalIds: StableId[];
  primaryId: StableId | null;
};

export type GraphViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type GraphLayoutHint = {
  nodeId: StableId;
  x: number;
  y: number;
  pinned: boolean;
  updatedAt: number;
};

export type GraphProjectionSnapshot = {
  revision: Revision;
  rootId: RootId;
  documentIds: StableId[];
  layers: GraphLayer[];
  nodes: GraphProjectionNode[];
  edges: GraphProjectionEdge[];
  portals: GraphProjectionPortal[];
  viewport: GraphViewport;
  selection: GraphSelection;
  layoutHints: Record<StableId, GraphLayoutHint>;
};

export type GraphMutationIntent =
  | {
      kind: "set-node-position";
      mutationId: MutationId;
      nodeId: StableId;
      x: number;
      y: number;
    }
  | {
      kind: "set-node-label";
      mutationId: MutationId;
      nodeId: StableId;
      label: string;
    }
  | {
      kind: "set-node-attribute";
      mutationId: MutationId;
      nodeId: StableId;
      attributeName: string;
      attributeValue: string;
    }
  | {
      kind: "create-node";
      mutationId: MutationId;
      layerId: StableId;
      nodeKind: GraphNodeKind;
      name: string;
      x: number;
      y: number;
    }
  | {
      kind: "connect-handles";
      mutationId: MutationId;
      sourceNodeId: StableId;
      sourceHandleId: StableId | null;
      targetNodeId: StableId;
      targetHandleId: StableId | null;
      relationshipKind: string;
    }
  | {
      kind: "delete-elements";
      mutationId: MutationId;
      nodeIds: StableId[];
      edgeIds: StableId[];
      portalIds: StableId[];
    }
  | {
      kind: "toggle-layer-visibility";
      mutationId: MutationId;
      layerId: StableId;
      hidden: boolean;
    };

export type DocumentChange = {
  documentId: StableId;
  nextText: string;
  operations: Array<{ kind: string; description: string }>;
};

export type ProjectionDelta =
  | { kind: "add"; entityKind: "node" | "edge" | "portal" | "layer"; entityId: StableId }
  | { kind: "update"; entityKind: "node" | "edge" | "portal" | "layer"; entityId: StableId }
  | { kind: "remove"; entityKind: "node" | "edge" | "portal" | "layer"; entityId: StableId };

export type SourcePatchPlan = {
  mutationId: MutationId;
  documentChanges: DocumentChange[];
  derivedProjectionDelta: ProjectionDelta[];
};

export type GraphConflictCode =
  | "external-change"
  | "ambiguous-target"
  | "non-round-trippable"
  | "validation-failed";

export type GraphConflict = {
  conflictId: ConflictId;
  mutationId: MutationId;
  code: GraphConflictCode;
  message: string;
  entityIds: StableId[];
  documentIds: StableId[];
  suggestedResolution: "reload" | "manual-edit" | "discard-local-intent";
};

export type GraphServerConfigResponse = {
  serverOrigin: string;
  wsOrigin: string;
  heartbeatIntervalMs: number;
  reconnectBackoffMs: number[];
  sessionTtlMs: number;
  supportsLayoutPersistence: true;
};

export type CreateSessionRequest = {
  rootId: RootId | null;
  initialDocumentPaths: DocumentPath[];
  readonly: boolean;
};

export type CreateSessionResponse = {
  sessionId: SessionId;
  sessionToken: SessionToken;
  wsUrl: string;
  snapshotUrl: string;
};

export type GetSessionSnapshotResponse = {
  workspace: {
    root: WorkspaceRootConfig | null;
    fileTree: WorkspaceEntry[];
    openDocuments: AgentishDocumentText[];
  };
  projection: GraphProjectionSnapshot;
  validationIssues: ValidationIssue[];
};

export type WsClientEnvelope =
  | { type: "client/hello"; sessionId: SessionId; sessionToken: SessionToken }
  | { type: "client/open-root"; rootId: RootId }
  | {
      type: "client/open-documents";
      paths: DocumentPath[];
      activeDocumentPath: DocumentPath | null;
    }
  | { type: "client/apply-intent"; intent: GraphMutationIntent }
  | { type: "client/persist-layout"; hint: GraphLayoutHint }
  | { type: "client/save-documents"; documentIds: StableId[] }
  | { type: "client/ping"; at: number };

export type WsServerEnvelope =
  | { type: "server/ready"; sessionId: SessionId; revision: Revision }
  | {
      type: "server/workspace-snapshot";
      root: WorkspaceRootConfig | null;
      fileTree: WorkspaceEntry[];
      openDocuments: AgentishDocumentText[];
    }
  | { type: "server/projection-snapshot"; snapshot: GraphProjectionSnapshot }
  | { type: "server/projection-patch"; patch: SourcePatchPlan; revision: Revision }
  | {
      type: "server/document-patched";
      mutationId: MutationId;
      documentIds: StableId[];
      savedRevision: Revision;
    }
  | { type: "server/validation"; issues: ValidationIssue[] }
  | { type: "server/conflict"; conflict: GraphConflict }
  | { type: "server/file-changed"; documentId: StableId; revision: Revision }
  | { type: "server/error"; code: string; message: string }
  | { type: "server/pong"; at: number };

export type ConnectionState = "idle" | "connecting" | "open" | "closed" | "error";
export type SyncStatus = "idle" | "syncing" | "dirty" | "conflicted";
export type PaneMode = "files" | "layers" | "legend" | "inspector";
export type LegendGroup =
  | "actors"
  | "systems"
  | "entities"
  | "events"
  | "states"
  | "concepts"
  | "portals";

export type SessionSlice = {
  sessionId: SessionId | null;
  sessionToken: SessionToken | null;
  serverOrigin: string;
  wsUrl: string;
  connectionState: ConnectionState;
  lastHeartbeatAt: number;
  reconnectAttempt: number;
  fatalError: string | null;
};

export type WorkspaceSlice = {
  allowedRoots: WorkspaceRootConfig[];
  activeRoot: RootId | null;
  fileTree: WorkspaceEntry[];
  openDocuments: DocumentPath[];
  activeDocumentPath: DocumentPath | null;
  documentBuffers: Partial<Record<DocumentPath, AgentishDocumentText>>;
  dirtyDocumentPaths: DocumentPath[];
  sourceRevision: Revision | 0;
};

export type GraphSlice = {
  snapshot: GraphProjectionSnapshot | null;
  nodes: Partial<Record<StableId, GraphProjectionNode>>;
  edges: Partial<Record<StableId, GraphProjectionEdge>>;
  portals: Partial<Record<StableId, GraphProjectionPortal>>;
  layers: Partial<Record<StableId, GraphLayer>>;
  layerOrder: StableId[];
  hiddenLayerIds: StableId[];
  selection: GraphSelection;
  viewport: GraphViewport;
  layoutHints: Partial<Record<StableId, GraphLayoutHint>>;
  legendVisibility: Record<LegendGroup, boolean>;
  filters: { search: string; kinds: string[]; documentIds: StableId[] };
};

export type InspectorSlice = {
  selectedEntityId: StableId | null;
  selectedEntityKind: string | null;
  draftAttributes: Record<string, string>;
  draftLabel: string;
  draftConnection: {
    sourceNodeId: StableId;
    sourceHandleId: StableId | null;
    targetNodeId: StableId;
    targetHandleId: StableId | null;
    relationshipKind: string;
  } | null;
  validationIssues: ValidationIssue[];
  activeConflict: GraphConflict | null;
};

export type UiSlice = {
  leftPaneMode: Exclude<PaneMode, "inspector">;
  rightPaneMode: "inspector" | "legend";
  showMiniMap: boolean;
  showPortals: boolean;
  showLabels: boolean;
  autoLayoutEnabled: boolean;
  isInspectorPinned: boolean;
  theme: "light" | "dark";
};

export type IoSlice = {
  pendingClientCommands: WsClientEnvelope[];
  pendingMutationIds: MutationId[];
  lastServerRevision: Revision | 0;
  lastAppliedPatchId: MutationId | null;
  lastSavedAt: number;
  syncStatus: SyncStatus;
};

export type AgentishGraphStoreState = {
  session: SessionSlice;
  workspace: WorkspaceSlice;
  graph: GraphSlice;
  inspector: InspectorSlice;
  ui: UiSlice;
  io: IoSlice;
};
