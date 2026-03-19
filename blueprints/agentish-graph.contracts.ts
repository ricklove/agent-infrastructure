export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type StableId = Brand<string, "StableId">;
export type Revision = number;
export type MutationId = string;
export type ConflictId = string;
export type SessionId = string;
export type SessionToken = string;
export type RootId = string;
export type DocumentPath = string;

export type AttributeValue = string | number | boolean | null;
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type IdMap<T> = Partial<Record<StableId, T>>;
type EntityRef = { id: StableId; documentId: StableId };
type HandleRef = StableId | null;
type HandleConnection = {
  sourceNodeId: StableId;
  sourceHandleId: HandleRef;
  targetNodeId: StableId;
  targetHandleId: HandleRef;
};
type DraftConnection = HandleConnection & { relationshipKind: string };
type WorkspaceSnapshot = {
  root: WorkspaceRootConfig | null;
  fileTree: WorkspaceEntry[];
  openDocuments: AgentishDocumentText[];
};
type Message<T extends string, P = {}> = { type: T } & P;
type Mutation<T extends string, P = {}> = { kind: T; mutationId: MutationId } & P;

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

export type SemanticNodeRecord = EntityRef & {
  kind: SemanticNodeKind;
  name: string;
  attributes: Record<string, AttributeValue>;
  sourceRange: SourceRange;
};

