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
  tokenId: string;
  title: string;
  kind: "task" | "wait" | "decision";
  status: StoredAgentTicketStepStatus;
  doneToken: string | null;
  blockedToken: string | null;
  steps: StoredAgentTicketStep[];
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
  parentPath: string[] = [],
  activationState: { claimed: boolean } = { claimed: false },
): StoredAgentTicketDecisionOption[] {
  return options.map((option) => ({
    id: option.id,
    title: option.title,
    goto: option.goto,
    next: option.next,
    block: option.block,
    complete: option.complete,
    steps: buildChecklist(option.steps, parentPath, activationState),
  }));
}

function buildChecklist(
  steps: ProcessBlueprintStep[],
  parentPath: string[] = [],
  activationState: { claimed: boolean } = { claimed: false },
): StoredAgentTicketStep[] {
  return steps.map((step) => {
    const currentPath = [...parentPath, step.id];
    const nestedSteps = buildChecklist(step.steps, currentPath, activationState);
    const executable = step.kind === "decision" || nestedSteps.length === 0;
    const status: StoredAgentTicketStepStatus =
      executable && !activationState.claimed ? "active" : "pending";

    if (status === "active") {
      activationState.claimed = true;
    }

    return {
      id: currentPath.join("."),
      tokenId: step.id,
      title: step.title,
      kind: step.kind,
      status,
      doneToken: step.doneToken,
      blockedToken: step.blockedToken,
      steps: nestedSteps,
      decision: step.decision
        ? {
            prompt: step.decision.prompt,
            options: buildDecisionOptions(step.decision.options, currentPath, activationState),
          }
        : null,
    };
  });
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
    steps: cloneChecklist(step.steps),
    decision: step.decision
      ? {
          prompt: step.decision.prompt,
          options: cloneDecisionOptions(step.decision.options),
        }
      : null,
  }));
}

