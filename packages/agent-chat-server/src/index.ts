import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AgentChatStore } from "./store.js";
import {
  getProviderCatalogEntry,
  providerCatalog,
  type AgentChatProviderKind,
} from "./catalog.js";
import { ensureCodexAppServer, runCodexTurn } from "./codex-provider.js";

const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state";
const appDataDir =
  process.env.AGENT_CHAT_DATA_DIR?.trim() || "/home/ec2-user/workspace/data/agent-chat";
const logPath =
  process.env.AGENT_CHAT_LOG_PATH?.trim() || `${stateDir}/logs/agent-chat-server.log`;
const legacyDbPath =
  process.env.AGENT_CHAT_DB_PATH?.trim() || `${stateDir}/agent-chat/agent-chat.sqlite`;
const port = Number.parseInt(process.env.AGENT_CHAT_PORT ?? "8789", 10);
const defaultSessionCwd =
  process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace";

mkdirSync(dirname(logPath), { recursive: true });
const store = new AgentChatStore({
  dataDir: appDataDir,
  legacySqlitePath: legacyDbPath,
});
const sessionSockets = new Map<string, Set<Bun.ServerWebSocket<ChatSocketData>>>();
const activeSessionRuns = new Set<string>();

type ChatSocketData = {
  socketId: string;
  sessionId: string | null;
};

function log(message: string) {
  const line = `[${new Date().toISOString()}:agent-chat-server] ${message}\n`;
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, line);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function notFound() {
  return new Response("not found", { status: 404 });
}

function getSessionSockets(sessionId: string) {
  let sockets = sessionSockets.get(sessionId);
  if (!sockets) {
    sockets = new Set();
    sessionSockets.set(sessionId, sockets);
  }
  return sockets;
}

function broadcastSession(sessionId: string, event: unknown) {
  for (const socket of getSessionSockets(sessionId)) {
    socket.send(JSON.stringify(event));
  }
}

function buildSessionTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 56) {
    return normalized;
  }
  return `${normalized.slice(0, 53)}...`;
}

function sessionSummary(sessionId: string) {
  const session = store.getSession(sessionId);
  if (!session) {
    return null;
  }

  return {
    session,
    messages: store.listMessages(sessionId),
  };
}

async function runProviderTurn(sessionId: string, inputText: string) {
  const session = store.getSession(sessionId);
  if (!session) {
    return;
  }

  if (activeSessionRuns.has(sessionId)) {
    throw new Error("A run is already active for this session");
  }

  activeSessionRuns.add(sessionId);

  try {
    if (session.providerKind !== "codex-app-server") {
      throw new Error(`${session.providerKind} provider adapter is not implemented yet`);
    }

    await ensureCodexAppServer(log);
    const currentSession = store.getSession(sessionId);
    if (!currentSession) {
      throw new Error("Session disappeared before provider execution started");
    }

    broadcastSession(sessionId, {
      type: "run.started",
      sessionId,
      providerKind: currentSession.providerKind,
    });

    const result = await runCodexTurn(currentSession, inputText, {
      onRunStarted(payload) {
        broadcastSession(sessionId, {
          type: "run.started",
          sessionId,
          providerKind: currentSession.providerKind,
          threadId: payload.threadId,
          turnId: payload.turnId,
        });
      },
      onAssistantDelta(payload) {
        broadcastSession(sessionId, {
          type: "run.delta",
          sessionId,
          threadId: payload.threadId,
          turnId: payload.turnId,
          itemId: payload.itemId,
          delta: payload.delta,
        });
      },
    });

    const updatedSession = store.updateProviderThread(sessionId, {
      threadId: result.threadId,
      threadPath: result.threadPath,
    });

    const assistantMessage = store.appendMessage(sessionId, {
      role: "assistant",
      content: [
        {
          type: "text",
          text: result.assistantText || "(empty response)",
        },
      ],
    });

    broadcastSession(sessionId, {
      type: "session.updated",
      session: updatedSession,
      messages: [assistantMessage],
    });
    broadcastSession(sessionId, {
      type: "run.completed",
      sessionId,
      threadId: result.threadId,
    });
  } catch (error) {
    const errorText =
      error instanceof Error ? error.message : "Provider run failed unexpectedly.";
    const failureMessage = store.appendMessage(sessionId, {
      role: "system",
      content: [{ type: "text", text: `Provider run failed: ${errorText}` }],
    });
    broadcastSession(sessionId, {
      type: "session.updated",
      session: store.getSession(sessionId),
      messages: [failureMessage],
    });
    broadcastSession(sessionId, {
      type: "run.failed",
      sessionId,
      error: errorText,
    });
    log(`run error session_id=${sessionId} error=${JSON.stringify(errorText)}`);
  } finally {
    activeSessionRuns.delete(sessionId);
  }
}

