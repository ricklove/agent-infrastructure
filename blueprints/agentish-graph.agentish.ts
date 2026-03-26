/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Single-subject graph blueprint",
});

const AgentishGraph = define.blueprint("AgentishGraph", {
  format: Agentish,
  role: "Human visualization and round-trip editing of Agentish documents and document sets",
});

const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

AgentishGraph.contains(
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

// Concept

const Human = define.actor("Human", {
  role: "Reader and editor of Agentish systems",
});
const ExternalEditor = define.actor("ExternalEditor", {
  role: "Out-of-band source mutator",
});
const Browser = define.actor("BrowserUser", { role: "Graph editor operator" });

const GraphSystem = define.system("AgentishGraphSystem", {
  role: "Projection, validation, and reconciliation authority",
});
const Studio = define.system("AgentishStudio", {
  role: "Thin Vite composition shell",
});
const Server = define.system("AgentishGraphServer", {
  role: "Bun HTTP and WSS authority",
});
const FileSystem = define.system("WorkspaceFileSystem", {
  role: "Source of documents",
});

const Source = {
  document: define.document("AgentishDocument", { format: Agentish }),
  documentSet: define.documentSet("AgentishDocumentSet", {
    actsAs: "workspace source",
  }),
  mutation: define.mutation("SourceMutation"),
};

const Semantics = {
  model: define.semanticModel("SemanticModel", {
    actsAs: "normalized meaning",
  }),
};

const Identity = {
  stable: define.identity("StableIdentity"),
};

const Projection = {
  workspace: define.workspace("GraphWorkspace", {
    actsAs: "human-editable projection",
  }),
  layer: define.graphLayer("GraphLayer"),
  node: define.graphNode("GraphNode"),
  edge: define.graphEdge("GraphEdge"),
  portal: define.portal("PortalEdge"),
  selection: define.selection("SelectionState"),
  layoutHint: define.layoutHint("LayoutHint"),
};

const Editing = {
  intent: define.intent("EditIntent"),
  validation: define.validation("ValidationResult"),
  conflict: define.conflict("EditConflict"),
};

const Planning = {
  patchPlan: define.patchPlan("SourcePatchPlan"),
};

const Truth = {
  sourceAuthority: define.truth("SourceAuthority"),
  derivedProjection: define.truth("DerivedProjection"),
  roundTripEditing: define.truth("RoundTripEditing"),
  layoutHintsAdvisory: define.truth("LayoutHintsAreAdvisory"),
  multiDocumentWorkspace: define.truth("WorkspaceMaySpanManyDocuments"),
  stableIdentity: define.truth("StableIdentityAcrossRefresh"),
  surfacedConflicts: define.truth("SurfacedConflicts"),
};

Source.documentSet.contains(Source.document);
Semantics.model.contains(Identity.stable);
Projection.workspace.contains(
  Projection.layer,
  Projection.node,
  Projection.edge,
  Projection.portal,
  Projection.selection,
  Projection.layoutHint,
);

GraphSystem.derives(Semantics.model).from(Source.documentSet);
GraphSystem.derives(Projection.workspace).from(
  Semantics.model,
  Identity.stable,
  Projection.layoutHint,
);
GraphSystem.derives(Editing.validation).from(Editing.intent, Source.documentSet);
GraphSystem.derives(Planning.patchPlan).from(Editing.validation, Editing.intent);
GraphSystem.derives(Source.mutation).from(Planning.patchPlan);
GraphSystem.derives(Editing.conflict).from(Editing.validation, Editing.intent);

AgentishGraph.enforces(
  Truth.sourceAuthority,
  Truth.derivedProjection,
  Truth.roundTripEditing,
  Truth.layoutHintsAdvisory,
  Truth.multiDocumentWorkspace,
  Truth.stableIdentity,
  Truth.surfacedConflicts,
);

Truth.sourceAuthority.means("Documents remain authoritative.");
Truth.derivedProjection.means(
  "The graph workspace is derived rather than primary truth.",
);
Truth.roundTripEditing.means("Graph edits return to source as mutations.");
Truth.layoutHintsAdvisory.means(
  "Layout hints shape the projection without changing source meaning.",
);
Truth.multiDocumentWorkspace.means(
  "A workspace may project one document or many documents together.",
);
Truth.stableIdentity.means(
  "Equivalent meaning reappears as equivalent visual identity.",
);
Truth.surfacedConflicts.means(
  "Ambiguity and revision drift must be shown rather than hidden.",
);

// Scenarios

const OpenWorkspaceScenario = define.scenario("OpenWorkspaceScenario");
const InspectNodeScenario = define.scenario("InspectNodeScenario");
const EditNodeScenario = define.scenario("EditNodeScenario");
const ConnectNodesScenario = define.scenario("ConnectNodesScenario");
const MoveNodeScenario = define.scenario("MoveNodeScenario");
const ExternalChangeScenario = define.scenario("ExternalChangeScenario");
const ResolveConflictScenario = define.scenario("ResolveConflictScenario");

OpenWorkspaceScenario
  .given("An Agentish document set is available to open.")
  .when(Human.opens(Source.documentSet))
  .then(GraphSystem.loads(Projection.workspace))
  .and(GraphSystem.projects(Projection.node, Projection.edge, Projection.portal))
  .succeeds(`- The workspace is visible.
- The projection matches source structure.`);

InspectNodeScenario
  .given("A projected node is visible and selectable.")
  .when(Human.selects(Projection.node))
  .then(GraphSystem.updates(Projection.selection))
  .and(GraphSystem.reveals("semantic details"))
  .succeeds("Meaning is inspectable without raw source.");

EditNodeScenario
  .given("A projected node exposes an editable label or attribute.")
  .when(Human.edits(Projection.node))
  .then(GraphSystem.derives(Editing.intent))
  .and(GraphSystem.derives(Editing.validation))
  .whenAccepted(Editing.validation)
  .then(GraphSystem.derives(Planning.patchPlan))
  .and(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Projection.workspace))
  .succeeds("The visual edit round-trips into source.")
  .preserves("Identity and manual layout are preserved when possible.")
  .conflictsAs("Conflicts are visible instead of silent writes.");

