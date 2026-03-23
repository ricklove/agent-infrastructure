import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AgentChatProviderKind } from "./catalog.js";

export type StoredSession = {
  id: string;
  title: string;
  providerKind: AgentChatProviderKind;
  modelRef: string;
  cwd: string;
  pendingSystemInstruction: string | null;
  pendingSystemInstructionMessageId: string | null;
  authProfile: string | null;
  imageModelRef: string | null;
  providerThreadId: string | null;
  providerThreadPath: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  preview: string | null;
  messageCount: number;
};

export type StoredMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  kind: "chat" | "directoryInstruction";
  replyToMessageId: string | null;
  providerSeenAtMs: number | null;
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
  createdAtMs: number;
};

export type CreateSessionInput = {
  title?: string;
  providerKind: AgentChatProviderKind;
  modelRef: string;
  cwd: string;
  authProfile?: string | null;
  imageModelRef?: string | null;
};

type AgentChatStoreOptions = {
  dataDir: string;
  legacySqlitePath?: string | null;
};

type SessionMetadata = Omit<StoredSession, "preview" | "messageCount">;

function safeJsonParse<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function summarizePreview(messages: StoredMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const textBlock = message?.content.find((block) => block.type === "text");
    const preview = textBlock?.type === "text" ? textBlock.text.trim() : "";
    if (preview) {
      return preview;
    }
  }
  return null;
}

function sessionSummary(metadata: SessionMetadata, messages: StoredMessage[]): StoredSession {
  return {
    ...metadata,
    preview: summarizePreview(messages),
    messageCount: messages.length,
  };
}

export class AgentChatStore {
  private readonly sessionsDir: string;
  private readonly sessionCache = new Map<string, StoredSession>();
  private readonly messageCache = new Map<string, StoredMessage[]>();

  constructor(options: AgentChatStoreOptions) {
    this.sessionsDir = join(options.dataDir, "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
    this.importLegacySqliteIfNeeded(options.legacySqlitePath ?? null);
    this.loadCache();
  }

  listSessions(): StoredSession[] {
    return Array.from(this.sessionCache.values()).sort((left, right) => {
      if (right.updatedAtMs !== left.updatedAtMs) {
        return right.updatedAtMs - left.updatedAtMs;
      }
      return right.createdAtMs - left.createdAtMs;
    });
  }

  getSession(sessionId: string): StoredSession | null {
    return this.sessionCache.get(sessionId) ?? null;
  }

  createSession(input: CreateSessionInput): StoredSession {
    const now = Date.now();
    const sessionId = randomUUID();
    const metadata: SessionMetadata = {
      id: sessionId,
      title: input.title?.trim() || "New chat",
      providerKind: input.providerKind,
      modelRef: input.modelRef,
      cwd: input.cwd,
      pendingSystemInstruction: null,
      pendingSystemInstructionMessageId: null,
      authProfile: input.authProfile ?? null,
      imageModelRef: input.imageModelRef ?? null,
      providerThreadId: null,
      providerThreadPath: null,
      createdAtMs: now,
      updatedAtMs: now,
    };
    const messages: StoredMessage[] = [];

    this.writeSessionFiles(metadata, messages);
    const summary = sessionSummary(metadata, messages);
    this.sessionCache.set(sessionId, summary);
    this.messageCache.set(sessionId, messages);
    return summary;
  }

  listMessages(sessionId: string): StoredMessage[] {
    return [...(this.messageCache.get(sessionId) ?? [])];
  }

  listQueuedMessages(sessionId: string): StoredMessage[] {
    return this.listMessages(sessionId).filter(
      (message) =>
        message.providerSeenAtMs === null &&
        (message.role === "user" || message.kind === "directoryInstruction"),
    );
  }

  getNextQueuedUserMessage(sessionId: string): StoredMessage | null {
    return (
      this.listMessages(sessionId).find(
        (message) => message.role === "user" && message.providerSeenAtMs === null,
      ) ?? null
    );
  }

  appendMessage(
    sessionId: string,
    input: {
      role: StoredMessage["role"];
      content: StoredMessage["content"];
      kind?: StoredMessage["kind"];
      replyToMessageId?: string | null;
      providerSeenAtMs?: number | null;
    },
  ): StoredMessage {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const createdAtMs = Date.now();
    const message: StoredMessage = {
      id: randomUUID(),
      sessionId,
      role: input.role,
      kind: input.kind ?? "chat",
      replyToMessageId: input.replyToMessageId ?? null,
      providerSeenAtMs:
        input.providerSeenAtMs === undefined ? createdAtMs : input.providerSeenAtMs,
      content: input.content,
      createdAtMs,
    };

    const nextMessages = [...(this.messageCache.get(sessionId) ?? []), message];
    this.messageCache.set(sessionId, nextMessages);

    const nextSession: StoredSession = {
      ...session,
      updatedAtMs: createdAtMs,
      preview: summarizePreview(nextMessages),
      messageCount: nextMessages.length,
    };

    this.writeSessionMetadata(nextSession);
    appendFileSync(this.messagesPath(sessionId), `${JSON.stringify(message)}\n`);
    this.sessionCache.set(sessionId, nextSession);
    return message;
  }

  updateSessionTitle(sessionId: string, title: string): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    const nextTitle = title.trim();
    if (!current || !nextTitle) {
      return current ?? null;
    }

    const nextSession: StoredSession = {
      ...current,
      title: nextTitle,
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    return nextSession;
  }

  updateProviderThread(
    sessionId: string,
    input: { threadId: string | null; threadPath: string | null },
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    if (!current) {
      return null;
    }

    const nextSession: StoredSession = {
      ...current,
      providerThreadId: input.threadId,
      providerThreadPath: input.threadPath,
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    return nextSession;
  }

  updateSessionCwd(sessionId: string, cwd: string): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    const nextCwd = cwd.trim();
    if (!current || !nextCwd) {
      return current ?? null;
    }

    const nextSession: StoredSession = {
      ...current,
      cwd: nextCwd,
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    return nextSession;
  }

  queuePendingSystemInstruction(
    sessionId: string,
    instruction: string,
    messageId: string,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    if (!current) {
      return null;
    }

    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: instruction,
      pendingSystemInstructionMessageId: messageId,
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    return nextSession;
  }

  consumePendingSystemInstruction(sessionId: string): string | null {
    const current = this.sessionCache.get(sessionId);
    if (!current || !current.pendingSystemInstruction) {
      return null;
    }

    const instruction = current.pendingSystemInstruction;
    const messageId = current.pendingSystemInstructionMessageId;
    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: null,
      pendingSystemInstructionMessageId: null,
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    if (messageId) {
      this.markMessagesSeen(sessionId, [messageId]);
    }
    return instruction;
  }

  markQueuedDirectoryInstructionsSeen(sessionId: string, seenAtMs = Date.now()) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => message.kind === "directoryInstruction")
      .map((message) => message.id);
    this.markMessagesSeen(sessionId, messageIds, seenAtMs);
  }

