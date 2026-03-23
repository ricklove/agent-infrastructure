import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync as readBinaryFileSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AgentChatProviderKind } from "./catalog.js";

const attachmentRoutePrefix = "/api/agent-chat/sessions";

export type StoredMessageContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; url: string };

export type StoredAttachment = {
  fileName: string;
  mediaType: string;
  path: string;
  url: string;
};

export type StoredSession = {
  id: string;
  title: string;
  providerKind: AgentChatProviderKind;
  modelRef: string;
  cwd: string;
  pendingSystemInstruction: string | null;
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
  content: StoredMessageContentBlock[];
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

type CanonicalWriteEvent = {
  sessionId: string;
  reason:
    | "session-created"
    | "attachment-persisted"
    | "message-appended"
    | "session-metadata-updated"
    | "message-visibility-updated";
};

type AgentChatStoreOptions = {
  dataDir: string;
  legacySqlitePath?: string | null;
  onCanonicalWrite?: (event: CanonicalWriteEvent) => void;
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
    const imageCount = message?.content.filter((block) => block.type === "image").length ?? 0;
    if (imageCount > 0) {
      return imageCount === 1 ? "Shared an image" : `Shared ${imageCount} images`;
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
  private readonly onCanonicalWrite?: (event: CanonicalWriteEvent) => void;
  private readonly sessionCache = new Map<string, StoredSession>();
  private readonly messageCache = new Map<string, StoredMessage[]>();

  constructor(options: AgentChatStoreOptions) {
    this.sessionsDir = join(options.dataDir, "sessions");
    this.onCanonicalWrite = options.onCanonicalWrite;
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
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-created",
    });
    return summary;
  }

  listMessages(sessionId: string): StoredMessage[] {
    return [...(this.messageCache.get(sessionId) ?? [])];
  }

  listMessagesPage(
    sessionId: string,
    input?: {
      beforeMessageId?: string | null;
      limit?: number;
    },
  ): {
    messages: StoredMessage[];
    hasOlderMessages: boolean;
  } {
    const allMessages = this.messageCache.get(sessionId) ?? [];
    const limit = Math.max(1, Math.min(200, input?.limit ?? 50));
    const beforeMessageId = input?.beforeMessageId?.trim() ?? "";

    if (!beforeMessageId) {
      const startIndex = Math.max(0, allMessages.length - limit);
      return {
        messages: allMessages.slice(startIndex),
        hasOlderMessages: startIndex > 0,
      };
    }

    const endIndex = allMessages.findIndex((message) => message.id === beforeMessageId);
    if (endIndex <= 0) {
      return {
        messages: [],
        hasOlderMessages: false,
      };
    }

    const startIndex = Math.max(0, endIndex - limit);
    return {
      messages: allMessages.slice(startIndex, endIndex),
      hasOlderMessages: startIndex > 0,
    };
  }

  listQueuedMessages(sessionId: string): StoredMessage[] {
    return this.listMessages(sessionId).filter(
      (message) =>
        message.providerSeenAtMs === null &&
        (message.role === "user" || message.role === "system"),
    );
  }

  persistAttachment(
    sessionId: string,
    input: {
      mediaType: string;
      bytes: Uint8Array;
    },
  ): StoredAttachment {
    const current = this.sessionCache.get(sessionId);
    if (!current) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const extension = fileExtensionForMediaType(input.mediaType);
    const fileName = `${randomUUID()}.${extension}`;
    const path = this.attachmentPath(sessionId, fileName);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, input.bytes);
    this.notifyCanonicalWrite({
      sessionId,
      reason: "attachment-persisted",
    });
    return {
      fileName,
      mediaType: input.mediaType,
      path,
      url: this.attachmentUrl(sessionId, fileName),
    };
  }

  resolveAttachment(url: string): StoredAttachment | null {
    const match = attachmentUrlPattern.exec(url);
    if (!match) {
      return null;
    }

    const sessionId = decodeURIComponent(match[1] ?? "");
    const fileName = decodeURIComponent(match[2] ?? "");
    const path = this.attachmentPath(sessionId, fileName);
    if (!existsSync(path)) {
      return null;
    }

    return {
      fileName,
      mediaType: mediaTypeForFileName(fileName),
      path,
      url: this.attachmentUrl(sessionId, fileName),
    };
  }

  readAttachmentBytes(url: string): { attachment: StoredAttachment; bytes: Buffer } | null {
    const attachment = this.resolveAttachment(url);
    if (!attachment) {
      return null;
    }

    return {
      attachment,
      bytes: readBinaryFileSync(attachment.path),
    };
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
    this.notifyCanonicalWrite({
      sessionId,
      reason: "message-appended",
    });
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
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
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
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
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
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
    return nextSession;
  }

  updateSessionProviderSettings(
    sessionId: string,
    input: {
      providerKind: AgentChatProviderKind;
      modelRef: string;
      authProfile: string | null;
      imageModelRef: string | null;
      clearProviderThread?: boolean;
    },
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    const nextModelRef = input.modelRef.trim();
    if (!current || !nextModelRef) {
      return current ?? null;
    }

    const clearProviderThread = input.clearProviderThread ?? true;
    const nextSession: StoredSession = {
      ...current,
      providerKind: input.providerKind,
      modelRef: nextModelRef,
      authProfile: input.authProfile?.trim() || null,
      imageModelRef: input.imageModelRef?.trim() || null,
      providerThreadId: clearProviderThread ? null : current.providerThreadId,
      providerThreadPath: clearProviderThread ? null : current.providerThreadPath,
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
    return nextSession;
  }

  queuePendingSystemInstruction(
    sessionId: string,
    instruction: string,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    if (!current) {
      return null;
    }

    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: current.pendingSystemInstruction
        ? `${current.pendingSystemInstruction}\n${instruction}`
        : instruction,
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
    return nextSession;
  }

  replacePendingSystemInstructionByPrefix(
    sessionId: string,
    prefix: string,
    instruction: string,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId);
    if (!current) {
      return null;
    }

    const existingLines = current.pendingSystemInstruction
      ? current.pendingSystemInstruction
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !line.startsWith(prefix))
      : [];
    existingLines.push(instruction);

    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: existingLines.join("\n"),
      updatedAtMs: Date.now(),
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
    return nextSession;
  }

  consumePendingSystemInstruction(sessionId: string): string | null {
    const current = this.sessionCache.get(sessionId);
    if (!current || !current.pendingSystemInstruction) {
      return null;
    }

    const instruction = current.pendingSystemInstruction;
    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: null,
    };
    this.writeSessionMetadata(nextSession);
    this.sessionCache.set(sessionId, nextSession);
    this.markQueuedSystemMessagesSeen(sessionId);
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    });
    return instruction;
  }

  markQueuedDirectoryInstructionsSeen(sessionId: string, seenAtMs = Date.now()) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => message.role === "system")
      .map((message) => message.id);
    this.markMessagesSeen(sessionId, messageIds, seenAtMs);
  }

  markQueuedSystemMessagesSeen(sessionId: string, seenAtMs = Date.now()) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => message.role === "system")
      .map((message) => message.id);
    this.markMessagesSeen(sessionId, messageIds, seenAtMs);
  }

  markQueuedSystemMessagesSeenByPrefix(
    sessionId: string,
    prefix: string,
    seenAtMs = Date.now(),
  ) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => {
        if (message.role !== "system") {
          return false;
        }
        const firstText = message.content.find((block) => block.type === "text");
        return firstText?.type === "text" && firstText.text.startsWith(prefix);
      })
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
    this.notifyCanonicalWrite({
      sessionId,
      reason: "message-visibility-updated",
    });
  }

  private notifyCanonicalWrite(event: CanonicalWriteEvent) {
    try {
      this.onCanonicalWrite?.(event);
    } catch {}
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

  private attachmentDir(sessionId: string) {
    return join(this.sessionDir(sessionId), "attachments");
  }

  private attachmentPath(sessionId: string, fileName: string) {
    return join(this.attachmentDir(sessionId), fileName);
  }

  private attachmentUrl(sessionId: string, fileName: string) {
    return `${attachmentRoutePrefix}/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(fileName)}`;
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

const attachmentUrlPattern =
  /^\/api\/agent-chat\/sessions\/([^/]+)\/attachments\/([^/]+)$/;

function fileExtensionForMediaType(mediaType: string) {
  switch (mediaType) {
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function mediaTypeForFileName(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}
