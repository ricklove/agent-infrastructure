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
  searchable add-node menu, accepts plugin-registered node types through dashboard composition, and \
  now hosts the canonical reusable Agent Chat session surface inside the feature-owned agent-chat node.
- AssessmentConfidence is high because this state is grounded in direct source inspection of the current \
  implementation plus worker-local build, lint, targeted package verification, worker-local route startup, \
  and worker-local agent-browser verification with screenshot capture.
- ImplementationEvidence includes packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx, \
  packages/agent-workbench-ui/src/workbench-node-types.ts, packages/agent-workbench-protocol/src/index.ts, \
  packages/dashboard-ui/src/feature-plugins.ts, packages/agent-chat-ui/src/AgentChatScreen.tsx, \
  packages/agent-chat-ui/src/workbench-node.tsx, and packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts.
- ImplementationGap means the current code still uses dashboard-ui as the explicit composition seam for \
  feature-owned Workbench node registration and has not yet proven a full save/load reload round trip for \
  persisted selected agent-chat session ids after a canonical node is saved and reloaded from disk.
- PlannedFiles means this implementation pass touched reusable Agent Chat UI view logic, the Workbench node \
  wrapper, blueprint-state files, and package-local agent-browser verification.
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
- prior verification had already proved saved node content round-trips through disk, API load, and UI reload
`);

CurrentReality.hostOwnedCanvas.means(`
- packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx owns the React Flow canvas, floating Workbench
  Files window integration, save triggers, add-node interaction, and persisted node geometry
- Workbench still owns placement and persisted geometry for all node records, including projected nodes
`);

CurrentReality.pluginRegistryHost.means(`
- packages/agent-workbench-ui/src/workbench-node-types.ts provides merge/sort/filter utilities for a host-owned
  registry that can be extended with feature-provided definitions
- packages/agent-workbench-ui/src/AgentWorkbenchScreen.tsx accepts nodeTypeDefinitions as screen props and merges
  built-in types with feature-provided node types at render time
- packages/dashboard-ui/src/feature-plugins.ts injects feature-owned Workbench node definitions through the composed
  Workbench plugin getProps path
`);

CurrentReality.searchableNodeMenu.means(`
- the current Workbench add-node flow opens a searchable menu on double click or two rapid pane clicks
- the menu defaults to text, Enter creates the selected type, and ArrowDown / ArrowUp cycle through visible results
- worker-local package verification proved menu open, default text creation, int creation, and Agent Chat node
  creation through the real agent-browser harness in packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts
`);

CurrentReality.registeredAgentChatNode.means(`
- packages/agent-workbench-protocol/src/index.ts defines the shared Workbench node registration contract and the
  persisted WorkbenchAgentChatNodeRecord shape
- packages/agent-chat-ui/src/workbench-node.tsx exports the feature-owned agent-chat node definition and keeps the
  compact session selector in the node header
- packages/agent-chat-ui/src/AgentChatScreen.tsx now exports AgentChatWorkbenchSessionView, which reuses the
  canonical Agent Chat transcript and composer logic inside the Workbench node body rather than a separate bounded viewer
- composer drafts are namespaced per node instance through draftNamespace so multiple open agent-chat nodes do not
  share one draft buffer for the same session
`);

CurrentReality.verificationBaseline.means(`
- Workbench save/load persistence had already been verified separately before this ticket
- this ticket added worker-local verification that route load, two-click menu open, and searchable Agent Chat node
  creation all pass through the package-local agent-browser harness
- worker-local screenshot /home/ec2-user/temp/worker-agent-chat-canonical-workbench-node.png shows the canonical
  Agent Chat session surface rendered inside the Workbench node with the compact selector still in the node header
- persisted reload of selected agent-chat session ids after save/load still needs an explicit dedicated verification pass
`);

when(CurrentReality.sharedDataPersistence.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.pluginRegistryHost.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.registeredAgentChatNode.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence));

when(CurrentReality.verificationBaseline.exists())
  .then(AgentWorkbenchBlueprintState.records(Assessment.evidence))
  .and(AgentWorkbenchBlueprintState.records(Assessment.gap));

Assessment.plannedFiles.means(`
- expected files now include packages/agent-chat-ui/src/AgentChatScreen.tsx for reusable canonical embedded chat session rendering
- expected files include packages/agent-chat-ui/src/workbench-node.tsx for the feature-owned agent-chat node wrapper
- expected files include packages/agent-workbench-ui/src/AgentWorkbenchScreen.agent-browser.test.ts for package-local browser verification of the canonical node behavior
- expected files include blueprint-state updates that describe the move from a bounded viewer to canonical view reuse
`);
