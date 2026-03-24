import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

type TerminalSocketData = {
  socketId: string;
  sessionId: string | null;
};

type BunWs = import("bun").ServerWebSocket<TerminalSocketData>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const port = Number.parseInt(process.env.DASHBOARD_TERMINAL_PORT ?? "8790", 10);
const defaultCwd =
  process.env.DASHBOARD_TERMINAL_DEFAULT_CWD?.trim() || "/home/ec2-user/workspace";
const allowedRoots = (
  process.env.DASHBOARD_TERMINAL_ALLOWED_ROOTS?.trim() || "/home/ec2-user/workspace"
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
const idleTimeoutMs = Number.parseInt(
  process.env.DASHBOARD_TERMINAL_IDLE_TIMEOUT_MS ?? String(30 * 60 * 1000),
  10,
);
const maxScrollback = Number.parseInt(
  process.env.DASHBOARD_TERMINAL_MAX_SCROLLBACK ?? "50000",
  10,
);
const defaultShell = process.env.SHELL || "/bin/bash";
const reconnectWindowMs = Number.parseInt(
  process.env.DASHBOARD_TERMINAL_RECONNECT_MS ?? String(5 * 60 * 1000),
  10,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TerminalSession = {
  id: string;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  createdAtMs: number;
  lastActivityMs: number;
  closed: boolean;
  terminal: InstanceType<typeof Bun.Terminal> | null;
  process: ReturnType<typeof Bun.spawn> | null;
  scrollback: Uint8Array[];
  scrollbackBytes: number;
  attachment: BunWs | null;
  detachedAtMs: number | null;
};

type WsMessageIn =
  | { type: "attach"; sessionId: string }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "heartbeat" };

type WsMessageOut =
  | { type: "output"; data: string }
  | { type: "snapshot"; data: string }
  | { type: "attached"; sessionId: string; cols: number; rows: number }
  | { type: "session_closed"; sessionId: string; exitCode?: number }
  | { type: "error"; message: string }
  | { type: "heartbeat_ack" };

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------

const sessions = new Map<string, TerminalSession>();

function validateCwd(cwd: string): string | null {
  const resolved = resolve(cwd);
  if (!existsSync(resolved)) return null;
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    return null;
  }
  const allowed = allowedRoots.some((root) => real === root || real.startsWith(root + "/"));
  return allowed ? real : null;
}

const allowedEnvKeys = new Set([
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TERM",
  "PATH",
  "SHELL",
  "EDITOR",
  "VISUAL",
  "XDG_RUNTIME_DIR",
  "BUN_INSTALL",
  "NVM_DIR",
  "NODE_PATH",
]);

function filteredEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of allowedEnvKeys) {
    if (process.env[key]) out[key] = process.env[key]!;
  }
  out.TERM = "xterm-256color";
  return out;
}

function createSession(opts: {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}): TerminalSession | { error: string } {
  const cwd = validateCwd(opts.cwd || defaultCwd);
  if (!cwd) return { error: `Invalid or disallowed working directory: ${opts.cwd || defaultCwd}` };

  const shell = opts.shell || defaultShell;
  const cols = opts.cols || 80;
  const rows = opts.rows || 24;
  const id = randomUUID();

  const session: TerminalSession = {
    id,
    cwd,
    shell,
    cols,
    rows,
    createdAtMs: Date.now(),
    lastActivityMs: Date.now(),
    closed: false,
    terminal: null,
    process: null,
    scrollback: [],
    scrollbackBytes: 0,
    attachment: null,
    detachedAtMs: null,
  };

  const terminal = new Bun.Terminal({
    cols,
    rows,
    name: "xterm-256color",
    data(_terminal, data) {
      session.lastActivityMs = Date.now();
      // Append to scrollback
      session.scrollback.push(new Uint8Array(data));
      session.scrollbackBytes += data.length;
      // Trim scrollback if too large
      while (session.scrollbackBytes > maxScrollback && session.scrollback.length > 1) {
        const removed = session.scrollback.shift()!;
        session.scrollbackBytes -= removed.length;
      }
      // Forward to attached client
      if (session.attachment && session.attachment.readyState === 1) {
        const msg: WsMessageOut = {
          type: "output",
          data: new TextDecoder().decode(data),
        };
        session.attachment.send(JSON.stringify(msg));
      }
    },
    exit(_terminal, _exitCode, _signal) {
      session.closed = true;
      if (session.attachment && session.attachment.readyState === 1) {
        const msg: WsMessageOut = {
          type: "session_closed",
          sessionId: session.id,
        };
        session.attachment.send(JSON.stringify(msg));
      }
    },
  });

  const proc = Bun.spawn([shell, "-l"], {
    cwd,
    env: filteredEnv(),
    terminal,
  });

  session.terminal = terminal;
  session.process = proc;
  sessions.set(id, session);

  return session;
}

