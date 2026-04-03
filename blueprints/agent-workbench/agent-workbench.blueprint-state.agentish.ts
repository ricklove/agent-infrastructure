/// <reference path="../_agentish.d.ts" />

// Agent Workbench Blueprint State

const Agentish = define.language("Agentish");

const AgentWorkbenchBlueprintState = define.system("AgentWorkbenchBlueprintState", {
  format: Agentish,
  role: "Current implementation comparison for the Agent Workbench blueprints, including plugin-registered node types",
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
  pluginRegistryHost: define.concept("PluginRegistryHost"),
  searchableNodeMenu: define.concept("SearchableWorkbenchNodeMenu"),
  registeredAgentChatNode: define.concept("RegisteredAgentChatNode"),
  verificationBaseline: define.concept("VerificationBaseline"),
};

AgentWorkbenchBlueprintState.defines(`
- CurrentImplementationStatus means the current Workbench implementation persists canonical \
  documents under workspace/data/workbench, renders through the shared dashboard shell, supports a \
  searchable add-node menu, and now accepts plugin-registered node types through dashboard composition.
- AssessmentConfidence is high because this state is grounded in direct source inspection of the current \
  worker branch plus passing worker-local package-local agent-browser checks for route load, menu open, \
  default text creation, int creation, and agent-chat node creation.
- ImplementationEvidence includes packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx, \
  packages/agent-workbench-ui/src/workbench-node-types.ts, packages/agent-workbench-protocol/src/index.ts, \
  packages/dashboard-ui/src/feature-plugins.ts, packages/agent-chat-ui/src/workbench-node.tsx, \
  packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts, and the worker-local \
  verification artifact /home/ec2-user/temp/worker-agent-chat-workbench-node.png.
- ImplementationGap means this pass does not yet prove persisted reload of the selected agent-chat sessionId \
  through a full save/load cycle, and the node-registration path is currently composed in dashboard-ui rather \
  than through a more generalized plugin discovery layer.
- PlannedFiles means the current implementation pass touched the Workbench protocol, Workbench UI host, \
  dashboard plugin composition, Agent Chat node rendering files, and package-local agent-browser verification.
`);

AgentWorkbenchBlueprintState.contains(
  Assessment.status,
  Assessment.confidence,
  Assessment.evidence,
  Assessment.gap,
  Assessment.plannedFiles,
  CurrentReality.sharedDataPersistence,
  CurrentReality.hostOwnedCanvas,
  CurrentReality.pluginRegistryHost,
  CurrentReality.searchableNodeMenu,
  CurrentReality.registeredAgentChatNode,
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

CurrentReality.pluginRegistryHost.means(`
- packages/agent-workbench-ui/src/workbench-node-types.ts now provides merge/sort/filter utilities for a host-owned
  registry that can be extended with feature-provided definitions
- packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx accepts nodeTypeDefinitions as screen props and merges
  built-in types with feature-provided node types at render time
- packages/dashboard-ui/src/feature-plugins.ts now injects feature-owned Workbench node definitions through the
  composed Workbench plugin getProps path
`);

CurrentReality.searchableNodeMenu.means(`
- the current Workbench add-node flow opens a searchable menu on double click or two rapid pane clicks
- the menu defaults to text, Enter creates the selected type, and ArrowDown / ArrowUp cycle through visible results
- package-local worker verification now proves menu open, default text creation, and int creation through the real
  agent-browser harness in packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts
`);

CurrentReality.registeredAgentChatNode.means(`
- packages/agent-workbench-protocol/src/index.ts now defines the shared Workbench node registration contract and the
  persisted WorkbenchAgentChatNodeRecord shape
- packages/agent-chat-ui/src/workbench-node.tsx exports the feature-owned agent-chat node definition with searchable
  metadata, compact session selector header, and embedded thread view body
- packages/dashboard-ui/src/feature-plugins.ts now composes the agent-chat Workbench node into the Workbench plugin
  through screen.getProps so the rendered Workbench node menu includes Agent Chat alongside text and int
`);

CurrentReality.verificationBaseline.means(`
- Workbench save/load persistence had already been verified separately before this ticket
- this pass now verifies plugin-registered node discovery, agent-chat node creation, and rendered in-node session
  thread view through package-local agent-browser checks plus the worker-local verification screenshot
- this ticket still does not fully prove a persisted reload of selected agent-chat sessionId through a save/load cycle
`);

when(CurrentReality.sharedDataPersistence.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.pluginRegistryHost.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.registeredAgentChatNode.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.verificationBaseline.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.gap));

Assessment.plannedFiles.means(`
- touched files include packages/agent-workbench-protocol/src/index.ts
- touched files include packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx and packages/agent-workbench-ui/src/workbench-node-types.ts
- touched files include packages/dashboard-ui/src/feature-plugins.ts for composed Workbench node registration
- touched files include packages/agent-chat-ui/src/workbench-node.tsx for the feature-owned agent-chat node renderer
- touched files include packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts for package-local browser verification
`);
