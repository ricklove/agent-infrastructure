import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  AgentChatStore,
  type SessionWatchdogState,
  type StoredMessage,
  type StoredMessageContentBlock,
  type StoredSession,
} from "./store.js";
import {
  getProviderCatalogEntry,
  listProviderCatalog,
  type AgentChatProviderKind,
} from "./catalog.js";
import {
  interruptClaudeTurn,
  runClaudeTurn,
} from "./claude-provider.js";
import {
  ensureCodexAppServer,
  interruptCodexTurn,
  runCodexTurn,
} from "./codex-provider.js";
import {
  loadProcessBlueprintCatalog,
  type ProcessBlueprint,
} from "./process-blueprints.js";
import {
  normalizeClaudeSessionModelRef,
  primeClaudeModelCatalogRefresh,
  refreshClaudeModelCatalog,
} from "./model-service.js";

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
const workspacePersistenceRequestPath =
  process.env.WORKSPACE_PERSISTENCE_REQUEST_PATH?.trim() ||
  `${stateDir}/workspace-persistence-request.json`;
const processBlueprintsDir =
  process.env.AGENT_PROCESS_BLUEPRINTS_DIR?.trim() ||
  resolve(import.meta.dir, "../../../blueprints/process-blueprints");
const DIRECTORY_QUEUE_PREFIX = "Directory will switch to ";
const TITLE_QUEUE_PREFIX = "Chat title will change to ";
const DIRECTORY_INSTRUCTION_PREFIX = "Working directory changed to ";
const TITLE_INSTRUCTION_PREFIX = "Chat title changed to ";
const PROCESS_INSTRUCTION_PREFIX = "Session process expectation changed to ";

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

type ProcessBlueprintResponseItem = {
  id: string;
  title: string;
  expectation: string;
  idlePrompt: string;
  completionMode: "exact_reply";
  completionToken: string;
  blockedToken: string;
  stopConditions: string[];
  watchdog: {
    enabled: boolean;
    idleTimeoutSeconds: number;
    maxNudgesPerIdleEpisode: number;
  };
  companionPath: string | null;
};

type SessionSnapshotPayload = {
  ok: true;
  session: SessionSummaryResponseItem;
  messages: StoredMessage[];
  queuedMessages: StoredMessage[];
  activity: SessionActivity;
};

type SessionRuntimeState = SessionActivity & {
  lastVisibleActivityAtMs: number | null;
  interruptRequested: boolean;
  providerKind: AgentChatProviderKind | null;
  providerIdleSinceAtMs: number | null;
  userTypingUntilAtMs: number | null;
};

type WorkspacePersistenceRequest = {
  requestedAtMs: number;
  flushNow?: boolean;
  reason?: string;
  source?: string;
};

type ProviderInputBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      url: string;
      mediaType: string | null;
      filePath: string | null;
      base64Data: string | null;
    };

function providerSupportsInterrupt(providerKind: AgentChatProviderKind) {
  return providerKind === "codex-app-server" || providerKind === "claude-agent-sdk";
}

mkdirSync(dirname(logPath), { recursive: true });

function readWorkspacePersistenceRequest(): WorkspacePersistenceRequest | null {
  if (!existsSync(workspacePersistenceRequestPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(workspacePersistenceRequestPath, "utf8")) as WorkspacePersistenceRequest;
  } catch {
    return null;
  }
}

function requestWorkspacePersistence(reason: string) {
  const current = readWorkspacePersistenceRequest();
  const next: WorkspacePersistenceRequest = {
    requestedAtMs: Date.now(),
    flushNow: current?.flushNow ?? false,
    reason,
    source: "agent-chat-server",
  };
  mkdirSync(dirname(workspacePersistenceRequestPath), { recursive: true });
  writeFileSync(workspacePersistenceRequestPath, `${JSON.stringify(next, null, 2)}\n`);
}

const store = new AgentChatStore({
  dataDir: appDataDir,
  legacySqlitePath: legacyDbPath,
  onCanonicalWrite(event) {
    requestWorkspacePersistence(`agent-chat:${event.reason}:${event.sessionId}`);
  },
});
const processBlueprintCatalog = loadProcessBlueprintCatalog(processBlueprintsDir);
const processBlueprintById = new Map(processBlueprintCatalog.map((entry) => [entry.id, entry] as const));
const sessionSockets = new Map<string, Set<Bun.ServerWebSocket<ChatSocketData>>>();
const activeSessionRuns = new Set<string>();
const sessionRuntime = new Map<string, SessionRuntimeState>();
const sessionWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();
const retryBackoffMs = [2_000, 5_000, 15_000] as const;
const typingGraceMs = 5_000;

