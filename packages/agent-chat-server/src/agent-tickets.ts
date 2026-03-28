import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProcessBlueprint } from "./process-blueprints.js";

export type StoredAgentTicketStatus = "active" | "completed" | "blocked";
export type StoredAgentTicketStepStatus = "pending" | "active" | "completed" | "blocked";

export type StoredAgentTicketStep = {
  id: string;
  title: string;
  kind: "task" | "wait" | "decision";
  status: StoredAgentTicketStepStatus;
  doneToken: string | null;
  blockedToken: string | null;
  decision: {
    prompt: string;
    options: Array<{
      id: string;
      title: string;
      goto: string | null;
      next: boolean;
      block: boolean;
      complete: boolean;
    }>;
  } | null;
};

export type StoredAgentTicket = {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  processBlueprintId: string;
  processTitle: string;
  status: StoredAgentTicketStatus;
  currentStepId: string | null;
  nextStepId: string | null;
  nextStepLabel: string | null;
  checklist: StoredAgentTicketStep[];
  resolution: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

type TicketIndex = {
  activeTicketBySessionId: Record<string, string>;
};

type AgentTicketStoreOptions = {
  dataDir: string;
  onCanonicalWrite?: (event: { sessionId: string; reason: "ticket-updated" }) => void;
};

const defaultIndex = (): TicketIndex => ({
  activeTicketBySessionId: {},
});

function safeJsonParse<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function buildChecklist(processBlueprint: ProcessBlueprint): StoredAgentTicketStep[] {
  return processBlueprint.steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    kind: step.kind,
    status: index === 0 ? "active" : "pending",
    doneToken: step.doneToken,
    blockedToken: step.blockedToken,
    decision: step.decision
      ? {
          prompt: step.decision.prompt,
          options: step.decision.options.map((option) => ({ ...option })),
        }
      : null,
  }));
}

export class AgentTicketStore {
  private readonly ticketsDir: string;
  private readonly onCanonicalWrite?: (event: { sessionId: string; reason: "ticket-updated" }) => void;
  private readonly ticketCache = new Map<string, StoredAgentTicket>();
  private readonly activeTicketBySessionId = new Map<string, string>();

  constructor(options: AgentTicketStoreOptions) {
    this.ticketsDir = join(options.dataDir, "tickets");
    this.onCanonicalWrite = options.onCanonicalWrite;
    mkdirSync(this.ticketsDir, { recursive: true });
    this.loadCache();
  }

  getActiveTicketForSession(sessionId: string): StoredAgentTicket | null {
    const ticketId = this.activeTicketBySessionId.get(sessionId);
    return ticketId ? this.ticketCache.get(ticketId) ?? null : null;
  }

  clearActiveTicketForSession(sessionId: string) {
    if (!this.activeTicketBySessionId.delete(sessionId)) {
      return;
    }
    this.writeIndex();
    this.notifyCanonicalWrite(sessionId);
  }

  createOrReplaceSessionTicket(sessionId: string, processBlueprint: ProcessBlueprint): StoredAgentTicket {
    const now = Date.now();
    const checklist = buildChecklist(processBlueprint);
    const firstActiveStep = checklist.find((step) => step.status === "active") ?? null;
    const ticket: StoredAgentTicket = {
      id: randomUUID(),
      sessionId,
      title: processBlueprint.title,
      description: processBlueprint.expectation,
      processBlueprintId: processBlueprint.id,
      processTitle: processBlueprint.title,
      status: "active",
      currentStepId: firstActiveStep?.id ?? null,
      nextStepId: firstActiveStep?.id ?? null,
      nextStepLabel: firstActiveStep?.title ?? null,
      checklist,
      resolution: null,
      createdAtMs: now,
      updatedAtMs: now,
    };

    this.ticketCache.set(ticket.id, ticket);
    this.activeTicketBySessionId.set(sessionId, ticket.id);
    this.writeTicket(ticket);
    this.writeIndex();
    this.notifyCanonicalWrite(sessionId);
    return ticket;
  }

