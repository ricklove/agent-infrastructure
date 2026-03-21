import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type {
  BoardFile,
  SourceDocument,
  SourceEdge,
  SourceNode,
  SourceWorkspace,
  WorkspaceState,
} from "@agent-infrastructure/agent-graph-core";

export const DEFAULT_AGENT_GRAPH_BOARD_PATH =
  process.env.AGENT_GRAPH_BOARD_PATH ??
  "/home/ec2-user/workspace/projects/agent-infrastructure/blueprints/agent-graph/agent-graph.board.json";

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

type LoadedBoard = {
  boardPath: string;
  boardFile: BoardFile;
  sourceWorkspace: SourceWorkspace;
  workspaceState: WorkspaceState;
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

function extractObjectDefinitions(args: {
  source: string;
  documentLabel: string;
}): ExtractedDefinition[] {
  const { source, documentLabel } = args;
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

function extractTopLevelDefinitions(args: {
  source: string;
  documentLabel: string;
}): ExtractedDefinition[] {
  const { source, documentLabel } = args;
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
  documentId: string,
): SourceEdge[] {
  const knownReferences = new Set(nodesByReference.keys());
  const edges: SourceEdge[] = [];
  const seen = new Set<string>();

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

    for (const targetReference of extractReferencedTargets(callArgs, knownReferences)) {
      if (targetReference === subjectReference) {
        continue;
      }

      const target = nodesByReference.get(targetReference);
      if (!target) {
        continue;
      }

      const edgeKey = `${documentId}:${subject.id}:${relationship}:${target.id}`;
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
      const nodeId = `detail-${toId(`${document.id}-${subjectReference}-${relationship}-${index}`)}`;
      nodes.push({
        id: nodeId,
        documentId: document.id,
        label: entry,
        kind: "detail",
        summary: `Detail from ${subjectReference}.${relationship}`,
        sourcePath: `${document.label}/${section}`,
      });
      edges.push({
        id: `edge-${toId(`${document.id}-${subject.id}-${relationship}-${nodeId}`)}`,
        sourceId: subject.id,
        targetId: nodeId,
        kind: relationship,
        label: relationship.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(),
      });
    }
  }

  return { nodes, edges };
}

async function loadSourceDocumentGraph(documentPath: string, relativePath: string): Promise<{
  document: SourceDocument;
  nodes: SourceNode[];
  edges: SourceEdge[];
}> {
  const source = await readFile(documentPath, "utf8");
  const document: SourceDocument = {
    id: `doc-${toId(relativePath)}`,
    label: basename(documentPath),
    path: documentPath,
  };

  const definitionMap = new Map<string, ExtractedDefinition>();
  for (const definition of [
    ...extractTopLevelDefinitions({ source, documentLabel: document.label }),
    ...extractObjectDefinitions({ source, documentLabel: document.label }),
  ]) {
    definitionMap.set(definition.reference, definition);
  }

  const nodes = [...definitionMap.values()].map<SourceNode>((definition) => ({
    id: toId(`${document.id}:${definition.reference}`),
    documentId: document.id,
    label: definition.label,
    kind: definition.kind,
    summary: summarize(definition.kind, definition.reference, definition.label),
    sourcePath: definition.sourcePath,
  }));

  const nodesByReference = new Map<string, SourceNode>();
  for (const definition of definitionMap.values()) {
    const node = nodes.find(
      (candidate) => candidate.id === toId(`${document.id}:${definition.reference}`),
    );
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
    document,
    nodes: [...nodes, ...detailGraph.nodes],
    edges: [
      ...extractRelationshipEdges(source, nodesByReference, document.id),
      ...detailGraph.edges,
    ],
  };
}

function isBoardFile(value: unknown): value is BoardFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BoardFile>;
  return (
    candidate.kind === "agent-graph-board" &&
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    Array.isArray(candidate.documents) &&
    typeof candidate.revision === "number" &&
    Array.isArray(candidate.layers)
  );
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

export function boardFileWithWorkspaceState(
  boardFile: BoardFile,
  workspaceState: WorkspaceState,
): BoardFile {
  return {
    ...boardFile,
    revision: workspaceState.revision,
    layers: workspaceState.layers,
    nodePositions: workspaceState.nodePositions,
    pinnedNodeIds: workspaceState.pinnedNodeIds,
  };
}

export async function loadAgentishBoard(
  boardPath = DEFAULT_AGENT_GRAPH_BOARD_PATH,
): Promise<LoadedBoard> {
  const rawBoard = JSON.parse(await readFile(boardPath, "utf8")) as unknown;
  if (!isBoardFile(rawBoard)) {
    throw new Error(`Invalid agent graph board file: ${boardPath}`);
  }

  const boardFile = rawBoard;
  const boardDir = dirname(boardPath);
  const loadedDocuments = await Promise.all(
    boardFile.documents.map(async (relativePath) =>
      loadSourceDocumentGraph(resolve(boardDir, relativePath), relativePath),
    ),
  );

  const sourceWorkspace: SourceWorkspace = {
    id: boardFile.id,
    label: boardFile.label,
    revision: boardFile.revision,
    documents: loadedDocuments.map((entry) => entry.document),
    nodes: loadedDocuments.flatMap((entry) => entry.nodes),
    edges: loadedDocuments.flatMap((entry) => entry.edges),
  };

  const workspaceState = normalizeWorkspaceState(sourceWorkspace, {
    rootId: boardFile.id,
    revision: boardFile.revision,
    layers: boardFile.layers,
    nodePositions: boardFile.nodePositions ?? {},
    pinnedNodeIds: boardFile.pinnedNodeIds ?? [],
  });

  return {
    boardPath,
    boardFile: boardFileWithWorkspaceState(boardFile, workspaceState),
    sourceWorkspace,
    workspaceState,
  };
}