primeClaudeModelCatalogRefresh();

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
      lastVisibleActivityAtMs: null,
      interruptRequested: false,
      providerKind: null,
      providerIdleSinceAtMs: null,
      userTypingUntilAtMs: null,
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
  const modelRef =
    session.providerKind === "claude-agent-sdk"
      ? normalizeClaudeSessionModelRef(session.modelRef)
      : session.modelRef;
  return {
    ...session,
    modelRef,
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

function normalizeProviderModelRef(providerKind: AgentChatProviderKind, modelRef: string) {
  const trimmed = modelRef.trim();
  if (providerKind === "claude-agent-sdk") {
    return normalizeClaudeSessionModelRef(trimmed);
  }
  return trimmed;
}

function listProcessBlueprints(): ProcessBlueprintResponseItem[] {
  return processBlueprintCatalog.map((entry) => ({
    id: entry.id,
    title: entry.title,
    expectation: entry.expectation,
    idlePrompt: entry.idlePrompt,
    completionMode: entry.completionMode,
    completionToken: entry.completionToken,
    blockedToken: entry.blockedToken,
    stopConditions: [...entry.stopConditions],
    watchdog: {
      enabled: entry.watchdog.enabled,
      idleTimeoutSeconds: entry.watchdog.idleTimeoutSeconds,
      maxNudgesPerIdleEpisode: entry.watchdog.maxNudgesPerIdleEpisode,
    },
    companionPath: entry.companionPath,
  }));
}

function getSessionProcessBlueprint(session: StoredSession | null | undefined): ProcessBlueprint | null {
  if (!session?.processBlueprintId) {
    return null;
  }
  return processBlueprintById.get(session.processBlueprintId) ?? null;
}

function cancelSessionWatchdog(sessionId: string) {
  const handle = sessionWatchdogTimers.get(sessionId);
  if (!handle) {
    return;
  }
  clearTimeout(handle);
  sessionWatchdogTimers.delete(sessionId);
}

function setSessionWatchdogState(sessionId: string, watchdogState: SessionWatchdogState) {
  const updated = store.updateSessionWatchdogState(sessionId, watchdogState);
  if (updated) {
    broadcastSnapshot(sessionId);
  }
  return updated;
}

function resetSessionWatchdogState(sessionId: string) {
  const updated = store.resetSessionWatchdogState(sessionId);
  if (updated) {
    broadcastSnapshot(sessionId);
  }
  return updated;
}

function maybeMarkProcessBlueprintTerminal(
  sessionId: string,
  assistantText: string,
): "completed" | "blocked" | null {
  const session = store.getSession(sessionId);
  const processBlueprint = getSessionProcessBlueprint(session);
  if (!session || !processBlueprint) {
    return null;
  }

  const normalizedText = assistantText.trim();
  if (normalizedText === processBlueprint.completionToken) {
    setSessionWatchdogState(sessionId, {
      status: "completed",
      nudgeCount: session.watchdogState.nudgeCount,
      lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
      completedAtMs: Date.now(),
    });
    return "completed";
  }

  if (normalizedText === processBlueprint.blockedToken) {
    setSessionWatchdogState(sessionId, {
      status: "blocked",
      nudgeCount: session.watchdogState.nudgeCount,
      lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
      completedAtMs: Date.now(),
    });
    return "blocked";
  }

  return null;
}

function buildProcessExpectationInstruction(processBlueprint: ProcessBlueprint | null) {
  if (!processBlueprint) {
    return `${PROCESS_INSTRUCTION_PREFIX}none. Continue based on the latest explicit user request and current transcript context.`;
  }

  return `${PROCESS_INSTRUCTION_PREFIX}${processBlueprint.title}. ${processBlueprint.expectation}`;
}

function persistedIdleWatchdogAnchorMs(session: StoredSession) {
  return session.updatedAtMs;
}

function processBlueprintNudgeLimitReached(
  session: StoredSession,
  processBlueprint: ProcessBlueprint,
) {
  return (
    processBlueprint.watchdog.maxNudgesPerIdleEpisode > 0 &&
    session.watchdogState.nudgeCount >= processBlueprint.watchdog.maxNudgesPerIdleEpisode
  );
}

function sessionTerminalWatchdogState(session: StoredSession) {
  return (
    session.watchdogState.status === "completed" || session.watchdogState.status === "blocked"
  );
}

function operatorTypingActive(runtime: SessionRuntimeState) {
  return runtime.userTypingUntilAtMs !== null && runtime.userTypingUntilAtMs > Date.now();
}

function isRetryableProviderError(errorText: string) {
  const normalized = errorText.toLowerCase();
  return [
    "timed out",
    "timeout",
    "websocket",
    "closed unexpectedly",
    "failed to connect",
    "connection refused",
    "econnreset",
    "econnrefused",
    "temporarily unavailable",
    "503",
    "502",
    "504",
    "rate limit",
  ].some((fragment) => normalized.includes(fragment));
}

function appendActivityMessage(sessionId: string, text: string) {
  return store.appendMessage(sessionId, {
    role: "system",
    kind: "activity",
    providerSeenAtMs: Date.now(),
    content: [{ type: "text", text }],
  });
}

function queueProcessExpectationForSession(sessionId: string) {
  const session = store.getSession(sessionId);
  const processBlueprint = getSessionProcessBlueprint(session);
  if (!session || !processBlueprint) {
    return { session, processMessage: null as StoredMessage | null };
  }

  const expectationText = buildProcessExpectationInstruction(processBlueprint);
  store.markQueuedSystemMessagesSeenByPrefix(sessionId, PROCESS_INSTRUCTION_PREFIX);
  const processMessage = store.appendMessage(sessionId, {
    role: "system",
    providerSeenAtMs: null,
    content: [{ type: "text", text: expectationText }],
  });
  const updatedSession = store.replacePendingSystemInstructionByPrefix(
    sessionId,
    PROCESS_INSTRUCTION_PREFIX,
    expectationText,
  );
  return { session: updatedSession ?? session, processMessage };
}

function runningTurnLooksStalled(runtime: SessionRuntimeState, processBlueprint: ProcessBlueprint) {
  if (runtime.status !== "running") {
    return false;
  }

  const anchorMs = runtime.lastVisibleActivityAtMs ?? runtime.startedAtMs;
  if (anchorMs === null) {
    return false;
  }

  return Date.now() - anchorMs >= processBlueprint.watchdog.idleTimeoutSeconds * 1000;
}

function maybeTriggerSessionWatchdog(sessionId: string) {
  sessionWatchdogTimers.delete(sessionId);
  const session = store.getSession(sessionId);
  if (!session) {
    return;
  }

  const processBlueprint = getSessionProcessBlueprint(session);
  if (!processBlueprint?.watchdog.enabled) {
    return;
  }

  const runtime = ensureRuntimeState(sessionId);
  if (runtime.status !== "idle" && !runningTurnLooksStalled(runtime, processBlueprint)) {
    return;
  }

  if (sessionTerminalWatchdogState(session)) {
    return;
  }

  if (processBlueprintNudgeLimitReached(session, processBlueprint)) {
    return;
  }

  if (operatorTypingActive(runtime)) {
    return;
  }

  const watchdogMessage = store.appendMessage(sessionId, {
    role: "system",
    kind: "watchdogPrompt",
    providerSeenAtMs: null,
    content: [{ type: "text", text: processBlueprint.idlePrompt }],
  });

  setSessionWatchdogState(sessionId, {
    status: "nudged",
    nudgeCount: session.watchdogState.nudgeCount + 1,
    lastNudgedAtMs: Date.now(),
    completedAtMs: null,
  });
  setRuntimeState(sessionId, (current) => ({
    ...current,
    providerIdleSinceAtMs: null,
    lastVisibleActivityAtMs: current.status === "running" ? Date.now() : current.lastVisibleActivityAtMs,
  }));

  broadcastSession(sessionId, {
    type: "session.updated",
    session: store.getSession(sessionId) ? buildSessionSummary(store.getSession(sessionId)!) : null,
    messages: [watchdogMessage],
    queuedMessages: store.listQueuedMessages(sessionId),
    activity: toSessionActivity(sessionId),
  });

  void processSessionQueue(sessionId);
  maybeScheduleSessionWatchdog(sessionId);
}

function maybeScheduleSessionWatchdog(sessionId: string) {
  cancelSessionWatchdog(sessionId);
  const session = store.getSession(sessionId);
  const processBlueprint = getSessionProcessBlueprint(session);
  if (!session || !processBlueprint?.watchdog.enabled) {
    return;
  }

  const runtime = ensureRuntimeState(sessionId);
  if (sessionTerminalWatchdogState(session)) {
    return;
  }

  if (processBlueprintNudgeLimitReached(session, processBlueprint)) {
    return;
  }

  let delayMs: number | null = null;
  if (operatorTypingActive(runtime)) {
    delayMs = Math.max((runtime.userTypingUntilAtMs ?? Date.now()) - Date.now(), 0);
  } else if (runtime.status === "idle") {
    if (runtime.providerIdleSinceAtMs !== null && session.watchdogState.nudgeCount === 0) {
      delayMs = 0;
    } else {
      delayMs = Math.max(
        processBlueprint.watchdog.idleTimeoutSeconds * 1000 -
          (Date.now() - persistedIdleWatchdogAnchorMs(session)),
        0,
      );
    }
  } else if (runtime.status === "running") {
    const anchorMs = runtime.lastVisibleActivityAtMs ?? runtime.startedAtMs;
    if (anchorMs !== null) {
      delayMs = Math.max(
        processBlueprint.watchdog.idleTimeoutSeconds * 1000 - (Date.now() - anchorMs),
        0,
      );
    }
  }

  if (delayMs === null) {
    return;
  }

  const handle = setTimeout(() => {
    maybeTriggerSessionWatchdog(sessionId);
  }, delayMs);
  sessionWatchdogTimers.set(sessionId, handle);
}

function setUserTypingState(sessionId: string, active: boolean) {
  const session = store.getSession(sessionId);
  if (!session) {
    return null;
  }

  const runtime = setRuntimeState(sessionId, (current) => ({
    ...current,
    userTypingUntilAtMs: active ? Date.now() + typingGraceMs : null,
  }));
  if (!active && runtime.status !== "idle" && runtime.status !== "running") {
    cancelSessionWatchdog(sessionId);
  }
  return runtime;
}

function rearmPersistedSessionWatchdogs() {
  for (const session of store.listSessions()) {
    const processBlueprint = getSessionProcessBlueprint(session);
    if (!processBlueprint?.watchdog.enabled) {
      continue;
    }
    if (sessionTerminalWatchdogState(session)) {
      continue;
    }
    if (processBlueprintNudgeLimitReached(session, processBlueprint)) {
      continue;
    }
    ensureRuntimeState(session.id);
    maybeScheduleSessionWatchdog(session.id);
  }
}

function buildRetryWaitingFlag(delayMs: number) {
  return `retrying in ${Math.max(1, Math.ceil(delayMs / 1000))}s`;
}

function shouldRetryProviderError(errorText: string, attempt: number) {
  return isRetryableProviderError(errorText) && attempt < retryBackoffMs.length + 1;
}

function providerActivityCallbacks(
  sessionId: string,
  currentSession: StoredSession,
  seenQueuedInstructionMessages: StoredMessage[],
  seenQueuedMessages: StoredMessage[],
  seenThoughtItemIds: Set<string>,
  streamCheckpointMessageIds: Map<string, string>,
  streamCheckpointTexts: Map<string, string>,
) {
  return {
    onRunStarted(payload: { threadId: string; turnId: string }) {
      const startedActivity = appendActivityMessage(sessionId, "Provider turn started.");
      setRuntimeState(sessionId, (current) => ({
        ...current,
        status: "running",
        startedAtMs: current.startedAtMs ?? Date.now(),
        lastVisibleActivityAtMs: Date.now(),
        providerIdleSinceAtMs: null,
        threadId: payload.threadId,
        turnId: payload.turnId,
      }));
      broadcastSession(sessionId, {
        type: "run.started",
        sessionId,
        providerKind: currentSession.providerKind,
        messages: [...seenQueuedInstructionMessages, ...seenQueuedMessages].sort(
          (left, right) => left.createdAtMs - right.createdAtMs,
        ),
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      });
      broadcastSingleMessageUpdate(sessionId, startedActivity);
    },
    onThreadStatusChanged(payload: { threadId: string; flags: string[] }) {
      let statusMessage: StoredMessage | null = null;
      setRuntimeState(sessionId, (current) => {
        const changed = current.waitingFlags.join("\u0000") !== payload.flags.join("\u0000");
        if (changed) {
          statusMessage = appendActivityMessage(
            sessionId,
            payload.flags.length > 0
              ? `Agent waiting: ${payload.flags.join(", ")}.`
              : "Agent resumed.",
          );
        }
        return {
          ...current,
          threadId: payload.threadId || current.threadId,
          waitingFlags: payload.flags,
          lastVisibleActivityAtMs: changed ? Date.now() : current.lastVisibleActivityAtMs,
          providerIdleSinceAtMs: null,
        };
      });
      if (statusMessage) {
        broadcastSingleMessageUpdate(sessionId, statusMessage);
      }
      broadcastActivity(sessionId);
    },
    onBackgroundProcessCountChanged(payload: {
      threadId: string;
      turnId: string;
      backgroundProcessCount: number;
    }) {
      setRuntimeState(sessionId, (current) => ({
        ...current,
        threadId: payload.threadId || current.threadId,
        turnId: payload.turnId || current.turnId,
        backgroundProcessCount: payload.backgroundProcessCount,
        lastVisibleActivityAtMs:
          current.backgroundProcessCount === payload.backgroundProcessCount
            ? current.lastVisibleActivityAtMs
            : Date.now(),
        providerIdleSinceAtMs: null,
      }));
      broadcastActivity(sessionId);
    },
    onAssistantDelta(payload: {
      threadId: string;
      turnId: string;
      itemId: string;
      delta: string;
    }) {
      if (payload.delta) {
        markSessionVisibleActivity(sessionId);
      }
      if (payload.itemId) {
        const nextText = `${streamCheckpointTexts.get(payload.itemId) ?? ""}${payload.delta}`;
        streamCheckpointTexts.set(payload.itemId, nextText);

        const existingMessageId = streamCheckpointMessageIds.get(payload.itemId);
        const checkpointContent: StoredMessageContentBlock[] = [
          {
            type: "text",
            text: nextText,
          },
        ];

        const checkpointMessage = existingMessageId
          ? store.updateMessageContent(sessionId, existingMessageId, checkpointContent)
          : store.appendMessage(sessionId, {
              role: "assistant",
              kind: "streamCheckpoint",
              providerSeenAtMs: Date.now(),
              content: checkpointContent,
            });

        if (checkpointMessage) {
          streamCheckpointMessageIds.set(payload.itemId, checkpointMessage.id);
          broadcastSession(sessionId, {
            type: "session.updated",
            session: store.getSession(sessionId)
              ? buildSessionSummary(store.getSession(sessionId)!)
              : null,
            messages: [checkpointMessage],
            queuedMessages: store.listQueuedMessages(sessionId),
            activity: toSessionActivity(sessionId),
          });
        }
      }

      broadcastSession(sessionId, {
        type: "run.delta",
        sessionId,
        threadId: payload.threadId,
        turnId: payload.turnId,
        itemId: payload.itemId,
        delta: payload.delta,
      });
    },
    onThoughtItem(payload: {
      threadId: string;
      turnId: string;
      itemId: string;
      summaryText: string;
    }) {
      if (!payload.itemId || seenThoughtItemIds.has(payload.itemId) || !payload.summaryText.trim()) {
        return;
      }
      markSessionVisibleActivity(sessionId);
      seenThoughtItemIds.add(payload.itemId);
      const thoughtMessage = store.appendMessage(sessionId, {
        role: "assistant",
        kind: "thought",
        providerSeenAtMs: Date.now(),
        content: [
          {
            type: "text",
            text: payload.summaryText,
          },
        ],
      });
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummary(store.getSession(sessionId)!)
          : null,
        messages: [thoughtMessage],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      });
    },
    onActivity(payload: { threadId: string; turnId: string; text: string }) {
      const activityMessage = appendActivityMessage(sessionId, payload.text);
      setRuntimeState(sessionId, (current) => ({
        ...current,
        threadId: payload.threadId || current.threadId,
        turnId: payload.turnId || current.turnId,
        lastVisibleActivityAtMs: Date.now(),
        providerIdleSinceAtMs: null,
      }));
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummary(store.getSession(sessionId)!)
          : null,
        messages: [activityMessage],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      });
    },
  };
}

