import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_SYSTEM_EVENT_LOG_PATH = "/home/ec2-user/state/logs/system-events.jsonl";

type SystemEventLevel = "info" | "error";

type SystemEventInput = {
  component: string;
  event: string;
  level?: SystemEventLevel;
  details?: Record<string, unknown>;
};

function logPath(): string {
  return process.env.SYSTEM_EVENT_LOG_PATH?.trim() || DEFAULT_SYSTEM_EVENT_LOG_PATH;
}

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitize(item),
      ]),
    );
  }

  return String(value);
}

export function logSystemEvent(input: SystemEventInput): void {
  const path = logPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: input.level ?? "info",
      component: input.component,
      event: input.event,
      pid: process.pid,
      ppid: process.ppid,
      cwd: process.cwd(),
      argv: process.argv,
      details: sanitize(input.details ?? {}),
    })}\n`,
  );
}
