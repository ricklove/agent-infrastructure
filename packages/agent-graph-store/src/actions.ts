import type {
  GraphDiffSnapshot,
  GraphIntent,
  GraphSnapshot,
  WorkspaceSnapshot,
} from "@agent-infrastructure/agent-graph-core";
import type { GetWorkspaceResponse } from "@agent-infrastructure/agent-graph-protocol";
import type { ClientMessage, ServerMessage } from "@agent-infrastructure/agent-graph-protocol";
import { nextIntentId, queueIntent, type AgentGraphStore } from "./agent-graph-store.js";

const dashboardSessionStorageKey = "agent-infrastructure.dashboard.session";

function wsOriginFromHttpOrigin(serverOrigin: string): string {
  return serverOrigin.replace(/^http/, "ws");
}

function readStoredSessionToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(dashboardSessionStorageKey) ?? "";
}

function buildFeatureUrl(serverOrigin: string, pathname: string): string {
  const url = new URL(pathname, `${serverOrigin}/`);
  const sessionToken = readStoredSessionToken().trim();
  if (sessionToken) {
    url.searchParams.set("sessionToken", sessionToken);
  }
  return url.toString();
}

function connect(store: AgentGraphStore): WebSocket {
  const ws = new WebSocket(
    buildFeatureUrl(
      wsOriginFromHttpOrigin(store.state$.connection.serverOrigin.get()),
      "/api/agent-graph/ws",
    ),
  );
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
  const visibleLayers = graph.layers.filter((layer) => layer.visible);
  if (
    !activeLayerId ||
    !visibleLayers.some((layer) => layer.id === activeLayerId)
  ) {
    store.state$.activeLayerId.set(visibleLayers[0]?.id ?? null);
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  store.state$.layout.pinnedNodeIds.set(
    workspace.pinnedNodeIds.filter((nodeId) => nodeIds.has(nodeId)),
  );
  store.state$.connection.status.set("ready");
}

function handleServerMessage(store: AgentGraphStore, message: ServerMessage): void {
  switch (message.type) {
    case "server/connected":
      applySnapshot(store, message.workspace, message.graph, message.diff);
      break;
    case "server/graph":
      if (!store.state$.layout.physicsEnabled.get()) {
        store.state$.graph.set(message.graph);
      }
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
          buildFeatureUrl(
            store.state$.connection.serverOrigin.get(),
            "/api/agent-graph/workspace",
          ),
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
        if (
          typeof window !== "undefined" &&
          error instanceof Error &&
          /status 401/.test(error.message)
        ) {
          window.sessionStorage.removeItem(dashboardSessionStorageKey);
        }
      }
    },

    selectNode(nodeId: string | null): void {
      store.state$.selection.assign({
        nodeId,
        nodeIds: nodeId ? [nodeId] : [],
        edgeId: null,
      });
    },

    selectEdge(edgeId: string | null): void {
      store.state$.selection.assign({ nodeId: null, nodeIds: [], edgeId });
    },

    setCanvasSelection(nodeIds: string[], edgeIds: string[]): void {
      const currentNodeIds = store.state$.selection.nodeIds.get();
      const currentEdgeId = store.state$.selection.edgeId.get();
      const nextEdgeId = edgeIds[0] ?? null;
      const sameNodeIds =
        currentNodeIds.length === nodeIds.length &&
        currentNodeIds.every((nodeId, index) => nodeId === nodeIds[index]);

      if (sameNodeIds && currentEdgeId === nextEdgeId) {
        return;
      }

      store.state$.selection.assign({
        nodeId: nodeIds[0] ?? null,
        nodeIds,
        edgeId: nextEdgeId,
      });
    },

    setActiveLayer(layerId: string): void {
      store.state$.activeLayerId.set(layerId);
      store.state$.selection.assign({ nodeId: null, nodeIds: [], edgeId: null });
      store.state$.layout.physicsEnabled.set(false);
    },

    setPhysicsEnabled(enabled: boolean): void {
      store.state$.layout.physicsEnabled.set(enabled);
    },

    setSpringStrength(value: number): void {
      store.state$.layout.springStrength.set(value);
    },

    setSpringLength(value: number): void {
      store.state$.layout.springLength.set(value);
    },

    setRepulsionStrength(value: number): void {
      store.state$.layout.repulsionStrength.set(value);
    },

    setNodePinned(nodeId: string, pinned: boolean, position?: { x: number; y: number }): void {
      const current = store.state$.layout.pinnedNodeIds.get();
      const alreadyPinned = current.includes(nodeId);
      if (alreadyPinned === pinned) {
        return;
      }
      if (pinned && position) {
        sendIntent(ws, store, {
          kind: "move-node",
          nodeId,
          x: position.x,
          y: position.y,
        });
      }
      const next = pinned
        ? [...current, nodeId]
        : current.filter((id) => id !== nodeId);
      store.state$.layout.pinnedNodeIds.set(next);
      sendIntent(ws, store, {
        kind: "set-node-pinned",
        nodeId,
        pinned,
      });
    },

    cloneLayer(layerId: string): void {
      sendIntent(ws, store, { kind: "clone-layer", layerId });
    },

    moveLayer(layerId: string, x: number, y: number): void {
      sendIntent(ws, store, { kind: "move-layer", layerId, x, y });
    },

    setLayerVisibility(layerId: string, visible: boolean): void {
      sendIntent(ws, store, { kind: "set-layer-visibility", layerId, visible });
      if (!visible && store.state$.activeLayerId.get() === layerId) {
        const fallbackLayerId =
          store.state$.graph
            .get()
            ?.layers.find((layer) => layer.id !== layerId && layer.visible)?.id ?? null;
        store.state$.activeLayerId.set(fallbackLayerId);
      }
    },

    moveNode(nodeId: string, x: number, y: number): void {
      sendIntent(ws, store, {
        kind: "move-nodes",
        positions: [{ nodeId, x, y }],
      });
    },

    moveNodes(positions: Array<{ nodeId: string; x: number; y: number }>): void {
      if (positions.length === 0) {
        return;
      }
      sendIntent(ws, store, {
        kind: "move-nodes",
        positions,
      });
    },

    toggleLayerNode(layerId: string, sourceNodeId: string, include: boolean): void {
      sendIntent(ws, store, {
        kind: "toggle-layer-node",
        layerId,
        sourceNodeId,
        include,
      });
    },

    toggleLayerNodes(layerId: string, sourceNodeIds: string[], include: boolean): void {
      if (sourceNodeIds.length === 0) {
        return;
      }
      sendIntent(ws, store, {
        kind: "toggle-layer-nodes",
        layerId,
        sourceNodeIds,
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
    },

    showNodeInLayer(layerId: string, sourceNodeId: string): void {
      sendIntent(ws, store, {
        kind: "toggle-layer-node",
        layerId,
        sourceNodeId,
        include: true,
      });
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

    revealHiddenNode(
      portalNodeId: string,
      hiddenNodeId: string,
      position?: { x: number; y: number },
    ): void {
      sendIntent(ws, store, {
        kind: "reveal-hidden-node",
        portalNodeId,
        hiddenNodeId,
        position,
      });
    },

    revealConnectedHiddenContext(sourceNodeId: string, layerId: string): void {
      sendIntent(ws, store, {
        kind: "reveal-connected-hidden-context",
        sourceNodeId,
        layerId,
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