ConnectNodesScenario
  .given("Two compatible handles are visible or discoverable in the graph.")
  .when(Human.connects(Projection.node).to(Projection.node))
  .then(GraphSystem.derives("relation creation intent"))
  .and(GraphSystem.derives(Editing.validation))
  .whenAccepted(Editing.validation)
  .then(GraphSystem.applies(Source.mutation))
  .and(GraphSystem.reprojects(Projection.edge, Projection.portal))
  .succeeds(`- The connection becomes a source relationship.
- A cross-layer relation appears as a portal.`)
  .conflictsAs("An invalid or ambiguous target is surfaced.");

MoveNodeScenario
  .given("A projected node is draggable.")
  .when(Human.drags(Projection.node))
  .then(GraphSystem.records(Projection.layoutHint))
  .and(GraphSystem.reprojects(Projection.workspace))
  .succeeds("Manual layout persists across refresh.")
  .preserves("Source meaning is preserved.");

ExternalChangeScenario
  .given("A projected document changes outside the current graph session.")
  .when(ExternalEditor.mutates(Source.document))
  .then(GraphSystem.detects("external source change"))
  .and(GraphSystem.reprojects(Projection.workspace))
  .succeeds("The graph reflects out-of-band edits.")
  .preserves("Selection and viewport are preserved when safe.")
  .conflictsAs("A pending mutation that loses its target is surfaced.");

ResolveConflictScenario
  .given("A mutation loses its target or conflicts with a newer source revision.")
  .when(GraphSystem.detects(Editing.conflict))
  .then(GraphSystem.surfaces(Editing.conflict).to(Human))
  .and(GraphSystem.pauses("the affected mutation path"))
  .and(
    GraphSystem.requests(Human, {
      toChoose: "reload, manual edit, or discard local intent",
    }),
  )
  .succeeds("The conflict is visible and its handling path is explicit.")
  .protects("Source authority is protected.");

// ImplementationPlan

const Package = {
  core: define.package("PackageAgentishGraphCore", {
    path: "packages/agentish-graph-core",
  }),
  protocol: define.package("PackageAgentishGraphProtocol", {
    path: "packages/agentish-graph-protocol",
  }),
  store: define.package("PackageAgentishGraphStore", {
    path: "packages/agentish-graph-store",
  }),
  ui: define.package("PackageAgentishGraphUi", {
    path: "packages/agentish-graph-ui",
  }),
  server: define.package("PackageAgentishGraphServer", {
    path: "packages/agentish-graph-server",
  }),
  studio: define.package("PackageAgentishStudio", {
    path: "apps/agentish-studio",
  }),
};

