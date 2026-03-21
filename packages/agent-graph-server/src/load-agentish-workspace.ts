import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { SourceDocument, SourceEdge, SourceNode, SourceWorkspace, WorkspaceState } from "@agent-infrastructure/agent-graph-core";

const AGENT_GRAPH_BLUEPRINT_PATH =
  process.env.AGENT_GRAPH_BLUEPRINT_PATH ??
  "/home/ec2-user/workspace/projects/agent-infrastructure/blueprints/agent-graph/agent-graph.agentish.ts";

function toId(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function summarize(kind: string, name: string, label: string): string {
  return `${kind} ${label} declared as ${name}`;
}

type ExtractedDefinition = {
  reference: string;
  label: string;
  kind: string;
  section: string;
  sourcePath: string;
};

function extractSections(source: string): Array<{ start: number; label: string }> {
  const sections: Array<{ start: number; label: string }> = [];
  for (const match of source.matchAll(/^\/\/\s+(.+)$/gm)) {
    const label = match[1]?.trim();
    if (!label || label.startsWith("/")) {
      continue;
    }
    sections.push({
      start: match.index ?? 0,
      label,
    });
  }
  return sections;
}

function sectionForIndex(
  sections: Array<{ start: number; label: string }>,
  index: number,
): string {
  let current = "top-level";
  for (const section of sections) {
    if (section.start > index) {
      break;
    }
    current = section.label;
  }
  return current;
}

function extractObjectDefinitions(source: string): ExtractedDefinition[] {
  const documentLabel = basename(AGENT_GRAPH_BLUEPRINT_PATH);
  const sections = extractSections(source);
  const definitions: ExtractedDefinition[] = [];
  for (const objectMatch of source.matchAll(/const\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*{([\s\S]*?)};/g)) {
    const objectName = objectMatch[1];
    const objectBody = objectMatch[2];
    for (const propertyMatch of objectBody.matchAll(
      /([A-Za-z][A-Za-z0-9]*)\s*:\s*define\.([A-Za-z][A-Za-z0-9]*)\("([^"]+)"/g,
    )) {
      const definitionIndex = (objectMatch.index ?? 0) + (propertyMatch.index ?? 0);
      const section = sectionForIndex(sections, definitionIndex);
      definitions.push({
        reference: `${objectName}.${propertyMatch[1]}`,
        kind: propertyMatch[2],
        label: propertyMatch[3],
        section,
        sourcePath: `${documentLabel}/${section}`,
      });
    }
  }
  return definitions;
}

function extractTopLevelDefinitions(source: string): ExtractedDefinition[] {
  const documentLabel = basename(AGENT_GRAPH_BLUEPRINT_PATH);
  const sections = extractSections(source);
  const definitions: ExtractedDefinition[] = [];
  for (const match of source.matchAll(
    /const\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*define\.([A-Za-z][A-Za-z0-9]*)\("([^"]+)"/g,
  )) {
    const section = sectionForIndex(sections, match.index ?? 0);
    definitions.push({
      reference: match[1],
      kind: match[2],
      label: match[3],
      section,
      sourcePath: `${documentLabel}/${section}`,
    });
  }
  return definitions;
}

