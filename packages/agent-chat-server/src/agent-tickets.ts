import { createHash, randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import {
  isProceduralProcessBlueprint,
  type ProcessBlueprint,
  type ProcessBlueprintDecisionOption,
  type ProcessBlueprintStep,
} from "./process-blueprints.js"
import { findStandaloneSignalLine } from "./process-signals.js"

export type StoredAgentTicketStatus = "active" | "completed" | "blocked"
export type StoredAgentTicketStepStatus =
  | "pending"
  | "active"
  | "completed"
  | "blocked"
export type StoredAgentTicketBlockedSource = "agent" | "system"

export type StoredAgentTicketDecisionOption = {
  id: string
  title: string
  goto: string | null
  next: boolean
  block: boolean
  complete: boolean
  steps: StoredAgentTicketStep[]
}

export type StoredAgentTicketStep = {
  id: string
  tokenId: string
  title: string
  kind: "task" | "wait" | "decision"
  status: StoredAgentTicketStepStatus
  doneToken: string | null
  blockedToken: string | null
  steps: StoredAgentTicketStep[]
  decision: {
    prompt: string
    options: StoredAgentTicketDecisionOption[]
  } | null
}

export type StoredAgentTicket = {
  id: string
  sessionId: string
  title: string
  description: string
  summary?: string | null
  processBlueprintId: string
  processSnapshotId: string | null
  processTitle: string
  status: StoredAgentTicketStatus
  currentStepId: string | null
  nextStepId: string | null
  nextStepLabel: string | null
  checklist: StoredAgentTicketStep[]
  resolution: string | null
  blockedSource: StoredAgentTicketBlockedSource | null
  sameStepAttemptCount: number
  createdAtMs: number
  updatedAtMs: number
}

export type StoredAgentProcessSnapshot = {
  id: string
  processBlueprintId: string
  processTitle: string
  description: string
  kind: ProcessBlueprint["kind"]
  idlePrompt: string | null
  completionMode: "exact_reply" | null
  completionToken: string | null
  blockedToken: string | null
  stopConditions: string[]
  steps: ProcessBlueprintStep[]
  watchdog: {
    enabled: boolean
    idleTimeoutSeconds: number
    maxNudgesPerIdleEpisode: number
  } | null
  createdAtMs: number
}

export type StoredAgentTicketTransition = {
  ticket: StoredAgentTicket
  kind: "stepCompleted" | "stepBlocked" | "ticketCompleted"
  stepTitle: string | null
  detail: string | null
}

type TicketIndex = {
  activeTicketBySessionId: Record<string, string>
}

type AgentTicketStoreOptions = {
  dataDir: string
  onCanonicalWrite?: (event: {
    sessionId: string
    reason: "ticket-updated"
  }) => void
}

const defaultIndex = (): TicketIndex => ({
  activeTicketBySessionId: {},
})

function safeJsonParse<T>(raw: string): T {
  return JSON.parse(raw) as T
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
  }))
}

function buildChecklist(
  steps: ProcessBlueprintStep[],
  parentPath: string[] = [],
  activationState: { claimed: boolean } = { claimed: false },
): StoredAgentTicketStep[] {
  return steps.map((step) => {
    const currentPath = [...parentPath, step.id]
    const nestedSteps = buildChecklist(step.steps, currentPath, activationState)
    const executable = step.kind === "decision" || nestedSteps.length === 0
    const status: StoredAgentTicketStepStatus =
      executable && !activationState.claimed ? "active" : "pending"

    if (status === "active") {
      activationState.claimed = true
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
            options: buildDecisionOptions(
              step.decision.options,
              currentPath,
              activationState,
            ),
          }
        : null,
    }
  })
}

function cloneDecisionOptions(
  options: StoredAgentTicketDecisionOption[],
): StoredAgentTicketDecisionOption[] {
  return options.map((option) => ({
    ...option,
    steps: cloneChecklist(option.steps),
  }))
}

function cloneChecklist(
  steps: StoredAgentTicketStep[],
): StoredAgentTicketStep[] {
  return steps.map((step) => ({
    ...step,
    steps: cloneChecklist(step.steps),
    decision: step.decision
      ? {
          prompt: step.decision.prompt,
          options: cloneDecisionOptions(step.decision.options),
        }
      : null,
  }))
}

function findStepById(
  steps: StoredAgentTicketStep[],
  stepId: string | null,
): StoredAgentTicketStep | null {
  if (!stepId) {
    return null
  }
  for (const step of steps) {
    if (step.id === stepId) {
      return step
    }
    const nested = findStepById(step.steps, stepId)
    if (nested) {
      return nested
    }
  }
  return null
}

