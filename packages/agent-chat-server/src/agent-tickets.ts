import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isProceduralProcessBlueprint,
  type ProcessBlueprint,
  type ProcessBlueprintDecisionOption,
  type ProcessBlueprintStep,
} from "./process-blueprints.js";

export type StoredAgentTicketStatus = "active" | "completed" | "blocked";
export type StoredAgentTicketStepStatus = "pending" | "active" | "completed" | "blocked";

export type StoredAgentTicketDecisionOption = {
  id: string;
  title: string;
  goto: string | null;
  next: boolean;
  block: boolean;
  complete: boolean;
  steps: StoredAgentTicketStep[];
};

export type StoredAgentTicketStep = {
  id: string;
  title: string;
  kind: "task" | "wait" | "decision";
  status: StoredAgentTicketStepStatus;
  doneToken: string | null;
  blockedToken: string | null;
  decision: {
    prompt: string;
    options: StoredAgentTicketDecisionOption[];
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

export type StoredAgentTicketTransition = {
  ticket: StoredAgentTicket;
  kind: "stepCompleted" | "stepBlocked" | "ticketCompleted";
  stepTitle: string | null;
  detail: string | null;
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

function buildDecisionOptions(
  options: ProcessBlueprintDecisionOption[],
): StoredAgentTicketDecisionOption[] {
  return options.map((option) => ({
    id: option.id,
    title: option.title,
    goto: option.goto,
    next: option.next,
    block: option.block,
    complete: option.complete,
    steps: buildChecklist(option.steps),
  }));
}

function buildChecklist(
  steps: ProcessBlueprintStep[],
  activeIndex: number | null = null,
): StoredAgentTicketStep[] {
  return steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    kind: step.kind,
    status: activeIndex !== null && index === activeIndex ? "active" : "pending",
    doneToken: step.doneToken,
    blockedToken: step.blockedToken,
    decision: step.decision
      ? {
          prompt: step.decision.prompt,
          options: buildDecisionOptions(step.decision.options),
        }
      : null,
  }));
}


function cloneDecisionOptions(
  options: StoredAgentTicketDecisionOption[],
): StoredAgentTicketDecisionOption[] {
  return options.map((option) => ({
    ...option,
    steps: cloneChecklist(option.steps),
  }));
}

function cloneChecklist(steps: StoredAgentTicketStep[]): StoredAgentTicketStep[] {
  return steps.map((step) => ({
    ...step,
    decision: step.decision
      ? {
          prompt: step.decision.prompt,
          options: cloneDecisionOptions(step.decision.options),
        }
      : null,
  }));
}