function closeSession(session: TerminalSession) {
  if (session.closed) return;
  session.closed = true;
  try {
    session.terminal?.close();
  } catch {}
  try {
    session.process?.kill();
  } catch {}
  if (session.attachment && session.attachment.readyState === 1) {
    const msg: WsMessageOut = { type: "session_closed", sessionId: session.id };
    session.attachment.send(JSON.stringify(msg));
  }
}

function getSnapshot(session: TerminalSession): string {
  const decoder = new TextDecoder();
  return session.scrollback.map((chunk) => decoder.decode(chunk)).join("");
}

function sessionSummary(session: TerminalSession) {
  return {
    id: session.id,
    cwd: session.cwd,
    shell: session.shell,
    cols: session.cols,
    rows: session.rows,
    createdAtMs: session.createdAtMs,
    lastActivityMs: session.lastActivityMs,
    closed: session.closed,
    attached: session.attachment !== null,
  };
}

// ---------------------------------------------------------------------------
// Idle reaper
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.closed) {
      // Clean up closed sessions after reconnect window
      if (
        session.detachedAtMs &&
        now - session.detachedAtMs > reconnectWindowMs
      ) {
        sessions.delete(id);
      } else if (!session.detachedAtMs && now - session.lastActivityMs > reconnectWindowMs) {
        sessions.delete(id);
      }
      continue;
    }
    // Reap idle sessions only when detached
    if (
      !session.attachment &&
      session.detachedAtMs &&
      now - session.detachedAtMs > reconnectWindowMs
    ) {
      closeSession(session);
      sessions.delete(id);
      continue;
    }
    // Reap sessions with no activity beyond idle timeout
    if (now - session.lastActivityMs > idleTimeoutMs) {
      closeSession(session);
    }
  }
}, 30_000);

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------

const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

