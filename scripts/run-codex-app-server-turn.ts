import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type JsonRpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
  method?: string;
  params?: Record<string, unknown>;
};

type ParsedArgs = {
  url: string;
  token: string | null;
  model: string;
  cwd: string;
  threadId: string | null;
  json: boolean;
  prompt: string;
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readStdin(): Promise<string> {
  return new Promise((resolveInput, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolveInput(data));
    process.stdin.on("error", reject);
  });
}

function optionalOne(args: string[], flag: string): string | null {
  const index = args.findIndex((value) => value === flag);
  if (index === -1) {
    return null;
  }
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return null;
  }
  return next;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function parseArgs(argv: string[]): Promise<ParsedArgs> {
  const url = optionalOne(argv, "--url") ?? process.env.CODEX_APP_SERVER_URL?.trim() ?? "";
  if (!url) {
    fail("Missing Codex app-server URL. Use --url or CODEX_APP_SERVER_URL.");
  }

  const tokenFileArg = optionalOne(argv, "--token-file");
  const tokenFileEnv = process.env.CODEX_APP_SERVER_TOKEN_FILE?.trim() ?? "";
  const tokenFile = tokenFileArg ?? (tokenFileEnv || null);
  const tokenArg = optionalOne(argv, "--token");
  const tokenEnv = process.env.CODEX_APP_SERVER_TOKEN?.trim() ?? "";
  const token =
    tokenArg ??
    (tokenEnv || null) ??
    (tokenFile ? readFileSync(resolve(tokenFile), "utf8").trim() : null);

  const model = optionalOne(argv, "--model") ?? "gpt-5.4";
  const cwd = optionalOne(argv, "--cwd") ?? process.cwd();
  const threadId = optionalOne(argv, "--thread-id");
  const json = hasFlag(argv, "--json");

  const positional = argv.filter((value, index) => {
    if (!value.startsWith("--")) {
      const previous = argv[index - 1];
      return !previous || !["--url", "--token", "--token-file", "--model", "--cwd", "--thread-id"].includes(previous);
    }
    return false;
  });

  let prompt = positional.join(" ").trim();
  if (!prompt || prompt === "-") {
    prompt = (await readStdin()).trim();
  }
  if (!prompt) {
    fail("Missing prompt. Pass it as arguments or stdin.");
  }

  return {
    url,
    token,
    model,
    cwd,
    threadId: threadId?.trim() || null,
    json,
    prompt,
  };
}

async function main() {
  const args = await parseArgs(process.argv.slice(2));
  const headers = args.token ? { Authorization: `Bearer ${args.token}` } : undefined;
  const ws = new WebSocket(args.url, { headers });

  let nextId = 1;
  let currentThreadId = args.threadId;
  let currentTurnId = "";
  let assistantText = "";
  let turnError: string | null = null;
  let completed = false;

  const pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();

  function emit(event: Record<string, unknown>) {
    if (args.json) {
      console.log(JSON.stringify(event));
    }
  }

  function closeSocket() {
    try {
      ws.close();
    } catch {}
  }

  function request(method: string, params: Record<string, unknown>) {
    return new Promise<Record<string, unknown>>((resolveRequest, rejectRequest) => {
      const id = nextId++;
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  const completionPromise = new Promise<void>((resolveCompletion, rejectCompletion) => {
    const timeout = setTimeout(() => {
      closeSocket();
      rejectCompletion(new Error("Timed out waiting for Codex app-server turn completion."));
    }, 300_000);

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as JsonRpcResponse;

      if (typeof message.id === "number") {
        const pendingRequest = pending.get(message.id);
        if (!pendingRequest) {
          return;
        }
        pending.delete(message.id);
        if (message.error) {
          pendingRequest.reject(
            new Error(message.error.message || `JSON-RPC error ${message.error.code ?? "unknown"}`),
          );
        } else {
          pendingRequest.resolve(message.result ?? {});
        }
        return;
      }

      if (message.method === "turn/started") {
        const params = message.params ?? {};
        currentThreadId = String(params.threadId ?? currentThreadId ?? "");
        const turn = params.turn as Record<string, unknown> | undefined;
        currentTurnId = String(turn?.id ?? "");
        emit({ type: "turn.started", threadId: currentThreadId, turnId: currentTurnId });
        return;
      }

      if (message.method === "item/agentMessage/delta") {
        const delta = String(message.params?.delta ?? "");
        assistantText += delta;
        if (args.json) {
          emit({ type: "assistant.delta", delta });
        } else {
          process.stdout.write(delta);
        }
        return;
      }

      if (message.method === "item/completed") {
        const item = message.params?.item as Record<string, unknown> | undefined;
        if (item?.type === "agentMessage") {
          assistantText = String(item.text ?? assistantText);
          emit({ type: "assistant.completed", text: assistantText });
        }
        return;
      }

      if (message.method === "turn/completed") {
        const turn = (message.params?.turn as Record<string, unknown> | undefined) ?? {};
        const rawError = turn.error;
        turnError =
          rawError && typeof rawError === "object"
            ? typeof (rawError as Record<string, unknown>).message === "string"
              ? String((rawError as Record<string, unknown>).message)
              : JSON.stringify(rawError)
            : typeof rawError === "string"
              ? rawError
              : null;
        completed = true;
        clearTimeout(timeout);
        emit({
          type: "turn.completed",
          threadId: currentThreadId,
          turnId: currentTurnId,
          error: turnError,
        });
        resolveCompletion();
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      rejectCompletion(new Error("Failed to connect to Codex app-server."));
    });

    ws.addEventListener("close", () => {
      if (!completed) {
        clearTimeout(timeout);
        rejectCompletion(new Error("Codex app-server WebSocket closed unexpectedly."));
      }
    });
  });

  await new Promise<void>((resolveOpen, rejectOpen) => {
    ws.addEventListener("open", () => resolveOpen(), { once: true });
    ws.addEventListener("error", () => rejectOpen(new Error("WebSocket open failed.")), {
      once: true,
    });
  });

  try {
    await request("initialize", {
      clientInfo: {
        name: "agent-provider-remote-script",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    if (currentThreadId) {
      try {
        const response = await request("thread/resume", {
          threadId: currentThreadId,
          model: args.model,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          cwd: args.cwd,
          persistExtendedHistory: false,
        });
        const thread = response.thread as Record<string, unknown> | undefined;
        currentThreadId = String(thread?.id ?? currentThreadId);
      } catch {
        currentThreadId = null;
      }
    }

    if (!currentThreadId) {
      const response = await request("thread/start", {
        model: args.model,
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        cwd: args.cwd,
        experimentalRawEvents: true,
        persistExtendedHistory: false,
        serviceName: "agent-provider-remote-script",
      });
      const thread = response.thread as Record<string, unknown> | undefined;
      currentThreadId = String(thread?.id ?? "");
      emit({ type: "thread.started", threadId: currentThreadId });
    }

    await request("turn/start", {
      threadId: currentThreadId,
      input: [
        {
          type: "text",
          text: args.prompt,
          text_elements: [],
        },
      ],
    });

    await completionPromise;
    if (turnError) {
      fail(turnError);
    }

    if (args.json) {
      emit({
        type: "result",
        threadId: currentThreadId,
        turnId: currentTurnId,
        text: assistantText.trim(),
      });
    } else if (!assistantText.endsWith("\n")) {
      process.stdout.write("\n");
    }
  } finally {
    closeSocket();
    for (const pendingRequest of pending.values()) {
      pendingRequest.reject(new Error("Codex app-server turn aborted."));
    }
    pending.clear();
  }
}

await main();