  resolveActiveTicket(sessionId: string, status: Extract<StoredAgentTicketStatus, "completed" | "blocked">, resolution: string) {
    const current = this.getActiveTicketForSession(sessionId);
    if (!current) {
      return null;
    }

    const nextChecklist = current.checklist.map((step) => {
      if (status === "completed") {
        return {
          ...step,
          status: "completed" as const,
        };
      }
      if (step.id === current.currentStepId) {
        return {
          ...step,
          status: "blocked" as const,
        };
      }
      return step;
    });

    const updated: StoredAgentTicket = {
      ...current,
      status,
      currentStepId: null,
      nextStepId: null,
      nextStepLabel: null,
      checklist: nextChecklist,
      resolution,
      updatedAtMs: Date.now(),
    };

    this.ticketCache.set(updated.id, updated);
    this.writeTicket(updated);
    this.writeIndex();
    this.notifyCanonicalWrite(sessionId);
    return updated;
  }

  private notifyCanonicalWrite(sessionId: string) {
    this.onCanonicalWrite?.({ sessionId, reason: "ticket-updated" });
  }

  private indexPath() {
    return join(this.ticketsDir, "index.json");
  }

  private ticketDir(ticketId: string) {
    return join(this.ticketsDir, ticketId);
  }

  private ticketPath(ticketId: string) {
    return join(this.ticketDir(ticketId), "ticket.json");
  }

  private writeIndex() {
    const payload: TicketIndex = {
      activeTicketBySessionId: Object.fromEntries(this.activeTicketBySessionId.entries()),
    };
    writeFileSync(this.indexPath(), `${JSON.stringify(payload, null, 2)}\n`);
  }

  private writeTicket(ticket: StoredAgentTicket) {
    mkdirSync(this.ticketDir(ticket.id), { recursive: true });
    writeFileSync(this.ticketPath(ticket.id), `${JSON.stringify(ticket, null, 2)}\n`);
  }

  private loadCache() {
    const index = this.readIndex();
    for (const [sessionId, ticketId] of Object.entries(index.activeTicketBySessionId)) {
      const ticket = this.readTicket(ticketId);
      if (!ticket) {
        continue;
      }
      this.ticketCache.set(ticket.id, ticket);
      this.activeTicketBySessionId.set(sessionId, ticket.id);
    }

    if (this.activeTicketBySessionId.size === 0) {
      for (const entry of readdirSync(this.ticketsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const ticket = this.readTicket(entry.name);
        if (!ticket) {
          continue;
        }
        this.ticketCache.set(ticket.id, ticket);
      }
    }
  }

  private readIndex(): TicketIndex {
    if (!existsSync(this.indexPath())) {
      return defaultIndex();
    }

    try {
      const parsed = safeJsonParse<Partial<TicketIndex>>(readFileSync(this.indexPath(), "utf8"));
      return {
        activeTicketBySessionId:
          parsed.activeTicketBySessionId && typeof parsed.activeTicketBySessionId === "object"
            ? Object.fromEntries(
                Object.entries(parsed.activeTicketBySessionId).map(([sessionId, ticketId]) => [
                  String(sessionId),
                  String(ticketId),
                ]),
              )
            : {},
      };
    } catch {
      return defaultIndex();
    }
  }

  private readTicket(ticketId: string): StoredAgentTicket | null {
    const path = this.ticketPath(ticketId);
    if (!existsSync(path)) {
      return null;
    }

    try {
      const parsed = safeJsonParse<StoredAgentTicket>(readFileSync(path, "utf8"));
      return {
        ...parsed,
        id: String(parsed.id),
        sessionId: String(parsed.sessionId),
        title: String(parsed.title),
        description: String(parsed.description),
        processBlueprintId: String(parsed.processBlueprintId),
        processTitle: String(parsed.processTitle),
      };
    } catch {
      return null;
    }
  }
}