function finalizeIdleRuntimeState(sessionId: string, threadId: string | null) {
  setRuntimeState(sessionId, {
    status: "idle",
    startedAtMs: null,
    threadId,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError: null,
    currentMessageId: null,
    canInterrupt: false,
    lastVisibleActivityAtMs: null,
    interruptRequested: false,
    providerKind: null,
    providerIdleSinceAtMs: Date.now(),
  });
}

function finalizeNonIdleRuntimeState(
  sessionId: string,
  status: "interrupted" | "error",
  lastError: string | null,
  providerKind: AgentChatProviderKind | null = null,
) {
  setRuntimeState(sessionId, {
    status,
    startedAtMs: null,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError,
    currentMessageId: null,
    canInterrupt: false,
    lastVisibleActivityAtMs: null,
    interruptRequested: false,
    providerKind,
    providerIdleSinceAtMs: null,
  });
}

function broadcastSingleMessageUpdate(sessionId: string, message: StoredMessage) {
  broadcastSession(sessionId, {
    type: "session.updated",
    session: store.getSession(sessionId) ? buildSessionSummary(store.getSession(sessionId)!) : null,
    messages: [message],
    queuedMessages: store.listQueuedMessages(sessionId),
    activity: toSessionActivity(sessionId),
  });
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

function buildSessionTitleFromContent(content: StoredMessageContentBlock[]) {
  const firstText = content.find((block) => block.type === "text" && block.text.trim());
  if (firstText?.type === "text") {
    return buildSessionTitle(firstText.text);
  }

  const imageCount = content.filter((block) => block.type === "image").length;
  return imageCount <= 1 ? "Shared image" : `Shared ${imageCount} images`;
}

function decodeImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Unsupported image payload. Expected a base64 image data URL.");
  }

  const mediaType = match[1]!.toLowerCase();
  const base64Data = match[2]!;
  return {
    mediaType,
    bytes: Buffer.from(base64Data, "base64"),
  };
}