function findStepByReference(
  steps: StoredAgentTicketStep[],
  stepReference: string | null,
): StoredAgentTicketStep | null {
  if (!stepReference) {
    return null
  }
  return (
    findStepById(steps, stepReference) ??
    flattenExecutableSteps(steps).find(
      (step) => step.tokenId === stepReference,
    ) ??
    null
  )
}

function flattenExecutableSteps(
  steps: StoredAgentTicketStep[],
): StoredAgentTicketStep[] {
  const flattened: StoredAgentTicketStep[] = []
  for (const step of steps) {
    const executable = step.kind === "decision" || step.steps.length === 0
    if (executable) {
      flattened.push(step)
    }
    flattened.push(...flattenExecutableSteps(step.steps))
  }
  return flattened
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
      })
    }
    if (step.steps.length === 0) {
      return step
    }
    return {
      ...step,
      steps: updateStepById(step.steps, stepId, updater),
    }
  })
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
  )
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
          options: updateDecisionOptionSteps(
            step.decision.options,
            optionId,
            insertedSteps,
          ),
        },
      }
    }
    if (step.steps.length === 0) {
      return step
    }
    return {
      ...step,
      steps: insertStepsAfterDecision(
        step.steps,
        decisionStepId,
        optionId,
        insertedSteps,
      ),
    }
  })
}

function recomputeContainerStatuses(
  steps: StoredAgentTicketStep[],
): StoredAgentTicketStep[] {
  return steps.map((step) => {
    const nestedSteps = recomputeContainerStatuses(step.steps)
    if (nestedSteps.length === 0 || step.kind === "decision") {
      return {
        ...step,
        steps: nestedSteps,
      }
    }
    const nestedStatuses = nestedSteps.map((entry) => entry.status)
    const status: StoredAgentTicketStepStatus = nestedStatuses.every(
      (entry) => entry === "completed",
    )
      ? "completed"
      : nestedStatuses.some((entry) => entry === "active")
        ? "active"
        : nestedStatuses.some((entry) => entry === "blocked")
          ? "blocked"
          : "pending"
    return {
      ...step,
      status,
      steps: nestedSteps,
    }
  })
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
  }))
}

function normalizeStoredTicketDecisionOptions(
  options: StoredAgentTicketDecisionOption[] | null | undefined,
  parentPath: string[],
): StoredAgentTicketDecisionOption[] {
  if (!Array.isArray(options)) {
    return []
  }
  return options.map((option) => ({
    id: String(option.id),
    title: String(option.title),
    goto: option.goto ? String(option.goto) : null,
    next: option.next === true,
    block: option.block === true,
    complete: option.complete === true,
    steps: normalizeStoredTicketSteps(option.steps, parentPath),
  }))
}

function normalizeStoredTicketSteps(
  steps: StoredAgentTicketStep[] | null | undefined,
  parentPath: string[] = [],
): StoredAgentTicketStep[] {
  if (!Array.isArray(steps)) {
    return []
  }
  return steps.map((step) => {
    const tokenId =
      typeof step.tokenId === "string" && step.tokenId.trim()
        ? step.tokenId
        : String(step.id)
    const fullId =
      typeof step.id === "string" && step.id.includes(".")
        ? step.id
        : [...parentPath, tokenId].join(".")
    const currentPath = fullId.split(".")
    return {
      id: fullId,
      tokenId,
      title: String(step.title),
      kind:
        step.kind === "wait" || step.kind === "decision" ? step.kind : "task",
      status:
        step.status === "active" ||
        step.status === "completed" ||
        step.status === "blocked"
          ? step.status
          : "pending",
      doneToken:
        typeof step.doneToken === "string" && step.doneToken.trim()
          ? step.doneToken
          : null,
      blockedToken:
        typeof step.blockedToken === "string" && step.blockedToken.trim()
          ? step.blockedToken
          : null,
      steps: normalizeStoredTicketSteps(step.steps, currentPath),
      decision: step.decision
        ? {
            prompt: String(step.decision.prompt),
            options: normalizeStoredTicketDecisionOptions(
              step.decision.options,
              currentPath,
            ),
          }
        : null,
    }
  })
}

