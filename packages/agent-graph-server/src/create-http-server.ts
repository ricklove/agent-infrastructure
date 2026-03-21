import { buildCompleteGraph, buildDiffLayers } from "@agent-infrastructure/agent-graph-core";
import { createWsMessageHandler } from "./create-ws-server.js";
import type { DocumentRepository } from "./document-repository.js";
import type { GetBoardsResponse, GetWorkspaceResponse } from "@agent-infrastructure/agent-graph-protocol";
import { boardFileWithWorkspaceState, DEFAULT_AGENT_GRAPH_BOARD_PATH } from "./load-agentish-workspace.js";
import { dirname, resolve } from "node:path";
import { saveBoardFile } from "./workspace-state-repository.js";

function snapshotPayload(repository: DocumentRepository): GetWorkspaceResponse {
  const sourceWorkspace = repository.getSourceWorkspace();
  const workspaceState = repository.getWorkspaceState();
  return {
    workspace: {
      board: repository.getBoardSummary(),
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

export async function createHttpServer(repository: DocumentRepository) {
  const handleWsMessage = createWsMessageHandler(repository);
  const sockets = new Set<Bun.ServerWebSocket<unknown>>();
  const boardRoot = dirname(DEFAULT_AGENT_GRAPH_BOARD_PATH);

  return Bun.serve({
    port: 8788,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === "/api/agent-graph/ws") {
        if (server.upgrade(request)) {
          return undefined;
        }
        return new Response("upgrade failed", { status: 500 });
      }

      if (url.pathname === "/api/agent-graph/workspace") {
        return Response.json(snapshotPayload(repository), {
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (url.pathname === "/api/agent-graph/boards") {
        const response: GetBoardsResponse = {
          boards: await repository.listBoards(),
          currentBoardPath: repository.getBoardSummary().path,
        };
        return Response.json(response, {
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (url.pathname === "/api/agent-graph/open-board" && request.method === "POST") {
        const payload = (await request.json()) as { path?: string };
        if (!payload.path) {
          return new Response("board path required", { status: 400 });
        }
        const nextBoardPath = resolve(boardRoot, payload.path);
        await repository.openBoard(nextBoardPath);
        return Response.json(snapshotPayload(repository));
      }

      if (url.pathname === "/api/agent-graph/save-board-as" && request.method === "POST") {
        const payload = (await request.json()) as { path?: string; label?: string };
        if (!payload.path) {
          return new Response("board path required", { status: 400 });
        }
        const nextBoardPath = resolve(boardRoot, payload.path);
        const nextBoardFile = {
          ...boardFileWithWorkspaceState(
            repository.getBoardFile(),
            repository.getWorkspaceState(),
          ),
          label: payload.label?.trim() || repository.getBoardFile().label,
        };
        await saveBoardFile(nextBoardPath, nextBoardFile);
        await repository.openBoard(nextBoardPath);
        return Response.json(snapshotPayload(repository));
      }

      if (url.pathname === "/api/agent-graph/add-board-document" && request.method === "POST") {
        const payload = (await request.json()) as { path?: string };
        if (!payload.path) {
          return new Response("document path required", { status: 400 });
        }
        const nextDocumentPath = payload.path.trim();
        const nextBoardFile = {
          ...repository.getBoardFile(),
          documents: [...new Set([...repository.getBoardFile().documents, nextDocumentPath])],
        };
        await saveBoardFile(repository.getBoardPath(), nextBoardFile);
        await repository.openBoard(repository.getBoardPath());
        return Response.json(snapshotPayload(repository));
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