  markMessagesSeen(sessionId: string, messageIds: string[], seenAtMs = Date.now()) {
    if (messageIds.length === 0) {
      return;
    }

    const currentMessages = this.messageCache.get(sessionId);
    if (!currentMessages?.length) {
      return;
    }

    const targets = new Set(messageIds);
    let changed = false;
    const nextMessages = currentMessages.map((message) => {
      if (!targets.has(message.id) || message.providerSeenAtMs !== null) {
        return message;
      }
      changed = true;
      return {
        ...message,
        providerSeenAtMs: seenAtMs,
      };
    });

    if (!changed) {
      return;
    }

    this.messageCache.set(sessionId, nextMessages);
    this.writeMessagesFile(sessionId, nextMessages);
    const metadata = this.readSessionMetadata(sessionId);
    this.sessionCache.set(sessionId, sessionSummary(metadata, nextMessages));
  }

  private loadCache() {
    this.sessionCache.clear();
    this.messageCache.clear();

    for (const sessionId of this.listSessionDirectories()) {
      const metadata = this.readSessionMetadata(sessionId);
      const messages = this.readMessages(sessionId);
      const summary = sessionSummary(metadata, messages);
      this.sessionCache.set(sessionId, summary);
      this.messageCache.set(sessionId, messages);
    }
  }

  private listSessionDirectories() {
    if (!existsSync(this.sessionsDir)) {
      return [];
    }

    return readdirSync(this.sessionsDir).filter((entry) => {
      try {
        return statSync(join(this.sessionsDir, entry)).isDirectory();
      } catch {
        return false;
      }
    });
  }

  private sessionDir(sessionId: string) {
    return join(this.sessionsDir, sessionId);
  }

  private sessionMetadataPath(sessionId: string) {
    return join(this.sessionDir(sessionId), "session.json");
  }

