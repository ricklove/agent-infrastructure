import type { LayerDefinition, SourceWorkspace, WorkspaceState } from "./types.js";

const agentGraphBlueprintPath =
  (((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
    {})["AGENT_GRAPH_BLUEPRINT_PATH"]) ??
  "/home/ec2-user/workspace/projects/agent-infrastructure/blueprints/agent-graph/agent-graph.agentish.ts";

export function createSampleSourceWorkspace(): SourceWorkspace {
  return {
    id: "agent-graph",
    label: "Agent Graph Workspace",
    revision: 1,
    documents: [
      {
        id: "doc-agent-graph",
        label: "Agent Graph Blueprint",
        path: agentGraphBlueprintPath,
      },
    ],
    nodes: [
      {
        id: "family-comprehension",
        documentId: "doc-agent-graph",
        label: "Whole-System Comprehension",
        kind: "scenario-family",
        summary: "Understand the complete multi-document graph and trust its completeness.",
      },
      {
        id: "family-compose",
        documentId: "doc-agent-graph",
        label: "View Composition",
        kind: "scenario-family",
        summary: "Compose persistent semantic slices and compare them together.",
      },
      {
        id: "family-inspection",
        documentId: "doc-agent-graph",
        label: "Graph-Native Inspection",
        kind: "scenario-family",
        summary: "Inspect local and hidden context without source text.",
      },
      {
        id: "family-editing",
        documentId: "doc-agent-graph",
        label: "Safe Editing",
        kind: "scenario-family",
        summary: "Perform trusted edits from visible graph layers.",
      },
      {
        id: "family-change",
        documentId: "doc-agent-graph",
        label: "Trust Under Change",
        kind: "scenario-family",
        summary: "Understand external changes and conflicts through graph-native diff.",
      },
      {
        id: "component-screen",
        documentId: "doc-agent-graph",
        label: "AgentGraphScreen",
        kind: "component",
        summary: "Composes the screen layout and panels.",
      },
      {
        id: "component-canvas",
        documentId: "doc-agent-graph",
        label: "AgentGraphCanvas",
        kind: "component",
        summary: "Owns the React Flow plane and renderers.",
      },
      {
        id: "component-layers",
        documentId: "doc-agent-graph",
        label: "LayerWorkspacePanel",
        kind: "component",
        summary: "Manages layers and their arrangement.",
      },
      {
        id: "component-inspector",
        documentId: "doc-agent-graph",
        label: "InspectorPanel",
        kind: "component",
        summary: "Owns selection details, rename, and connect flows.",
      },
      {
        id: "component-diff",
        documentId: "doc-agent-graph",
        label: "DiffPanel",
        kind: "component",
        summary: "Explains change and diff layers.",
      },
      {
        id: "contract-workspace",
        documentId: "doc-agent-graph",
        label: "WorkspaceSnapshot",
        kind: "contract",
        summary: "Open workspace and layer persistence context.",
      },
      {
        id: "contract-graph",
        documentId: "doc-agent-graph",
        label: "GraphSnapshot",
        kind: "contract",
        summary: "Complete projected graph for the current revision.",
      },
      {
        id: "contract-diff",
        documentId: "doc-agent-graph",
        label: "GraphDiffSnapshot",
        kind: "contract",
        summary: "Old, new, and changed-only comparison state.",
      },
      {
        id: "contract-validation",
        documentId: "doc-agent-graph",
        label: "ValidationPayload",
        kind: "contract",
        summary: "Accepted or rejected edit with graph-native explanation.",
      },
      {
        id: "runtime-browser",
        documentId: "doc-agent-graph",
        label: "BrowserClient",
        kind: "runtime",
        summary: "Runs React and React Flow for the graph workspace.",
      },
      {
        id: "runtime-server",
        documentId: "doc-agent-graph",
        label: "BunGraphServer",
        kind: "runtime",
        summary: "Authoritative server for snapshots, validation, and persistence.",
      },
      {
        id: "runtime-filesystem",
        documentId: "doc-agent-graph",
        label: "WorkspaceFilesystem",
        kind: "runtime",
        summary: "Authoritative persistence layer for source and workspace sidecar state.",
      },
      {
        id: "workspace-op-reveal",
        documentId: "doc-agent-graph",
        label: "Reveal Hidden Context",
        kind: "workspace-op",
        summary: "Expands hidden context into temporary workspace state.",
      },
    ],
    edges: [
      {
        id: "edge-comp-1",
        sourceId: "family-comprehension",
        targetId: "component-screen",
        kind: "supports",
        label: "screen supports comprehension",
      },
      {
        id: "edge-comp-2",
        sourceId: "family-compose",
        targetId: "component-layers",
        kind: "supports",
        label: "layers support composition",
      },
      {
        id: "edge-comp-3",
        sourceId: "family-inspection",
        targetId: "component-inspector",
        kind: "supports",
        label: "inspector supports inspection",
      },
      {
        id: "edge-comp-4",
        sourceId: "family-change",
        targetId: "component-diff",
        kind: "supports",
        label: "diff panel supports trust under change",
      },
      {
        id: "edge-comp-5",
        sourceId: "component-screen",
        targetId: "component-canvas",
        kind: "contains",
        label: "screen contains canvas",
      },
      {
        id: "edge-comp-6",
        sourceId: "component-screen",
        targetId: "component-layers",
        kind: "contains",
        label: "screen contains layer workspace panel",
      },
      {
        id: "edge-comp-7",
        sourceId: "component-screen",
        targetId: "component-inspector",
        kind: "contains",
        label: "screen contains inspector",
      },
      {
        id: "edge-comp-8",
        sourceId: "component-screen",
        targetId: "component-diff",
        kind: "contains",
        label: "screen contains diff panel",
      },
      {
        id: "edge-contract-1",
        sourceId: "component-canvas",
        targetId: "contract-graph",
        kind: "depends-on",
        label: "canvas depends on graph snapshot",
      },
      {
        id: "edge-contract-2",
        sourceId: "component-layers",
        targetId: "contract-workspace",
        kind: "depends-on",
        label: "layers depend on workspace snapshot",
      },
      {
        id: "edge-contract-3",
        sourceId: "component-inspector",
        targetId: "contract-validation",
        kind: "depends-on",
        label: "inspector depends on validation payload",
      },
      {
        id: "edge-contract-4",
        sourceId: "component-diff",
        targetId: "contract-diff",
        kind: "depends-on",
        label: "diff panel depends on graph diff snapshot",
      },
      {
        id: "edge-runtime-1",
        sourceId: "component-canvas",
        targetId: "runtime-browser",
        kind: "implements",
        label: "canvas runs in browser client",
      },
      {
        id: "edge-runtime-2",
        sourceId: "contract-workspace",
        targetId: "runtime-server",
        kind: "implements",
        label: "workspace snapshot served by server",
      },
      {
        id: "edge-runtime-3",
        sourceId: "runtime-server",
        targetId: "runtime-filesystem",
        kind: "depends-on",
        label: "server persists through workspace filesystem",
      },
      {
        id: "edge-trace-1",
        sourceId: "family-editing",
        targetId: "workspace-op-reveal",
        kind: "traces-to",
        label: "editing may require hidden context reveal",
      },
      {
        id: "edge-trace-2",
        sourceId: "workspace-op-reveal",
        targetId: "component-inspector",
        kind: "supports",
        label: "reveal hidden context enters inspection flow",
      },
    ],
  };
}

export function createInitialWorkspaceState(): WorkspaceState {
  const layers: LayerDefinition[] = [
    {
      id: "layer-overview",
      label: "Overview",
      kind: "overview",
      nodeIds: [
        "family-comprehension",
        "family-compose",
        "family-inspection",
        "family-editing",
        "family-change",
      ],
      visible: true,
      x: 40,
      y: 40,
      derivedFromLayerId: null,
    },
  ];

  return {
    rootId: "agent-graph",
    revision: 1,
    layers,
    nodePositions: {},
    pinnedNodeIds: [],
  };
}