function findStepById(
  steps: StoredAgentTicketStep[],
  stepId: string | null,
): StoredAgentTicketStep | null {
  if (!stepId) {
    return null;
  }
  for (const step of steps) {
    if (step.id === stepId) {
      return step;
    }
    const nested = findStepById(step.steps, stepId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function findStepByReference(
  steps: StoredAgentTicketStep[],
  stepReference: string | null,
): StoredAgentTicketStep | null {
  if (!stepReference) {
    return null;
  }
  return (
    findStepById(steps, stepReference) ??
    flattenExecutableSteps(steps).find((step) => step.tokenId === stepReference) ??
    null
  );
}

function flattenExecutableSteps(steps: StoredAgentTicketStep[]): StoredAgentTicketStep[] {
  const flattened: StoredAgentTicketStep[] = [];
  for (const step of steps) {
    const executable = step.kind === "decision" || step.steps.length === 0;
    if (executable) {
      flattened.push(step);
    }
    flattened.push(...flattenExecutableSteps(step.steps));
  }
  return flattened;
}

function updateStepById(
  steps: StoredAgentTicketStep[],
  stepId: string,
  updater: (step: StoredAgentTicketStep) => StoredAgentTicketStep,
): StoredAgentTicketStep[] {
  return steps.map((step) => {
    if (step.id === stepId) {
      return updater({
        ...step,
        steps: cloneChecklist(step.steps),
      });
    }
    if (step.steps.length === 0) {
      return step;
    }
    return {
      ...step,
      steps: updateStepById(step.steps, stepId, updater),
    };
  });
}

function updateDecisionOptionSteps(
  options: StoredAgentTicketDecisionOption[],
  targetOptionId: string,
  replacementSteps: StoredAgentTicketStep[],
): StoredAgentTicketDecisionOption[] {
  return options.map((option) =>
    option.id === targetOptionId
      ? { ...option, steps: replacementSteps }
      : { ...option, steps: cloneChecklist(option.steps) },
  );
}

function insertStepsAfterDecision(
  steps: StoredAgentTicketStep[],
  decisionStepId: string,
  optionId: string,
  insertedSteps: StoredAgentTicketStep[],
): StoredAgentTicketStep[] {
  return steps.map((step) => {
    if (step.id === decisionStepId && step.decision) {
      return {
        ...step,
        decision: {
          ...step.decision,
          options: updateDecisionOptionSteps(step.decision.options, optionId, insertedSteps),
        },
      };
    }
    if (step.steps.length === 0) {
      return step;
    }
    return {
      ...step,
      steps: insertStepsAfterDecision(step.steps, decisionStepId, optionId, insertedSteps),
    };
  });
}

function recomputeContainerStatuses(steps: StoredAgentTicketStep[]): StoredAgentTicketStep[] {
  return steps.map((step) => {
    const nestedSteps = recomputeContainerStatuses(step.steps);
    if (nestedSteps.length === 0 || step.kind === "decision") {
      return {
        ...step,
        steps: nestedSteps,
      };
    }
    const nestedStatuses = nestedSteps.map((entry) => entry.status);
    const status: StoredAgentTicketStepStatus = nestedStatuses.every((entry) => entry === "completed")
      ? "completed"
      : nestedStatuses.some((entry) => entry === "active")
        ? "active"
        : nestedStatuses.some((entry) => entry === "blocked")
          ? "blocked"
          : "pending";
    return {
      ...step,
      status,
      steps: nestedSteps,
    };
  });
}

function markAllStepsStatus(
  steps: StoredAgentTicketStep[],
  status: StoredAgentTicketStepStatus,
): StoredAgentTicketStep[] {
  return steps.map((step) => ({
    ...step,
    status,
    steps: markAllStepsStatus(step.steps, status),
    decision: step.decision
      ? {
          ...step.decision,
          options: step.decision.options.map((option) => ({
            ...option,
            steps: markAllStepsStatus(option.steps, status),
          })),
        }
      : null,
  }));
}

function normalizeStoredTicketDecisionOptions(
  options: StoredAgentTicketDecisionOption[] | null | undefined,
  parentPath: string[],
): StoredAgentTicketDecisionOption[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options.map((option) => ({
    id: String(option.id),
    title: String(option.title),
    goto: option.goto ? String(option.goto) : null,
    next: option.next === true,
    block: option.block === true,
    complete: option.complete === true,
    steps: normalizeStoredTicketSteps(option.steps, parentPath),
  }));
}

function normalizeStoredTicketSteps(
  steps: StoredAgentTicketStep[] | null | undefined,
  parentPath: string[] = [],
): StoredAgentTicketStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps.map((step) => {
    const tokenId = typeof step.tokenId === "string" && step.tokenId.trim() ? step.tokenId : String(step.id);
    const fullId =
      typeof step.id === "string" && step.id.includes(".")
        ? step.id
        : [...parentPath, tokenId].join(".");
    const currentPath = fullId.split(".");
    return {
      id: fullId,
      tokenId,
      title: String(step.title),
      kind: step.kind === "wait" || step.kind === "decision" ? step.kind : "task",
      status:
        step.status === "active" ||
        step.status === "completed" ||
        step.status === "blocked"
          ? step.status
          : "pending",
      doneToken: typeof step.doneToken === "string" && step.doneToken.trim() ? step.doneToken : null,
      blockedToken:
        typeof step.blockedToken === "string" && step.blockedToken.trim() ? step.blockedToken : null,
      steps: normalizeStoredTicketSteps(step.steps, currentPath),
      decision: step.decision
        ? {
            prompt: String(step.decision.prompt),
            options: normalizeStoredTicketDecisionOptions(step.decision.options, currentPath),
          }
        : null,
    };
  });
}

function ticketWithNextStep(
  current: StoredAgentTicket,
  checklist: StoredAgentTicketStep[],
  currentStepId: string | null,
  resolution: string | null,
  status: StoredAgentTicketStatus = "active",
): StoredAgentTicket {
  const normalizedChecklist = recomputeContainerStatuses(checklist);
  const currentStep = findStepById(normalizedChecklist, currentStepId);
  return {
    ...current,
    status,
    currentStepId,
    nextStepId: currentStep?.id ?? null,
    nextStepLabel: currentStep?.title ?? null,
    checklist: normalizedChecklist,
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
      ? buildChecklist(processBlueprint.steps)
      : [];
    const firstActiveStep = flattenExecutableSteps(checklist).find((step) => step.status === "active") ?? null;
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

    const executableSteps = flattenExecutableSteps(current.checklist);
    const currentIndex = executableSteps.findIndex((step) => step.id === current.currentStepId);
    if (currentIndex < 0) {
      return null;
    }

    const currentStep = executableSteps[currentIndex]!;
    const normalizedText = assistantText.trim();
    const genericDoneToken = `done: ${currentStep.tokenId}`;
    const genericBlockedToken = `blocked: ${currentStep.tokenId}`;

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

    const nextChecklist =
      status === "completed"
        ? markAllStepsStatus(cloneChecklist(current.checklist), "completed")
        : cloneChecklist(current.checklist);

    const resolvedChecklist =
      status === "blocked" && current.currentStepId
        ? updateStepById(nextChecklist, current.currentStepId, (step) => ({
            ...step,
            status: "blocked",
          }))
        : nextChecklist;

    const updated = ticketWithNextStep(current, resolvedChecklist, null, resolution, status);
    this.persistTicket(updated);
    return updated;
  }

  private completeCurrentStep(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    detail: string | null,
  ): StoredAgentTicketTransition {
    const completedChecklist = updateStepById(cloneChecklist(current.checklist), currentStep.id, (step) => ({
      ...step,
      status: "completed",
    }));
    const nextExecutableSteps = flattenExecutableSteps(completedChecklist);
    const nextStep = nextExecutableSteps.find(
      (step, index) => index > currentIndex && step.status === "pending",
    );

    if (!nextStep) {
      const finalizedChecklist = nextExecutableSteps.reduce(
        (acc, step) =>
          updateStepById(acc, step.id, (entry) => ({
            ...entry,
            status: "completed",
          })),
        completedChecklist,
      );
      const updated = ticketWithNextStep(current, finalizedChecklist, null, detail, "completed");
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "ticketCompleted",
        stepTitle: currentStep.title,
        detail,
      };
    }

    const activatedChecklist = updateStepById(completedChecklist, nextStep.id, (step) => ({
      ...step,
      status: "active",
    }));
    const updated = ticketWithNextStep(current, activatedChecklist, nextStep.id, detail);
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
    void currentIndex;
    const nextChecklist = updateStepById(cloneChecklist(current.checklist), currentStep.id, (step) => ({
      ...step,
      status: "active",
    }));
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
    const baseChecklist = updateStepById(cloneChecklist(current.checklist), currentStep.id, (step) => ({
      ...step,
      status: option.block ? "active" : "completed",
    }));

    if (option.block) {
      const updated = ticketWithNextStep(current, baseChecklist, currentStep.id, option.title, "active");
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "stepBlocked",
        stepTitle: currentStep.title,
        detail: option.title,
      };
    }

    if (option.complete) {
      const updated = ticketWithNextStep(current, baseChecklist, null, option.title, "completed");
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
      const activatedChecklist = insertStepsAfterDecision(
        baseChecklist,
        currentStep.id,
        option.id,
        inserted,
      );
      const insertedExecutables = flattenExecutableSteps(inserted);
      const firstInserted = insertedExecutables[0] ?? null;
      const updated = ticketWithNextStep(
        current,
        firstInserted
          ? updateStepById(activatedChecklist, firstInserted.id, (step) => ({
              ...step,
              status: "active",
            }))
          : activatedChecklist,
        firstInserted?.id ?? null,
        option.title,
      );
      this.persistTicket(updated);
      return {
        ticket: updated,
        kind: "stepCompleted",
        stepTitle: currentStep.title,
        detail: option.title,
      };
    }

    if (option.goto) {
      const gotoStep = findStepByReference(baseChecklist, option.goto);
      if (gotoStep) {
        const updated = ticketWithNextStep(
          current,
          updateStepById(baseChecklist, gotoStep.id, (step) => ({
            ...step,
            status: "active",
          })),
          gotoStep.id,
          option.title,
        );
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
      const nextExecutableSteps = flattenExecutableSteps(baseChecklist);
      const nextStep = nextExecutableSteps.find(
        (step, index) => index > currentIndex && step.status === "pending",
      );
      if (nextStep) {
        const updated = ticketWithNextStep(
          current,
          updateStepById(baseChecklist, nextStep.id, (step) => ({
            ...step,
            status: "active",
          })),
          nextStep.id,
          option.title,
        );
        this.persistTicket(updated);
        return {
          ticket: updated,
          kind: "stepCompleted",
          stepTitle: currentStep.title,
          detail: option.title,
        };
      }
    }

    const updated = ticketWithNextStep(current, baseChecklist, null, option.title, "completed");
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
        checklist: normalizeStoredTicketSteps(parsed.checklist),
      };
    } catch {
      return null;
    }
  }
}