Package.protocol.dependsOn(Package.core);
Package.store.dependsOn(Package.core, Package.protocol);
Package.ui.dependsOn(Package.core, Package.protocol, Package.store);
Package.server.dependsOn(Package.core, Package.protocol);
Package.studio.dependsOn(Package.ui, Package.store, Package.protocol);

Package.core.owns(
  "Parser",
  "Semantic model",
  "Stable identity",
  "Projection builder",
  "Mutation planner",
);
Package.protocol.owns("HTTP contracts", "WSS contracts");
Package.store.owns("Legend State", "Client actions");
Package.ui.owns("React components", "React Flow adapters", "Tailwind UI");
Package.server.owns(
  "Bun HTTP server",
  "Bun WSS server",
  "Workspace access",
  "File watching",
  "Mutation execution",
);
Package.studio.owns("Entry point only");

const Decision = {
  parsing: define.decision("ParsingDecision"),
  identity: define.decision("StableIdentityDecision"),
  projection: define.decision("ProjectionDecision"),
  layering: define.decision("LayeringDecision"),
  mutation: define.decision("MutationDecision"),
  conflicts: define.decision("ConflictDecision"),
  session: define.decision("SessionDecision"),
  rendering: define.decision("RenderingDecision"),
};

Decision.parsing.defines(`- Use the TypeScript compiler API.
- Extract define declarations, relationship chains, and when chains.
- Treat named declarations as semantic nodes and fluent chains as semantic edges.`);
Decision.identity.defines(`- Stable IDs derive from relative path and local meaning.
- Equivalent meaning must yield the same stable ID after reprojection.
- Layout hints are keyed by stable ID rather than by transient render position.
- Stable ID precedence is relative path, declaration kind, declaration name, then local structural position.
- If a stable ID no longer resolves to a projected node, its layout hint is discarded.`);
Decision.projection.defines(`- Projection is built on the server.
- Projection recomputes from source and layout hints.
- Layout hints may influence geometry but may not change source meaning.
- A relation becomes a portal when its endpoints land in different document layers.`);
Decision.layering.defines(`- There is one layer per open document.
- Default layer order is lexicographic by relative path.
- Cross-document references appear as portals between layers.`);
Decision.mutation.defines(`- Graph mutation intent is the only client write primitive.
- Source patch plan is the only server write primitive.
- Validation precedes source writes.
- The client may be optimistic about selection and viewport only.
- Setting node position mutates layout hints only.
- Setting node label or attribute rewrites the corresponding source declaration.
- Connecting handles rewrites or creates a source relationship.
- Deleting elements removes the owning source declarations or relationships.
- When multiple source declarations could satisfy one edit intent, validation fails as non-round-trippable instead of guessing.`);
Decision.conflicts.defines(`- Conflicts pause the pending mutation queue.
- A mutation that loses its target becomes a surfaced conflict instead of a silent drop.
- Conflict resolution choices are reload, manual edit, or discard local intent.
- Reload replaces stale client state with a fresh snapshot.
- Discard local intent clears the blocked mutation without mutating source.
- Manual edit preserves the conflict until the source meaning changes or the user abandons the edit.`);
Decision.session.defines(`- There is one writable session per workspace root.
- A missing patch revision forces a full snapshot reload.
- The server remains authoritative for revision ordering and patch acceptance.
- Heartbeat uses client ping and server pong to keep connection state current.`);
Decision.rendering.defines(`- React Flow is an adapter, not a source of truth.
- Portal edges represent cross-layer references only.
- Manual layout is preserved when stable identity persists.`);

const State = {
  session: define.stateSlice("SessionSlice"),
  workspace: define.stateSlice("WorkspaceSlice"),
  graph: define.stateSlice("GraphSlice"),
  inspector: define.stateSlice("InspectorSlice"),
  ui: define.stateSlice("UiSlice"),
  io: define.stateSlice("IoSlice"),
};

