import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { StoredSession } from "./store.js";

type ProviderInputBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      url: string;
      mediaType: string | null;
      filePath: string | null;
      base64Data: string | null;
    };

const defaultSessionCwd =
  process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace";

type JsonRpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  method?: string;
  params?: Record<string, unknown>;
};

type CodexRateLimitsPayload = {
  primary?: Record<string, unknown>;
  secondary?: Record<string, unknown>;
  credits?: Record<string, unknown> | null;
  planType?: string | null;
};

export type CodexTokenUsagePayload = {
  total?: Record<string, unknown>;
  last?: Record<string, unknown>;
  modelContextWindow?: unknown;
};

type CodexRunCallbacks = {
  onRunStarted?: (payload: { threadId: string; turnId: string }) => void;
  onThreadStatusChanged?: (payload: {
    threadId: string;
    flags: string[];
  }) => void;
  onBackgroundProcessCountChanged?: (payload: {
    threadId: string;
    turnId: string;
    backgroundProcessCount: number;
  }) => void;
  onAssistantDelta?: (payload: {
    threadId: string;
    turnId: string;
    itemId: string;
    delta: string;
  }) => void;
  onThoughtItem?: (payload: {
    threadId: string;
    turnId: string;
    itemId: string;
    summaryText: string;
  }) => void;
  onActivity?: (payload: {
    threadId: string;
    turnId: string;
    text: string;
  }) => void;
  onTokenUsageUpdated?: (payload: {
    threadId: string;
    turnId: string;
    tokenUsage: CodexTokenUsagePayload | null;
  }) => void;
};

type CodexRunResult = {
  threadId: string;
  threadPath: string | null;
  assistantText: string;
  completionIssueText: string | null;
};

const codexWsUrl = process.env.AGENT_CHAT_CODEX_WS_URL?.trim() || "ws://127.0.0.1:8799";
const codexReadyzUrl =
  process.env.AGENT_CHAT_CODEX_READYZ_URL?.trim() || "http://127.0.0.1:8799/readyz";
const codexLogPath =
  process.env.AGENT_CHAT_CODEX_LOG_PATH?.trim() ||
  "/home/ec2-user/state/logs/codex-app-server.log";
const codexTurnIdleTimeoutMs = parseTimeoutMs(
  process.env.AGENT_CHAT_CODEX_TURN_IDLE_TIMEOUT_MS,
  900_000,
);

function summarizeReasoningItem(item: Record<string, unknown>) {
  const summary = Array.isArray(item.summary) ? item.summary : [];
  const entries = summary
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (!entry || typeof entry !== "object") {
        return "";
      }
      return "text" in entry ? String(entry.text ?? "").trim() : "";
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  if (entries.length === 1) {
    return entries[0];
  }

  return entries.map((entry) => `- ${entry}`).join("\n\n");
}

