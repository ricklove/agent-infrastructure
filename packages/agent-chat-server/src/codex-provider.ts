import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { StoredSession } from "./store.js";

type JsonRpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  method?: string;
  params?: Record<string, unknown>;
};

type CodexRunCallbacks = {
  onRunStarted?: (payload: { threadId: string; turnId: string }) => void;
  onAssistantDelta?: (payload: {
    threadId: string;
    turnId: string;
    itemId: string;
    delta: string;
  }) => void;
};

type CodexRunResult = {
  threadId: string;
  threadPath: string | null;
  assistantText: string;
};

const codexWsUrl = process.env.AGENT_CHAT_CODEX_WS_URL?.trim() || "ws://127.0.0.1:8799";
const codexReadyzUrl =
  process.env.AGENT_CHAT_CODEX_READYZ_URL?.trim() || "http://127.0.0.1:8799/readyz";
const codexLogPath =
  process.env.AGENT_CHAT_CODEX_LOG_PATH?.trim() ||
  "/home/ec2-user/state/logs/codex-app-server.log";

let codexStartupPromise: Promise<void> | null = null;

function parseCodexModel(modelRef: string) {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return "gpt-5.4";
  }

  const parts = trimmed.split("/");
  return parts.at(-1) || trimmed;
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
  inputText: string,
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
  let completed = false;

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
    const timeout = setTimeout(() => {
      reject(new Error("Codex turn timed out"));
    }, 120_000);

    ws.addEventListener("message", (event) => {
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
        return;
      }

      if (message.method === "turn/completed") {
        completed = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Codex app-server WebSocket error"));
    });

    ws.addEventListener("close", () => {
      if (!completed) {
        clearTimeout(timeout);
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
    });

    const model = parseCodexModel(session.modelRef);

    if (currentThreadId) {
      try {
        const response = await request("thread/resume", {
          threadId: currentThreadId,
          model,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          cwd: "/home/ec2-user/workspace/projects/agent-infrastructure",
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
        cwd: "/home/ec2-user/workspace/projects/agent-infrastructure",
        experimentalRawEvents: false,
        persistExtendedHistory: false,
        serviceName: "agent-chat-server",
      });
      const thread = response.thread as Record<string, unknown> | undefined;
      currentThreadId = String(thread?.id ?? "");
      currentThreadPath = thread?.path ? String(thread.path) : null;
    }

    await request("turn/start", {
      threadId: currentThreadId,
      input: [
        {
          type: "text",
          text: inputText,
          text_elements: [],
        },
      ],
    });

    await completionPromise;

    return {
      threadId: currentThreadId,
      threadPath: currentThreadPath,
      assistantText: assistantText.trim(),
    };
  } finally {
    closeSocket();
    for (const pendingRequest of pending.values()) {
      pendingRequest.reject(new Error("Codex app-server turn aborted"));
    }
    pending.clear();
  }
}