const Action = {
  bootstrapConfig: define.action("BootstrapConfig"),
  createSession: define.action("CreateSession"),
  closeSession: define.action("CloseSession"),
  connectSocket: define.action("ConnectSocket"),
  applyServerReady: define.action("ApplyServerReady"),
  applyWorkspaceSnapshot: define.action("ApplyWorkspaceSnapshot"),
  applyProjectionSnapshot: define.action("ApplyProjectionSnapshot"),
  applyProjectionPatch: define.action("ApplyProjectionPatch"),
  applyValidationResult: define.action("ApplyValidationResult"),
  applyConflict: define.action("ApplyConflict"),
  handleFileChange: define.action("HandleFileChange"),
  acknowledgeDocumentPatched: define.action("AcknowledgeDocumentPatched"),
  applyServerError: define.action("ApplyServerError"),
  sendPing: define.action("SendPing"),
  receivePong: define.action("ReceivePong"),
  openRoot: define.action("OpenRoot"),
  openDocuments: define.action("OpenDocuments"),
  saveDocuments: define.action("SaveDocuments"),
  setSelection: define.action("SetSelection"),
  setViewport: define.action("SetViewport"),
  beginInspectorEdit: define.action("BeginInspectorEdit"),
  commitInspectorDraft: define.action("CommitInspectorDraft"),
  createNode: define.action("CreateNode"),
  connectHandles: define.action("ConnectHandles"),
  deleteSelection: define.action("DeleteSelection"),
  queueGraphIntent: define.action("QueueGraphIntent"),
  resolveConflict: define.action("ResolveConflict"),
  persistLayoutHint: define.action("PersistLayoutHint"),
};

const Transport = {
  http: define.transport("HttpSurface"),
  ws: define.transport("WssSurface"),
};

const Route = {
  config: define.route("GetGraphConfigRoute", {
    path: "GET /api/agentish-graph/config",
  }),
  roots: define.route("ListWorkspaceRootsRoute", {
    path: "GET /api/agentish-graph/roots",
  }),
  createSession: define.route("CreateGraphSessionRoute", {
    path: "POST /api/agentish-graph/sessions",
  }),
  sessionSnapshot: define.route("GetGraphSessionSnapshotRoute", {
    path: "GET /api/agentish-graph/sessions/:sessionId/snapshot",
  }),
  closeSession: define.route("DeleteGraphSessionRoute", {
    path: "DELETE /api/agentish-graph/sessions/:sessionId",
  }),
};

const Message = {
  clientHello: define.message("ClientHelloMessage"),
  clientOpenRoot: define.message("ClientOpenRootMessage"),
  clientOpenDocuments: define.message("ClientOpenDocumentsMessage"),
  clientApplyIntent: define.message("ClientApplyIntentMessage"),
  clientPersistLayout: define.message("ClientPersistLayoutMessage"),
  clientSaveDocuments: define.message("ClientSaveDocumentsMessage"),
  clientPing: define.message("ClientPingMessage"),
  serverReady: define.message("ServerReadyMessage"),
  serverWorkspaceSnapshot: define.message("ServerWorkspaceSnapshotMessage"),
  serverProjectionSnapshot: define.message("ServerProjectionSnapshotMessage"),
  serverProjectionPatch: define.message("ServerProjectionPatchMessage"),
  serverDocumentPatched: define.message("ServerDocumentPatchedMessage"),
  serverValidation: define.message("ServerValidationMessage"),
  serverConflict: define.message("ServerConflictMessage"),
  serverFileChanged: define.message("ServerFileChangedMessage"),
  serverError: define.message("ServerErrorMessage"),
  serverPong: define.message("ServerPongMessage"),
};

Transport.http.serves(
  Route.config,
  Route.roots,
  Route.createSession,
  Route.sessionSnapshot,
  Route.closeSession,
);
Transport.ws.serves("WSS /api/agentish-graph/ws");

Action.bootstrapConfig.calls(Route.config, Route.roots);
Action.createSession.calls(Route.createSession, Route.sessionSnapshot);
Action.closeSession.calls(Route.closeSession);
Action.connectSocket.sends(Message.clientHello);
Action.openRoot.sends(Message.clientOpenRoot);
Action.openDocuments.sends(Message.clientOpenDocuments);
Action.saveDocuments.sends(Message.clientSaveDocuments);
Action.sendPing.sends(Message.clientPing);
Action.queueGraphIntent.sends(Message.clientApplyIntent);
Action.persistLayoutHint.sends(Message.clientPersistLayout);
Action.resolveConflict.calls(Route.sessionSnapshot).when("the choice is reload");
Action.createNode.feeds(Action.queueGraphIntent);
Action.connectHandles.feeds(Action.queueGraphIntent);
Action.deleteSelection.feeds(Action.queueGraphIntent);
Action.commitInspectorDraft.feeds(Action.queueGraphIntent);

