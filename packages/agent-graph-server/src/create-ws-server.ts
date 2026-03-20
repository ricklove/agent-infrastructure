import {
  buildCompleteGraph,
  buildDiffLayers,
  planSourceMutation,
  type GraphIntent,
} from "@agent-infrastructure/agent-graph-core";
import type { ClientMessage, ServerMessage } from "@agent-infrastructure/agent-graph-protocol";
import { applySourceMutation } from "./apply-source-mutation.js";
import type { DocumentRepository } from "./document-repository.js";
import { saveWorkspaceState } from "./workspace-state-repository.js";

function snapshotMessage(repository: DocumentRepository): ServerMessage {
  const sourceWorkspace = repository.getSourceWorkspace();
  const workspaceState = repository.getWorkspaceState();
  return {
    type: "server/connected",
    workspace: {
      workspace: {
        id: sourceWorkspace.id,
        label: sourceWorkspace.label,
        revision: sourceWorkspace.revision,
      },
      documents: sourceWorkspace.documents,
      nodes: sourceWorkspace.nodes,
      pinnedNodeIds: workspaceState.pinnedNodeIds,
      workspaceStateRevision: workspaceState.revision,
    },
    graph: buildCompleteGraph({
      sourceWorkspace,
      workspaceState,
    }),
    diff: buildDiffLayers({
      previous: repository.getPreviousSourceWorkspace(),
      current: sourceWorkspace,
      workspaceState,
    }),
  };
}

function addNodesToLayer(
  workspaceState: ReturnType<DocumentRepository["getWorkspaceState"]>,
  layerId: string,
  sourceNodeIds: string[],
): void {
  workspaceState.layers = workspaceState.layers.map((layer) =>
    layer.id === layerId
      ? {
          ...layer,
          nodeIds: [...new Set([...layer.nodeIds, ...sourceNodeIds])],
        }
      : layer,
  );
}

function parsePortalNodeId(
  portalNodeId: string,
): { direction: "incoming" | "outgoing"; sourceNodeId: string; layerId: string } | null {
  const match = /^portal:(incoming|outgoing):(.+?)::(.+)$/.exec(portalNodeId);
  if (!match) {
    return null;
  }

  const [, rawDirection, sourceNodeId, layerId] = match;
  if (!sourceNodeId || !layerId) {
    return null;
  }

  const direction = rawDirection === "incoming" ? "incoming" : "outgoing";
  return { direction, sourceNodeId, layerId };
}

function graphNodeId(sourceNodeId: string, layerId: string): string {
  return `${sourceNodeId}::${layerId}`;
}