function extractReferencedTargets(args: string, knownReferences: Set<string>): string[] {
  const rawRefs =
    args.match(/\b[A-Z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*\b/g) ?? [];
  return [...new Set(rawRefs.filter((ref) => knownReferences.has(ref)))];
}

function extractRelationshipEdges(
  source: string,
  nodesByReference: Map<string, SourceNode>,
): SourceEdge[] {
  const knownReferences = new Set(nodesByReference.keys());
  const edges: SourceEdge[] = [];
  const seen = new Set<string>();

  for (const match of source.matchAll(
    /([A-Z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\.([a-z][A-Za-zA-Z0-9]*)\(([\s\S]*?)\);/g,
  )) {
    const subjectReference = match[1];
    const relationship = match[2];
    const args = match[3];
    const subject = nodesByReference.get(subjectReference);
    if (!subject) {
      continue;
    }

    for (const targetReference of extractReferencedTargets(args, knownReferences)) {
      if (targetReference === subjectReference) {
        continue;
      }

      const target = nodesByReference.get(targetReference);
      if (!target) {
        continue;
      }

      const edgeKey = `${subject.id}:${relationship}:${target.id}`;
      if (seen.has(edgeKey)) {
        continue;
      }
      seen.add(edgeKey);
      edges.push({
        id: `edge-${toId(edgeKey)}`,
        sourceId: subject.id,
        targetId: target.id,
        kind: relationship,
        label: relationship.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(),
      });
    }
  }

  return edges;
}

function extractStringEntries(args: string): string[] {
  const entries: string[] = [];

  for (const match of args.matchAll(/`([\s\S]*?)`/g)) {
    const block = match[1] ?? "";
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      entries.push(line.startsWith("- ") ? line.slice(2).trim() : line);
    }
  }

  for (const match of args.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }
    entries.push(value);
  }

  return [...new Set(entries)];
}

function extractDetailNodesAndEdges(args: {
  source: string;
  document: SourceDocument;
  nodesByReference: Map<string, SourceNode>;
}): { nodes: SourceNode[]; edges: SourceEdge[] } {
  const { source, document, nodesByReference } = args;
  const sections = extractSections(source);
  const nodes: SourceNode[] = [];
  const edges: SourceEdge[] = [];

  for (const match of source.matchAll(
    /([A-Z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\.([a-z][A-Za-zA-Z0-9]*)\(([\s\S]*?)\);/g,
  )) {
    const subjectReference = match[1];
    const relationship = match[2];
    const callArgs = match[3];
    const subject = nodesByReference.get(subjectReference);
    if (!subject) {
      continue;
    }

    const strings = extractStringEntries(callArgs);
    if (strings.length === 0) {
      continue;
    }

    const section = sectionForIndex(sections, match.index ?? 0);
    for (const [index, entry] of strings.entries()) {
      const nodeId = `detail-${toId(`${subjectReference}-${relationship}-${index}`)}`;
      nodes.push({
        id: nodeId,
        documentId: document.id,
        label: entry,
        kind: "detail",
        summary: `Detail from ${subjectReference}.${relationship}`,
        sourcePath: `${document.label}/${section}`,
      });
      edges.push({
        id: `edge-${toId(`${subject.id}-${relationship}-${nodeId}`)}`,
        sourceId: subject.id,
        targetId: nodeId,
        kind: relationship,
        label: relationship.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(),
      });
    }
  }

  return { nodes, edges };
}

export async function loadAgentishSourceWorkspace(): Promise<SourceWorkspace> {
  const source = await readFile(AGENT_GRAPH_BLUEPRINT_PATH, "utf8");
  const document: SourceDocument = {
    id: "doc-agent-graph",
    label: basename(AGENT_GRAPH_BLUEPRINT_PATH),
    path: AGENT_GRAPH_BLUEPRINT_PATH,
  };

  const definitionMap = new Map<string, ExtractedDefinition>();
  for (const definition of [
    ...extractTopLevelDefinitions(source),
    ...extractObjectDefinitions(source),
  ]) {
    definitionMap.set(definition.reference, definition);
  }

  const nodes = [...definitionMap.values()].map<SourceNode>((definition) => ({
    id: toId(definition.reference),
    documentId: document.id,
    label: definition.label,
    kind: definition.kind,
    summary: summarize(definition.kind, definition.reference, definition.label),
    sourcePath: definition.sourcePath,
  }));

  const nodesByReference = new Map<string, SourceNode>();
  for (const definition of definitionMap.values()) {
    const node = nodes.find((candidate) => candidate.id === toId(definition.reference));
    if (node) {
      nodesByReference.set(definition.reference, node);
    }
  }

  const detailGraph = extractDetailNodesAndEdges({
    source,
    document,
    nodesByReference,
  });

  return {
    id: "agent-graph",
    label: "Agent Graph Workspace",
    revision: 1,
    documents: [document],
    nodes: [...nodes, ...detailGraph.nodes],
    edges: [...extractRelationshipEdges(source, nodesByReference), ...detailGraph.edges],
  };
}

export function createWorkspaceStateForSourceWorkspace(
  sourceWorkspace: SourceWorkspace,
): WorkspaceState {
  return {
    rootId: sourceWorkspace.id,
    revision: 1,
    layers: [
      {
        id: "layer-overview",
        label: "Overview",
        kind: "overview",
        nodeIds: sourceWorkspace.nodes.map((node) => node.id),
        visible: true,
        x: 40,
        y: 40,
        derivedFromLayerId: null,
      },
    ],
    nodePositions: {},
    pinnedNodeIds: [],
  };
}

export function normalizeWorkspaceState(
  sourceWorkspace: SourceWorkspace,
  workspaceState: WorkspaceState,
): WorkspaceState {
  const validNodeIds = new Set(sourceWorkspace.nodes.map((node) => node.id));
  const layers = workspaceState.layers
    .map((layer) => ({
      ...layer,
      nodeIds: layer.nodeIds.filter((nodeId) => validNodeIds.has(nodeId)),
    }))
    .filter((layer) => layer.nodeIds.length > 0);

  const nextLayers =
    layers.length > 0
      ? layers
      : createWorkspaceStateForSourceWorkspace(sourceWorkspace).layers;
  const validPinnedNodeIds = new Set(
    nextLayers.flatMap((layer) => layer.nodeIds.map((nodeId) => `${nodeId}::${layer.id}`)),
  );

  return {
    rootId: sourceWorkspace.id,
    revision: workspaceState.revision,
    layers: nextLayers,
    nodePositions: workspaceState.nodePositions ?? {},
    pinnedNodeIds: (workspaceState.pinnedNodeIds ?? []).filter((nodeId) =>
      validPinnedNodeIds.has(nodeId),
    ),
  };
}
