import type {
  GraphDiffSnapshot,
  GraphIntent,
  GraphSnapshot,
  WorkspaceSnapshot,
} from "@agent-infrastructure/agent-graph-core";
import type { GetWorkspaceResponse } from "@agent-infrastructure/agent-graph-protocol";
import type { ClientMessage, ServerMessage } from "@agent-infrastructure/agent-graph-protocol";
import { nextIntentId, queueIntent, type AgentGraphStore } from "./agent-graph-store.js";

function wsOriginFromHttpOrigin(serverOrigin: string): string {
  return serverOrigin.replace(/^http/, "ws");
}

function connect(store: AgentGraphStore): WebSocket {
  const ws = new WebSocket(`${wsOriginFromHttpOrigin(store.state$.connection.serverOrigin.get())}/api/agent-graph/ws`);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "client/hello" satisfies ClientMessage["type"] }));
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    handleServerMessage(store, message);
  });
  ws.addEventListener("close", () => {
    if (store.state$.connection.status.get() !== "error") {
      store.state$.connection.status.set("idle");
    }
  });
  ws.addEventListener("error", () => {
    store.state$.connection.status.set("error");
    store.state$.connection.error.set("WebSocket connection failed.");
  });
  return ws;
}

function applySnapshot(
  store: AgentGraphStore,
  workspace: WorkspaceSnapshot,
  graph: GraphSnapshot,
  diff: GraphDiffSnapshot | null,
): void {
  store.state$.workspace.set(workspace);
  store.state$.graph.set(graph);
  store.state$.diff.set(diff);
  const activeLayerId = store.state$.activeLayerId.get();
  if (!activeLayerId || !graph.layers.some((layer) => layer.id === activeLayerId)) {
    store.state$.activeLayerId.set(graph.layers[0]?.id ?? null);
  }
  store.state$.connection.status.set("ready");
}

function handleServerMessage(store: AgentGraphStore, message: ServerMessage): void {
  switch (message.type) {
    case "server/connected":
      applySnapshot(store, message.workspace, message.graph, message.diff);
      break;
    case "server/graph":
      store.state$.graph.set(message.graph);
      break;
    case "server/diff":
      store.state$.diff.set(message.diff);
      break;
    case "server/validation":
      store.state$.validation.set(message.validation);
      break;
    case "server/conflict":
      store.state$.conflict.set(message.conflict);
      break;
    case "server/external-change":
      store.state$.connection.error.set(
        `Authoritative workspace changed externally at revision ${message.revision}: ${message.reason}`,
      );
      break;
  }
}

function sendIntent(ws: WebSocket | null, store: AgentGraphStore, intent: GraphIntent): void {
  queueIntent(store.state$, intent);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "client/intent", intent } satisfies ClientMessage));
  }
}

export function createAgentGraphActions(store: AgentGraphStore) {
  let ws: WebSocket | null = null;

  return {
    async openWorkspace(): Promise<void> {
      store.state$.connection.status.set("loading");
      store.state$.connection.error.set(null);
      try {
        const response = await fetch(
          `${store.state$.connection.serverOrigin.get()}/api/agent-graph/workspace`,
        );
        if (!response.ok) {
          throw new Error(`Workspace request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as GetWorkspaceResponse;
        applySnapshot(store, payload.workspace, payload.graph, payload.diff);
        ws = connect(store);
      } catch (error) {
        store.state$.connection.status.set("error");
        store.state$.connection.error.set(
          error instanceof Error
            ? error.message
            : "Workspace request failed before the graph could load.",
        );
      }
    },

    selectNode(nodeId: string | null): void {
      store.state$.selection.assign({ nodeId, edgeId: null });
    },

    selectEdge(edgeId: string | null): void {
      store.state$.selection.assign({ nodeId: null, edgeId });
    },

    setActiveLayer(layerId: string): void {
      store.state$.activeLayerId.set(layerId);
      store.state$.selection.assign({ nodeId: null, edgeId: null });
    },

    cloneLayer(layerId: string): void {
      sendIntent(ws, store, { kind: "clone-layer", layerId });
    },

    moveLayer(layerId: string, x: number, y: number): void {
      sendIntent(ws, store, { kind: "move-layer", layerId, x, y });
    },

    moveNode(nodeId: string, x: number, y: number): void {
      sendIntent(ws, store, { kind: "move-node", nodeId, x, y });
    },

    toggleLayerNode(layerId: string, sourceNodeId: string, include: boolean): void {
      sendIntent(ws, store, {
        kind: "toggle-layer-node",
        layerId,
        sourceNodeId,
        include,
      });
    },

    hideNodeFromLayer(layerId: string, sourceNodeId: string): void {
      sendIntent(ws, store, {
        kind: "toggle-layer-node",
        layerId,
        sourceNodeId,
        include: false,
      });
      if (store.state$.selection.nodeId.get()?.startsWith(`${sourceNodeId}::`)) {
        store.state$.selection.assign({ nodeId: null, edgeId: null });
      }
    },

    revealHiddenContext(portalNodeId: string): void {
      store.state$.inspection.revealedPortalIds.set([
        ...store.state$.inspection.revealedPortalIds.get(),
        portalNodeId,
      ]);
      sendIntent(ws, store, {
        kind: "reveal-hidden-context",
        portalNodeId,
      });
    },

    inspectDerivedEdge(edgeId: string, supportingPathIds: string[]): void {
      this.selectEdge(edgeId);
      store.state$.inspection.derivedEdgePathIds.set(supportingPathIds);
    },

    editNodeMeaning(sourceNodeId: string, label: string): void {
      const revision = store.state$.graph.get()?.revision ?? 0;
      sendIntent(ws, store, {
        kind: "edit-node-meaning",
        intentId: nextIntentId("rename"),
        expectedRevision: revision,
        sourceNodeId,
        label,
      });
    },

    connectVisibleNodes(sourceNodeId: string, targetNodeId: string): void {
      const revision = store.state$.graph.get()?.revision ?? 0;
      sendIntent(ws, store, {
        kind: "connect-visible-nodes",
        intentId: nextIntentId("connect"),
        expectedRevision: revision,
        sourceNodeId,
        targetNodeId,
      });
    },

    requestDiff(): void {
      sendIntent(ws, store, { kind: "request-diff" });
    },
  };
}
