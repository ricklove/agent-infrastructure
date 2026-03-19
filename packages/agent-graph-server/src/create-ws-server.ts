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
    case "reveal-hidden-context": {
      const portalNodeId = intent.portalNodeId;
      const [_, sourceNodeId, layerId] = portalNodeId.split(":");
      const sourceWorkspace = repository.getSourceWorkspace();
      const revealedNodeIds = sourceWorkspace.edges
        .filter((edge) => edge.sourceId === sourceNodeId)
        .map((edge) => edge.targetId);
      workspaceState.layers = workspaceState.layers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              nodeIds: [...new Set([...layer.nodeIds, ...revealedNodeIds])],
            }
          : layer,
      );
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