function ticketWithNextStep(
  current: StoredAgentTicket,
  checklist: StoredAgentTicketStep[],
  currentStepId: string | null,
  resolution: string | null,
  status: StoredAgentTicketStatus = "active",
  options: {
    blockedSource?: StoredAgentTicketBlockedSource | null
    sameStepAttemptCount?: number
  } = {},
): StoredAgentTicket {
  const normalizedChecklist = recomputeContainerStatuses(checklist)
  const currentStep = findStepById(normalizedChecklist, currentStepId)
  const nextCurrentStepId = currentStep?.id ?? null
  const preservesSameStep = current.currentStepId === nextCurrentStepId
  return {
    ...current,
    status,
    currentStepId: nextCurrentStepId,
    nextStepId: nextCurrentStepId,
    nextStepLabel: currentStep?.title ?? null,
    checklist: normalizedChecklist,
    resolution,
    blockedSource:
      status === "blocked"
        ? (options.blockedSource ?? current.blockedSource ?? "agent")
        : null,
    sameStepAttemptCount:
      options.sameStepAttemptCount ??
      (status === "active" && preservesSameStep
        ? current.sameStepAttemptCount
        : 0),
    updatedAtMs: Date.now(),
  }
}

export class AgentTicketStore {
  private readonly ticketsDir: string
  private readonly processSnapshotsDir: string
  private readonly onCanonicalWrite?: (event: {
    sessionId: string
    reason: "ticket-updated"
  }) => void
  private readonly ticketCache = new Map<string, StoredAgentTicket>()
  private readonly processSnapshotCache = new Map<
    string,
    StoredAgentProcessSnapshot
  >()
  private readonly activeTicketBySessionId = new Map<string, string>()

  constructor(options: AgentTicketStoreOptions) {
    this.ticketsDir = join(options.dataDir, "tickets")
    this.processSnapshotsDir = join(this.ticketsDir, "processes")
    this.onCanonicalWrite = options.onCanonicalWrite
    mkdirSync(this.ticketsDir, { recursive: true })
    mkdirSync(this.processSnapshotsDir, { recursive: true })
    this.loadCache()
  }

  getProcessSnapshot(processSnapshotId: string | null | undefined) {
    if (!processSnapshotId) {
      return null
    }
    return this.processSnapshotCache.get(processSnapshotId) ?? null
  }

  getTicket(ticketId: string | null | undefined) {
    if (!ticketId) {
      return null
    }
    const cached = this.ticketCache.get(ticketId)
    if (cached) {
      return cached
    }
    const ticket = this.readTicket(ticketId)
    if (!ticket) {
      return null
    }
    this.ticketCache.set(ticket.id, ticket)
    return ticket
  }

  getActiveTicketForSession(sessionId: string): StoredAgentTicket | null {
    const ticketId = this.activeTicketBySessionId.get(sessionId)
    return this.getTicket(ticketId)
  }

  listTicketsForSession(
    sessionId: string,
    options: { unfinishedOnly?: boolean } = {},
  ) {
    const activeTicketId = this.activeTicketBySessionId.get(sessionId) ?? null
    return [...this.ticketCache.values()]
      .filter((ticket) => ticket.sessionId === sessionId)
      .filter(
        (ticket) => !options.unfinishedOnly || ticket.status !== "completed",
      )
      .sort((left, right) => {
        if (left.id === activeTicketId && right.id !== activeTicketId) {
          return -1
        }
        if (right.id === activeTicketId && left.id !== activeTicketId) {
          return 1
        }
        return right.updatedAtMs - left.updatedAtMs
      })
  }

  activateTicketForSession(sessionId: string, ticketId: string) {
    const ticket = this.getTicket(ticketId)
    if (
      !ticket ||
      ticket.sessionId !== sessionId ||
      ticket.status === "completed"
    ) {
      return null
    }

    this.activeTicketBySessionId.set(sessionId, ticket.id)

    if (ticket.status === "blocked") {
      const resumedChecklist = ticket.currentStepId
        ? updateStepById(
            cloneChecklist(ticket.checklist),
            ticket.currentStepId,
            (step) => ({
              ...step,
              status: "active",
            }),
          )
        : cloneChecklist(ticket.checklist)
      const updated = ticketWithNextStep(
        ticket,
        resumedChecklist,
        ticket.currentStepId,
        null,
        "active",
        {
          blockedSource: null,
          sameStepAttemptCount: 0,
        },
      )
      this.persistTicket(updated)
      return updated
    }

    if (ticket.sameStepAttemptCount !== 0) {
      const updated = ticketWithNextStep(
        ticket,
        cloneChecklist(ticket.checklist),
        ticket.currentStepId,
        ticket.resolution,
        ticket.status,
        {
          blockedSource: ticket.blockedSource,
          sameStepAttemptCount: 0,
        },
      )
      this.persistTicket(updated)
      return updated
    }

    this.writeIndex()
    this.notifyCanonicalWrite(sessionId)
    return ticket
  }

