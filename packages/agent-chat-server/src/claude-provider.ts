import { randomUUID } from "node:crypto";
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { resolveClaudeSdkModelValue } from "./model-service.js";
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

type ClaudeRunCallbacks = {
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
};

type ClaudeRunResult = {
  threadId: string;
  threadPath: string | null;
  assistantText: string;
};

type ClaudeSdkMessage = {
  type?: string;
  subtype?: string;
  uuid?: string;
  session_id?: string;
  status?: string | null;
  message?: {
    id?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
  event?: {
    type?: string;
    index?: number;
    delta?: {
      type?: string;
      text?: string;
      partial_json?: string;
    };
  };
  result?: string;
  error?: string;
  task_id?: string;
};

const activeClaudeQueries = new Map<string, Query>();

function parseClaudeModel(modelRef: string) {
  return resolveClaudeSdkModelValue(modelRef);
}

function buildClaudeMessageContent(
  inputBlocks: ProviderInputBlock[],
  pendingSystemInstruction: string | null,
) {
  const content: Array<Record<string, unknown>> = [];
  const systemText = pendingSystemInstruction?.trim();
  if (systemText) {
    content.push({
      type: "text",
      text: systemText,
    });
  }

  for (const block of inputBlocks) {
    if (block.type === "text") {
      const text = block.text.trim();
      if (!text) {
        continue;
      }
      content.push({
        type: "text",
        text,
      });
      continue;
    }

    if (block.base64Data && block.mediaType) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: block.mediaType,
          data: block.base64Data,
        },
      });
      continue;
    }

    if (block.url.startsWith("http://") || block.url.startsWith("https://")) {
      content.push({
        type: "image",
        source: {
          type: "url",
          url: block.url,
        },
      });
    }
  }

  return content
}

function extractAssistantText(message: ClaudeSdkMessage["message"]) {
  if (!message?.content?.length) {
    return "";
  }

  return message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() || "")
    .filter(Boolean)
    .join("\n\n");
}

function buildClaudeEnv(session: StoredSession) {
  const env = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "agent-chat-server",
  } as Record<string, string | undefined>;

  // Keep the current auth-profile choice on the session, but rely on the SDK's
  // native auth discovery rather than guessing provider-specific env rewrites.
  if (session.authProfile?.trim()) {
    env.AGENT_CHAT_CLAUDE_AUTH_PROFILE = session.authProfile.trim();
  }

  return env;
}

export async function runClaudeTurn(
  sessionId: string,
  session: StoredSession,
  inputBlocks: ProviderInputBlock[],
  pendingSystemInstruction: string | null,
  callbacks: ClaudeRunCallbacks,
): Promise<ClaudeRunResult> {
  const model = parseClaudeModel(session.modelRef);
  const sessionCwd = session.cwd.trim() || defaultSessionCwd;
  const prompt = (async function* () {
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: buildClaudeMessageContent(inputBlocks, pendingSystemInstruction),
      },
      parent_tool_use_id: null,
      session_id: session.providerThreadId || randomUUID(),
    }
  })();
  const activeTaskIds = new Set<string>();
  let currentThreadId = session.providerThreadId || "";
  let currentTurnId = "";
  let assistantText = "";
  let finalResultText = "";
  let started = false;

  const runQuery = query({
    prompt,
    options: {
      cwd: sessionCwd,
      model,
      resume: session.providerThreadId || undefined,
      includePartialMessages: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: buildClaudeEnv(session),
    },
  });

  activeClaudeQueries.set(sessionId, runQuery);

  try {
    for await (const rawMessage of runQuery) {
      const message = rawMessage as ClaudeSdkMessage;
      const nextThreadId = message.session_id || currentThreadId;
      if (nextThreadId && !started) {
        currentThreadId = nextThreadId;
        currentTurnId = String(message.uuid || nextThreadId);
        started = true;
        callbacks.onRunStarted?.({
          threadId: currentThreadId,
          turnId: currentTurnId,
        });
      } else if (nextThreadId) {
        currentThreadId = nextThreadId;
      }

      if (message.type === "system" && message.subtype === "status") {
        callbacks.onThreadStatusChanged?.({
          threadId: currentThreadId,
          flags: message.status ? [String(message.status)] : [],
        });
        continue;
      }

      if (message.type === "system" && message.subtype === "task_started") {
        if (message.task_id) {
          activeTaskIds.add(message.task_id);
          callbacks.onBackgroundProcessCountChanged?.({
            threadId: currentThreadId,
            turnId: currentTurnId || currentThreadId,
            backgroundProcessCount: activeTaskIds.size,
          });
        }
        continue;
      }

      if (message.type === "system" && message.subtype === "task_notification") {
        if (message.task_id) {
          activeTaskIds.delete(message.task_id);
          callbacks.onBackgroundProcessCountChanged?.({
            threadId: currentThreadId,
            turnId: currentTurnId || currentThreadId,
            backgroundProcessCount: activeTaskIds.size,
          });
        }
        continue;
      }

      if (message.type === "stream_event") {
        const streamEvent = message.event;
        const delta = streamEvent?.delta;
        if (streamEvent?.type === "content_block_delta" && delta?.type === "text_delta") {
          const textDelta = String(delta.text ?? "");
          if (textDelta) {
            assistantText += textDelta;
            callbacks.onAssistantDelta?.({
              threadId: currentThreadId,
              turnId: currentTurnId || currentThreadId,
              itemId: String(message.uuid || `claude-delta-${streamEvent.index ?? 0}`),
              delta: textDelta,
            });
          }
        }
        continue;
      }

      if (message.type === "assistant") {
        const fullText = extractAssistantText(message.message);
        if (fullText) {
          assistantText = fullText;
        }
        continue;
      }

      if (message.type === "result") {
        finalResultText = String(message.result ?? "");
        if (message.subtype === "error") {
          throw new Error(String(message.error || finalResultText || "Claude Agent SDK run failed"));
        }
      }
    }

    return {
      threadId: currentThreadId,
      threadPath: null,
      assistantText: (assistantText || finalResultText).trim(),
    };
  } finally {
    activeClaudeQueries.delete(sessionId);
  }
}

export async function interruptClaudeTurn(sessionId: string) {
  const activeQuery = activeClaudeQueries.get(sessionId);
  if (!activeQuery) {
    throw new Error("No active Claude Agent SDK run to interrupt");
  }

  await activeQuery.interrupt();
}