  private messagesPath(sessionId: string) {
    return join(this.sessionDir(sessionId), "messages.jsonl");
  }

  private writeSessionFiles(metadata: SessionMetadata, messages: StoredMessage[]) {
    mkdirSync(this.sessionDir(metadata.id), { recursive: true });
    mkdirSync(dirname(this.sessionMetadataPath(metadata.id)), { recursive: true });
    mkdirSync(dirname(this.messagesPath(metadata.id)), { recursive: true });
    writeFileSync(this.sessionMetadataPath(metadata.id), `${JSON.stringify(metadata, null, 2)}\n`);
    this.writeMessagesFile(metadata.id, messages);
  }

  private writeMessagesFile(sessionId: string, messages: StoredMessage[]) {
    mkdirSync(dirname(this.messagesPath(sessionId)), { recursive: true });
    const lines = messages.map((message) => JSON.stringify(message)).join("\n");
    writeFileSync(this.messagesPath(sessionId), lines ? `${lines}\n` : "");
  }

  private writeSessionMetadata(session: StoredSession) {
    const metadata: SessionMetadata = {
      id: session.id,
      title: session.title,
      providerKind: session.providerKind,
      modelRef: session.modelRef,
      cwd: session.cwd,
      pendingSystemInstruction: session.pendingSystemInstruction,
      pendingSystemInstructionMessageId: session.pendingSystemInstructionMessageId,
      authProfile: session.authProfile,
      imageModelRef: session.imageModelRef,
      providerThreadId: session.providerThreadId,
      providerThreadPath: session.providerThreadPath,
      createdAtMs: session.createdAtMs,
      updatedAtMs: session.updatedAtMs,
    };
    mkdirSync(this.sessionDir(session.id), { recursive: true });
    mkdirSync(dirname(this.sessionMetadataPath(session.id)), { recursive: true });
    writeFileSync(this.sessionMetadataPath(session.id), `${JSON.stringify(metadata, null, 2)}\n`);
  }

  private readSessionMetadata(sessionId: string): SessionMetadata {
    const parsed = safeJsonParse<Partial<SessionMetadata>>(
      readFileSync(this.sessionMetadataPath(sessionId), "utf8"),
    );
    return {
      id: String(parsed.id),
      title: String(parsed.title),
      providerKind: parsed.providerKind as AgentChatProviderKind,
      modelRef: String(parsed.modelRef),
      cwd: String(parsed.cwd || "/home/ec2-user/workspace"),
      pendingSystemInstruction: parsed.pendingSystemInstruction
        ? String(parsed.pendingSystemInstruction)
        : null,
      pendingSystemInstructionMessageId: parsed.pendingSystemInstructionMessageId
        ? String(parsed.pendingSystemInstructionMessageId)
        : null,
      authProfile: parsed.authProfile ? String(parsed.authProfile) : null,
      imageModelRef: parsed.imageModelRef ? String(parsed.imageModelRef) : null,
      providerThreadId: parsed.providerThreadId ? String(parsed.providerThreadId) : null,
      providerThreadPath: parsed.providerThreadPath ? String(parsed.providerThreadPath) : null,
      createdAtMs: Number(parsed.createdAtMs),
      updatedAtMs: Number(parsed.updatedAtMs),
    };
  }