function ticketWithNextStep(
  current: StoredAgentTicket,
  checklist: StoredAgentTicketStep[],
  currentStepId: string | null,
  resolution: string | null,
  status: StoredAgentTicketStatus = "active",
): StoredAgentTicket {
  const currentStep = currentStepId
    ? checklist.find((step) => step.id === currentStepId) ?? null
    : null;
  return {
    ...current,
    status,
    currentStepId,
    nextStepId: currentStep?.id ?? null,
    nextStepLabel: currentStep?.title ?? null,
    checklist,
    resolution,
    updatedAtMs: Date.now(),
  };
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
    const checklist = isProceduralProcessBlueprint(processBlueprint)
      ? buildChecklist(processBlueprint.steps, processBlueprint.steps.length > 0 ? 0 : null)
      : [];
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

  resolveStepFromAssistantText(sessionId: string, assistantText: string): StoredAgentTicketTransition | null {
    const current = this.getActiveTicketForSession(sessionId);
    if (!current || current.status !== "active" || !current.currentStepId) {
      return null;
    }

    const currentIndex = current.checklist.findIndex((step) => step.id === current.currentStepId);
    if (currentIndex < 0) {
      return null;
    }

    const currentStep = current.checklist[currentIndex]!;
    const normalizedText = assistantText.trim();
    const genericDoneToken = `done: ${currentStep.id}`;
    const genericBlockedToken = `blocked: ${currentStep.id}`;

    if (
      (currentStep.doneToken && normalizedText === currentStep.doneToken) ||
      normalizedText === genericDoneToken
    ) {
      return this.completeCurrentStep(current, currentIndex, currentStep, null);
    }

    if (
      (currentStep.blockedToken && normalizedText === currentStep.blockedToken) ||
      normalizedText === genericBlockedToken
    ) {
      return this.blockCurrentStep(current, currentIndex, currentStep, normalizedText);
    }

    if (currentStep.kind === "decision" && currentStep.decision) {
      const matchedOption = currentStep.decision.options.find(
        (option) => normalizedText === option.title || normalizedText === option.id,
      );
      if (!matchedOption) {
        return null;
      }
      return this.resolveDecisionOption(current, currentIndex, currentStep, matchedOption);
    }

    return null;
  }

  resolveActiveTicket(sessionId: string, status: Extract<StoredAgentTicketStatus, "completed" | "blocked">, resolution: string) {
    const current = this.getActiveTicketForSession(sessionId);
    if (!current) {
      return null;
    }

    const nextChecklist = cloneChecklist(current.checklist).map((step) => {
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

    const updated = ticketWithNextStep(current, nextChecklist, null, resolution, status);
    this.persistTicket(updated);
    return updated;
  }

  private completeCurrentStep(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    detail: string | null,
  ): StoredAgentTicketTransition {
    const nextChecklist = cloneChecklist(current.checklist);
    nextChecklist[currentIndex] = {
      ...nextChecklist[currentIndex]!,
      status: "completed",
    };

    const nextIndex = nextChecklist.findIndex(
      (step, index) => index > currentIndex && step.status === "pending",
    );

    if (nextIndex === -1) {
      const updated = ticketWithNextStep(current, nextChecklist, null, detail, "completed");
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "ticketCompleted",
        stepTitle: currentStep.title,
        detail,
      };
    }

    nextChecklist[nextIndex] = {
      ...nextChecklist[nextIndex]!,
      status: "active",
    };
    const updated = ticketWithNextStep(current, nextChecklist, nextChecklist[nextIndex]!.id, detail);
    this.persistTicket(updated);
    return {
      ticket: updated,
      kind: "stepCompleted",
      stepTitle: currentStep.title,
      detail,
    };
  }

  private blockCurrentStep(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    detail: string | null,
  ): StoredAgentTicketTransition {
    const nextChecklist = cloneChecklist(current.checklist);
    nextChecklist[currentIndex] = {
      ...nextChecklist[currentIndex]!,
      status: "active",
    };
    const updated = ticketWithNextStep(current, nextChecklist, currentStep.id, detail, "active");
    this.persistTicket(updated);
    return {
      ticket: updated,
      kind: "stepBlocked",
      stepTitle: currentStep.title,
      detail,
    };
  }

  private resolveDecisionOption(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    option: StoredAgentTicketDecisionOption,
  ): StoredAgentTicketTransition {
    const nextChecklist = cloneChecklist(current.checklist);
    nextChecklist[currentIndex] = {
      ...nextChecklist[currentIndex]!,
      status: option.block ? "active" : "completed",
    };

    if (option.block) {
      const updated = ticketWithNextStep(current, nextChecklist, currentStep.id, option.title, "active");
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "stepBlocked",
        stepTitle: currentStep.title,
        detail: option.title,
      };
    }

    if (option.complete) {
      const updated = ticketWithNextStep(current, nextChecklist, null, option.title, "completed");
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "ticketCompleted",
        stepTitle: currentStep.title,
        detail: option.title,
      };
    }

    if (option.steps.length > 0) {
      const inserted = cloneChecklist(option.steps);
      inserted[0] = {
        ...inserted[0]!,
        status: "active",
      };
      for (let index = 1; index < inserted.length; index += 1) {
        inserted[index] = {
          ...inserted[index]!,
          status: "pending",
        };
      }
      nextChecklist.splice(currentIndex + 1, 0, ...inserted);
      const updated = ticketWithNextStep(current, nextChecklist, inserted[0]!.id, option.title);
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "stepCompleted",
        stepTitle: currentStep.title,
        detail: option.title,
      };
    }

    if (option.goto) {
      const gotoIndex = nextChecklist.findIndex((step) => step.id === option.goto);
      if (gotoIndex >= 0) {
        nextChecklist[gotoIndex] = {
          ...nextChecklist[gotoIndex]!,
          status: "active",
        };
        const updated = ticketWithNextStep(current, nextChecklist, nextChecklist[gotoIndex]!.id, option.title);
        this.persistTicket(updated);
        return {
          ticket: updated,
          kind: "stepCompleted",
          stepTitle: currentStep.title,
          detail: option.title,
        };
      }
    }

    if (option.next) {
      const nextIndex = nextChecklist.findIndex(
        (step, index) => index > currentIndex && step.status === "pending",
      );
      if (nextIndex >= 0) {
        nextChecklist[nextIndex] = {
          ...nextChecklist[nextIndex]!,
          status: "active",
        };
        const updated = ticketWithNextStep(current, nextChecklist, nextChecklist[nextIndex]!.id, option.title);
        this.persistTicket(updated);
        return {
          ticket: updated,
          kind: "stepCompleted",
          stepTitle: currentStep.title,
          detail: option.title,
        };
      }
    }

    const updated = ticketWithNextStep(current, nextChecklist, null, option.title, "completed");
    this.persistTicket(updated);
    return {
      ticket: updated,
      kind: "ticketCompleted",
      stepTitle: currentStep.title,
      detail: option.title,
    };
  }

  private persistTicket(ticket: StoredAgentTicket) {
    this.ticketCache.set(ticket.id, ticket);
    this.writeTicket(ticket);
    this.writeIndex();
    this.notifyCanonicalWrite(ticket.sessionId);
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
