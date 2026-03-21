import { buildCompleteGraph, buildDiffLayers } from "@agent-infrastructure/agent-graph-core";
import { createWsMessageHandler } from "./create-ws-server.js";
import type { DocumentRepository } from "./document-repository.js";
import type { GetWorkspaceResponse } from "@agent-infrastructure/agent-graph-protocol";

export async function createHttpServer(repository: DocumentRepository) {
  const handleWsMessage = createWsMessageHandler(repository);
  const sockets = new Set<Bun.ServerWebSocket<unknown>>();

  return Bun.serve({
    port: 8788,
    fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/api/agent-graph/ws") {
        if (server.upgrade(request)) {
          return undefined;
        }
        return new Response("upgrade failed", { status: 500 });
      }

      if (url.pathname === "/api/agent-graph/workspace") {
        const sourceWorkspace = repository.getSourceWorkspace();
        const workspaceState = repository.getWorkspaceState();
        const response: GetWorkspaceResponse = {
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

        return Response.json(response, {
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
    websocket: {
      async message(ws, message) {
        const responses = await handleWsMessage(String(message));
        for (const response of responses) {
          for (const socket of sockets) {
            socket.send(JSON.stringify(response));
          }
        }
      },
      open(ws) {
        sockets.add(ws);
      },
      close(ws) {
        sockets.delete(ws);
      },
    },
  });
}
