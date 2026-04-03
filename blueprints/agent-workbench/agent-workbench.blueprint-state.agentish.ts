/// <reference path="../_agentish.d.ts" />

// Agent Workbench Blueprint State

const Agentish = define.language("Agentish");

const AgentWorkbenchBlueprintState = define.system("AgentWorkbenchBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Agent Workbench blueprints",
});

const Assessment = {
  status: define.concept("CurrentImplementationStatus"),
  confidence: define.concept("AssessmentConfidence"),
  evidence: define.concept("ImplementationEvidence"),
  gap: define.concept("ImplementationGap"),
  plannedFiles: define.concept("PlannedFiles"),
};

const CurrentReality = {
  sharedDataPersistence: define.concept("SharedDataPersistence"),
  hostOwnedCanvas: define.concept("HostOwnedCanvas"),
  localRegistryOnly: define.concept("LocalRegistryOnly"),
  directNodeMenu: define.concept("DirectWorkbenchNodeMenu"),
  missingPluginRegistration: define.concept("MissingPluginRegistration"),
  missingAgentChatNode: define.concept("MissingAgentChatNode"),
  verificationBaseline: define.concept("VerificationBaseline"),
};

AgentWorkbenchBlueprintState.defines(`
- CurrentImplementationStatus means the current Workbench implementation already persists canonical \
  documents under workspace/data/workbench, renders through the shared dashboard shell, and supports a \
  searchable add-node menu for host-owned node types.
- AssessmentConfidence is medium because this state is grounded in direct source inspection of the current \
  worker branch plus recent verified save/load behavior for Workbench documents, but the plugin-registered \
  node-type architecture has not been implemented yet.
- ImplementationEvidence includes packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx, \
  packages/agent-workbench-ui/src/workbench-node-types.ts, packages/agent-workbench-protocol/src/index.ts, \
  packages/agent-workbench-server/src/workbench-store.ts, and the existing worker-local save/load \
  verification artifacts from earlier Workbench persistence work.
- ImplementationGap means Workbench node types are still hosted through Workbench-local registration \
  logic rather than through feature-owned plugin registration, and there is no agent-chat node yet.
- PlannedFiles means this implementation pass is expected to touch the Workbench protocol, Workbench UI \
  registry host, dashboard/plugin bootstrap, and new Agent Chat UI node-rendering files.
`);

AgentWorkbenchBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.plannedFiles,
  CurrentReality.sharedDataPersistence,
  CurrentReality.hostOwnedCanvas,
  CurrentReality.localRegistryOnly,
  CurrentReality.directNodeMenu,
  CurrentReality.missingPluginRegistration,
  CurrentReality.missingAgentChatNode,
  CurrentReality.verificationBaseline,
);

CurrentReality.sharedDataPersistence.means(`
- packages/agent-workbench-server/src/workbench-store.ts persists canonical .workbench.ts documents under
  workspace/data/workbench rather than under the runtime checkout
- recent verification already proved that saved node content round-trips through disk, API load, and UI reload
`);

CurrentReality.hostOwnedCanvas.means(`
- packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx owns the React Flow canvas, floating Workbench
  Files window integration, save triggers, and add-node interaction
- Workbench still owns placement and persisted geometry for all node records
`);

CurrentReality.localRegistryOnly.means(`
- packages/agent-workbench-ui/src/workbench-node-types.ts currently acts as a Workbench-local registry for
  host-owned node types such as text and int
- the registry is not yet feature-extensible and is not yet populated through dashboard plugin loading
`);

CurrentReality.directNodeMenu.means(`
- the current Workbench add-node flow already opens a searchable menu on double click
- the menu defaults to text and supports ArrowDown and ArrowUp selection through visible results
- this behavior exists inside Workbench UI only and does not yet allow feature packages to contribute node types
`);

CurrentReality.missingPluginRegistration.means(`
- no shared registration contract currently allows a feature package such as agent-chat-ui to register a
  Workbench node type when the plugin loads
- dashboard/plugin bootstrap does not yet wire feature-owned node registration into the Workbench host
`);

CurrentReality.missingAgentChatNode.means(`
- there is no persisted agent-chat workbench node record in packages/agent-workbench-protocol/src/index.ts
- there is no Agent Chat Workbench node renderer, session selector node header, or embedded thread-view node body
- AgentWorkbench cannot yet render or persist a node that references an Agent Chat session
`);

CurrentReality.verificationBaseline.means(`
- Workbench save/load persistence has already been verified separately before this ticket
- this ticket still needs bounded verification for plugin-registered node discovery, agent-chat node creation,
  session switching inside the node, and save/load persistence of the selected session id
`);

when(CurrentReality.sharedDataPersistence.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.localRegistryOnly.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.gap));

when(CurrentReality.missingPluginRegistration.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.gap));

when(CurrentReality.missingAgentChatNode.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.gap));

Assessment.plannedFiles.means(`
- expected files include packages/agent-workbench-protocol/src/index.ts
- expected files include packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx and the Workbench registry host modules
- expected files include dashboard/plugin bootstrap files that can register Workbench node types at feature load time
- expected files include new or extracted Agent Chat UI components for the agent-chat Workbench node renderer,
  compact session selector, and thread view
`);