State.session.updatedBy(
  Action.bootstrapConfig,
  Action.createSession,
  Action.closeSession,
  Action.connectSocket,
  Action.applyServerReady,
  Action.applyServerError,
);
State.workspace.updatedBy(
  Action.openRoot,
  Action.openDocuments,
  Action.applyWorkspaceSnapshot,
  Action.applyProjectionPatch,
  Action.handleFileChange,
);
State.graph.updatedBy(
  Action.applyProjectionSnapshot,
  Action.applyProjectionPatch,
  Action.handleFileChange,
  Action.setSelection,
  Action.setViewport,
  Action.persistLayoutHint,
  Action.deleteSelection,
);
State.inspector.updatedBy(
  Action.setSelection,
  Action.beginInspectorEdit,
  Action.commitInspectorDraft,
  Action.applyValidationResult,
  Action.applyConflict,
  Action.resolveConflict,
);
State.ui.updatedBy(Action.bootstrapConfig);
State.io.updatedBy(
  Action.connectSocket,
  Action.acknowledgeDocumentPatched,
  Action.applyServerReady,
  Action.applyServerError,
  Action.sendPing,
  Action.receivePong,
  Action.queueGraphIntent,
  Action.applyProjectionPatch,
  Action.resolveConflict,
  Action.saveDocuments,
);

AgentishGraph.prescribes(`- The Vite app contains no business logic.
- Reusable code lives under packages.
- The browser never touches filesystem APIs.
- Only the server writes source files.
- The server is authoritative for projection and mutation results.
- The store contains client session state only.
- The UI never plans source mutations.
- Conflict resolution is orchestrated by store actions rather than by a dedicated transport message.
- The protocol owns all cross-boundary contracts.`);

when(Browser.edits(Projection.workspace))
  .then(GraphSystem.derives(Editing.intent))
  .and(GraphSystem.derives(Editing.validation));

when(GraphSystem.accepts(Editing.validation))
  .then(GraphSystem.derives(Planning.patchPlan))
  .and(GraphSystem.derives(Source.mutation))
  .and(GraphSystem.applies(Source.mutation).to(Source.documentSet))
  .and(GraphSystem.projects(Projection.workspace));

when(GraphSystem.rejects(Editing.validation))
  .then(GraphSystem.derives(Editing.conflict))
  .and(GraphSystem.surfaces(Editing.conflict).to(Browser))
  .and(GraphSystem.protects(Source.documentSet));

when(GraphSystem.detects("external source change"))
  .then(GraphSystem.derives(Semantics.model))
  .and(GraphSystem.projects(Projection.workspace))
  .and(GraphSystem.preserves("selection and viewport when safe"));

when(GraphSystem.detects("missing patch revision"))
  .then(GraphSystem.reloads("full snapshot"))
  .and(GraphSystem.replaces("stale client projection state"));

when(Browser.opens(Studio))
  .then(Action.bootstrapConfig)
  .and(Action.createSession)
  .and(Action.connectSocket)
  .and(Route.config)
  .and(Route.roots)
  .and(Route.createSession)
  .and(Message.clientHello)
  .and(Message.serverReady);

// Contracts

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
type MessageEnvelope<T extends string, P = {}> = { type: T } & P;
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
export type GraphNodeKind =
  | "language"
  | "actor"
  | "system"
  | "entity"
  | "event"
  | "state"
  | "concept"
  | "group";

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