export type SemanticEdgeRecord = EntityRef & {
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

export type SemanticRuleRecord = EntityRef & {
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
  position: Point;
  size: Size;
  handles: GraphHandle[];
  badges: string[];
  collapsed: boolean;
};

export type GraphEdgeKind = "structural" | "causal" | "ownership" | "reference";

export type GraphProjectionEdge = {
  id: StableId;
  semanticId: StableId;
  sourceNodeId: HandleConnection["sourceNodeId"];
  targetNodeId: HandleConnection["targetNodeId"];
  sourceHandleId: HandleConnection["sourceHandleId"];
  targetHandleId: HandleConnection["targetHandleId"];
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

export type GraphViewport = Point & { zoom: number };

export type GraphLayoutHint = {
  nodeId: StableId;
  x: Point["x"];
  y: Point["y"];
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
  | Mutation<"set-node-position", { nodeId: StableId } & Point>
  | Mutation<"set-node-label", { nodeId: StableId; label: string }>
  | Mutation<
      "set-node-attribute",
      { nodeId: StableId; attributeName: string; attributeValue: string }
    >
  | Mutation<
      "create-node",
      { layerId: StableId; nodeKind: GraphNodeKind; name: string } & Point
    >
  | Mutation<"connect-handles", DraftConnection>
  | Mutation<
      "delete-elements",
      { nodeIds: StableId[]; edgeIds: StableId[]; portalIds: StableId[] }
    >
  | Mutation<"toggle-layer-visibility", { layerId: StableId; hidden: boolean }>;

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

export type ListWorkspaceRootsResponse = {
  roots: WorkspaceRootConfig[];
};

export type GetSessionSnapshotResponse = {
  workspace: WorkspaceSnapshot;
  projection: GraphProjectionSnapshot;
  validationIssues: ValidationIssue[];
};

export type CloseSessionResponse = {
  closed: true;
  sessionId: SessionId;
};

export type GraphHttpContracts = {
  "GET /api/agentish-graph/config": {
    response: GraphServerConfigResponse;
  };
  "GET /api/agentish-graph/roots": {
    response: ListWorkspaceRootsResponse;
  };
  "POST /api/agentish-graph/sessions": {
    request: CreateSessionRequest;
    response: CreateSessionResponse;
  };
  "GET /api/agentish-graph/sessions/:sessionId/snapshot": {
    response: GetSessionSnapshotResponse;
  };
  "DELETE /api/agentish-graph/sessions/:sessionId": {
    response: CloseSessionResponse;
  };
};

export type WsClientEnvelope =
  | Message<"client/hello", { sessionId: SessionId; sessionToken: SessionToken }>
  | Message<"client/open-root", { rootId: RootId }>
  | Message<
      "client/open-documents",
      { paths: DocumentPath[]; activeDocumentPath: DocumentPath | null }
    >
  | Message<"client/apply-intent", { intent: GraphMutationIntent }>
  | Message<"client/persist-layout", { hint: GraphLayoutHint }>
  | Message<"client/save-documents", { documentIds: StableId[] }>
  | Message<"client/ping", { at: number }>;

export type WsServerEnvelope =
  | Message<"server/ready", { sessionId: SessionId; revision: Revision }>
  | Message<"server/workspace-snapshot", WorkspaceSnapshot>
  | Message<"server/projection-snapshot", { snapshot: GraphProjectionSnapshot }>
  | Message<"server/projection-patch", { patch: SourcePatchPlan; revision: Revision }>
  | Message<
      "server/document-patched",
      { mutationId: MutationId; documentIds: StableId[]; savedRevision: Revision }
    >
  | Message<"server/validation", { issues: ValidationIssue[] }>
  | Message<"server/conflict", { conflict: GraphConflict }>
  | Message<"server/file-changed", { documentId: StableId; revision: Revision }>
  | Message<"server/error", { code: string; message: string }>
  | Message<"server/pong", { at: number }>;

export type WorkspaceSnapshotMessage = Extract<
  WsServerEnvelope,
  { type: "server/workspace-snapshot" }
>;

export type ProjectionSnapshotMessage = Extract<
  WsServerEnvelope,
  { type: "server/projection-snapshot" }
>;

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
  nodes: IdMap<GraphProjectionNode>;
  edges: IdMap<GraphProjectionEdge>;
  portals: IdMap<GraphProjectionPortal>;
  layers: IdMap<GraphLayer>;
  layerOrder: StableId[];
  hiddenLayerIds: StableId[];
  selection: GraphSelection;
  viewport: GraphViewport;
  layoutHints: IdMap<GraphLayoutHint>;
  legendVisibility: Record<LegendGroup, boolean>;
  filters: { search: string; kinds: string[]; documentIds: StableId[] };
};

export type InspectorSlice = {
  selectedEntityId: StableId | null;
  selectedEntityKind: string | null;
  draftAttributes: Record<string, string>;
  draftLabel: string;
  draftConnection: DraftConnection | null;
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

export type AgentishGraphStoreActions = {
  bootstrapConfig(config: GraphServerConfigResponse): void;
  createSession(request: CreateSessionRequest): Promise<CreateSessionResponse>;
  closeSession(sessionId: SessionId): Promise<CloseSessionResponse>;
  connectSocket(session: {
    sessionId: SessionId;
    sessionToken: SessionToken;
    wsUrl: string;
  }): Promise<void>;
  applyServerReady(message: Extract<WsServerEnvelope, { type: "server/ready" }>): void;
  applyWorkspaceSnapshot(message: WorkspaceSnapshotMessage): void;
  applyProjectionSnapshot(message: ProjectionSnapshotMessage): void;
  applyServerPatch(message: Extract<WsServerEnvelope, { type: "server/projection-patch" }>): void;
  applyValidationIssues(issues: ValidationIssue[]): void;
  applyConflict(conflict: GraphConflict): void;
  handleFileChange(message: Extract<WsServerEnvelope, { type: "server/file-changed" }>): void;
  acknowledgeDocumentPatched(
    message: Extract<WsServerEnvelope, { type: "server/document-patched" }>,
  ): void;
  applyServerError(message: Extract<WsServerEnvelope, { type: "server/error" }>): void;
  sendPing(at: number): void;
  receivePong(message: Extract<WsServerEnvelope, { type: "server/pong" }>): void;
  openRoot(rootId: RootId): void;
  openDocument(paths: DocumentPath[], activeDocumentPath?: DocumentPath | null): void;
  saveDocuments(documentIds: StableId[]): void;
  setSelection(selection: GraphSelection): void;
  setViewport(viewport: GraphViewport): void;
  beginInspectorEdit(entityId: StableId): void;
  commitInspectorDraft(): void;
  createNode(intent: Extract<GraphMutationIntent, { kind: "create-node" }>): void;
  connectHandles(intent: Extract<GraphMutationIntent, { kind: "connect-handles" }>): void;
  deleteSelection(intent: Extract<GraphMutationIntent, { kind: "delete-elements" }>): void;
  queueGraphIntent(intent: GraphMutationIntent): void;
  resolveConflict(resolution: {
    conflictId: ConflictId;
    choice: GraphConflict["suggestedResolution"];
  }): void;
  persistLayoutHint(hint: GraphLayoutHint): void;
};

export type AgentishGraphStoreContract = {
  state: AgentishGraphStoreState;
  actions: AgentishGraphStoreActions;
};

export type AgentishGraphWsContracts = {
  client: WsClientEnvelope;
  server: WsServerEnvelope;
};
