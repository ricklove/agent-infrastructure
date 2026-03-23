import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentChatProviderKind } from "./catalog.js";

export type StoredSession = {
  id: string;
  title: string;
  providerKind: AgentChatProviderKind;
  modelRef: string;
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
  content: Array<{ type: "text"; text: string } | { type: "image"; url: string }>;
  createdAtMs: number;
};

export type CreateSessionInput = {
  title?: string;
  providerKind: AgentChatProviderKind;
  modelRef: string;
  authProfile?: string | null;
  imageModelRef?: string | null;
};

export class AgentChatStore {
  private readonly db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    if (!existsSync(dbPath)) {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath, { create: true });
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        provider_kind TEXT NOT NULL,
        model_ref TEXT NOT NULL,
        auth_profile TEXT,
        image_model_ref TEXT,
        provider_thread_id TEXT,
        provider_thread_path TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS messages_session_id_created_at_idx
      ON messages(session_id, created_at_ms);
    `);

    const sessionColumns = this.db
      .query(`PRAGMA table_info(sessions)`)
      .all() as Array<Record<string, unknown>>;
    const existingColumnNames = new Set(
      sessionColumns.map((column) => String(column.name)),
    );

    if (!existingColumnNames.has("provider_thread_id")) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN provider_thread_id TEXT`);
    }
    if (!existingColumnNames.has("provider_thread_path")) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN provider_thread_path TEXT`);
    }
  }

  listSessions(): StoredSession[] {
    const query = this.db.query(`
      SELECT
        s.id,
        s.title,
        s.provider_kind,
        s.model_ref,
        s.auth_profile,
        s.image_model_ref,
        s.provider_thread_id,
        s.provider_thread_path,
        s.created_at_ms,
        s.updated_at_ms,
        (
          SELECT json_extract(m.content_json, '$[0].text')
          FROM messages m
          WHERE m.session_id = s.id
          ORDER BY m.created_at_ms DESC
          LIMIT 1
        ) AS preview,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.session_id = s.id
        ) AS message_count
      FROM sessions s
      ORDER BY s.updated_at_ms DESC, s.created_at_ms DESC
    `);

    return query.all().map((row) => {
      const sessionRow = row as Record<string, unknown>;
      return {
        id: String(sessionRow.id),
        title: String(sessionRow.title),
        providerKind: sessionRow.provider_kind as AgentChatProviderKind,
        modelRef: String(sessionRow.model_ref),
        authProfile: sessionRow.auth_profile ? String(sessionRow.auth_profile) : null,
        imageModelRef: sessionRow.image_model_ref ? String(sessionRow.image_model_ref) : null,
        providerThreadId: sessionRow.provider_thread_id
          ? String(sessionRow.provider_thread_id)
          : null,
        providerThreadPath: sessionRow.provider_thread_path
          ? String(sessionRow.provider_thread_path)
          : null,
        createdAtMs: Number(sessionRow.created_at_ms),
        updatedAtMs: Number(sessionRow.updated_at_ms),
        preview: sessionRow.preview ? String(sessionRow.preview) : null,
        messageCount: Number(sessionRow.message_count),
      };
    });
  }

  getSession(sessionId: string): StoredSession | null {
    return this.listSessions().find((session) => session.id === sessionId) ?? null;
  }

  createSession(input: CreateSessionInput): StoredSession {
    const now = Date.now();
    const sessionId = randomUUID();
    const title = input.title?.trim() || "New chat";

    this.db
      .query(`
        INSERT INTO sessions (
          id, title, provider_kind, model_ref, auth_profile, image_model_ref, provider_thread_id, provider_thread_path, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        sessionId,
        title,
        input.providerKind,
        input.modelRef,
        input.authProfile ?? null,
        input.imageModelRef ?? null,
        null,
        null,
        now,
        now,
      );

    return this.getSession(sessionId)!;
  }

  listMessages(sessionId: string): StoredMessage[] {
    const query = this.db.query(`
      SELECT id, session_id, role, content_json, created_at_ms
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at_ms ASC, id ASC
    `);

    return query.all(sessionId).map((row) => {
      const messageRow = row as Record<string, unknown>;
      return {
        id: String(messageRow.id),
        sessionId: String(messageRow.session_id),
        role: messageRow.role as StoredMessage["role"],
        content: JSON.parse(String(messageRow.content_json)) as StoredMessage["content"],
        createdAtMs: Number(messageRow.created_at_ms),
      };
    });
  }

  appendMessage(
    sessionId: string,
    input: { role: StoredMessage["role"]; content: StoredMessage["content"] },
  ): StoredMessage {
    const now = Date.now();
    const messageId = randomUUID();
    this.db
      .query(`
        INSERT INTO messages (id, session_id, role, content_json, created_at_ms)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(messageId, sessionId, input.role, JSON.stringify(input.content), now);

    this.db
      .query(`UPDATE sessions SET updated_at_ms = ? WHERE id = ?`)
      .run(now, sessionId);

    return {
      id: messageId,
      sessionId,
      role: input.role,
      content: input.content,
      createdAtMs: now,
    };
  }

  updateSessionTitle(sessionId: string, title: string): StoredSession | null {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return this.getSession(sessionId);
    }

    const now = Date.now();
    this.db
      .query(`UPDATE sessions SET title = ?, updated_at_ms = ? WHERE id = ?`)
      .run(nextTitle, now, sessionId);

    return this.getSession(sessionId);
  }

  updateProviderThread(
    sessionId: string,
    input: { threadId: string | null; threadPath: string | null },
  ): StoredSession | null {
    const now = Date.now();
    this.db
      .query(`
        UPDATE sessions
        SET provider_thread_id = ?, provider_thread_path = ?, updated_at_ms = ?
        WHERE id = ?
      `)
      .run(input.threadId, input.threadPath, now, sessionId);

    return this.getSession(sessionId);
  }
}