export type GraphProjectionEdge = {
  id: StableId;
  semanticId: StableId;
  sourceNodeId: HandleConnection["sourceNodeId"];
  targetNodeId: HandleConnection["targetNodeId"];
  sourceHandleId: HandleConnection["sourceHandleId"];
  targetHandleId: HandleConnection["targetHandleId"];
  edgeKind: "structural" | "causal" | "ownership" | "reference";
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

export type GraphConflictResolutionChoice =
  | "reload"
  | "manual-edit"
  | "discard-local-intent";

export type GraphConflict = {
  conflictId: ConflictId;
  mutationId: MutationId;
  code: "external-change" | "ambiguous-target" | "non-round-trippable" | "validation-failed";
  message: string;
  entityIds: StableId[];
  documentIds: StableId[];
  suggestedResolution: GraphConflictResolutionChoice;
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

export type GraphHttpContracts = {
  "GET /api/agentish-graph/config": { response: GraphServerConfigResponse };
  "GET /api/agentish-graph/roots": { response: { roots: WorkspaceRootConfig[] } };
  "POST /api/agentish-graph/sessions": {
    request: CreateSessionRequest;
    response: CreateSessionResponse;
  };
  "GET /api/agentish-graph/sessions/:sessionId/snapshot": {
    response: {
      workspace: {
        root: WorkspaceRootConfig | null;
        fileTree: WorkspaceEntry[];
        openDocuments: AgentishDocumentText[];
      };
      projection: GraphProjectionSnapshot;
      validationIssues: ValidationIssue[];
    };
  };
  "DELETE /api/agentish-graph/sessions/:sessionId": {
    response: { closed: true; sessionId: SessionId };
  };
};

export type WsClientEnvelope =
  | MessageEnvelope<"client/hello", { sessionId: SessionId; sessionToken: SessionToken }>
  | MessageEnvelope<"client/open-root", { rootId: RootId }>
  | MessageEnvelope<
      "client/open-documents",
      { paths: DocumentPath[]; activeDocumentPath: DocumentPath | null }
    >
  | MessageEnvelope<"client/apply-intent", { intent: GraphMutationIntent }>
  | MessageEnvelope<"client/persist-layout", { hint: GraphLayoutHint }>
  | MessageEnvelope<"client/save-documents", { documentIds: StableId[] }>
  | MessageEnvelope<"client/ping", { at: number }>;

export type WsServerEnvelope =
  | MessageEnvelope<"server/ready", { sessionId: SessionId; revision: Revision }>
  | MessageEnvelope<
      "server/workspace-snapshot",
      {
        root: WorkspaceRootConfig | null;
        fileTree: WorkspaceEntry[];
        openDocuments: AgentishDocumentText[];
      }
    >
  | MessageEnvelope<"server/projection-snapshot", { snapshot: GraphProjectionSnapshot }>
  | MessageEnvelope<"server/projection-patch", { patch: SourcePatchPlan; revision: Revision }>
  | MessageEnvelope<
      "server/document-patched",
      { mutationId: MutationId; documentIds: StableId[]; savedRevision: Revision }
    >
  | MessageEnvelope<"server/validation", { issues: ValidationIssue[] }>
  | MessageEnvelope<"server/conflict", { conflict: GraphConflict }>
  | MessageEnvelope<"server/file-changed", { documentId: StableId; revision: Revision }>
  | MessageEnvelope<"server/error", { code: string; message: string }>
  | MessageEnvelope<"server/pong", { at: number }>;

export type AgentishGraphStoreState = {
  session: {
    sessionId: SessionId | null;
    sessionToken: SessionToken | null;
    serverOrigin: string;
    wsUrl: string;
    connectionState: "idle" | "connecting" | "open" | "closed" | "error";
    lastHeartbeatAt: number;
    reconnectAttempt: number;
    fatalError: string | null;
  };
  workspace: {
    allowedRoots: WorkspaceRootConfig[];
    activeRoot: RootId | null;
    fileTree: WorkspaceEntry[];
    openDocuments: DocumentPath[];
    activeDocumentPath: DocumentPath | null;
    documentBuffers: Partial<Record<DocumentPath, AgentishDocumentText>>;
    dirtyDocumentPaths: DocumentPath[];
    sourceRevision: Revision | 0;
  };
  graph: {
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
  };
  inspector: {
    selectedEntityId: StableId | null;
    selectedEntityKind: string | null;
    draftAttributes: Record<string, string>;
    draftLabel: string;
    draftConnection: DraftConnection | null;
    validationIssues: ValidationIssue[];
    activeConflict: GraphConflict | null;
  };
};

export type AgentishGraphStoreActions = {
  bootstrapConfig(config: GraphServerConfigResponse): void;
  createSession(request: CreateSessionRequest): Promise<CreateSessionResponse>;
  closeSession(sessionId: SessionId): Promise<{ closed: true; sessionId: SessionId }>;
  connectSocket(session: {
    sessionId: SessionId;
    sessionToken: SessionToken;
    wsUrl: string;
  }): Promise<void>;
  openRoot(rootId: RootId): void;
  openDocuments(paths: DocumentPath[], activeDocumentPath?: DocumentPath | null): void;
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
    choice: GraphConflictResolutionChoice;
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