async function applyWorkspaceIntent(repository: DocumentRepository, intent: GraphIntent): Promise<ServerMessage[]> {
  const workspaceState = structuredClone(repository.getWorkspaceState());

  switch (intent.kind) {
    case "clone-layer": {
      const layer = workspaceState.layers.find((candidate) => candidate.id === intent.layerId);
      if (!layer) {
        return [];
      }
      workspaceState.layers.push({
        ...layer,
        id: `layer-${Date.now()}`,
        label: `${layer.label} Copy`,
        x: layer.x + 520,
        y: layer.y + 40,
        derivedFromLayerId: layer.id,
      });
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "move-layer": {
      workspaceState.layers = workspaceState.layers.map((layer) =>
        layer.id === intent.layerId ? { ...layer, x: intent.x, y: intent.y } : layer,
      );
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "move-node": {
      workspaceState.nodePositions[intent.nodeId] = {
        x: intent.x,
        y: intent.y,
      };
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "set-node-pinned": {
      workspaceState.pinnedNodeIds = intent.pinned
        ? [...new Set([...workspaceState.pinnedNodeIds, intent.nodeId])]
        : workspaceState.pinnedNodeIds.filter((nodeId) => nodeId !== intent.nodeId);
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "toggle-layer-node": {
      workspaceState.layers = workspaceState.layers.map((layer) => {
        if (layer.id !== intent.layerId) {
          return layer;
        }
        return {
          ...layer,
          nodeIds: intent.include
            ? [...new Set([...layer.nodeIds, intent.sourceNodeId])]
            : layer.nodeIds.filter((nodeId) => nodeId !== intent.sourceNodeId),
        };
      });
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "toggle-layer-nodes": {
      const sourceNodeIdSet = new Set(intent.sourceNodeIds);
      workspaceState.layers = workspaceState.layers.map((layer) => {
        if (layer.id !== intent.layerId) {
          return layer;
        }
        return {
          ...layer,
          nodeIds: intent.include
            ? [...new Set([...layer.nodeIds, ...intent.sourceNodeIds])]
            : layer.nodeIds.filter((nodeId) => !sourceNodeIdSet.has(nodeId)),
        };
      });
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "reveal-hidden-context": {
      const portal = parsePortalNodeId(intent.portalNodeId);
      if (!portal) {
        return [];
      }

      const sourceWorkspace = repository.getSourceWorkspace();
      const revealedNodeIds = sourceWorkspace.edges
        .filter((edge) =>
          portal.direction === "incoming"
            ? edge.targetId === portal.sourceNodeId
            : edge.sourceId === portal.sourceNodeId,
        )
        .map((edge) =>
          portal.direction === "incoming" ? edge.sourceId : edge.targetId,
        );
      addNodesToLayer(workspaceState, portal.layerId, revealedNodeIds);
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace,
            workspaceState,
          }),
        },
      ];
    }
    case "reveal-hidden-node": {
      const portal = parsePortalNodeId(intent.portalNodeId);
      if (!portal) {
        return [];
      }

      addNodesToLayer(workspaceState, portal.layerId, [intent.hiddenNodeId]);
      const revealedGraphNodeId = graphNodeId(intent.hiddenNodeId, portal.layerId);
      if (intent.position && !workspaceState.nodePositions[revealedGraphNodeId]) {
        workspaceState.nodePositions[revealedGraphNodeId] = intent.position;
      }
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    case "reveal-connected-hidden-context": {
      const sourceWorkspace = repository.getSourceWorkspace();
      const revealedNodeIds = sourceWorkspace.edges.flatMap((edge) => {
        if (edge.sourceId === intent.sourceNodeId) {
          return [edge.targetId];
        }
        if (edge.targetId === intent.sourceNodeId) {
          return [edge.sourceId];
        }
        return [];
      });
      addNodesToLayer(workspaceState, intent.layerId, revealedNodeIds);
      workspaceState.revision += 1;
      repository.setWorkspaceState(workspaceState);
      await saveWorkspaceState(workspaceState);
      return [
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace,
            workspaceState,
          }),
        },
      ];
    }
    case "request-diff": {
      return [
        {
          type: "server/diff",
          diff: buildDiffLayers({
            previous: repository.getPreviousSourceWorkspace(),
            current: repository.getSourceWorkspace(),
            workspaceState,
          }),
        },
      ];
    }
    default:
      return [];
  }
}

export function createWsMessageHandler(repository: DocumentRepository) {
  return async function handleMessage(raw: string): Promise<ServerMessage[]> {
    const message = JSON.parse(raw) as ClientMessage;

    if (message.type === "client/hello") {
      return [snapshotMessage(repository)];
    }

    const intent = message.intent;
    if (
      intent.kind === "edit-node-meaning" ||
      intent.kind === "connect-visible-nodes"
    ) {
      const sourceWorkspace = repository.getSourceWorkspace();
      const plan = planSourceMutation({
        sourceWorkspace,
        intent,
      });

      if (!plan.ok) {
        return [
          { type: "server/validation", validation: plan.validation },
          { type: "server/conflict", conflict: plan.conflict },
        ];
      }

      repository.setPreviousSourceWorkspace(structuredClone(sourceWorkspace));
      const nextWorkspace = applySourceMutation({
        sourceWorkspace,
        mutation: plan.mutation,
      });
      repository.setSourceWorkspace(nextWorkspace);

      return [
        { type: "server/validation", validation: plan.validation },
        {
          type: "server/graph",
          graph: buildCompleteGraph({
            sourceWorkspace: nextWorkspace,
            workspaceState: repository.getWorkspaceState(),
          }),
        },
        {
          type: "server/diff",
          diff: buildDiffLayers({
            previous: repository.getPreviousSourceWorkspace(),
            current: nextWorkspace,
            workspaceState: repository.getWorkspaceState(),
          }),
        },
      ];
    }

    return applyWorkspaceIntent(repository, intent);
  };
}