function describeCodexCommandExecution(item: Record<string, unknown> | undefined) {
  if (!item) {
    return "";
  }

  const directTextFields = ["command", "commandLine", "cmd", "title", "summary"];
  for (const field of directTextFields) {
    const value = item[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const commandValue = item.command;
  if (Array.isArray(commandValue)) {
    const parts = commandValue.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  if (commandValue && typeof commandValue === "object") {
    const commandObject = commandValue as Record<string, unknown>;
    const executable =
      typeof commandObject.executable === "string" && commandObject.executable.trim()
        ? commandObject.executable.trim()
        : typeof commandObject.program === "string" && commandObject.program.trim()
          ? commandObject.program.trim()
          : "";
    const args = Array.isArray(commandObject.args)
      ? commandObject.args.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    const joined = [executable, ...args].filter(Boolean).join(" ").trim();
    if (joined) {
      return joined;
    }
  }

  return "";
}

let codexStartupPromise: Promise<void> | null = null;

function parseCodexModel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return "gpt-5.4";
  }

  const parts = trimmed.split("/");
  return parts.at(-1) || trimmed;
}

function parseTimeoutMs(rawValue: string | undefined, fallbackMs: number) {
  const parsed = Number.parseInt(rawValue?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanFromUnknown(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return null;
}

function describeCodexCompletionIssue(
  rateLimits: CodexRateLimitsPayload | null,
  tokenUsage: CodexTokenUsagePayload | null,
) {
  const credits = rateLimits?.credits;
  const hasCredits =
    credits && typeof credits === "object"
      ? booleanFromUnknown((credits as Record<string, unknown>).hasCredits)
      : null;
  const creditBalance =
    credits && typeof credits === "object"
      ? numberFromUnknown((credits as Record<string, unknown>).balance)
      : null;
  if (hasCredits === false || creditBalance === 0) {
    return "Provider credits exhausted; no assistant response was produced.";
  }

  const secondaryUsedPercent = numberFromUnknown(rateLimits?.secondary?.usedPercent);
  if (secondaryUsedPercent !== null && secondaryUsedPercent >= 100) {
    return "Provider token budget exhausted; no assistant response was produced.";
  }

  const modelContextWindow = numberFromUnknown(tokenUsage?.modelContextWindow);
  const totalUsage =
    numberFromUnknown(tokenUsage?.last?.totalTokens) ??
    numberFromUnknown(tokenUsage?.total?.totalTokens);
  if (
    modelContextWindow !== null &&
    totalUsage !== null &&
    totalUsage >= modelContextWindow
  ) {
    return "Provider context window exhausted; no assistant response was produced.";
  }

  return null;
}

async function codexReady() {
  try {
    const response = await fetch(codexReadyzUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCodexReady(maxAttempts = 40) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await codexReady()) {
      return;
    }
    await Bun.sleep(250);
  }

  throw new Error("Codex app-server did not become ready in time");
}

export async function ensureCodexAppServer(log: (message: string) => void) {
  if (await codexReady()) {
    return;
  }

  if (!codexStartupPromise) {
    codexStartupPromise = (async () => {
      mkdirSync(dirname(codexLogPath), { recursive: true });
      log(`start codex app-server listen=${codexWsUrl}`);
      const logFile = Bun.file(codexLogPath);
      const processHandle = Bun.spawn(
        ["codex", "app-server", "--listen", codexWsUrl, "--session-source", "vscode"],
        {
          stdout: logFile,
          stderr: logFile,
          stdin: "ignore",
          detached: true,
        },
      );
      processHandle.unref();
      await waitForCodexReady();
    })().finally(() => {
      codexStartupPromise = null;
    });
  }

  await codexStartupPromise;
}

export async function runCodexTurn(
  session: StoredSession,
  inputBlocks: ProviderInputBlock[],
  pendingSystemInstruction: string | null,
  callbacks: CodexRunCallbacks,
): Promise<CodexRunResult> {
  const ws = new WebSocket(codexWsUrl);
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();

  let currentThreadId = session.providerThreadId;
  let currentThreadPath = session.providerThreadPath;
  let currentTurnId = "";
  let assistantText = "";
  let latestRateLimits: CodexRateLimitsPayload | null = null;
  let latestTokenUsage: CodexTokenUsagePayload | null = null;
  let turnCompletedWithError: string | null = null;
  let completed = false;
  const activeCommandIds = new Set<string>();

  function closeSocket() {
    try {
      ws.close();
    } catch {}
  }

  function request(method: string, params: Record<string, unknown>) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  const completionPromise = new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function clearCompletionTimeout() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    }

    function armCompletionTimeout() {
      clearCompletionTimeout();
      timeout = setTimeout(() => {
        closeSocket();
        reject(
          new Error(
            `Codex turn timed out after ${Math.floor(codexTurnIdleTimeoutMs / 1000)}s of inactivity`,
          ),
        );
      }, codexTurnIdleTimeoutMs);
    }

    armCompletionTimeout();

    ws.addEventListener("message", (event) => {
      armCompletionTimeout();
      const message = JSON.parse(String(event.data)) as JsonRpcResponse;

      if (typeof message.id === "number") {
        const pendingRequest = pending.get(message.id);
        if (!pendingRequest) {
          return;
        }
        pending.delete(message.id);
        if (message.error) {
          pendingRequest.reject(new Error(message.error.message));
        } else {
          pendingRequest.resolve(message.result ?? {});
        }
        return;
      }

      if (message.method === "turn/started") {
        const params = message.params ?? {};
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(params.threadId ?? currentThreadId ?? "");
        currentTurnId = String(turn?.id ?? "");
        callbacks.onRunStarted?.({
          threadId,
          turnId: currentTurnId,
        });
        return;
      }

      if (message.method === "thread/status/changed") {
        const params = message.params ?? {};
        const status = params.status as
          | { type?: string; activeFlags?: unknown[] }
          | undefined;
        callbacks.onThreadStatusChanged?.({
          threadId: String(params.threadId ?? currentThreadId ?? ""),
          flags:
            status?.type === "active" && Array.isArray(status.activeFlags)
              ? status.activeFlags.map((flag) => String(flag))
              : [],
        });
        return;
      }

      if (message.method === "account/rateLimits/updated") {
        const params = message.params ?? {};
        latestRateLimits = (params.rateLimits as CodexRateLimitsPayload | undefined) ?? null;
        return;
      }

      if (message.method === "thread/tokenUsage/updated") {
        const params = message.params ?? {};
        latestTokenUsage = (params.tokenUsage as CodexTokenUsagePayload | undefined) ?? null;
        callbacks.onTokenUsageUpdated?.({
          threadId: String(params.threadId ?? currentThreadId ?? ""),
          turnId: String(params.turnId ?? currentTurnId),
          tokenUsage: latestTokenUsage,
        });
        return;
      }

      if (message.method === "item/started") {
        const params = message.params ?? {};
        const item = params.item as Record<string, unknown> | undefined;
        if (item?.type === "commandExecution") {
          activeCommandIds.add(String(item.id ?? ""));
          const commandLabel = describeCodexCommandExecution(item);
          callbacks.onActivity?.({
            threadId: String(params.threadId ?? currentThreadId ?? ""),
            turnId: String(params.turnId ?? currentTurnId),
            text: commandLabel ? `Command started: ${commandLabel}` : "Command execution started.",
          });
          callbacks.onBackgroundProcessCountChanged?.({
            threadId: String(params.threadId ?? currentThreadId ?? ""),
            turnId: String(params.turnId ?? currentTurnId),
            backgroundProcessCount: activeCommandIds.size,
          });
        }
        return;
      }

      if (message.method === "item/agentMessage/delta") {
        const params = message.params ?? {};
        const delta = String(params.delta ?? "");
        assistantText += delta;
        callbacks.onAssistantDelta?.({
          threadId: String(params.threadId ?? currentThreadId ?? ""),
          turnId: String(params.turnId ?? currentTurnId),
          itemId: String(params.itemId ?? ""),
          delta,
        });
        return;
      }

      if (message.method === "item/completed") {
        const params = message.params ?? {};
        const item = params.item as Record<string, unknown> | undefined;
        if (item?.type === "agentMessage") {
          assistantText = String(item.text ?? assistantText);
        }
        if (item?.type === "reasoning") {
          callbacks.onThoughtItem?.({
            threadId: String(params.threadId ?? currentThreadId ?? ""),
            turnId: String(params.turnId ?? currentTurnId),
            itemId: String(item.id ?? ""),
            summaryText: summarizeReasoningItem(item),
          });
        }
        if (item?.type === "commandExecution") {
          activeCommandIds.delete(String(item.id ?? ""));
          const commandLabel = describeCodexCommandExecution(item);
          callbacks.onActivity?.({
            threadId: String(params.threadId ?? currentThreadId ?? ""),
            turnId: String(params.turnId ?? currentTurnId),
            text: commandLabel
              ? `Command completed: ${commandLabel}`
              : "Command execution completed.",
          });
          callbacks.onBackgroundProcessCountChanged?.({
            threadId: String(params.threadId ?? currentThreadId ?? ""),
            turnId: String(params.turnId ?? currentTurnId),
            backgroundProcessCount: activeCommandIds.size,
          });
        }
        return;
      }

      if (message.method === "turn/completed") {
        const params = message.params ?? {};
        const turn = params.turn as Record<string, unknown> | undefined;
        const rawError = turn?.error;
        turnCompletedWithError =
          rawError && typeof rawError === "object"
            ? typeof (rawError as Record<string, unknown>).message === "string"
              ? String((rawError as Record<string, unknown>).message)
              : JSON.stringify(rawError)
            : typeof rawError === "string"
              ? rawError
              : null;
        completed = true;
        clearCompletionTimeout();
        resolve();
      }
    });

    ws.addEventListener("error", () => {
      clearCompletionTimeout();
      reject(new Error("Codex app-server WebSocket error"));
    });

    ws.addEventListener("close", () => {
      if (!completed) {
        clearCompletionTimeout();
        reject(new Error("Codex app-server WebSocket closed unexpectedly"));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("Failed to connect to Codex app-server")), {
      once: true,
    });
  });

  try {
    await request("initialize", {
      clientInfo: {
        name: "agent-chat-server",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    const model = parseCodexModel(session.modelRef);
    const sessionCwd = session.cwd.trim() || defaultSessionCwd;

    if (currentThreadId) {
      try {
        const response = await request("thread/resume", {
          threadId: currentThreadId,
          model,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          cwd: sessionCwd,
          persistExtendedHistory: false,
        });
        const thread = response.thread as Record<string, unknown> | undefined;
        currentThreadId = String(thread?.id ?? currentThreadId);
        currentThreadPath = thread?.path ? String(thread.path) : currentThreadPath;
      } catch {
        currentThreadId = null;
        currentThreadPath = null;
      }
    }

    if (!currentThreadId) {
      const response = await request("thread/start", {
        model,
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        cwd: sessionCwd,
        experimentalRawEvents: true,
        persistExtendedHistory: false,
        serviceName: "agent-chat-server",
      });
      const thread = response.thread as Record<string, unknown> | undefined;
      currentThreadId = String(thread?.id ?? "");
      currentThreadPath = thread?.path ? String(thread.path) : null;
    }

    const input = [];

    if (pendingSystemInstruction?.trim()) {
      input.push({
        type: "text",
        text: pendingSystemInstruction.trim(),
        text_elements: [],
      });
    }

    for (const block of inputBlocks) {
      if (block.type === "text") {
        input.push({
          type: "text",
          text: block.text,
          text_elements: [],
        });
        continue;
      }

      if (block.filePath) {
        input.push({
          type: "localImage",
          path: block.filePath,
        });
        continue;
      }

      input.push({
        type: "image",
        url: block.url,
      });
    }

    await request("turn/start", {
      threadId: currentThreadId,
      input,
    });

    await completionPromise;

    if (turnCompletedWithError) {
      throw new Error(turnCompletedWithError);
    }

    return {
      threadId: currentThreadId,
      threadPath: currentThreadPath,
      assistantText: assistantText.trim(),
      completionIssueText:
        assistantText.trim() === ""
          ? describeCodexCompletionIssue(latestRateLimits, latestTokenUsage)
          : null,
    };
  } finally {
    closeSocket();
    for (const pendingRequest of pending.values()) {
      pendingRequest.reject(new Error("Codex app-server turn aborted"));
    }
    pending.clear();
  }
}

export async function interruptCodexTurn(
  session: StoredSession,
  threadId: string,
  turnId: string,
) {
  const ws = new WebSocket(codexWsUrl);
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();

  function closeSocket() {
    try {
      ws.close();
    } catch {}
  }

  function request(method: string, params: Record<string, unknown>) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("Failed to connect to Codex app-server")), {
      once: true,
    });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as JsonRpcResponse;
    if (typeof message.id !== "number") {
      return;
    }
    const pendingRequest = pending.get(message.id);
    if (!pendingRequest) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      pendingRequest.reject(new Error(message.error.message));
    } else {
      pendingRequest.resolve(message.result ?? {});
    }
  });

  try {
    await request("initialize", {
      clientInfo: {
        name: "agent-chat-server",
        version: "0.1.0",
      },
    });

    await request("turn/interrupt", {
      threadId: threadId || session.providerThreadId,
      turnId,
    });
  } finally {
    closeSocket();
    for (const pendingRequest of pending.values()) {
      pendingRequest.reject(new Error("Codex interrupt request aborted"));
    }
    pending.clear();
  }
}