  clearActiveTicketForSession(sessionId: string) {
    if (!this.activeTicketBySessionId.delete(sessionId)) {
      return
    }
    this.writeIndex()
    this.notifyCanonicalWrite(sessionId)
  }

  createOrReplaceSessionTicket(
    sessionId: string,
    processBlueprint: ProcessBlueprint,
  ): StoredAgentTicket {
    const now = Date.now()
    const processSnapshot = this.createOrReadProcessSnapshot(processBlueprint)
    const checklist =
      processSnapshot.kind === "procedural"
        ? buildChecklist(processSnapshot.steps)
        : []
    const firstActiveStep =
      flattenExecutableSteps(checklist).find(
        (step) => step.status === "active",
      ) ?? null
    const ticket: StoredAgentTicket = {
      id: randomUUID(),
      sessionId,
      title: processBlueprint.title,
      description: processBlueprint.expectation,
      processBlueprintId: processBlueprint.id,
      processSnapshotId: processSnapshot.id,
      processTitle: processBlueprint.title,
      status: "active",
      currentStepId: firstActiveStep?.id ?? null,
      nextStepId: firstActiveStep?.id ?? null,
      nextStepLabel: firstActiveStep?.title ?? null,
      checklist,
      resolution: null,
      blockedSource: null,
      sameStepAttemptCount: 0,
      createdAtMs: now,
      updatedAtMs: now,
    }

    this.ticketCache.set(ticket.id, ticket)
    this.activeTicketBySessionId.set(sessionId, ticket.id)
    this.writeTicket(ticket)
    this.writeIndex()
    this.notifyCanonicalWrite(sessionId)
    return ticket
  }

  resolveStepFromAssistantText(
    sessionId: string,
    assistantText: string,
  ): StoredAgentTicketTransition | null {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current || current.status !== "active" || !current.currentStepId) {
      return null
    }

    const executableSteps = flattenExecutableSteps(current.checklist)
    const currentIndex = executableSteps.findIndex(
      (step) => step.id === current.currentStepId,
    )
    if (currentIndex < 0) {
      return null
    }

    const currentStep = executableSteps[currentIndex]
    if (!currentStep) {
      return null
    }
    const genericDoneToken = `done: ${currentStep.tokenId}`
    const genericBlockedToken = `blocked: ${currentStep.tokenId}`
    const { signalText } = findStandaloneSignalLine(assistantText, [
      genericDoneToken,
      genericBlockedToken,
      ...(currentStep.doneToken ? [currentStep.doneToken] : []),
      ...(currentStep.blockedToken ? [currentStep.blockedToken] : []),
      ...(currentStep.decision?.options.flatMap((option) => [
        option.id,
        option.title,
      ]) ?? []),
    ])
    if (!signalText) {
      return null
    }

    if (
      (currentStep.doneToken && signalText === currentStep.doneToken) ||
      signalText === genericDoneToken
    ) {
      return this.completeCurrentStep(current, currentIndex, currentStep, null)
    }

    if (
      (currentStep.blockedToken && signalText === currentStep.blockedToken) ||
      signalText === genericBlockedToken
    ) {
      return this.blockCurrentStep(
        current,
        currentIndex,
        currentStep,
        signalText,
      )
    }

    if (currentStep.kind === "decision" && currentStep.decision) {
      const matchedOption = currentStep.decision.options.find(
        (option) => signalText === option.title || signalText === option.id,
      )
      if (!matchedOption) {
        return null
      }
      return this.resolveDecisionOption(
        current,
        currentIndex,
        currentStep,
        matchedOption,
      )
    }

