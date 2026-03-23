import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AgentChatStore, type StoredMessage, type StoredSession } from "./store.js";
import {
  getProviderCatalogEntry,
  providerCatalog,
  type AgentChatProviderKind,
} from "./catalog.js";
import {
  ensureCodexAppServer,
  interruptCodexTurn,
  runCodexTurn,
} from "./codex-provider.js";

const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state";
const appDataDir =
  process.env.AGENT_CHAT_DATA_DIR?.trim() || "/home/ec2-user/workspace/data/agent-chat";
const logPath =
  process.env.AGENT_CHAT_LOG_PATH?.trim() || `${stateDir}/logs/agent-chat-server.log`;
const legacyDbPath =
  process.env.AGENT_CHAT_DB_PATH?.trim() || `${stateDir}/agent-chat/agent-chat.sqlite`;
const port = Number.parseInt(process.env.AGENT_CHAT_PORT ?? "8789", 10);
const defaultSessionDirectory =
  process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace";

type ChatSocketData = {
  socketId: string;
  sessionId: string | null;
};

type SessionActivity = {
  status: "idle" | "queued" | "running" | "interrupted" | "error";
  startedAtMs: number | null;
  threadId: string | null;
  turnId: string | null;
  backgroundProcessCount: number;
  waitingFlags: string[];
  lastError: string | null;
  currentMessageId: string | null;
  canInterrupt: boolean;
};

type SessionSummaryResponseItem = StoredSession & {
  activity: SessionActivity;
  queuedMessageCount: number;
};

type SessionSnapshotPayload = {
  ok: true;
  session: SessionSummaryResponseItem;
  messages: StoredMessage[];
  queuedMessages: StoredMessage[];
  activity: SessionActivity;
};

type SessionRuntimeState = SessionActivity & {
  interruptRequested: boolean;
};

mkdirSync(dirname(logPath), { recursive: true });

const store = new AgentChatStore({
  dataDir: appDataDir,
  legacySqlitePath: legacyDbPath,
});
const sessionSockets = new Map<string, Set<Bun.ServerWebSocket<ChatSocketData>>>();
const activeSessionRuns = new Set<string>();
const sessionRuntime = new Map<string, SessionRuntimeState>();

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

function ensureRuntimeState(sessionId: string): SessionRuntimeState {
  let runtime = sessionRuntime.get(sessionId);
  if (!runtime) {
    runtime = {
      status: "idle",
      startedAtMs: null,
      threadId: null,
      turnId: null,
      backgroundProcessCount: 0,
      waitingFlags: [],
      lastError: null,
      currentMessageId: null,
      canInterrupt: false,
      interruptRequested: false,
    };
    sessionRuntime.set(sessionId, runtime);
  }
  return runtime;
}

function getSessionSockets(sessionId: string) {
  let sockets = sessionSockets.get(sessionId);
  if (!sockets) {
    sockets = new Set();
    sessionSockets.set(sessionId, sockets);
  }
  return sockets;
}

function toSessionActivity(sessionId: string): SessionActivity {
  const runtime = ensureRuntimeState(sessionId);
  return {
    status: runtime.status,
    startedAtMs: runtime.startedAtMs,
    threadId: runtime.threadId,
    turnId: runtime.turnId,
    backgroundProcessCount: runtime.backgroundProcessCount,
    waitingFlags: [...runtime.waitingFlags],
    lastError: runtime.lastError,
    currentMessageId: runtime.currentMessageId,
    canInterrupt: runtime.canInterrupt,
  };
}

function buildSessionSummary(session: StoredSession): SessionSummaryResponseItem {
  return {
    ...session,
    activity: toSessionActivity(session.id),
    queuedMessageCount: store.listQueuedMessages(session.id).length,
  };
}

function buildSessionSnapshot(sessionId: string): SessionSnapshotPayload | null {
  const session = store.getSession(sessionId);
  if (!session) {
    return null;
  }

  const activity = toSessionActivity(sessionId);
  return {
    ok: true,
    session: buildSessionSummary(session),
    messages: store.listMessages(sessionId),
    queuedMessages: store.listQueuedMessages(sessionId),
    activity,
  };
}

function broadcastSession(sessionId: string, event: unknown) {
  for (const socket of getSessionSockets(sessionId)) {
    socket.send(JSON.stringify(event));
  }
}

