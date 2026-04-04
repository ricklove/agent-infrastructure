/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const WorkbenchRuntimeGraphBlueprint = define.system("WorkbenchRuntimeGraphBlueprint", {
  format: Agentish,
  role: "Blueprint for Agent Workbench runtime graph authority, graph-aware value resolution, and current-file reload behavior",
});

const SubjectBlueprint = define.document("WorkbenchRuntimeGraphBlueprintFile");
const SectionMap = define.document("SectionMap");

const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

WorkbenchRuntimeGraphBlueprint.contains(
  SubjectBlueprint,
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

Section.concept.answers(
  "Why does the subject exist? To evolve AgentWorkbench from a document-centric React Flow editor into the runtime-graph continuation of AgentWorkbench, where the open workbench graph is the active editable truth during a session and `.workbench.ts` remains the durable cross-session artifact that captures that graph when it is saved.",
  "What are the core abstractions? The runtime graph is the in-session source of truth, the persistence snapshot is its serialized save/load form, React Flow is only the interaction and rendering adapter, and node, edge, and handle names are the stable authored identity layer that lets the workbench graph be meaningfully referenced instead of treated as anonymous canvas state.",
  "What is authoritative? While the workbench is open, the runtime graph store is authoritative for nodes, edges, values, and viewport; across sessions, the persisted workbench document is authoritative as the durable record; React Flow is never authoritative, and browser-only transient state must never override the runtime graph or the saved document.",
  "What must remain true? The blueprint must preserve stable unique names for persisted graph entities, keep graph meaning separate from adapter behavior, allow graph-aware value resolution without collapsing back into raw widget-local state, and handle current-file reload safety in a way that protects unsaved edits without assuming full collaborative multiwriter behavior.",
);

Section.scenarios.answers(
  "What must work end to end? An operator opens a workbench and sees the currently saved nodes, edges, names, and viewport load into the live editor; the operator changes a text or int node, connects it to another node, saves, closes, and later reopens the same workbench to find the same named graph elements and node contents restored.",
  "What do humans observe? When a node named `sourceText` is given a value and another node named `targetText` is connected to it, editing `sourceText` changes what `targetText` shows in the open session without rebuilding the connection; the graph reads like a named diagram instead of anonymous canvas state; and saving plus reloading preserves the same readable node and edge identities rather than turning them into new or unclear references.",
  "What counts as success? A connected-value case behaves predictably: if `sourceText` feeds `targetText`, then editing `sourceText` produces the expected visible result at `targetText` without the user having to rebuild the connection or rename anything; a named-identity round trip behaves predictably: a node and edge that the operator can identify by name before saving still have the same names and same connection after reload.",
  "What do conflicts look like? If the currently open file changes on disk while the session is clean, the editor can refresh to the new snapshot without surprise; if the session has unsaved local edits to `targetText` while the file changes externally, the change is surfaced as a conflict instead of silently replacing work; and if a node’s value depends on a missing or ambiguous connection, the user sees a clear failure state rather than a guessed result.",
);

Section.implementationPlan.answers(
  "How should the subject be structured? The target architecture should split Agent Workbench into three layers: a runtime graph store that owns the live in-session graph and all graph state, a React Flow adapter that projects that graph into canvas interactions, and a persistence and reload boundary that loads, saves, and listens for external changes to the current `.workbench.ts` file.",
  "What should the runtime graph store own? The runtime graph store should own nodes, edges, handles, viewport, selection, dirty tracking, loaded source identity, revision bookkeeping, value evaluation, and external-change state; it is the authoritative session model and the only place where graph meaning is resolved during editing.",
  "What should the React Flow adapter own? The React Flow adapter should own rendering, gesture translation, node placement interaction, connection capture, resizing gestures, and pan or zoom events, but it should not own canonical node values, dirty state, file identity, or file reload policy.",
  "How should persistence and reload work? The persistence adapter should serialize the runtime graph into the existing `.workbench.ts` snapshot shape and hydrate the runtime graph from that same shape; the server-side file watcher should monitor only the currently open file, emit reload notifications when it changes, and let the client decide between immediate reload and dirty-session conflict handling.",
  "How should graph evaluation work? Node-type evaluation should live with the graph model, not the canvas, so `getValue(graph, nodeName, handleName?)`-style resolution can read local payloads, follow incoming edges, and report missing, ambiguous, or cyclic results without guessing; React Flow should never be the source of truth for this logic.",
  "What migration path should the implementation follow? Start inside the current `agent-workbench-ui` and `agent-workbench-server` packages by extracting shared runtime graph types, naming rules, adjacency helpers, and evaluation utilities from the existing screen and store code; keep dirty tracking and reload policy in the UI-owned runtime graph store during that first step while the server continues to own file IO and file-watch notifications; then move React Flow rendering to consume that runtime graph projection; then move persistence and file-watch handling behind explicit adapters; and finally split the codebase toward the target hierarchy of `packages/agent-workbench-core`, `packages/agent-workbench-ui`, `packages/agent-workbench-server`, and `packages/agent-workbench-protocol` as an intended end state rather than as a claim about current repository shape.",
);

const WorkbenchRuntimeGraph = define.system("WorkbenchRuntimeGraph");
const WorkbenchDocumentRecord = define.document("WorkbenchDocumentRecord");
const WorkbenchNodeRecord = define.document("WorkbenchNodeRecord");
const WorkbenchEdgeRecord = define.document("WorkbenchEdgeRecord");
const WorkbenchHandleRecord = define.document("WorkbenchHandleRecord");
const WorkbenchIdentityScope = define.concept("WorkbenchIdentityScope");
const WorkbenchConnectionCardinality = define.concept("WorkbenchConnectionCardinality");
const WorkbenchNodeValueContract = define.concept("WorkbenchNodeValueContract");
const WorkbenchValueResolutionResult = define.concept("WorkbenchValueResolutionResult");
const WorkbenchFileWatchEvent = define.event("WorkbenchFileWatchEvent");
const WorkbenchReloadState = define.concept("WorkbenchReloadState");
const WorkbenchReloadDecision = define.concept("WorkbenchReloadDecision");
const ReactFlowAdapterState = define.system("ReactFlowAdapterState");

Section.contracts.answers(
  "What exact runtime graph shape exists? The runtime session owns one `WorkbenchRuntimeGraph` that contains the editable node set, edge set, handle set, viewport, loaded source identity, revision tracking, dirty state, pending external-change state, and derived adjacency needed for value resolution; it is authoritative while the workbench is open, while the persisted `.workbench.ts` document is only the serialized snapshot used for load and save, and React Flow is a transient projection that may be rebuilt from the runtime graph at any time.",
  "What exact identity and connection contracts exist? `WorkbenchIdentityScope` is the loaded workbench document: within that scope, every persisted node name is unique across nodes, every persisted edge name is unique across edges, and every persisted handle name is unique within its owning node. Semantic names are the authored identity for all persisted graph entities; technical ids may exist only for adapter bookkeeping and must not be the identity used by graph logic or persistence references.",
  "What exact value-resolution, connection-cardinality, and geometry contracts exist? `getValue(graph, nodeName, handleName?)` resolves a node's local authored value first, then follows the unique incoming connection for the requested handle when the handle is connected; zero incoming connections yield either a node default or an explicit missing-connection result, exactly one incoming connection resolves normally, and more than one incoming connection is invalid unless the node type explicitly declares multi-input aggregation. Persisted width and height are valid only when they are finite and strictly positive; zero, negative, NaN, or missing dimensions are treated as absent at load time and replaced with canonical node-type defaults so the runtime graph can never recreate invisible `0x0` nodes.",
  "What exact persistence and reload contracts exist? The durable artifact remains one `.workbench.ts` snapshot per workbench file, the snapshot stores semantic graph content plus persisted layout but never runtime-only adapter state, and the currently open file's watch event must identify the file, change kind, and revision or hash. Reload decisions are exact: clean sessions may auto-reload the external snapshot, dirty sessions must surface a prompt or conflict state, deleted or renamed sources must surface a missing-source state, and no external file change may silently overwrite unsaved local runtime state.",
);

WorkbenchRuntimeGraphBlueprint.defines(`
- WorkbenchRuntimeGraph means the authoritative in-session graph store containing nodes, edges, handles, viewport, loaded source identity, revision tracking, dirty state, pending external-change state, and derived adjacency needed for value resolution; it is the runtime truth while the workbench is open.
- WorkbenchDocumentRecord means the persisted snapshot written to and read from `.workbench.ts`; it stores semantic graph content and layout, but never runtime-only adapter state, and it is only authoritative across sessions or after an explicit reload.
- WorkbenchIdentityScope means the uniqueness boundary for authored names: semantic names are the authored identity for all persisted graph entities, each node name is unique across the document, each edge name is unique across the document, and each handle name is unique within its owning node.
- WorkbenchNodeRecord means one persisted semantic node record with stable unique name, node type, authored payload, and layout; its width and height are valid only when they are finite and strictly positive.
- WorkbenchEdgeRecord means one persisted semantic edge record with stable unique name, source node name, source handle name, target node name, target handle name, and optional label or relation metadata.
- WorkbenchHandleRecord means one first-class persisted semantic handle record with stable unique name within its owning node, owner node name, semantic direction, and optional label; any edge-referenced handle must resolve by name when the runtime graph is hydrated.
- WorkbenchConnectionCardinality means the exact incoming-connection cases for a handle: zero, one, many, and explicit multi-input aggregation.
- WorkbenchNodeValueContract means the exact runtime rule for node value lookup: local authored values come from the node record, connected values come from the unique incoming edge for the requested handle, and graph evaluation must not guess through missing, ambiguous, or cyclic connections.
- WorkbenchValueResolutionResult means the exact outcome space for value lookup, including success, missing node, missing handle, missing connection, ambiguous connection, cyclic dependency, and invalid persisted geometry.
- WorkbenchFileWatchEvent means the websocket or equivalent event emitted when the currently open workbench file changes on disk, with exact fields for workbench id, file path, change kind, revision or hash, and timestamp; it applies only to the open file, not the wider workspace.
- WorkbenchReloadState means the observable reload state of the open session, including clean, dirty, reloading, conflict, and missingSource states.
- WorkbenchReloadDecision means the exact client action chosen in response to a file-watch event, including autoReload, promptUser, keepLocal, adoptRemote, defer, or missingSource.
- ReactFlowAdapterState means the derived node and edge projection used by React Flow for rendering and interaction only; it is not durable truth and may be reconstructed from the runtime graph at any time.
`);

when(WorkbenchDocumentRecord.writesTo(".workbench.ts"))
  .then(WorkbenchDocumentRecord.preserves("semantic node names"))
  .and(WorkbenchDocumentRecord.preserves("semantic edge names"))
  .and(WorkbenchDocumentRecord.preserves("semantic handle names"))
  .and(WorkbenchDocumentRecord.preserves("layout positions and viewport"))
  .and(WorkbenchDocumentRecord.forbids("runtime-only adapter state, dirty flags, loaded source state, or React Flow internals"));

when(WorkbenchDocumentRecord.loadsFrom(".workbench.ts"))
  .then(WorkbenchNodeRecord.requires("finite positive width and height before geometry enters the runtime graph"))
  .and(WorkbenchNodeRecord.forbids("zero, negative, NaN, or missing dimensions from being recreated as visible geometry"))
  .and(WorkbenchHandleRecord.requires("matching names for all edge-referenced handles"))
  .and(WorkbenchRuntimeGraph.requires("canonical default geometry whenever persisted size is invalid"))
  .and(WorkbenchRuntimeGraph.forbids("recreating invisible nodes from invalid persisted geometry"));

when(WorkbenchNodeValueContract.looksUp("a handle with incoming connections"))
  .then(WorkbenchConnectionCardinality.requires("zero incoming edges to yield either a node default or missing-connection"))
  .and(WorkbenchConnectionCardinality.requires("exactly one incoming edge to yield that source value"))
  .and(WorkbenchConnectionCardinality.forbids("more than one incoming edge unless the handle explicitly declares multi-input aggregation"))
  .and(WorkbenchValueResolutionResult.forbids("silent fan-in selection"));

when(WorkbenchNodeValueContract.detects("a cycle"))
  .then(WorkbenchValueResolutionResult.requires("an explicit cyclic dependency result"))
  .and(WorkbenchValueResolutionResult.forbids("infinite recursion or silent partial values"));

when(WorkbenchFileWatchEvent.emits("for the currently open file"))
  .then(WorkbenchFileWatchEvent.expects("workbench id or name"))
  .and(WorkbenchFileWatchEvent.expects("file path"))
  .and(WorkbenchFileWatchEvent.expects("change kind"))
  .and(WorkbenchFileWatchEvent.expects("revision or hash"))
  .and(WorkbenchFileWatchEvent.expects("timestamp"))
  .and(WorkbenchFileWatchEvent.forbids("events for unrelated files from mutating the open session"));

when(WorkbenchReloadState.sees("clean"))
  .then(WorkbenchReloadDecision.allows("autoReload"))
  .and(WorkbenchReloadDecision.forbids("promptUser"));

when(WorkbenchReloadState.sees("dirty"))
  .then(WorkbenchReloadDecision.requires("promptUser"))
  .and(WorkbenchReloadDecision.forbids("silent overwrite of local runtime state"));

when(WorkbenchReloadState.sees("deleted or renamed source"))
  .then(WorkbenchReloadDecision.requires("missingSource"));

when(WorkbenchReloadDecision.allows("autoReload"))
  .then(WorkbenchRuntimeGraph.requires("a clean in-session graph or an explicit discard-local choice first"))
  .and(WorkbenchRuntimeGraph.forbids("preserving stale runtime geometry from invalid persisted sizes"));

when(ReactFlowAdapterState.exists())
  .then(ReactFlowAdapterState.requires("projection from the runtime graph"))
  .and(ReactFlowAdapterState.forbids("becoming the authoritative model for node values, reload state, or persisted geometry"));