    return null
  }

  specializeActiveTicketMetadata(
    sessionId: string,
    metadata: { title?: string | null; summary?: string | null },
  ) {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current || current.status !== "active") {
      return current
    }

    const processSnapshot = this.getProcessSnapshot(current.processSnapshotId)
    const nextTitle = metadata.title?.trim() || null
    const nextSummary = metadata.summary?.trim() || null
    const currentSummary = current.summary?.trim() || null
    const provisionalSummary = (
      processSnapshot?.description ?? current.description
    ).trim()
    const canSpecializeTitle =
      current.title.trim() === current.processTitle.trim()
    const canSpecializeSummary =
      !currentSummary || currentSummary === provisionalSummary

    const updated: StoredAgentTicket = {
      ...current,
      title: nextTitle && canSpecializeTitle ? nextTitle : current.title,
      summary:
        nextSummary && canSpecializeSummary ? nextSummary : current.summary,
      updatedAtMs: Date.now(),
    }

    if (
      updated.title === current.title &&
      (updated.summary ?? null) === (current.summary ?? null)
    ) {
      return current
    }

    this.persistTicket(updated)
    return updated
  }

  resolveActiveTicket(
    sessionId: string,
    status: Extract<StoredAgentTicketStatus, "completed" | "blocked">,
    resolution: string,
  ) {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current) {
      return null
    }

    const nextChecklist =
      status === "completed"
        ? markAllStepsStatus(cloneChecklist(current.checklist), "completed")
        : cloneChecklist(current.checklist)

    const resolvedChecklist =
      status === "blocked" && current.currentStepId
        ? updateStepById(nextChecklist, current.currentStepId, (step) => ({
            ...step,
            status: "blocked",
          }))
        : nextChecklist

    const updated = ticketWithNextStep(
      current,
      resolvedChecklist,
      status === "blocked" ? current.currentStepId : null,
      resolution,
      status,
      {
        blockedSource: status === "blocked" ? "agent" : null,
        sameStepAttemptCount: 0,
      },
    )
    this.persistTicket(updated)
    return updated
  }

  resumeBlockedActiveTicket(sessionId: string) {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current || current.status !== "blocked" || !current.currentStepId) {
      return null
    }

    const resumedChecklist = updateStepById(
      cloneChecklist(current.checklist),
      current.currentStepId,
      (step) => ({
        ...step,
        status: "active",
      }),
    )
    const updated = ticketWithNextStep(
      current,
      resumedChecklist,
      current.currentStepId,
      null,
      "active",
      {
        blockedSource: null,
        sameStepAttemptCount: 0,
      },
    )
    this.persistTicket(updated)
    return updated
  }

  resetSameStepAttemptCount(sessionId: string) {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current || current.sameStepAttemptCount === 0) {
      return current
    }
    const updated = ticketWithNextStep(
      current,
      cloneChecklist(current.checklist),
      current.currentStepId,
      current.resolution,
      current.status,
      {
        blockedSource: current.blockedSource,
        sameStepAttemptCount: 0,
      },
    )
    this.persistTicket(updated)
    return updated
  }

  incrementSameStepAttemptCount(sessionId: string) {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current || current.status !== "active" || !current.currentStepId) {
      return null
    }
    const updated = ticketWithNextStep(
      current,
      cloneChecklist(current.checklist),
      current.currentStepId,
      current.resolution,
      current.status,
      {
        blockedSource: null,
        sameStepAttemptCount: current.sameStepAttemptCount + 1,
      },
    )
    this.persistTicket(updated)
    return updated
  }

  blockActiveTicketBySystem(sessionId: string, resolution: string) {
    const current = this.getActiveTicketForSession(sessionId)
    if (!current?.currentStepId) {
      return null
    }

    const blockedChecklist = updateStepById(
      cloneChecklist(current.checklist),
      current.currentStepId,
      (step) => ({
        ...step,
        status: "blocked",
      }),
    )
    const updated = ticketWithNextStep(
      current,
      blockedChecklist,
      current.currentStepId,
      resolution,
      "blocked",
      {
        blockedSource: "system",
        sameStepAttemptCount: 0,
      },
    )
    this.persistTicket(updated)
    return updated
  }

  private completeCurrentStep(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    detail: string | null,
  ): StoredAgentTicketTransition {
    const completedChecklist = updateStepById(
      cloneChecklist(current.checklist),
      currentStep.id,
      (step) => ({
        ...step,
        status: "completed",
      }),
    )
    const nextExecutableSteps = flattenExecutableSteps(completedChecklist)
    const nextStep = nextExecutableSteps.find(
      (step, index) => index > currentIndex && step.status === "pending",
    )

    if (!nextStep) {
      const finalizedChecklist = nextExecutableSteps.reduce(
        (acc, step) =>
          updateStepById(acc, step.id, (entry) => ({
            ...entry,
            status: "completed",
          })),
        completedChecklist,
      )
      const updated = ticketWithNextStep(
        current,
        finalizedChecklist,
        null,
        detail,
        "completed",
      )
      this.persistTicket(updated)
      return {
        ticket: updated,
        kind: "ticketCompleted",
        stepTitle: currentStep.title,
        detail,
      }
    }

    const activatedChecklist = updateStepById(
      completedChecklist,
      nextStep.id,
      (step) => ({
        ...step,
        status: "active",
      }),
    )
    const updated = ticketWithNextStep(
      current,
      activatedChecklist,
      nextStep.id,
      detail,
    )
    this.persistTicket(updated)
    return {
      ticket: updated,
      kind: "stepCompleted",
      stepTitle: currentStep.title,
      detail,
    }
  }

  private blockCurrentStep(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    detail: string | null,
  ): StoredAgentTicketTransition {
    void currentIndex
    const nextChecklist = updateStepById(
      cloneChecklist(current.checklist),
      currentStep.id,
      (step) => ({
        ...step,
        status: "blocked",
      }),
    )
    const updated = ticketWithNextStep(
      current,
      nextChecklist,
      currentStep.id,
      detail,
      "blocked",
      {
        blockedSource: "agent",
        sameStepAttemptCount: 0,
      },
    )
    this.persistTicket(updated)
    return {
      ticket: updated,
      kind: "stepBlocked",
      stepTitle: currentStep.title,
      detail,
    }
  }

  private resolveDecisionOption(
    current: StoredAgentTicket,
    currentIndex: number,
    currentStep: StoredAgentTicketStep,
    option: StoredAgentTicketDecisionOption,
  ): StoredAgentTicketTransition {
    const baseChecklist = updateStepById(
      cloneChecklist(current.checklist),
      currentStep.id,
      (step) => ({
        ...step,
        status: option.block ? "blocked" : "completed",
      }),
    )

    if (option.block) {
      const updated = ticketWithNextStep(
        current,
        baseChecklist,
        currentStep.id,
        option.title,
        "blocked",
        {
          blockedSource: "agent",
          sameStepAttemptCount: 0,
        },
      )
      this.persistTicket(updated)
      return {
        ticket: updated,
        kind: "stepBlocked",
        stepTitle: currentStep.title,
        detail: option.title,
      }
    }

    if (option.complete) {
      const updated = ticketWithNextStep(
        current,
        baseChecklist,
        null,
        option.title,
        "completed",
      )
      this.persistTicket(updated)
      return {
        ticket: updated,
        kind: "ticketCompleted",
        stepTitle: currentStep.title,
        detail: option.title,
      }
    }

    if (option.steps.length > 0) {
      const inserted = cloneChecklist(option.steps)
      const activatedChecklist = insertStepsAfterDecision(
        baseChecklist,
        currentStep.id,
        option.id,
        inserted,
      )
      const insertedExecutables = flattenExecutableSteps(inserted)
      const firstInserted = insertedExecutables[0] ?? null
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
      )
      this.persistTicket(updated)
      return {
        ticket: updated,
        kind: "stepCompleted",
        stepTitle: currentStep.title,
        detail: option.title,
      }
    }

    if (option.goto) {
      const gotoStep = findStepByReference(baseChecklist, option.goto)
      if (gotoStep) {
        const updated = ticketWithNextStep(
          current,
          updateStepById(baseChecklist, gotoStep.id, (step) => ({
            ...step,
            status: "active",
          })),
          gotoStep.id,
          option.title,
        )
        this.persistTicket(updated)
        return {
          ticket: updated,
          kind: "stepCompleted",
          stepTitle: currentStep.title,
          detail: option.title,
        }
      }
    }

    if (option.next) {
      const nextExecutableSteps = flattenExecutableSteps(baseChecklist)
      const nextStep = nextExecutableSteps.find(
        (step, index) => index > currentIndex && step.status === "pending",
      )
      if (nextStep) {
        const updated = ticketWithNextStep(
          current,
          updateStepById(baseChecklist, nextStep.id, (step) => ({
            ...step,
            status: "active",
          })),
          nextStep.id,
          option.title,
        )
        this.persistTicket(updated)
        return {
          ticket: updated,
          kind: "stepCompleted",
          stepTitle: currentStep.title,
          detail: option.title,
        }
      }
    }

    const updated = ticketWithNextStep(
      current,
      baseChecklist,
      null,
      option.title,
      "completed",
    )
    this.persistTicket(updated)
    return {
      ticket: updated,
      kind: "ticketCompleted",
      stepTitle: currentStep.title,
      detail: option.title,
    }
  }

  private persistTicket(ticket: StoredAgentTicket) {
    this.ticketCache.set(ticket.id, ticket)
    this.writeTicket(ticket)
    this.writeIndex()
    this.notifyCanonicalWrite(ticket.sessionId)
  }

  private notifyCanonicalWrite(sessionId: string) {
    this.onCanonicalWrite?.({ sessionId, reason: "ticket-updated" })
  }

  private processSnapshotDir(processSnapshotId: string) {
    return join(this.processSnapshotsDir, processSnapshotId)
  }

  private processSnapshotPath(processSnapshotId: string) {
    return join(this.processSnapshotDir(processSnapshotId), "process.json")
  }

  private indexPath() {
    return join(this.ticketsDir, "index.json")
  }

  private ticketDir(ticketId: string) {
    return join(this.ticketsDir, ticketId)
  }

  private ticketPath(ticketId: string) {
    return join(this.ticketDir(ticketId), "ticket.json")
  }

  private writeIndex() {
    const payload: TicketIndex = {
      activeTicketBySessionId: Object.fromEntries(
        this.activeTicketBySessionId.entries(),
      ),
    }
    writeFileSync(this.indexPath(), `${JSON.stringify(payload, null, 2)}\n`)
  }

  private writeTicket(ticket: StoredAgentTicket) {
    mkdirSync(this.ticketDir(ticket.id), { recursive: true })
    writeFileSync(
      this.ticketPath(ticket.id),
      `${JSON.stringify(ticket, null, 2)}\n`,
    )
  }

  private writeProcessSnapshot(processSnapshot: StoredAgentProcessSnapshot) {
    mkdirSync(this.processSnapshotDir(processSnapshot.id), { recursive: true })
    writeFileSync(
      this.processSnapshotPath(processSnapshot.id),
      `${JSON.stringify(processSnapshot, null, 2)}\n`,
    )
  }

  private createOrReadProcessSnapshot(
    processBlueprint: ProcessBlueprint,
  ): StoredAgentProcessSnapshot {
    const payload = {
      processBlueprintId: processBlueprint.id,
      processTitle: processBlueprint.title,
      description: processBlueprint.expectation,
      kind: processBlueprint.kind,
      idlePrompt: isProceduralProcessBlueprint(processBlueprint)
        ? processBlueprint.idlePrompt
        : null,
      completionMode: isProceduralProcessBlueprint(processBlueprint)
        ? processBlueprint.completionMode
        : null,
      completionToken: isProceduralProcessBlueprint(processBlueprint)
        ? processBlueprint.completionToken
        : null,
      blockedToken: isProceduralProcessBlueprint(processBlueprint)
        ? processBlueprint.blockedToken
        : null,
      stopConditions: isProceduralProcessBlueprint(processBlueprint)
        ? [...processBlueprint.stopConditions]
        : [],
      steps: isProceduralProcessBlueprint(processBlueprint)
        ? JSON.parse(JSON.stringify(processBlueprint.steps))
        : [],
      watchdog: isProceduralProcessBlueprint(processBlueprint)
        ? { ...processBlueprint.watchdog }
        : null,
    } satisfies Omit<StoredAgentProcessSnapshot, "id" | "createdAtMs">

    const id = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, 16)
    const cached =
      this.processSnapshotCache.get(id) ?? this.readProcessSnapshot(id)
    if (cached) {
      this.processSnapshotCache.set(id, cached)
      return cached
    }

    const processSnapshot: StoredAgentProcessSnapshot = {
      id,
      createdAtMs: Date.now(),
      ...payload,
    }
    this.processSnapshotCache.set(id, processSnapshot)
    this.writeProcessSnapshot(processSnapshot)
    return processSnapshot
  }

  private loadCache() {
    for (const entry of readdirSync(this.processSnapshotsDir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue
      }
      const processSnapshot = this.readProcessSnapshot(entry.name)
      if (!processSnapshot) {
        continue
      }
      this.processSnapshotCache.set(processSnapshot.id, processSnapshot)
    }

    const index = this.readIndex()
    for (const [sessionId, ticketId] of Object.entries(
      index.activeTicketBySessionId,
    )) {
      const ticket = this.readTicket(ticketId)
      if (!ticket) {
        continue
      }
      this.ticketCache.set(ticket.id, ticket)
      this.activeTicketBySessionId.set(sessionId, ticket.id)
    }

    if (this.activeTicketBySessionId.size === 0) {
      for (const entry of readdirSync(this.ticketsDir, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) {
          continue
        }
        const ticket = this.readTicket(entry.name)
        if (!ticket) {
          continue
        }
        this.ticketCache.set(ticket.id, ticket)
      }
    }
  }

  private readProcessSnapshot(
    processSnapshotId: string,
  ): StoredAgentProcessSnapshot | null {
    const path = this.processSnapshotPath(processSnapshotId)
    if (!existsSync(path)) {
      return null
    }

    try {
      const parsed = safeJsonParse<StoredAgentProcessSnapshot>(
        readFileSync(path, "utf8"),
      )
      return {
        ...parsed,
        id: String(parsed.id),
        processBlueprintId: String(parsed.processBlueprintId),
        processTitle: String(parsed.processTitle),
        description: String(parsed.description),
        kind: parsed.kind === "procedural" ? "procedural" : "mode",
        idlePrompt:
          typeof parsed.idlePrompt === "string" && parsed.idlePrompt.trim()
            ? parsed.idlePrompt
            : null,
        completionMode:
          parsed.completionMode === "exact_reply" ? "exact_reply" : null,
        completionToken:
          typeof parsed.completionToken === "string" &&
          parsed.completionToken.trim()
            ? parsed.completionToken
            : null,
        blockedToken:
          typeof parsed.blockedToken === "string" && parsed.blockedToken.trim()
            ? parsed.blockedToken
            : null,
        stopConditions: Array.isArray(parsed.stopConditions)
          ? parsed.stopConditions.map((value) => String(value))
          : [],
        steps: Array.isArray(parsed.steps)
          ? JSON.parse(JSON.stringify(parsed.steps))
          : [],
        watchdog:
          parsed.watchdog && typeof parsed.watchdog === "object"
            ? {
                enabled: parsed.watchdog.enabled !== false,
                idleTimeoutSeconds:
                  Number(parsed.watchdog.idleTimeoutSeconds) || 90,
                maxNudgesPerIdleEpisode:
                  Number(parsed.watchdog.maxNudgesPerIdleEpisode) || 0,
              }
            : null,
        createdAtMs: Number(parsed.createdAtMs) || Date.now(),
      }
    } catch {
      return null
    }
  }

  private readIndex(): TicketIndex {
    if (!existsSync(this.indexPath())) {
      return defaultIndex()
    }

    try {
      const parsed = safeJsonParse<Partial<TicketIndex>>(
        readFileSync(this.indexPath(), "utf8"),
      )
      return {
        activeTicketBySessionId:
          parsed.activeTicketBySessionId &&
          typeof parsed.activeTicketBySessionId === "object"
            ? Object.fromEntries(
                Object.entries(parsed.activeTicketBySessionId).map(
                  ([sessionId, ticketId]) => [
                    String(sessionId),
                    String(ticketId),
                  ],
                ),
              )
            : {},
      }
    } catch {
      return defaultIndex()
    }
  }

  private readTicket(ticketId: string): StoredAgentTicket | null {
    const path = this.ticketPath(ticketId)
    if (!existsSync(path)) {
      return null
    }

    try {
      const parsed = safeJsonParse<StoredAgentTicket>(
        readFileSync(path, "utf8"),
      )
      return {
        ...parsed,
        id: String(parsed.id),
        sessionId: String(parsed.sessionId),
        title: String(parsed.title),
        description: String(parsed.description),
        summary:
          typeof parsed.summary === "string" && parsed.summary.trim()
            ? parsed.summary
            : null,
        processBlueprintId: String(parsed.processBlueprintId),
        processSnapshotId:
          typeof parsed.processSnapshotId === "string" &&
          parsed.processSnapshotId.trim()
            ? parsed.processSnapshotId
            : null,
        processTitle: String(parsed.processTitle),
        status:
          parsed.status === "completed" || parsed.status === "blocked"
            ? parsed.status
            : "active",
        currentStepId:
          typeof parsed.currentStepId === "string" &&
          parsed.currentStepId.trim()
            ? parsed.currentStepId
            : null,
        nextStepId:
          typeof parsed.nextStepId === "string" && parsed.nextStepId.trim()
            ? parsed.nextStepId
            : null,
        nextStepLabel:
          typeof parsed.nextStepLabel === "string" &&
          parsed.nextStepLabel.trim()
            ? parsed.nextStepLabel
            : null,
        checklist: normalizeStoredTicketSteps(parsed.checklist),
        resolution:
          typeof parsed.resolution === "string" && parsed.resolution.trim()
            ? parsed.resolution
            : null,
        blockedSource:
          parsed.blockedSource === "agent" || parsed.blockedSource === "system"
            ? parsed.blockedSource
            : null,
        sameStepAttemptCount: Number.isFinite(
          Number(parsed.sameStepAttemptCount),
        )
          ? Math.max(0, Number(parsed.sameStepAttemptCount))
          : 0,
      }
    } catch {
      return null
    }
  }
}