  private readMessages(sessionId: string): StoredMessage[] {
    const path = this.messagesPath(sessionId);
    if (!existsSync(path)) {
      return [];
    }

    const raw = readFileSync(path, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parsed = safeJsonParse<Partial<StoredMessage>>(line);
        return {
          id: String(parsed.id),
          sessionId: String(parsed.sessionId),
          role: parsed.role as StoredMessage["role"],
          kind: parsed.kind === "directoryInstruction" ? "directoryInstruction" : "chat",
          replyToMessageId: parsed.replyToMessageId ? String(parsed.replyToMessageId) : null,
          providerSeenAtMs:
            parsed.providerSeenAtMs === null || parsed.providerSeenAtMs === undefined
              ? null
              : Number(parsed.providerSeenAtMs),
          content: (parsed.content ?? []) as StoredMessage["content"],
          createdAtMs: Number(parsed.createdAtMs),
        } satisfies StoredMessage;
      })
      .sort((left, right) => {
        if (left.createdAtMs !== right.createdAtMs) {
          return left.createdAtMs - right.createdAtMs;
        }
        return left.id.localeCompare(right.id);
      });
  }

  private importLegacySqliteIfNeeded(legacySqlitePath: string | null) {
    if (!legacySqlitePath || !existsSync(legacySqlitePath)) {
      return;
    }

    if (this.listSessionDirectories().length > 0) {
      return;
    }

    const legacyDb = new Database(legacySqlitePath, { create: false, readonly: true });

    try {
      const tables = new Set(
        (legacyDb.query(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{
          name: string;
        }>).map((row) => row.name),
      );

      if (!tables.has("sessions") || !tables.has("messages")) {
        return;
      }

      const sessionColumns = new Set(
        (
          legacyDb.query(`PRAGMA table_info(sessions)`).all() as Array<{
            name: string;
          }>
        ).map((row) => row.name),
      );
      const messageColumns = new Set(
        (
          legacyDb.query(`PRAGMA table_info(messages)`).all() as Array<{
            name: string;
          }>
        ).map((row) => row.name),
      );
      const legacyHasCwd = sessionColumns.has("cwd");

      const sessionRows = legacyDb.query(`
        SELECT
          id,
          title,
          provider_kind,
          model_ref,
          ${legacyHasCwd ? "cwd," : "'/home/ec2-user/workspace' AS cwd,"}
          ${sessionColumns.has("pending_system_instruction") ? "pending_system_instruction," : "NULL AS pending_system_instruction,"}
          ${sessionColumns.has("pending_system_instruction_message_id") ? "pending_system_instruction_message_id," : "NULL AS pending_system_instruction_message_id,"}
          auth_profile,
          image_model_ref,
          provider_thread_id,
          provider_thread_path,
          created_at_ms,
          updated_at_ms
        FROM sessions
        ORDER BY created_at_ms ASC, id ASC
      `).all() as Array<Record<string, unknown>>;

      const messageQuery = legacyDb.query(`
        SELECT
          id,
          session_id,
          role,
          ${messageColumns.has("kind") ? "kind," : "'chat' AS kind,"}
          ${messageColumns.has("reply_to_message_id") ? "reply_to_message_id," : "NULL AS reply_to_message_id,"}
          ${messageColumns.has("provider_seen_at_ms") ? "provider_seen_at_ms," : "NULL AS provider_seen_at_ms,"}
          content_json,
          created_at_ms
        FROM messages
        WHERE session_id = ?
        ORDER BY created_at_ms ASC, id ASC
      `);

      for (const row of sessionRows) {
        const metadata: SessionMetadata = {
          id: String(row.id),
          title: String(row.title),
          providerKind: row.provider_kind as AgentChatProviderKind,
          modelRef: String(row.model_ref),
          cwd: row.cwd ? String(row.cwd) : "/home/ec2-user/workspace",
          pendingSystemInstruction: row.pending_system_instruction
            ? String(row.pending_system_instruction)
            : null,
          pendingSystemInstructionMessageId: row.pending_system_instruction_message_id
            ? String(row.pending_system_instruction_message_id)
            : null,
          authProfile: row.auth_profile ? String(row.auth_profile) : null,
          imageModelRef: row.image_model_ref ? String(row.image_model_ref) : null,
          providerThreadId: row.provider_thread_id ? String(row.provider_thread_id) : null,
          providerThreadPath: row.provider_thread_path ? String(row.provider_thread_path) : null,
          createdAtMs: Number(row.created_at_ms),
          updatedAtMs: Number(row.updated_at_ms),
        };

        const messages = messageQuery.all(metadata.id).map((messageRow) => {
          const rowObject = messageRow as Record<string, unknown>;
          return {
            id: String(rowObject.id),
            sessionId: String(rowObject.session_id),
            role: rowObject.role as StoredMessage["role"],
            kind:
              rowObject.kind === "directoryInstruction" ? "directoryInstruction" : "chat",
            replyToMessageId: rowObject.reply_to_message_id
              ? String(rowObject.reply_to_message_id)
              : null,
            providerSeenAtMs:
              rowObject.provider_seen_at_ms === null ||
              rowObject.provider_seen_at_ms === undefined
                ? null
                : Number(rowObject.provider_seen_at_ms),
            content: safeJsonParse<StoredMessage["content"]>(String(rowObject.content_json)),
            createdAtMs: Number(rowObject.created_at_ms),
          } satisfies StoredMessage;
        });

        this.writeSessionFiles(metadata, messages);
      }
    } finally {
      legacyDb.close();
    }
  }
}