const server = Bun.serve<ChatSocketData>({
  port,
  fetch(request, serverInstance) {
    const url = new URL(request.url);

    if (url.pathname === "/api/agent-chat/ws") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !store.getSession(sessionId)) {
        return jsonResponse({ ok: false, error: "sessionId required" }, 400);
      }

      if (
        serverInstance.upgrade(request, {
          data: {
            socketId: randomUUID(),
            sessionId,
          },
        })
      ) {
        return undefined;
      }
      return new Response("upgrade failed", { status: 500 });
    }

    if (url.pathname === "/api/agent-chat/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/agent-chat/providers") {
      return jsonResponse({
        ok: true,
        providers: providerCatalog,
      });
    }

    if (url.pathname === "/api/agent-chat/sessions" && request.method === "GET") {
      return jsonResponse({
        ok: true,
        sessions: store.listSessions(),
      });
    }

    if (url.pathname === "/api/agent-chat/sessions" && request.method === "POST") {
      return request.json().then((body: unknown) => {
        const payload = body as {
          title?: string;
          providerKind?: AgentChatProviderKind;
          modelRef?: string;
          cwd?: string;
          authProfile?: string | null;
          imageModelRef?: string | null;
        };

        if (!payload.providerKind) {
          return jsonResponse({ ok: false, error: "providerKind required" }, 400);
        }

        const provider = getProviderCatalogEntry(payload.providerKind);
        if (!provider) {
          return jsonResponse({ ok: false, error: "unknown provider" }, 400);
        }

        if (provider.status !== "ready") {
          return jsonResponse(
            {
              ok: false,
              error: `${provider.label} is not implemented yet in Agent Chat`,
            },
            400,
          );
        }

        const session = store.createSession({
          title: payload.title,
          providerKind: payload.providerKind,
          modelRef: payload.modelRef?.trim() || provider.defaultModelRef,
          cwd: payload.cwd?.trim() || defaultSessionCwd,
          authProfile: payload.authProfile?.trim() || provider.authProfiles[0] || null,
          imageModelRef: payload.imageModelRef?.trim() || null,
        });

        return jsonResponse({
          ok: true,
          session,
          messages: store.listMessages(session.id),
        });
      });
    }

    const sessionMatch = /^\/api\/agent-chat\/sessions\/([^/]+)$/.exec(url.pathname);
    if (sessionMatch && request.method === "GET") {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      const snapshot = sessionSummary(sessionId);
      return snapshot ? jsonResponse({ ok: true, ...snapshot }) : notFound();
    }

    if (sessionMatch && request.method === "PATCH") {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      if (!store.getSession(sessionId)) {
        return notFound();
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          cwd?: string;
        };
        const nextCwd = payload.cwd?.trim();
        if (!nextCwd) {
          return jsonResponse({ ok: false, error: "cwd required" }, 400);
        }

        const session = store.updateSessionCwd(sessionId, nextCwd);
        broadcastSession(sessionId, {
          type: "session.updated",
          session,
          messages: [],
        });
        return jsonResponse({ ok: true, session });
      });
    }

    const messagesMatch = /^\/api\/agent-chat\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
    if (messagesMatch && request.method === "GET") {
      const sessionId = decodeURIComponent(messagesMatch[1]!);
      const snapshot = sessionSummary(sessionId);
      return snapshot ? jsonResponse({ ok: true, ...snapshot }) : notFound();
    }

    if (messagesMatch && request.method === "POST") {
      const sessionId = decodeURIComponent(messagesMatch[1]!);
      if (!store.getSession(sessionId)) {
        return notFound();
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          role?: "user";
          text?: string;
        };
        const text = payload.text?.trim() || "";
        if (!text) {
          return jsonResponse({ ok: false, error: "text required" }, 400);
        }

        const userMessage = store.appendMessage(sessionId, {
          role: "user",
          content: [{ type: "text", text }],
        });

        const sessionBeforeRun = store.getSession(sessionId);
        const titledSession =
          sessionBeforeRun?.title === "New chat"
            ? store.updateSessionTitle(sessionId, buildSessionTitle(text))
            : sessionBeforeRun;

        const sessionUpdateEvent = {
          type: "session.updated",
          session: titledSession,
          messages: [userMessage],
        };
        broadcastSession(sessionId, sessionUpdateEvent);
        void runProviderTurn(sessionId, text);

        return jsonResponse({
          ok: true,
          session: titledSession,
          started: true,
        }, 202);
      });
    }

    return notFound();
  },
  websocket: {
    open(ws) {
      if (ws.data.sessionId) {
        getSessionSockets(ws.data.sessionId).add(ws);
        const payload = sessionSummary(ws.data.sessionId);
        if (payload) {
          ws.send(
            JSON.stringify({
              type: "session.snapshot",
              ...payload,
            }),
          );
        }
      }
    },
    message() {},
    close(ws) {
      if (!ws.data.sessionId) {
        return;
      }
      const sockets = sessionSockets.get(ws.data.sessionId);
      sockets?.delete(ws);
      if (sockets && sockets.size === 0) {
        sessionSockets.delete(ws.data.sessionId);
      }
    },
  },
});

log(`agent-chat server listening on http://127.0.0.1:${server.port}`);