function normalizeMessageContent(
  sessionId: string,
  payload: {
    text?: string;
    content?: Array<
      | { type?: "text"; text?: string }
      | { type?: "image"; dataUrl?: string }
    >;
  },
): StoredMessageContentBlock[] {
  const nextContent: StoredMessageContentBlock[] = [];

  for (const block of payload.content ?? []) {
    if (block?.type === "text") {
      const text = block.text?.trim() || "";
      if (text) {
        nextContent.push({ type: "text", text });
      }
      continue;
    }

    if (block?.type === "image") {
      const dataUrl = block.dataUrl?.trim() || "";
      if (!dataUrl) {
        continue;
      }
      const decoded = decodeImageDataUrl(dataUrl);
      const attachment = store.persistAttachment(sessionId, decoded);
      nextContent.push({
        type: "image",
        url: attachment.url,
      });
    }
  }

  if (nextContent.length > 0) {
    return nextContent;
  }

  const text = payload.text?.trim() || "";
  return text ? [{ type: "text", text }] : [];
}

function buildProviderInputContent(content: StoredMessageContentBlock[]): ProviderInputBlock[] {
  return content.reduce<ProviderInputBlock[]>((accumulator, block) => {
    if (block.type === "text") {
      const text = block.text.trim();
      if (text) {
        accumulator.push({ type: "text", text });
      }
      return accumulator;
    }

    const attachment = store.readAttachmentBytes(block.url);
    accumulator.push({
      type: "image",
      url: block.url,
      mediaType: attachment?.attachment.mediaType ?? null,
      filePath: attachment?.attachment.path ?? null,
      base64Data: attachment ? attachment.bytes.toString("base64") : null,
    });
    return accumulator;
  }, []);
}