function broadcastSnapshot(sessionId: string) {
  const payload = buildSessionSnapshot(sessionId);
  if (!payload) {
    return;
  }
  broadcastSession(sessionId, {
    type: "session.snapshot",
    ...payload,
  });
}

function broadcastActivity(sessionId: string) {
  broadcastSession(sessionId, {
    type: "run.activity",
    sessionId,
    activity: toSessionActivity(sessionId),
    queuedMessages: store.listQueuedMessages(sessionId),
  });
}

function buildSessionTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 56) {
    return normalized;
  }
  return `${normalized.slice(0, 53)}...`;
}

function setRuntimeState(
  sessionId: string,
  update: Partial<SessionRuntimeState> | ((current: SessionRuntimeState) => SessionRuntimeState),
) {
  const current = ensureRuntimeState(sessionId);
  const next =
    typeof update === "function"
      ? update({ ...current, waitingFlags: [...current.waitingFlags] })
      : { ...current, ...update };
  sessionRuntime.set(sessionId, next);
  return next;
}

async function processSessionQueue(sessionId: string) {
  if (activeSessionRuns.has(sessionId)) {
    return;
  }

  const nextMessage = store.getNextQueuedUserMessage(sessionId);
  if (!nextMessage) {
    const runtime = ensureRuntimeState(sessionId);
    if (runtime.status === "queued") {
      setRuntimeState(sessionId, {
        status: "idle",
        currentMessageId: null,
        lastError: null,
      });
      broadcastActivity(sessionId);
    }
    return;
  }

  void runProviderTurnForQueuedMessage(sessionId, nextMessage);
}