const server = Bun.serve<TerminalSocketData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Health check
    if (path === "/api/dashboard-terminal/health") {
      return jsonResponse({ ok: true, sessions: sessions.size });
    }

    // List sessions
    if (path === "/api/dashboard-terminal/sessions" && req.method === "GET") {
      const list = Array.from(sessions.values())
        .filter((s) => !s.closed)
        .map(sessionSummary);
      return jsonResponse({ sessions: list });
    }

    // Create session
    if (path === "/api/dashboard-terminal/sessions" && req.method === "POST") {
      return (async () => {
        let body: Record<string, unknown> = {};
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {}
        const result = createSession({
          cwd: typeof body.cwd === "string" ? body.cwd : undefined,
          shell: typeof body.shell === "string" ? body.shell : undefined,
          cols: typeof body.cols === "number" ? body.cols : undefined,
          rows: typeof body.rows === "number" ? body.rows : undefined,
        });
        if ("error" in result) {
          return jsonResponse({ error: result.error }, 400);
        }
        return jsonResponse({ session: sessionSummary(result) }, 201);
      })();
    }

    // Close session
    const closeMatch = path.match(/^\/api\/dashboard-terminal\/sessions\/([^/]+)\/close$/);
    if (closeMatch && req.method === "POST") {
      const session = sessions.get(closeMatch[1]);
      if (!session) return jsonResponse({ error: "Session not found" }, 404);
      closeSession(session);
      return jsonResponse({ ok: true });
    }

    // Get session snapshot
    const snapshotMatch = path.match(/^\/api\/dashboard-terminal\/sessions\/([^/]+)\/snapshot$/);
    if (snapshotMatch && req.method === "GET") {
      const session = sessions.get(snapshotMatch[1]);
      if (!session) return jsonResponse({ error: "Session not found" }, 404);
      return jsonResponse({
        session: sessionSummary(session),
        snapshot: getSnapshot(session),
      });
    }

    // WebSocket upgrade
    if (path === "/api/dashboard-terminal/ws") {
      const upgraded = server.upgrade(req, {
        data: { socketId: randomUUID(), sessionId: null },
      });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Shell profiles
    if (path === "/api/dashboard-terminal/profiles" && req.method === "GET") {
      return jsonResponse({
        profiles: [
          { id: "bash-login", label: "Bash (login)", shell: "/bin/bash" },
        ],
        defaultCwd,
        allowedRoots,
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      // Wait for attach message
    },

    message(ws, rawMessage) {
      let msg: WsMessageIn;
      try {
        msg = JSON.parse(typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage)) as WsMessageIn;
      } catch {
        const err: WsMessageOut = { type: "error", message: "Invalid JSON" };
        ws.send(JSON.stringify(err));
        return;
      }

      if (msg.type === "attach") {
        const session = sessions.get(msg.sessionId);
        if (!session || session.closed) {
          const err: WsMessageOut = {
            type: "error",
            message: session ? "Session is closed" : "Session not found",
          };
          ws.send(JSON.stringify(err));
          return;
        }
        // Detach previous attachment
        if (session.attachment && session.attachment !== ws) {
          const detachMsg: WsMessageOut = {
            type: "error",
            message: "Detached: another client attached",
          };
          try {
            session.attachment.send(JSON.stringify(detachMsg));
          } catch {}
        }
        session.attachment = ws;
        session.detachedAtMs = null;
        ws.data.sessionId = session.id;

        // Send snapshot + attached confirmation
        const snapshot: WsMessageOut = {
          type: "snapshot",
          data: getSnapshot(session),
        };
        ws.send(JSON.stringify(snapshot));
        const attached: WsMessageOut = {
          type: "attached",
          sessionId: session.id,
          cols: session.cols,
          rows: session.rows,
        };
        ws.send(JSON.stringify(attached));
        return;
      }

      // All other messages require an attached session
      const sessionId = ws.data.sessionId;
      if (!sessionId) {
        const err: WsMessageOut = { type: "error", message: "Not attached to a session" };
        ws.send(JSON.stringify(err));
        return;
      }
      const session = sessions.get(sessionId);
      if (!session || session.closed) {
        const err: WsMessageOut = {
          type: "error",
          message: "Session not found or closed",
        };
        ws.send(JSON.stringify(err));
        return;
      }

      if (msg.type === "input") {
        session.lastActivityMs = Date.now();
        try {
          session.terminal?.write(new TextEncoder().encode(msg.data));
        } catch (e) {
          const err: WsMessageOut = {
            type: "error",
            message: `Write failed: ${e instanceof Error ? e.message : String(e)}`,
          };
          ws.send(JSON.stringify(err));
        }
        return;
      }

      if (msg.type === "resize") {
        const cols = Math.max(1, Math.min(500, msg.cols));
        const rows = Math.max(1, Math.min(200, msg.rows));
        session.cols = cols;
        session.rows = rows;
        session.lastActivityMs = Date.now();
        try {
          session.terminal?.resize(cols, rows);
        } catch {}
        return;
      }

      if (msg.type === "heartbeat") {
        session.lastActivityMs = Date.now();
        const ack: WsMessageOut = { type: "heartbeat_ack" };
        ws.send(JSON.stringify(ack));
        return;
      }
    },

    close(ws) {
      const sessionId = ws.data.sessionId;
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (session && session.attachment === ws) {
          session.attachment = null;
          session.detachedAtMs = Date.now();
        }
      }
    },
  },
});

console.log(`[dashboard-terminal-server] listening on port ${port}`);