function normalizeOptionalValue(value: string | null | undefined) {
  return value?.trim() || "";
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
  if (next.status === "idle" || next.status === "running") {
    maybeScheduleSessionWatchdog(sessionId);
  } else {
    cancelSessionWatchdog(sessionId);
  }
  return next;
}

function markSessionVisibleActivity(sessionId: string, atMs = Date.now()) {
  return setRuntimeState(sessionId, {
    lastVisibleActivityAtMs: atMs,
    providerIdleSinceAtMs: null,
  });
}

async function processSessionQueue(sessionId: string) {
  if (activeSessionRuns.has(sessionId)) {
    return;
  }

  const queuedMessages = store.listQueuedUserMessages(sessionId);
  if (queuedMessages.length === 0) {
    const runtime = ensureRuntimeState(sessionId);
    if (runtime.status === "queued") {
      setRuntimeState(sessionId, {
        status: "idle",
        currentMessageId: null,
        lastError: null,
        providerIdleSinceAtMs: null,
      });
      broadcastActivity(sessionId);
    }
    return;
  }

  void runProviderTurnForQueuedMessages(sessionId, queuedMessages);
}

async function runProviderTurnForQueuedMessages(
  sessionId: string,
  queuedMessages: StoredMessage[],
) {
  const session = store.getSession(sessionId);
  if (!session) {
    return;
  }

  if (activeSessionRuns.has(sessionId)) {
    return;
  }

  activeSessionRuns.add(sessionId);
  const runProviderSettings = {
    providerKind: session.providerKind,
    modelRef: session.modelRef,
    authProfile: session.authProfile,
    imageModelRef: session.imageModelRef,
  };
  setRuntimeState(sessionId, {
    status: "running",
    startedAtMs: Date.now(),
    threadId: session.providerThreadId,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError: null,
    currentMessageId: queuedMessages[0]?.id ?? null,
    canInterrupt: providerSupportsInterrupt(session.providerKind),
    lastVisibleActivityAtMs: Date.now(),
    interruptRequested: false,
    providerKind: session.providerKind,
    providerIdleSinceAtMs: null,
  });
  store.markMessagesSeen(
    sessionId,
    queuedMessages.map((message) => message.id),
  );
  const queuedInstructionMessages = store
    .listQueuedMessages(sessionId)
    .filter(
      (message) =>
        message.providerSeenAtMs === null &&
        message.role === "system" &&
        message.kind !== "watchdogPrompt",
    )
    .sort((left, right) => left.createdAtMs - right.createdAtMs);
  store.markMessagesSeen(
    sessionId,
    queuedInstructionMessages.map((message) => message.id),
  );
  const pendingSystemInstruction = store.consumePendingSystemInstruction(sessionId);
  const seenThoughtItemIds = new Set<string>();
  const streamCheckpointMessageIds = new Map<string, string>();
  const streamCheckpointTexts = new Map<string, string>();
  const seenQueuedMessages = queuedMessages
    .map(
      (queuedMessage) =>
        store.listMessages(sessionId).find((message) => message.id === queuedMessage.id) ?? queuedMessage,
    )
    .sort((left, right) => left.createdAtMs - right.createdAtMs);
  const seenQueuedInstructionMessages = queuedInstructionMessages
    .map(
      (queuedMessage) =>
        store.listMessages(sessionId).find((message) => message.id === queuedMessage.id) ?? queuedMessage,
    )
    .sort((left, right) => left.createdAtMs - right.createdAtMs);
  broadcastActivity(sessionId);

  try {
    const currentSession = store.getSession(sessionId);
    if (!currentSession) {
      throw new Error("Session disappeared before provider execution started");
    }

    const messageContent = queuedMessages.flatMap((queuedMessage) =>
      buildProviderInputContent(queuedMessage.content),
    );
    const callbacks = providerActivityCallbacks(
      sessionId,
      currentSession,
      seenQueuedInstructionMessages,
      seenQueuedMessages,
      seenThoughtItemIds,
      streamCheckpointMessageIds,
      streamCheckpointTexts,
    );

    let result: Awaited<ReturnType<typeof runCodexTurn>> | Awaited<ReturnType<typeof runClaudeTurn>>;
    let attempt = 1;
    while (true) {
      try {
        if (currentSession.providerKind === "codex-app-server") {
          await ensureCodexAppServer(log);
          result = await runCodexTurn(
            currentSession,
            messageContent,
            pendingSystemInstruction,
            callbacks,
          );
        } else if (currentSession.providerKind === "claude-agent-sdk") {
          result = await runClaudeTurn(
            sessionId,
            currentSession,
            messageContent,
            pendingSystemInstruction,
            callbacks,
          );
        } else {
          throw new Error(`${currentSession.providerKind} provider adapter is not implemented yet`);
        }
        break;
      } catch (error) {
        const runtime = ensureRuntimeState(sessionId);
        if (runtime.interruptRequested) {
          throw error;
        }
        const errorText =
          error instanceof Error ? error.message : "Provider run failed unexpectedly.";
        if (!shouldRetryProviderError(errorText, attempt)) {
          throw error;
        }
        const delayMs = retryBackoffMs[attempt - 1] ?? retryBackoffMs.at(-1) ?? 15000;
        const failureActivity = appendActivityMessage(sessionId, `Provider error: ${errorText}`);
        const retryActivity = appendActivityMessage(
          sessionId,
          `Retrying in ${Math.max(1, Math.ceil(delayMs / 1000))}s (attempt ${attempt + 1} of ${retryBackoffMs.length + 1}).`,
        );
        setRuntimeState(sessionId, (current) => ({
          ...current,
          status: "running",
          waitingFlags: [buildRetryWaitingFlag(delayMs)],
          lastError: errorText,
          lastVisibleActivityAtMs: Date.now(),
          providerIdleSinceAtMs: null,
        }));
        broadcastSession(sessionId, {
          type: "session.updated",
          session: store.getSession(sessionId)
            ? buildSessionSummary(store.getSession(sessionId)!)
            : null,
          messages: [failureActivity, retryActivity],
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        });
        await Bun.sleep(delayMs);
        const retryStartActivity = appendActivityMessage(
          sessionId,
          `Retry attempt ${attempt + 1} starting.`,
        );
        setRuntimeState(sessionId, (current) => ({
          ...current,
          status: "running",
          waitingFlags: [],
          lastError: null,
          lastVisibleActivityAtMs: Date.now(),
          providerIdleSinceAtMs: null,
        }));
        broadcastSingleMessageUpdate(sessionId, retryStartActivity);
        attempt += 1;
      }
    }

    const latestSession = store.getSession(sessionId);
    const shouldPersistProviderThread =
      !!latestSession &&
      latestSession.providerKind === runProviderSettings.providerKind &&
      latestSession.modelRef === runProviderSettings.modelRef &&
      normalizeOptionalValue(latestSession.authProfile) ===
        normalizeOptionalValue(runProviderSettings.authProfile) &&
      normalizeOptionalValue(latestSession.imageModelRef) ===
        normalizeOptionalValue(runProviderSettings.imageModelRef);
    const updatedSession = shouldPersistProviderThread
      ? store.updateProviderThread(sessionId, {
          threadId: result.threadId,
          threadPath: result.threadPath,
        })
      : latestSession;
    const finalAssistantText = result.assistantText || "(empty response)";
    const lastStreamItemId = Array.from(streamCheckpointMessageIds.keys()).at(-1) ?? null;
    const lastStreamMessageId = lastStreamItemId ? streamCheckpointMessageIds.get(lastStreamItemId) ?? null : null;
    const lastStreamText = lastStreamItemId ? streamCheckpointTexts.get(lastStreamItemId) ?? "" : "";
    const assistantMessage =
      lastStreamMessageId && lastStreamText === finalAssistantText
        ? store.updateMessage(sessionId, lastStreamMessageId, {
            kind: "chat",
            content: [
              {
                type: "text",
                text: finalAssistantText,
              },
            ],
            providerSeenAtMs: Date.now(),
          }) ??
          store.appendMessage(sessionId, {
            role: "assistant",
            providerSeenAtMs: Date.now(),
            content: [
              {
                type: "text",
                text: finalAssistantText,
              },
            ],
          })
        : store.appendMessage(sessionId, {
            role: "assistant",
            providerSeenAtMs: Date.now(),
            content: [
              {
                type: "text",
                text: finalAssistantText,
              },
            ],
          });
    maybeMarkProcessBlueprintTerminal(sessionId, finalAssistantText);
    finalizeIdleRuntimeState(sessionId, result.threadId);
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
      const systemMessage = appendActivityMessage(sessionId, "Agent run interrupted.");
      finalizeNonIdleRuntimeState(sessionId, "interrupted", null);
      broadcastSingleMessageUpdate(sessionId, systemMessage);
      broadcastSession(sessionId, {
        type: "run.interrupted",
        sessionId,
        activity: toSessionActivity(sessionId),
      });
    } else {
      const failureMessage = appendActivityMessage(sessionId, `Provider run failed: ${errorText}`);
      finalizeNonIdleRuntimeState(sessionId, "error", errorText);
      broadcastSingleMessageUpdate(sessionId, failureMessage);
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
  async fetch(request, serverInstance) {
    const url = new URL(request.url);

    const attachment = store.resolveAttachment(url.pathname);
    if (attachment && request.method === "GET") {
      return new Response(Bun.file(attachment.path), {
        status: 200,
        headers: {
          "content-type": attachment.mediaType,
          "cache-control": "no-store",
        },
      });
    }

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
      await refreshClaudeModelCatalog();
      return jsonResponse({
        ok: true,
        providers: listProviderCatalog(),
      });
    }

    if (url.pathname === "/api/agent-chat/process-blueprints") {
      return jsonResponse({
        ok: true,
        processBlueprints: listProcessBlueprints(),
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
          processBlueprintId?: string | null;
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

        const nextProcessBlueprintId = payload.processBlueprintId?.trim() || null;
        if (nextProcessBlueprintId && !processBlueprintById.has(nextProcessBlueprintId)) {
          return jsonResponse({ ok: false, error: "unknown process blueprint" }, 400);
        }

        let session = store.createSession({
          title: payload.title,
          providerKind: payload.providerKind,
          modelRef: normalizeProviderModelRef(
            payload.providerKind,
            payload.modelRef?.trim() || provider.defaultModelRef,
          ),
          cwd: payload.cwd?.trim() || defaultSessionDirectory,
          authProfile: payload.authProfile?.trim() || provider.authProfiles[0] || null,
          imageModelRef: payload.imageModelRef?.trim() || null,
        });
        if (nextProcessBlueprintId) {
          const updatedSession = store.updateSessionProcessBlueprint(session.id, nextProcessBlueprintId);
          if (updatedSession) {
            session = updatedSession;
          }
          const queuedExpectation = queueProcessExpectationForSession(session.id);
          if (queuedExpectation.session) {
            session = queuedExpectation.session;
          }
        }

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
          archived?: boolean;
          processBlueprintId?: string | null;
          forceProcessBlueprintReapply?: boolean;
          providerKind?: AgentChatProviderKind;
          modelRef?: string;
          authProfile?: string | null;
          imageModelRef?: string | null;
        };
        const currentSession = store.getSession(sessionId);
        if (!currentSession) {
          return notFound();
        }

        const nextDirectory = payload.cwd?.trim();
        const nextTitle = payload.title?.trim();
        const nextArchived =
          typeof payload.archived === "boolean" ? payload.archived : undefined;
        const nextProcessBlueprintId =
          payload.processBlueprintId === undefined ? undefined : payload.processBlueprintId?.trim() || null;
        const forceProcessBlueprintReapply = payload.forceProcessBlueprintReapply === true;
        const nextProviderKind = payload.providerKind?.trim() as AgentChatProviderKind | undefined;
        const nextModelRef = payload.modelRef?.trim();
        const nextAuthProfile =
          payload.authProfile === undefined ? undefined : payload.authProfile?.trim() || null;
        const nextImageModelRef =
          payload.imageModelRef === undefined ? undefined : payload.imageModelRef?.trim() || null;
        const hasProviderPatch =
          !!nextProviderKind ||
          !!nextModelRef ||
          payload.authProfile !== undefined ||
          payload.imageModelRef !== undefined;
        const hasProcessBlueprintPatch = payload.processBlueprintId !== undefined;

        if (
          !nextDirectory &&
          !nextTitle &&
          nextArchived === undefined &&
          !hasProviderPatch &&
          !hasProcessBlueprintPatch
        ) {
          return jsonResponse(
            {
              ok: false,
              error:
                "directory, title, archive state, process blueprint, or provider settings required",
            },
            400,
          );
        }
        let session = currentSession;
        const queuedMessages: StoredMessage[] = [];

        if (nextDirectory && session && nextDirectory !== session.cwd) {
          store.markQueuedSystemMessagesSeenByPrefix(sessionId, DIRECTORY_QUEUE_PREFIX);
          const updatedSession = store.updateSessionCwd(sessionId, nextDirectory);
          if (updatedSession) {
            session = updatedSession;
          }
          const directoryMessage = store.appendMessage(sessionId, {
            role: "system",
            kind: "directoryInstruction",
            providerSeenAtMs: null,
            content: [
              {
                type: "text",
                text: `${DIRECTORY_QUEUE_PREFIX}${nextDirectory} for the next agent turn.`,
              },
            ],
          });
          queuedMessages.push(directoryMessage);
          const instructionSession = store.replacePendingSystemInstructionByPrefix(
            sessionId,
            DIRECTORY_INSTRUCTION_PREFIX,
            `${DIRECTORY_INSTRUCTION_PREFIX}${nextDirectory}. Use this directory for subsequent work unless the user says otherwise.`,
          );
          if (instructionSession) {
            session = instructionSession;
          }
        }

        if (nextTitle && session && nextTitle !== session.title) {
          store.markQueuedSystemMessagesSeenByPrefix(sessionId, TITLE_QUEUE_PREFIX);
          const updatedSession = store.updateSessionTitle(sessionId, nextTitle);
          if (updatedSession) {
            session = updatedSession;
          }
          const titleMessage = store.appendMessage(sessionId, {
            role: "system",
            providerSeenAtMs: null,
            content: [
              {
                type: "text",
                text: `${TITLE_QUEUE_PREFIX}${nextTitle} for the next agent turn.`,
              },
            ],
          });
          queuedMessages.push(titleMessage);
          const instructionSession = store.replacePendingSystemInstructionByPrefix(
            sessionId,
            TITLE_INSTRUCTION_PREFIX,
            `${TITLE_INSTRUCTION_PREFIX}${nextTitle}. Use this title when referring to this chat unless the user says otherwise.`,
          );
          if (instructionSession) {
            session = instructionSession;
          }
        }

        if (nextArchived !== undefined && session && nextArchived !== session.archived) {
          const updatedSession = store.updateSessionArchived(sessionId, nextArchived);
          if (updatedSession) {
            session = updatedSession;
          }
        }

        if (hasProcessBlueprintPatch && session) {
          if (nextProcessBlueprintId && !processBlueprintById.has(nextProcessBlueprintId)) {
            return jsonResponse({ ok: false, error: "unknown process blueprint" }, 400);
          }
          const previousProcessBlueprintId = session.processBlueprintId;
          const shouldReapplyProcessBlueprint =
            previousProcessBlueprintId === (nextProcessBlueprintId ?? null) &&
            forceProcessBlueprintReapply;
          const updatedSession = store.updateSessionProcessBlueprint(
            sessionId,
            nextProcessBlueprintId ?? null,
          );
          if (updatedSession) {
            session = updatedSession;
          }
          if (shouldReapplyProcessBlueprint) {
            const resetSession = resetSessionWatchdogState(sessionId);
            if (resetSession) {
              session = resetSession;
            }
          }
          if (
            previousProcessBlueprintId !== (nextProcessBlueprintId ?? null) ||
            shouldReapplyProcessBlueprint
          ) {
            const queuedExpectation = queueProcessExpectationForSession(sessionId);
            if (queuedExpectation.processMessage) {
              queuedMessages.push(queuedExpectation.processMessage);
            }
            if (queuedExpectation.session) {
              session = queuedExpectation.session;
            }
          }
          cancelSessionWatchdog(sessionId);
          maybeScheduleSessionWatchdog(sessionId);
        }

        if (hasProviderPatch && session) {
          const resolvedProviderKind = nextProviderKind ?? session.providerKind;
          const provider = getProviderCatalogEntry(resolvedProviderKind);
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

          const resolvedModelRef = normalizeProviderModelRef(
            resolvedProviderKind,
            nextModelRef || session.modelRef || provider.defaultModelRef,
          );
          const resolvedAuthProfile =
            nextAuthProfile !== undefined
              ? nextAuthProfile
              : session.authProfile || provider.authProfiles[0] || null;
          const resolvedImageModelRef =
            nextImageModelRef !== undefined ? nextImageModelRef : session.imageModelRef;
          const providerChanged =
            resolvedProviderKind !== session.providerKind ||
            resolvedModelRef !== session.modelRef ||
            normalizeOptionalValue(resolvedAuthProfile) !==
              normalizeOptionalValue(session.authProfile) ||
            normalizeOptionalValue(resolvedImageModelRef) !==
              normalizeOptionalValue(session.imageModelRef);

          if (providerChanged) {
            const updatedSession = store.updateSessionProviderSettings(sessionId, {
              providerKind: resolvedProviderKind,
              modelRef: resolvedModelRef,
              authProfile: resolvedAuthProfile,
              imageModelRef: resolvedImageModelRef,
              clearProviderThread: true,
            });
            if (updatedSession) {
              session = updatedSession;
            }

            const providerMessage = store.appendMessage(sessionId, {
              role: "system",
              providerSeenAtMs: Date.now(),
              content: [
                {
                  type: "text",
                  text: `Chat provider changed to ${provider.label} · ${resolvedModelRef}`,
                },
              ],
            });
            queuedMessages.push(providerMessage);
          }
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
      const interruptProviderKind = runtime.providerKind ?? session.providerKind;
      if (!providerSupportsInterrupt(interruptProviderKind)) {
        return jsonResponse({ ok: false, error: "Interrupt not supported for this provider" }, 400);
      }
      if (runtime.status !== "running") {
        return jsonResponse({ ok: false, error: "No active turn to interrupt" }, 409);
      }

      const interruptPromise =
        interruptProviderKind === "codex-app-server"
          ? !runtime.turnId || !runtime.threadId
            ? Promise.reject(new Error("No active turn to interrupt"))
            : interruptCodexTurn(session, runtime.threadId, runtime.turnId)
          : interruptClaudeTurn(sessionId);

      return interruptPromise
        .then(() => {
          setRuntimeState(sessionId, {
            status: "interrupted",
            interruptRequested: true,
            canInterrupt: false,
            providerKind: interruptProviderKind,
            providerIdleSinceAtMs: null,
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
    const typingMatch = /^\/api\/agent-chat\/sessions\/([^/]+)\/typing$/.exec(url.pathname);
    if (typingMatch && request.method === "POST") {
      const sessionId = decodeURIComponent(typingMatch[1]!);
      if (!store.getSession(sessionId)) {
        return notFound();
      }
      return request.json().then((body: unknown) => {
        const payload = body as { active?: boolean };
        setUserTypingState(sessionId, payload.active !== false);
        return jsonResponse({ ok: true, activity: toSessionActivity(sessionId) });
      });
    }

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
          content?: Array<
            | { type?: "text"; text?: string }
            | { type?: "image"; dataUrl?: string }
          >;
        };
        let content: StoredMessageContentBlock[];
        try {
          content = normalizeMessageContent(sessionId, payload);
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : "Invalid message content.";
          return jsonResponse({ ok: false, error: errorText }, 400);
        }
        if (content.length === 0) {
          return jsonResponse({ ok: false, error: "message content required" }, 400);
        }

        const userMessage = store.appendMessage(sessionId, {
          role: "user",
          providerSeenAtMs: null,
          replyToMessageId: payload.replyToMessageId?.trim() || null,
          content,
        });
        resetSessionWatchdogState(sessionId);

        const sessionBeforeRun = store.getSession(sessionId);
        const titledSession =
          sessionBeforeRun?.title === "New chat"
            ? store.updateSessionTitle(sessionId, buildSessionTitleFromContent(content))
            : sessionBeforeRun;

        if (!activeSessionRuns.has(sessionId)) {
          setRuntimeState(sessionId, {
            status: "queued",
            currentMessageId: userMessage.id,
            lastError: null,
            providerIdleSinceAtMs: null,
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
rearmPersistedSessionWatchdogs();