async function runProviderTurnForQueuedMessage(
  sessionId: string,
  queuedMessage: StoredMessage,
) {
  const session = store.getSession(sessionId);
  if (!session) {
    return;
  }

  if (activeSessionRuns.has(sessionId)) {
    return;
  }

  activeSessionRuns.add(sessionId);
  setRuntimeState(sessionId, {
    status: "running",
    startedAtMs: Date.now(),
    threadId: session.providerThreadId,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError: null,
    currentMessageId: queuedMessage.id,
    canInterrupt: session.providerKind === "codex-app-server",
    interruptRequested: false,
  });
  store.markMessagesSeen(sessionId, [queuedMessage.id]);
  const pendingSystemInstruction = store.consumePendingSystemInstruction(sessionId);
  broadcastActivity(sessionId);

  try {
    if (session.providerKind !== "codex-app-server") {
      throw new Error(`${session.providerKind} provider adapter is not implemented yet`);
    }

    await ensureCodexAppServer(log);
    const currentSession = store.getSession(sessionId);
    if (!currentSession) {
      throw new Error("Session disappeared before provider execution started");
    }

    const result = await runCodexTurn(currentSession, queuedMessage.content[0]?.type === "text" ? queuedMessage.content[0].text : "", pendingSystemInstruction, {
      onRunStarted(payload) {
        setRuntimeState(sessionId, (current) => ({
          ...current,
          status: "running",
          startedAtMs: current.startedAtMs ?? Date.now(),
          threadId: payload.threadId,
          turnId: payload.turnId,
        }));
        broadcastSession(sessionId, {
          type: "run.started",
          sessionId,
          providerKind: currentSession.providerKind,
          activity: toSessionActivity(sessionId),
        });
      },
      onThreadStatusChanged(payload) {
        setRuntimeState(sessionId, (current) => ({
          ...current,
          threadId: payload.threadId || current.threadId,
          waitingFlags: payload.flags,
        }));
        broadcastActivity(sessionId);
      },
      onBackgroundProcessCountChanged(payload) {
        setRuntimeState(sessionId, (current) => ({
          ...current,
          threadId: payload.threadId || current.threadId,
          turnId: payload.turnId || current.turnId,
          backgroundProcessCount: payload.backgroundProcessCount,
        }));
        broadcastActivity(sessionId);
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
      providerSeenAtMs: Date.now(),
      content: [
        {
          type: "text",
          text: result.assistantText || "(empty response)",
        },
      ],
    });

    setRuntimeState(sessionId, {
      status: "idle",
      startedAtMs: null,
      threadId: result.threadId,
      turnId: null,
      backgroundProcessCount: 0,
      waitingFlags: [],
      lastError: null,
      currentMessageId: null,
      canInterrupt: false,
      interruptRequested: false,
    });
    broadcastSession(sessionId, {
      type: "session.updated",
      session: updatedSession ? buildSessionSummary(updatedSession) : null,
      messages: [assistantMessage],
      queuedMessages: store.listQueuedMessages(sessionId),
      activity: toSessionActivity(sessionId),
    });
    broadcastSession(sessionId, {
      type: "run.completed",
      sessionId,
      activity: toSessionActivity(sessionId),
    });
  } catch (error) {
    const runtime = ensureRuntimeState(sessionId);
    const interrupted = runtime.interruptRequested;
    const errorText =
      error instanceof Error ? error.message : "Provider run failed unexpectedly.";

    if (interrupted) {
      const systemMessage = store.appendMessage(sessionId, {
        role: "system",
        providerSeenAtMs: Date.now(),
        content: [{ type: "text", text: "Agent run interrupted." }],
      });
      setRuntimeState(sessionId, {
        status: "interrupted",
        startedAtMs: null,
        turnId: null,
        backgroundProcessCount: 0,
        waitingFlags: [],
        lastError: null,
        currentMessageId: null,
        canInterrupt: false,
        interruptRequested: false,
      });
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummary(store.getSession(sessionId)!)
          : null,
        messages: [systemMessage],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      });
      broadcastSession(sessionId, {
        type: "run.interrupted",
        sessionId,
        activity: toSessionActivity(sessionId),
      });
    } else {
      const failureMessage = store.appendMessage(sessionId, {
        role: "system",
        providerSeenAtMs: Date.now(),
        content: [{ type: "text", text: `Provider run failed: ${errorText}` }],
      });
      setRuntimeState(sessionId, {
        status: "error",
        startedAtMs: null,
        turnId: null,
        backgroundProcessCount: 0,
        waitingFlags: [],
        lastError: errorText,
        currentMessageId: null,
        canInterrupt: false,
        interruptRequested: false,
      });
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummary(store.getSession(sessionId)!)
          : null,
        messages: [failureMessage],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      });
      broadcastSession(sessionId, {
        type: "run.failed",
        sessionId,
        error: errorText,
        activity: toSessionActivity(sessionId),
      });
      log(`run error session_id=${sessionId} error=${JSON.stringify(errorText)}`);
    }
  } finally {
    activeSessionRuns.delete(sessionId);
    await processSessionQueue(sessionId);
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
        sessions: store.listSessions().map(buildSessionSummary),
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
          cwd: payload.cwd?.trim() || defaultSessionDirectory,
          authProfile: payload.authProfile?.trim() || provider.authProfiles[0] || null,
          imageModelRef: payload.imageModelRef?.trim() || null,
        });

        const snapshot = buildSessionSnapshot(session.id);
        return snapshot ? jsonResponse(snapshot) : notFound();
      });
    }

    const sessionMatch = /^\/api\/agent-chat\/sessions\/([^/]+)$/.exec(url.pathname);
    if (sessionMatch && request.method === "GET") {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      const snapshot = buildSessionSnapshot(sessionId);
      return snapshot ? jsonResponse(snapshot) : notFound();
    }

    if (sessionMatch && request.method === "PATCH") {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      if (!store.getSession(sessionId)) {
        return notFound();
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          cwd?: string;
          title?: string;
        };
        const nextDirectory = payload.cwd?.trim();
        const nextTitle = payload.title?.trim();
        if (!nextDirectory && !nextTitle) {
          return jsonResponse({ ok: false, error: "directory or title required" }, 400);
        }
        let session = store.getSession(sessionId);
        const queuedMessages: StoredMessage[] = [];

        if (nextDirectory && session && nextDirectory !== session.cwd) {
          store.markQueuedSystemMessagesSeen(sessionId);
          session = store.updateSessionCwd(sessionId, nextDirectory);
          const directoryMessage = store.appendMessage(sessionId, {
            role: "system",
            kind: "directoryInstruction",
            providerSeenAtMs: null,
            content: [
              {
                type: "text",
                text: `Directory will switch to ${nextDirectory} for the next agent turn.`,
              },
            ],
          });
          queuedMessages.push(directoryMessage);
          session = store.queuePendingSystemInstruction(
            sessionId,
            `Working directory changed to ${nextDirectory}. Use this directory for subsequent work unless the user says otherwise.`,
          );
        }

        if (nextTitle && session && nextTitle !== session.title) {
          session = store.updateSessionTitle(sessionId, nextTitle);
          const titleMessage = store.appendMessage(sessionId, {
            role: "system",
            providerSeenAtMs: null,
            content: [
              {
                type: "text",
                text: `Chat title will change to ${nextTitle} for the next agent turn.`,
              },
            ],
          });
          queuedMessages.push(titleMessage);
          session = store.queuePendingSystemInstruction(
            sessionId,
            `Chat title changed to ${nextTitle}. Use this title when referring to this chat unless the user says otherwise.`,
          );
        }

        broadcastSession(sessionId, {
          type: "session.updated",
          session: session ? buildSessionSummary(session) : null,
          messages: queuedMessages,
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        });
        const snapshot = buildSessionSnapshot(sessionId);
        return snapshot ? jsonResponse(snapshot) : notFound();
      });
    }

    const interruptMatch = /^\/api\/agent-chat\/sessions\/([^/]+)\/interrupt$/.exec(url.pathname);
    if (interruptMatch && request.method === "POST") {
      const sessionId = decodeURIComponent(interruptMatch[1]!);
      const session = store.getSession(sessionId);
      const runtime = ensureRuntimeState(sessionId);
      if (!session) {
        return notFound();
      }
      if (session.providerKind !== "codex-app-server") {
        return jsonResponse({ ok: false, error: "Interrupt not supported for this provider" }, 400);
      }
      if (!runtime.turnId || !runtime.threadId) {
        return jsonResponse({ ok: false, error: "No active turn to interrupt" }, 409);
      }

      return interruptCodexTurn(session, runtime.threadId, runtime.turnId)
        .then(() => {
          setRuntimeState(sessionId, {
            status: "interrupted",
            interruptRequested: true,
            canInterrupt: false,
          });
          broadcastActivity(sessionId);
          return jsonResponse({ ok: true, activity: toSessionActivity(sessionId) });
        })
        .catch((error) => {
          const errorText =
            error instanceof Error ? error.message : "Interrupt request failed.";
          return jsonResponse({ ok: false, error: errorText }, 500);
        });
    }

    const messagesMatch = /^\/api\/agent-chat\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
    if (messagesMatch && request.method === "GET") {
      const sessionId = decodeURIComponent(messagesMatch[1]!);
      const snapshot = buildSessionSnapshot(sessionId);
      return snapshot ? jsonResponse(snapshot) : notFound();
    }

    if (messagesMatch && request.method === "POST") {
      const sessionId = decodeURIComponent(messagesMatch[1]!);
      if (!store.getSession(sessionId)) {
        return notFound();
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          text?: string;
          replyToMessageId?: string | null;
        };
        const text = payload.text?.trim() || "";
        if (!text) {
          return jsonResponse({ ok: false, error: "text required" }, 400);
        }

        const userMessage = store.appendMessage(sessionId, {
          role: "user",
          providerSeenAtMs: null,
          replyToMessageId: payload.replyToMessageId?.trim() || null,
          content: [{ type: "text", text }],
        });

        const sessionBeforeRun = store.getSession(sessionId);
        const titledSession =
          sessionBeforeRun?.title === "New chat"
            ? store.updateSessionTitle(sessionId, buildSessionTitle(text))
            : sessionBeforeRun;

        if (!activeSessionRuns.has(sessionId)) {
          setRuntimeState(sessionId, {
            status: "queued",
            currentMessageId: userMessage.id,
            lastError: null,
          });
        }

        broadcastSession(sessionId, {
          type: "session.updated",
          session: titledSession ? buildSessionSummary(titledSession) : null,
          messages: [userMessage],
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        });
        void processSessionQueue(sessionId);

        return jsonResponse(
          {
            ok: true,
            session: titledSession ? buildSessionSummary(titledSession) : null,
            started: !activeSessionRuns.has(sessionId),
            queuedMessages: store.listQueuedMessages(sessionId),
            activity: toSessionActivity(sessionId),
          },
          202,
        );
      });
    }

    return notFound();
  },
  websocket: {
    open(ws) {
      if (!ws.data.sessionId) {
        return;
      }
      getSessionSockets(ws.data.sessionId).add(ws);
      const payload = buildSessionSnapshot(ws.data.sessionId);
      if (payload) {
        ws.send(
          JSON.stringify({
            type: "session.snapshot",
            ...payload,
          }),
        );
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
