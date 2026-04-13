import { randomUUID } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import {
  AgentTicketStore,
  type StoredAgentTicket,
  type StoredAgentTicketTransition,
} from "./agent-tickets.js"
import {
  type AgentChatProviderKind,
  getProviderCatalogEntry,
  listProviderCatalog,
} from "./catalog.js"
import { interruptClaudeTurn, runClaudeTurn } from "./claude-provider.js"
import {
  type CodexTokenUsagePayload,
  ensureCodexAppServer,
  interruptCodexTurn,
  runCodexTurn,
} from "./codex-provider.js"
import {
  normalizeClaudeSessionModelRef,
  primeClaudeModelCatalogRefresh,
  refreshClaudeModelCatalog,
} from "./model-service.js"
import {
  isProceduralProcessBlueprint,
  loadProcessBlueprintCatalog,
  type ProcessBlueprint,
  resolveProcessBlueprintById,
} from "./process-blueprints.js"
import { findStandaloneSignalLine } from "./process-signals.js"
import {
  resolveActiveProviderParticipantId,
  SYSTEM_PARTICIPANT_ID,
  USER_PARTICIPANT_ID,
} from "./schema.js"
import {
  AgentChatStore,
  type SessionWatchdogState,
  type StoredMessage,
  type StoredMessageContentBlock,
  type StoredSession,
} from "./store.js"
import {
  reassignTicketMutation,
  selectTicketStepMutation,
} from "./ticket-mutations.js"
import {
  matchTicketReassignRoute,
  matchTicketStepSelectionRoute,
} from "./ticket-routes.js"

const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state"
const appDataDir =
  process.env.AGENT_CHAT_DATA_DIR?.trim() ||
  "/home/ec2-user/workspace/data/agent-chat"
const logPath =
  process.env.AGENT_CHAT_LOG_PATH?.trim() ||
  `${stateDir}/logs/agent-chat-server.log`
const legacyDbPath =
  process.env.AGENT_CHAT_DB_PATH?.trim() ||
  `${stateDir}/agent-chat/agent-chat.sqlite`
const port = Number.parseInt(process.env.AGENT_CHAT_PORT ?? "8789", 10)
const defaultSessionDirectory =
  process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace"
const workspaceBlueprintRoot =
  process.env.AGENT_SHARED_BLUEPRINTS_DIR?.trim() ||
  `${defaultSessionDirectory}/blueprints`
const workspacePersistenceRequestPath =
  process.env.WORKSPACE_PERSISTENCE_REQUEST_PATH?.trim() ||
  `${stateDir}/workspace-persistence-request.json`
const processBlueprintsDir =
  process.env.AGENT_PROCESS_BLUEPRINTS_DIR?.trim() ||
  resolve(import.meta.dir, "../../../blueprints/process-blueprints")
const processStepsDir =
  process.env.AGENT_PROCESS_STEPS_DIR?.trim() ||
  resolve(import.meta.dir, "../../../blueprints/process-steps")
const processTemplatesDir =
  process.env.AGENT_PROCESS_TEMPLATES_DIR?.trim() ||
  resolve(import.meta.dir, "../../../blueprints/process-templates")
const workspaceProcessBlueprintsDir = resolve(
  workspaceBlueprintRoot,
  "process-blueprints",
)
const workspaceProcessTemplatesDir = resolve(
  workspaceBlueprintRoot,
  "process-templates",
)
const workspaceProcessStepsDir = resolve(
  workspaceBlueprintRoot,
  "process-steps",
)
const approvedTempImageDir = resolve(
  process.env.AGENT_CHAT_TEMP_IMAGE_DIR?.trim() || "/home/ec2-user/temp",
)
const DIRECTORY_QUEUE_PREFIX = "Directory will switch to "
const TITLE_QUEUE_PREFIX = "Chat title will change to "
const DIRECTORY_INSTRUCTION_PREFIX = "Working directory changed to "
const TITLE_INSTRUCTION_PREFIX = "Chat title changed to "
const PROCESS_INSTRUCTION_PREFIX = "Session process expectation changed to "
const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

type ChatSocketData = {
  socketId: string
  sessionId: string | null
  clientMode: "v1" | "v2"
}

type SessionActivity = {
  status: "idle" | "queued" | "running" | "interrupted" | "error"
  startedAtMs: number | null
  threadId: string | null
  turnId: string | null
  backgroundProcessCount: number
  waitingFlags: string[]
  lastError: string | null
  currentMessageId: string | null
  canInterrupt: boolean
}

type SessionProviderUsage = {
  providerKind: AgentChatProviderKind
  modelContextWindow: number | null
  totalTokens: number | null
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  reasoningOutputTokens: number | null
  lastTotalTokens: number | null
  lastInputTokens: number | null
  lastOutputTokens: number | null
  lastCachedInputTokens: number | null
  lastReasoningOutputTokens: number | null
  updatedAtMs: number
}

type SessionSummaryResponseItem = StoredSession & {
  activity: SessionActivity
  queuedMessageCount: number
  providerUsage: SessionProviderUsage | null
  activeTicket: StoredAgentTicket | null
}

type ProcessBlueprintResponseItem = ProcessBlueprint

type SessionSnapshotPayload = {
  ok: true
  session: SessionSummaryResponseItem
  messages: StoredMessage[]
  queuedMessages: StoredMessage[]
  activity: SessionActivity
  providerUsage: SessionProviderUsage | null
}

type SessionWindowPayload = {
  ok: true
  session: SessionSummaryResponseItem
  messages: StoredMessage[]
  queuedMessages: StoredMessage[]
  activity: SessionActivity
  providerUsage: SessionProviderUsage | null
  hasOlderMessages: boolean
  nextBeforeMessageId: string | null
  sessionVersion: string
}

type SessionRuntimeState = SessionActivity & {
  lastVisibleActivityAtMs: number | null
  interruptRequested: boolean
  providerKind: AgentChatProviderKind | null
  providerIdleSinceAtMs: number | null
  userTypingUntilAtMs: number | null
  providerUsage: SessionProviderUsage | null
}

type WorkspacePersistenceRequest = {
  requestedAtMs: number
  flushNow?: boolean
  reason?: string
  source?: string
}

type ProviderInputBlock =
  | { type: "text"; text: string }
  | {
      type: "image"
      url: string
      mediaType: string | null
      filePath: string | null
      base64Data: string | null
    }

function providerSupportsInterrupt(providerKind: AgentChatProviderKind) {
  return (
    providerKind === "codex-app-server" || providerKind === "claude-agent-sdk"
  )
}

mkdirSync(dirname(logPath), { recursive: true })

function readWorkspacePersistenceRequest(): WorkspacePersistenceRequest | null {
  if (!existsSync(workspacePersistenceRequestPath)) {
    return null
  }

  try {
    return JSON.parse(
      readFileSync(workspacePersistenceRequestPath, "utf8"),
    ) as WorkspacePersistenceRequest
  } catch {
    return null
  }
}

function requestWorkspacePersistence(reason: string) {
  const current = readWorkspacePersistenceRequest()
  const next: WorkspacePersistenceRequest = {
    requestedAtMs: Date.now(),
    flushNow: current?.flushNow ?? false,
    reason,
    source: "agent-chat-server",
  }
  mkdirSync(dirname(workspacePersistenceRequestPath), { recursive: true })
  writeFileSync(
    workspacePersistenceRequestPath,
    `${JSON.stringify(next, null, 2)}\n`,
  )
}

const store = new AgentChatStore({
  dataDir: appDataDir,
  legacySqlitePath: legacyDbPath,
  onCanonicalWrite(event) {
    requestWorkspacePersistence(`agent-chat:${event.reason}:${event.sessionId}`)
  },
})
const ticketStore = new AgentTicketStore({
  dataDir: appDataDir,
  onCanonicalWrite(event) {
    requestWorkspacePersistence(`agent-chat:${event.reason}:${event.sessionId}`)
  },
})
const processBlueprintCatalog = loadProcessBlueprintCatalog({
  processBlueprintDirs: [processBlueprintsDir, workspaceProcessBlueprintsDir],
  processTemplateDirs: [processTemplatesDir, workspaceProcessTemplatesDir],
  processStepDirs: [processStepsDir, workspaceProcessStepsDir],
})
const processBlueprintById = new Map(
  processBlueprintCatalog.map((entry) => [entry.id, entry] as const),
)
const sessionSockets = new Map<
  string,
  Set<Bun.ServerWebSocket<ChatSocketData>>
>()
const activeSessionRuns = new Set<string>()
const sessionRuntime = new Map<string, SessionRuntimeState>()
const sessionWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()
const retryBackoffMs = [2_000, 5_000, 15_000] as const
const typingGraceMs = 5_000

primeClaudeModelCatalogRefresh()

function log(message: string) {
  const line = `[${new Date().toISOString()}:agent-chat-server] ${message}\n`
  mkdirSync(dirname(logPath), { recursive: true })
  appendFileSync(logPath, line)
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function notFound() {
  return new Response("not found", { status: 404 })
}

function ensureRuntimeState(sessionId: string): SessionRuntimeState {
  let runtime = sessionRuntime.get(sessionId)
  if (!runtime) {
    runtime = {
      status: "idle",
      startedAtMs: null,
      threadId: null,
      turnId: null,
      backgroundProcessCount: 0,
      waitingFlags: [],
      lastError: null,
      currentMessageId: null,
      canInterrupt: false,
      lastVisibleActivityAtMs: null,
      interruptRequested: false,
      providerKind: null,
      providerIdleSinceAtMs: null,
      userTypingUntilAtMs: null,
      providerUsage: null,
    }
    sessionRuntime.set(sessionId, runtime)
  }
  return runtime
}

function getSessionSockets(sessionId: string) {
  let sockets = sessionSockets.get(sessionId)
  if (!sockets) {
    sockets = new Set()
    sessionSockets.set(sessionId, sockets)
  }
  return sockets
}

function toSessionActivity(sessionId: string): SessionActivity {
  const runtime = ensureRuntimeState(sessionId)
  return {
    status: runtime.status,
    startedAtMs: runtime.startedAtMs,
    threadId: runtime.threadId,
    turnId: runtime.turnId,
    backgroundProcessCount: runtime.backgroundProcessCount,
    waitingFlags: [...runtime.waitingFlags],
    lastError: runtime.lastError,
    currentMessageId: runtime.currentMessageId,
    canInterrupt: runtime.canInterrupt,
  }
}

function buildSessionSummary(
  session: StoredSession,
): SessionSummaryResponseItem {
  const runtime = ensureRuntimeState(session.id)
  const modelRef =
    session.providerKind === "claude-agent-sdk"
      ? normalizeClaudeSessionModelRef(session.modelRef)
      : session.modelRef
  return {
    ...session,
    modelRef,
    activity: toSessionActivity(session.id),
    queuedMessageCount: store.listQueuedMessages(session.id).length,
    providerUsage: runtime.providerUsage,
    activeTicket: ticketStore.getActiveTicketForSession(session.id),
  }
}

function buildSessionSnapshot(
  sessionId: string,
): SessionSnapshotPayload | null {
  const session = store.getSession(sessionId)
  if (!session) {
    return null
  }

  const activity = toSessionActivity(sessionId)
  return {
    ok: true,
    session: buildSessionSummary(session),
    messages: store.listMessages(sessionId),
    queuedMessages: store.listQueuedMessages(sessionId),
    activity,
    providerUsage: ensureRuntimeState(sessionId).providerUsage,
  }
}

function buildSessionVersion(
  session: StoredSession,
  messages: StoredMessage[],
): string {
  const lastMessage = messages.at(-1)
  return [
    session.updatedAtMs,
    session.messageCount,
    lastMessage?.id ?? "none",
    lastMessage?.createdAtMs ?? 0,
  ].join(":")
}

function buildSessionWindow(
  sessionId: string,
  input?: {
    beforeMessageId?: string | null
    limit?: number | null
  },
): SessionWindowPayload | null {
  const session = store.getSession(sessionId)
  if (!session) {
    return null
  }
  const page = store.listMessagesPage(sessionId, {
    beforeMessageId: input?.beforeMessageId ?? null,
    limit: input?.limit ?? 50,
  })
  const allMessages = store.listMessages(sessionId)
  const activity = toSessionActivity(sessionId)
  return {
    ok: true,
    session: buildSessionSummary(session),
    messages: page.messages,
    queuedMessages: store.listQueuedMessages(sessionId),
    activity,
    providerUsage: ensureRuntimeState(sessionId).providerUsage,
    hasOlderMessages: page.hasOlderMessages,
    nextBeforeMessageId: page.messages[0]?.id ?? null,
    sessionVersion: buildSessionVersion(session, allMessages),
  }
}

function normalizeV2Limit(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(1, Math.min(200, parsed))
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeCodexTokenUsage(
  tokenUsage: CodexTokenUsagePayload | null,
): SessionProviderUsage | null {
  if (!tokenUsage) {
    return null
  }

  const total = tokenUsage.total ?? {}
  const last = tokenUsage.last ?? {}
  return {
    providerKind: "codex-app-server",
    modelContextWindow: numberFromUnknown(tokenUsage.modelContextWindow),
    totalTokens: numberFromUnknown(total.totalTokens),
    inputTokens: numberFromUnknown(total.inputTokens),
    outputTokens: numberFromUnknown(total.outputTokens),
    cachedInputTokens: numberFromUnknown(total.cachedInputTokens),
    reasoningOutputTokens: numberFromUnknown(total.reasoningOutputTokens),
    lastTotalTokens: numberFromUnknown(last.totalTokens),
    lastInputTokens: numberFromUnknown(last.inputTokens),
    lastOutputTokens: numberFromUnknown(last.outputTokens),
    lastCachedInputTokens: numberFromUnknown(last.cachedInputTokens),
    lastReasoningOutputTokens: numberFromUnknown(last.reasoningOutputTokens),
    updatedAtMs: Date.now(),
  }
}

function normalizeProviderModelRef(
  providerKind: AgentChatProviderKind,
  modelRef: string,
) {
  const trimmed = modelRef.trim()
  if (providerKind === "claude-agent-sdk") {
    return normalizeClaudeSessionModelRef(trimmed)
  }
  return trimmed
}

function normalizeImageSource(sourceUrl: string) {
  const trimmed = sourceUrl.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("~/")) {
    return resolve("/home/ec2-user", trimmed.slice(2))
  }
  return trimmed
}

function isApprovedTempImagePath(path: string) {
  const resolvedPath = resolve(path)
  return (
    resolvedPath === approvedTempImageDir ||
    resolvedPath.startsWith(`${approvedTempImageDir}/`)
  )
}

function inferImageMediaType(
  sourceUrl: string,
  fallback: string | null = null,
) {
  const normalizedFallback = fallback?.split(";")[0]?.trim() || ""
  if (normalizedFallback.startsWith("image/")) {
    return normalizedFallback
  }

  const lowerSource = sourceUrl.toLowerCase()
  if (lowerSource.endsWith(".jpg") || lowerSource.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (lowerSource.endsWith(".gif")) {
    return "image/gif"
  }
  if (lowerSource.endsWith(".webp")) {
    return "image/webp"
  }
  if (lowerSource.endsWith(".svg")) {
    return "image/svg+xml"
  }
  return "image/png"
}

function isLikelyLocalImagePath(sourceUrl: string) {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(sourceUrl)
}

async function readImageSource(sourceUrl: string): Promise<{
  normalizedSource: string
  provenance: "attachment" | "temp" | "external"
  mediaType: string
  bytes: Uint8Array
}> {
  const normalizedSource = normalizeImageSource(sourceUrl)
  if (!normalizedSource) {
    throw new Error("Image source required.")
  }

  const attachment = store.readAttachmentBytes(normalizedSource)
  if (attachment) {
    return {
      normalizedSource,
      provenance: "attachment",
      mediaType: attachment.attachment.mediaType,
      bytes: attachment.bytes,
    }
  }

  if (isApprovedTempImagePath(normalizedSource)) {
    if (!existsSync(normalizedSource)) {
      throw new Error("Temporary image not found.")
    }
    const file = Bun.file(normalizedSource)
    return {
      normalizedSource,
      provenance: "temp",
      mediaType: inferImageMediaType(normalizedSource, file.type),
      bytes: new Uint8Array(await file.arrayBuffer()),
    }
  }

  if (normalizedSource.startsWith("/") && existsSync(normalizedSource)) {
    if (!isLikelyLocalImagePath(normalizedSource)) {
      throw new Error("Unsupported local image source.")
    }
    const file = Bun.file(normalizedSource)
    return {
      normalizedSource,
      provenance: "external",
      mediaType: inferImageMediaType(normalizedSource, file.type),
      bytes: new Uint8Array(await file.arrayBuffer()),
    }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(normalizedSource)
  } catch {
    throw new Error("Unsupported image source.")
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("External images must use http or https URLs.")
  }

  const response = await fetch(parsedUrl)
  if (!response.ok) {
    throw new Error(
      `External image request failed with status ${response.status}.`,
    )
  }

  return {
    normalizedSource,
    provenance: "external",
    mediaType: inferImageMediaType(
      normalizedSource,
      response.headers.get("content-type"),
    ),
    bytes: new Uint8Array(await response.arrayBuffer()),
  }
}

function replaceMarkdownImageSourceInText(
  text: string,
  sourceUrl: string,
  nextSourceUrl: string,
) {
  let replaced = false
  const nextText = text.replace(
    markdownImagePattern,
    (match, altText, currentSource) => {
      if (normalizeImageSource(String(currentSource)) !== sourceUrl) {
        return match
      }
      replaced = true
      return `![${String(altText)}](${nextSourceUrl})`
    },
  )
  return {
    text: nextText,
    replaced,
  }
}

function promoteMarkdownImageReference(
  sessionId: string,
  messageId: string,
  sourceUrl: string,
  nextSourceUrl: string,
) {
  const message = store
    .listMessages(sessionId)
    .find((entry) => entry.id === messageId)
  if (!message) {
    return null
  }

  let replacedAny = false
  const nextContent = message.content.map((block) => {
    if (block.type !== "text") {
      return block
    }
    const replacement = replaceMarkdownImageSourceInText(
      block.text,
      sourceUrl,
      nextSourceUrl,
    )
    if (replacement.replaced) {
      replacedAny = true
      return {
        type: "text" as const,
        text: replacement.text,
      }
    }
    return block
  })

  if (!replacedAny) {
    return null
  }

  return store.updateMessageContent(sessionId, messageId, nextContent)
}

function listProcessBlueprints(): ProcessBlueprintResponseItem[] {
  return processBlueprintCatalog.map((entry) =>
    isProceduralProcessBlueprint(entry)
      ? {
          kind: "procedural",
          id: entry.id,
          title: entry.title,
          catalogOrder: entry.catalogOrder,
          expectation: entry.expectation,
          idlePrompt: entry.idlePrompt,
          completionMode: entry.completionMode,
          completionToken: entry.completionToken,
          blockedToken: entry.blockedToken,
          stopConditions: [...entry.stopConditions],
          steps: JSON.parse(JSON.stringify(entry.steps)),
          watchdog: {
            enabled: entry.watchdog.enabled,
            idleTimeoutSeconds: entry.watchdog.idleTimeoutSeconds,
            maxNudgesPerIdleEpisode: entry.watchdog.maxNudgesPerIdleEpisode,
          },
          companionPath: entry.companionPath,
          processConfig: entry.processConfig,
        }
      : {
          kind: "mode",
          id: entry.id,
          title: entry.title,
          catalogOrder: entry.catalogOrder,
          expectation: entry.expectation,
          companionPath: entry.companionPath,
          processConfig: entry.processConfig,
        },
  )
}

function getSessionProcessBlueprint(
  session: StoredSession | null | undefined,
): ProcessBlueprint | null {
  if (!session?.processBlueprintId) {
    return null
  }
  return processBlueprintById.get(session.processBlueprintId) ?? null
}

function formatTicketChecklistStepLines(
  steps: StoredAgentTicket["checklist"],
  indentLevel = 0,
  currentStepId: string | null = null,
): string[] {
  return steps.flatMap((step) => {
    const prefix = step.status === "completed" ? "- [x]" : "- [ ]"
    const kindLabel =
      step.kind === "wait"
        ? " [wait]"
        : step.kind === "decision"
          ? " [decision]"
          : ""
    const suffix =
      step.id === currentStepId
        ? " <- current"
        : step.status === "blocked"
          ? " (blocked)"
          : ""
    return [
      `${"  ".repeat(indentLevel)}${prefix} ${step.title}${kindLabel}${suffix}`,
      ...formatTicketChecklistStepLines(
        step.steps,
        indentLevel + 1,
        currentStepId,
      ),
    ]
  })
}

function formatTicketChecklist(ticket: StoredAgentTicket) {
  return formatTicketChecklistStepLines(
    ticket.checklist,
    0,
    ticket.currentStepId,
  ).join("\n")
}

function currentTicketStepTokenHint(ticket: StoredAgentTicket | null) {
  if (!ticket?.currentStepId) {
    return ""
  }
  const currentStep = findCurrentTicketStep(ticket)
  if (!currentStep) {
    return ""
  }
  return `\n\nIf you complete the current step in this reply, include one of these on its own line anywhere in the message: done: ${currentStep.tokenId} | blocked: ${currentStep.tokenId}`
}

function activeTicketNeedsMetadataSpecialization(
  ticket: StoredAgentTicket | null,
) {
  if (!ticket) {
    return false
  }
  const titleIsProvisional = ticket.title.trim() === ticket.processTitle.trim()
  const summaryIsProvisional =
    !ticket.summary?.trim() ||
    ticket.summary.trim() === ticket.description.trim()
  return titleIsProvisional || summaryIsProvisional
}

function initialTicketMetadataHint(ticket: StoredAgentTicket | null) {
  if (!activeTicketNeedsMetadataSpecialization(ticket)) {
    return ""
  }
  return (
    "\n\nOn your first reply for this ticket, include these two metadata lines before your normal response:\n" +
    "ticketTitle: <specific ticket title>\n" +
    "ticketSummary: <short concrete summary>"
  )
}

function currentDecisionOptionHint(ticket: StoredAgentTicket | null) {
  if (!ticket?.currentStepId) {
    return ""
  }
  const currentStep = findCurrentTicketStep(ticket)
  if (!currentStep?.decision || currentStep.decision.options.length === 0) {
    return ""
  }
  return `\n\nIf you resolve the current decision in this reply, include one of these on its own line anywhere in the message: ${currentStep.decision.options.map((option) => option.id).join(" | ")}`
}

function formatTicketProcessConfig(ticket: StoredAgentTicket | null) {
  if (!ticket?.effectiveProcessConfig) {
    return ""
  }
  return JSON.stringify(ticket.effectiveProcessConfig, null, 2)
}

function processConfigConfirmationHint(ticket: StoredAgentTicket | null) {
  if (!ticket?.templateId || ticket.confirmationState === "confirmed") {
    return ""
  }
  const configJson = formatTicketProcessConfig(ticket)
  if (!configJson) {
    return ""
  }
  return (
    "\n\nThis is going to start this process with these settings:\n\n```json\n" +
    `${configJson}\n` +
    "```\n\nReply only with `confirm_process_config` if these values are correct, or reply with corrected JSON containing only allowed override keys."
  )
}

function parseProcessConfigPatchFromText(assistantText: string) {
  const trimmed = assistantText.trim()
  if (!trimmed) {
    return {
      kind: "none" as const,
      patch: null as Record<string, string> | null,
    }
  }
  const fencedMatch = /```(?:json)?\s*([\s\S]+?)```/u.exec(trimmed)
  const candidate = fencedMatch?.[1]?.trim() || trimmed
  if (!candidate.startsWith("{")) {
    return {
      kind: "none" as const,
      patch: null as Record<string, string> | null,
    }
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    const entries = Object.entries(parsed)
      .map(
        ([key, value]) =>
          [key.trim(), typeof value === "string" ? value.trim() : ""] as const,
      )
      .filter(([key, value]) => key && value)
    return {
      kind: "patch" as const,
      patch: entries.length > 0 ? Object.fromEntries(entries) : {},
    }
  } catch {
    return {
      kind: "invalid" as const,
      patch: null as Record<string, string> | null,
    }
  }
}

function resolveConfiguredProcessBlueprint(
  processBlueprintId: string,
  overrides: Record<string, string> | null = null,
) {
  return resolveProcessBlueprintById(processBlueprintId, overrides, {
    processBlueprintDirs: [processBlueprintsDir, workspaceProcessBlueprintsDir],
    processTemplateDirs: [processTemplatesDir, workspaceProcessTemplatesDir],
    processStepDirs: [processStepsDir, workspaceProcessStepsDir],
  })
}

function applyTicketProcessConfigOverrides(
  ticket: StoredAgentTicket,
  overridesPatch: Record<string, string>,
  confirmationState: StoredAgentTicket["confirmationState"],
) {
  if (!ticket.templateId) {
    return {
      ok: false as const,
      error: "ticket has no overridable process config",
    }
  }

  const sessionBlueprint = processBlueprintById.get(ticket.processBlueprintId)
  const declarations =
    sessionBlueprint?.processConfig?.variableDeclarations ?? {}
  const nextOverrides = {
    ...(ticket.templateOverrides ?? {}),
    ...overridesPatch,
  }

  for (const [key, value] of Object.entries(overridesPatch)) {
    const declaration = declarations[key]
    if (!declaration) {
      return {
        ok: false as const,
        error: `Unknown process config override: ${key}`,
      }
    }
    if (!declaration.overridable) {
      return {
        ok: false as const,
        error: `Process config override is not allowed: ${key}`,
      }
    }
    if (!value.trim()) {
      return {
        ok: false as const,
        error: `Process config override must be a non-empty string: ${key}`,
      }
    }
  }

  const resolved = resolveConfiguredProcessBlueprint(
    ticket.processBlueprintId,
    nextOverrides,
  )
  if (!resolved) {
    return {
      ok: false as const,
      error: "unable to resolve configured process blueprint",
    }
  }

  const updated = ticketStore.updateTicketProcessConfig(
    ticket.id,
    resolved,
    nextOverrides,
    confirmationState,
  )
  if (!updated) {
    return {
      ok: false as const,
      error: "unable to update ticket process config",
    }
  }
  return { ok: true as const, ticket: updated }
}

function buildProcessExpectationInstruction(
  processBlueprint: ProcessBlueprint | null,
  ticket: StoredAgentTicket | null,
) {
  if (!processBlueprint) {
    return `${PROCESS_INSTRUCTION_PREFIX}none. Continue based on the latest explicit user request and current transcript context.`
  }

  if (!isProceduralProcessBlueprint(processBlueprint)) {
    return `${PROCESS_INSTRUCTION_PREFIX}${processBlueprint.title}. ${processBlueprint.expectation}`
  }

  const outline =
    ticket && ticket.checklist.length > 0 ? formatTicketChecklist(ticket) : ""
  const outlineBlock = outline
    ? `\n\nProcess outline:
${outline}`
    : ""
  return `${PROCESS_INSTRUCTION_PREFIX}${processBlueprint.title}. ${processBlueprint.expectation}${outlineBlock}${processConfigConfirmationHint(ticket)}${initialTicketMetadataHint(ticket)}`
}

function buildWatchdogPrompt(
  processBlueprint: ProcessBlueprint,
  ticket: StoredAgentTicket | null,
) {
  if (!isProceduralProcessBlueprint(processBlueprint)) {
    return null
  }
  if (ticket?.confirmationState === "pending") {
    return `Confirm process config${processConfigConfirmationHint(ticket)}`
  }
  if (!ticket?.nextStepLabel) {
    return processBlueprint.idlePrompt
  }
  return `Continue\n\nNext step: ${ticket.nextStepLabel}${currentTicketStepTokenHint(ticket)}${currentDecisionOptionHint(ticket)}`
}

function cancelSessionWatchdog(sessionId: string) {
  const handle = sessionWatchdogTimers.get(sessionId)
  if (!handle) {
    return
  }
  clearTimeout(handle)
  sessionWatchdogTimers.delete(sessionId)
}

function setSessionWatchdogState(
  sessionId: string,
  watchdogState: SessionWatchdogState,
) {
  const updated = store.updateSessionWatchdogState(sessionId, watchdogState)
  if (updated) {
    broadcastSnapshot(sessionId)
  }
  return updated
}

function markSessionWatchdogStepPrompted(sessionId: string) {
  const session = store.getSession(sessionId)
  if (!session) {
    return null
  }

  return setSessionWatchdogState(sessionId, {
    status: "nudged",
    nudgeCount: session.watchdogState.nudgeCount,
    lastNudgedAtMs: Date.now(),
    completedAtMs: null,
  })
}

function resetSessionWatchdogState(sessionId: string) {
  const updated = store.resetSessionWatchdogState(sessionId)
  if (updated) {
    broadcastSnapshot(sessionId)
  }
  return updated
}

function maybeMarkProcessBlueprintTerminal(
  sessionId: string,
  assistantText: string,
): "completed" | "blocked" | null {
  const session = store.getSession(sessionId)
  const processBlueprint = getSessionProcessBlueprint(session)
  if (
    !session ||
    !processBlueprint ||
    !isProceduralProcessBlueprint(processBlueprint)
  ) {
    return null
  }

  const activeTicket = ticketStore.getActiveTicketForSession(sessionId)
  if (
    activeTicket?.status === "active" &&
    (activeTicket.currentStepId || activeTicket.confirmationState === "pending")
  ) {
    return null
  }

  const { signalText } = findStandaloneSignalLine(assistantText, [
    processBlueprint.completionToken,
    processBlueprint.blockedToken,
  ])
  if (signalText === processBlueprint.completionToken) {
    const ticket = ticketStore.resolveActiveTicket(
      sessionId,
      "completed",
      signalText,
    )
    if (ticket) {
      appendTicketEventMessage(
        sessionId,
        buildTicketStateEventText(ticket, "completed"),
        { queueForProvider: false },
      )
    }
    setSessionWatchdogState(sessionId, {
      status: "completed",
      nudgeCount: session.watchdogState.nudgeCount,
      lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
      completedAtMs: Date.now(),
    })
    return "completed"
  }

  if (signalText === processBlueprint.blockedToken) {
    const ticket = ticketStore.resolveActiveTicket(
      sessionId,
      "blocked",
      signalText,
    )
    if (ticket) {
      appendTicketEventMessage(
        sessionId,
        buildTicketStateEventText(ticket, "blocked"),
        { queueForProvider: false },
      )
    }
    setSessionWatchdogState(sessionId, {
      status: "blocked",
      nudgeCount: session.watchdogState.nudgeCount,
      lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
      completedAtMs: Date.now(),
    })
    return "blocked"
  }

  return null
}

function persistedIdleWatchdogAnchorMs(session: StoredSession) {
  return session.updatedAtMs
}

function processBlueprintNudgeLimitReached(
  session: StoredSession,
  processBlueprint: ProcessBlueprint,
) {
  return (
    isProceduralProcessBlueprint(processBlueprint) &&
    processBlueprint.watchdog.maxNudgesPerIdleEpisode > 0 &&
    session.watchdogState.nudgeCount >=
      processBlueprint.watchdog.maxNudgesPerIdleEpisode
  )
}

function sessionTerminalWatchdogState(session: StoredSession) {
  return session.watchdogState.status === "completed"
}

function operatorTypingActive(runtime: SessionRuntimeState) {
  return (
    runtime.userTypingUntilAtMs !== null &&
    runtime.userTypingUntilAtMs > Date.now()
  )
}

function isRetryableProviderError(errorText: string) {
  const normalized = errorText.toLowerCase()
  return [
    "timed out",
    "timeout",
    "websocket",
    "closed unexpectedly",
    "failed to connect",
    "connection refused",
    "econnreset",
    "econnrefused",
    "temporarily unavailable",
    "503",
    "502",
    "504",
    "rate limit",
  ].some((fragment) => normalized.includes(fragment))
}

function appendActivityMessage(sessionId: string, text: string) {
  return store.appendMessage(sessionId, {
    role: "system",
    kind: "activity",
    providerSeenAtMs: Date.now(),
    content: [{ type: "text", text }],
  })
}

function appendTicketEventMessage(
  sessionId: string,
  text: string,
  options: { queueForProvider?: boolean } = {},
) {
  return store.appendMessage(sessionId, {
    role: "system",
    kind: "ticketEvent",
    ticketId: ticketStore.getActiveTicketForSession(sessionId)?.id ?? null,
    providerSeenAtMs: options.queueForProvider === false ? Date.now() : null,
    content: [{ type: "text", text }],
  })
}

function findCurrentTicketStep(ticket: StoredAgentTicket | null) {
  const findNestedStep = (
    steps: StoredAgentTicket["checklist"],
    stepId: string | null,
  ): StoredAgentTicket["checklist"][number] | null => {
    if (!stepId) {
      return null
    }
    for (const step of steps) {
      if (step.id === stepId) {
        return step
      }
      const nested = findNestedStep(step.steps, stepId)
      if (nested) {
        return nested
      }
    }
    return null
  }
  if (!ticket?.currentStepId) {
    return null
  }
  return findNestedStep(ticket.checklist, ticket.currentStepId)
}

function buildStartedStepEventText(ticket: StoredAgentTicket) {
  if (ticket.confirmationState === "pending") {
    return `Started process config confirmation\n- reply with: confirm_process_config${ticket.effectiveProcessConfig ? "\n- or reply with corrected JSON containing only allowed override keys" : ""}`
  }
  const currentStep = findCurrentTicketStep(ticket)
  if (!currentStep) {
    return `Ticket started: ${ticket.processTitle}`
  }
  if (currentStep.kind === "decision" && currentStep.decision) {
    return [
      `Started ${currentStep.id}`,
      `- ${currentStep.title}`,
      `- reply with: ${currentStep.decision.options.map((option) => option.id).join(" | ")}`,
    ].join("\n")
  }
  return [
    `Started ${currentStep.id}`,
    `- ${currentStep.title}`,
    `- say "done: ${currentStep.tokenId}" when done`,
  ].join("\n")
}

function buildTicketStateEventText(
  ticket: StoredAgentTicket,
  event: "created" | "completed" | "blocked",
) {
  if (event === "created") {
    return buildStartedStepEventText(ticket)
  }
  if (event === "completed") {
    return ticket.resolution
      ? `Ticket completed: ${ticket.processTitle}. ${ticket.resolution}`
      : `Ticket completed: ${ticket.processTitle}`
  }
  return ticket.resolution
    ? `Ticket blocked: ${ticket.processTitle}. ${ticket.resolution}`
    : `Ticket blocked: ${ticket.processTitle}`
}

function buildProcessSelectionEventText(
  previousProcessTitle: string | null,
  nextProcessTitle: string | null,
  mode: "changed" | "reapplied",
) {
  if (mode === "reapplied") {
    return nextProcessTitle
      ? `Process reapplied: ${nextProcessTitle}. This overrides prior ticket state for the session.`
      : "Process cleared. This overrides prior ticket state for the session."
  }

  if (!previousProcessTitle) {
    return nextProcessTitle
      ? `Process selected: ${nextProcessTitle}. This overrides prior ticket state for the session.`
      : "Process cleared. This overrides prior ticket state for the session."
  }

  return nextProcessTitle
    ? `Process changed: ${previousProcessTitle} -> ${nextProcessTitle}. This overrides prior ticket state for the session.`
    : `Process cleared: ${previousProcessTitle}. This overrides prior ticket state for the session.`
}

function extractAssistantProcessSignal(
  assistantText: string,
  ticket: StoredAgentTicket | null,
) {
  const trimmed = assistantText.trimEnd()
  if (!ticket?.currentStepId || !trimmed) {
    return { visibleText: trimmed.trim(), signalText: null as string | null }
  }

  const currentStep = findCurrentTicketStep(ticket)
  if (!currentStep) {
    return { visibleText: trimmed.trim(), signalText: null as string | null }
  }

  const allowedSignals = new Set<string>([
    `done: ${currentStep.tokenId}`,
    `blocked: ${currentStep.tokenId}`,
    ...(currentStep.doneToken ? [currentStep.doneToken] : []),
    ...(currentStep.blockedToken ? [currentStep.blockedToken] : []),
    ...(currentStep.decision?.options.flatMap((option) => [
      option.id,
      option.title,
    ]) ?? []),
  ])
  return findStandaloneSignalLine(trimmed, allowedSignals)
}

function extractAssistantTicketMetadata(assistantText: string) {
  const trimmed = assistantText.trimEnd()
  if (!trimmed) {
    return {
      visibleText: trimmed.trim(),
      title: null as string | null,
      summary: null as string | null,
    }
  }

  const lines = trimmed.split(/\r?\n/)
  let title: string | null = null
  let summary: string | null = null
  const visibleLines: string[] = []

  for (const line of lines) {
    const titleMatch = /^ticketTitle:\s*(.+)$/i.exec(line.trim())
    if (titleMatch) {
      const value = titleMatch[1]?.trim()
      if (value) {
        title = value
      }
      continue
    }
    const summaryMatch = /^ticketSummary:\s*(.+)$/i.exec(line.trim())
    if (summaryMatch) {
      const value = summaryMatch[1]?.trim()
      if (value) {
        summary = value
      }
      continue
    }
    visibleLines.push(line)
  }

  return {
    visibleText: visibleLines.join("\n").trim(),
    title,
    summary,
  }
}

function normalizeTransitionDetail(
  step: ReturnType<typeof findCurrentTicketStep>,
  detail: string | null,
) {
  if (!detail) {
    return null
  }
  if (!step) {
    return detail
  }
  if (
    detail === `done: ${step.tokenId}` ||
    detail === `blocked: ${step.tokenId}` ||
    detail === step.doneToken ||
    detail === step.blockedToken
  ) {
    return null
  }
  return detail
}

function buildTicketTransitionEventText(
  previousTicket: StoredAgentTicket | null,
  transition: StoredAgentTicketTransition,
) {
  if (transition.kind === "configUpdated") {
    return [
      "Ticket process config updated",
      buildStartedStepEventText(transition.ticket),
    ].join("\n\n")
  }

  if (transition.kind === "configConfirmed") {
    return [
      "Ticket process config confirmed",
      buildStartedStepEventText(transition.ticket),
    ].join("\n\n")
  }

  if (transition.kind === "configRejected") {
    return [
      "Ticket process config rejected",
      transition.detail ??
        "Provide corrected JSON containing only allowed override keys.",
    ].join("\n\n")
  }

  const previousStep = findCurrentTicketStep(previousTicket)
  const detail = normalizeTransitionDetail(previousStep, transition.detail)
  const stepTitle =
    previousStep?.title ??
    transition.stepTitle ??
    transition.ticket.processTitle
  const lines: string[] = []

  if (previousStep?.kind === "decision" && detail) {
    lines.push(`Ticket decision chosen: ${stepTitle}. Outcome: ${detail}`)
  }

  if (
    transition.kind === "stepCompleted" ||
    transition.kind === "ticketCompleted"
  ) {
    lines.push(`Ticket step completed: ${stepTitle}`)
    if (
      transition.kind === "stepCompleted" &&
      transition.ticket.nextStepLabel
    ) {
      lines.push(buildStartedStepEventText(transition.ticket))
    }
    if (transition.kind === "ticketCompleted") {
      lines.push(buildTicketStateEventText(transition.ticket, "completed"))
    }
    return lines.join("\n\n")
  }

  lines.push(`Ticket step blocked: ${stepTitle}`)
  lines.push(buildTicketStateEventText(transition.ticket, "blocked"))
  return lines.join("\n\n")
}

function maybeApplyTicketStepTransition(
  sessionId: string,
  assistantText: string,
): { status: "completed" | "blocked" | null; messages: StoredMessage[] } {
  const previousTicket = ticketStore.getActiveTicketForSession(sessionId)
  if (
    previousTicket?.status === "active" &&
    previousTicket.confirmationState === "pending"
  ) {
    const trimmed = assistantText.trim()
    if (trimmed === "confirm_process_config") {
      const confirmed = ticketStore.confirmActiveTicketProcessConfig(sessionId)
      if (!confirmed) {
        return { status: null, messages: [] }
      }
      const messages = [
        appendTicketEventMessage(
          sessionId,
          buildTicketTransitionEventText(previousTicket, {
            ticket: confirmed,
            kind: "configConfirmed",
            stepTitle: confirmed.nextStepLabel,
            detail: "confirm_process_config",
          }),
        ),
      ]
      if (confirmed.nextStepLabel) {
        markSessionWatchdogStepPrompted(sessionId)
      }
      return { status: null, messages }
    }

    const configPatch = parseProcessConfigPatchFromText(assistantText)
    if (configPatch.kind === "invalid") {
      return {
        status: null,
        messages: [
          appendTicketEventMessage(
            sessionId,
            buildTicketTransitionEventText(previousTicket, {
              ticket: {
                ...previousTicket,
                confirmationState: "rejected",
                updatedAtMs: Date.now(),
              },
              kind: "configRejected",
              stepTitle: null,
              detail:
                "Malformed process config JSON. Reply with valid JSON or `confirm_process_config`.",
            }),
          ),
        ],
      }
    }

    if (configPatch.kind === "patch") {
      const result = applyTicketProcessConfigOverrides(
        previousTicket,
        configPatch.patch ?? {},
        "pending",
      )
      const transition = result.ok
        ? {
            ticket: result.ticket,
            kind: "configUpdated" as const,
            stepTitle: null,
            detail: null,
          }
        : {
            ticket: {
              ...previousTicket,
              confirmationState: "rejected" as const,
              updatedAtMs: Date.now(),
            },
            kind: "configRejected" as const,
            stepTitle: null,
            detail: result.error,
          }
      return {
        status: null,
        messages: [
          appendTicketEventMessage(
            sessionId,
            buildTicketTransitionEventText(previousTicket, transition),
          ),
        ],
      }
    }
  }

  const transition = ticketStore.resolveStepFromAssistantText(
    sessionId,
    assistantText,
  )
  if (!transition) {
    return { status: null, messages: [] }
  }

  const queuesFollowupStep =
    transition.kind === "stepCompleted" &&
    Boolean(transition.ticket.nextStepLabel)
  const messages = [
    appendTicketEventMessage(
      sessionId,
      buildTicketTransitionEventText(previousTicket, transition),
      { queueForProvider: queuesFollowupStep },
    ),
  ]

  if (transition.kind === "stepCompleted" && transition.ticket.nextStepLabel) {
    markSessionWatchdogStepPrompted(sessionId)
  }

  if (transition.kind === "ticketCompleted") {
    const session = store.getSession(sessionId)
    if (session) {
      setSessionWatchdogState(sessionId, {
        status: "completed",
        nudgeCount: session.watchdogState.nudgeCount,
        lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
        completedAtMs: Date.now(),
      })
    }
    return { status: "completed", messages }
  }

  if (transition.kind === "stepBlocked") {
    const session = store.getSession(sessionId)
    if (session) {
      setSessionWatchdogState(sessionId, {
        status: "blocked",
        nudgeCount: session.watchdogState.nudgeCount,
        lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
        completedAtMs: Date.now(),
      })
    }
    return { status: null, messages }
  }

  return { status: null, messages }
}

function queueProcessExpectationForSession(sessionId: string) {
  const session = store.getSession(sessionId)
  const processBlueprint = getSessionProcessBlueprint(session)
  if (!session || !processBlueprint) {
    ticketStore.clearActiveTicketForSession(sessionId)
    return { session, messages: [] as StoredMessage[] }
  }

  const isProceduralProcess = isProceduralProcessBlueprint(processBlueprint)
  const ticket = isProceduralProcess
    ? ticketStore.createOrReplaceSessionTicket(sessionId, processBlueprint)
    : null
  if (!isProceduralProcess) {
    ticketStore.clearActiveTicketForSession(sessionId)
  }
  const expectationText = buildProcessExpectationInstruction(
    processBlueprint,
    ticket,
  )
  store.markQueuedSystemMessagesSeenByPrefix(
    sessionId,
    PROCESS_INSTRUCTION_PREFIX,
  )
  const processMessage = store.appendMessage(sessionId, {
    role: "system",
    providerSeenAtMs: null,
    content: [{ type: "text", text: expectationText }],
  })
  if (ticket) {
    markSessionWatchdogStepPrompted(sessionId)
  }
  const updatedSession = store.replacePendingSystemInstructionByPrefix(
    sessionId,
    PROCESS_INSTRUCTION_PREFIX,
    expectationText,
  )
  return {
    session: updatedSession ?? session,
    messages: ticket
      ? [
          processMessage,
          appendTicketEventMessage(
            sessionId,
            buildTicketStateEventText(ticket, "created"),
          ),
        ]
      : [processMessage],
  }
}

function queuedProcessChangeAwaitingExplicitHumanSend(
  sessionId: string,
  session: StoredSession | null,
) {
  if (!session?.pendingSystemInstruction) {
    return false
  }

  const hasQueuedProcessInstruction = session.pendingSystemInstruction
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => line.startsWith(PROCESS_INSTRUCTION_PREFIX))

  if (!hasQueuedProcessInstruction) {
    return false
  }

  return !store
    .listQueuedMessages(sessionId)
    .some(
      (message) => message.providerSeenAtMs === null && message.role === "user",
    )
}

function runningTurnLooksStalled(
  runtime: SessionRuntimeState,
  processBlueprint: ProcessBlueprint,
) {
  if (
    !isProceduralProcessBlueprint(processBlueprint) ||
    runtime.status !== "running"
  ) {
    return false
  }

  const anchorMs = runtime.lastVisibleActivityAtMs ?? runtime.startedAtMs
  if (anchorMs === null) {
    return false
  }

  return (
    Date.now() - anchorMs >= processBlueprint.watchdog.idleTimeoutSeconds * 1000
  )
}

function maybeTriggerSessionWatchdog(sessionId: string) {
  sessionWatchdogTimers.delete(sessionId)
  const session = store.getSession(sessionId)
  if (!session) {
    return
  }

  const processBlueprint = getSessionProcessBlueprint(session)
  if (
    !processBlueprint ||
    !isProceduralProcessBlueprint(processBlueprint) ||
    !processBlueprint.watchdog.enabled
  ) {
    return
  }

  const runtime = ensureRuntimeState(sessionId)
  if (
    runtime.status !== "idle" &&
    !runningTurnLooksStalled(runtime, processBlueprint)
  ) {
    return
  }

  if (sessionTerminalWatchdogState(session)) {
    return
  }

  if (processBlueprintNudgeLimitReached(session, processBlueprint)) {
    return
  }

  if (queuedProcessChangeAwaitingExplicitHumanSend(sessionId, session)) {
    return
  }

  if (operatorTypingActive(runtime)) {
    return
  }

  let activeTicket = ticketStore.getActiveTicketForSession(sessionId)
  if (activeTicket?.status === "blocked") {
    return
  }

  if (activeTicket?.status === "active" && activeTicket.currentStepId) {
    activeTicket =
      ticketStore.incrementSameStepAttemptCount(sessionId) ?? activeTicket
    if (activeTicket.sameStepAttemptCount >= 3) {
      const blockedTicket = ticketStore.blockActiveTicketBySystem(
        sessionId,
        `Auto-blocked after 3 attempts on step: ${activeTicket.nextStepLabel ?? activeTicket.processTitle}`,
      )
      if (blockedTicket) {
        const blockedMessage = appendTicketEventMessage(
          sessionId,
          buildTicketStateEventText(blockedTicket, "blocked"),
          { queueForProvider: false },
        )
        setSessionWatchdogState(sessionId, {
          status: "blocked",
          nudgeCount: session.watchdogState.nudgeCount,
          lastNudgedAtMs: session.watchdogState.lastNudgedAtMs,
          completedAtMs: null,
        })
        broadcastSession(sessionId, {
          type: "session.updated",
          session: store.getSession(sessionId)
            ? buildSessionSummaryOrNull(sessionId)
            : null,
          messages: [blockedMessage],
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        })
      }
      return
    }
  }

  const watchdogMessage =
    activeTicket?.status === "active" && activeTicket.currentStepId
      ? appendTicketEventMessage(
          sessionId,
          buildStartedStepEventText(activeTicket),
        )
      : store.appendMessage(sessionId, {
          role: "system",
          kind: "watchdogPrompt",
          providerSeenAtMs: null,
          content: [
            {
              type: "text",
              text:
                buildWatchdogPrompt(processBlueprint, activeTicket) ??
                processBlueprint.idlePrompt,
            },
          ],
        })

  setSessionWatchdogState(sessionId, {
    status: "nudged",
    nudgeCount: session.watchdogState.nudgeCount + 1,
    lastNudgedAtMs: Date.now(),
    completedAtMs: null,
  })
  setRuntimeState(sessionId, (current) => ({
    ...current,
    providerIdleSinceAtMs: null,
    lastVisibleActivityAtMs:
      current.status === "running"
        ? Date.now()
        : current.lastVisibleActivityAtMs,
  }))

  broadcastSession(sessionId, {
    type: "session.updated",
    session: store.getSession(sessionId)
      ? buildSessionSummaryOrNull(sessionId)
      : null,
    messages: [watchdogMessage],
    queuedMessages: store.listQueuedMessages(sessionId),
    activity: toSessionActivity(sessionId),
  })

  void processSessionQueue(sessionId)
  maybeScheduleSessionWatchdog(sessionId)
}

function maybeScheduleSessionWatchdog(sessionId: string) {
  cancelSessionWatchdog(sessionId)
  const session = store.getSession(sessionId)
  const processBlueprint = getSessionProcessBlueprint(session)
  if (
    !session ||
    !processBlueprint ||
    !isProceduralProcessBlueprint(processBlueprint) ||
    !processBlueprint.watchdog.enabled
  ) {
    return
  }

  const runtime = ensureRuntimeState(sessionId)
  if (sessionTerminalWatchdogState(session)) {
    return
  }

  if (processBlueprintNudgeLimitReached(session, processBlueprint)) {
    return
  }

  if (queuedProcessChangeAwaitingExplicitHumanSend(sessionId, session)) {
    return
  }

  let delayMs: number | null = null
  if (operatorTypingActive(runtime)) {
    delayMs = Math.max(
      (runtime.userTypingUntilAtMs ?? Date.now()) - Date.now(),
      0,
    )
  } else if (runtime.status === "idle") {
    const activeTicket = ticketStore.getActiveTicketForSession(sessionId)
    const activeStepAwaitingProgress =
      activeTicket?.status === "active" && !!activeTicket.currentStepId
    if (activeStepAwaitingProgress) {
      delayMs =
        session.watchdogState.status === "nudged" &&
        session.watchdogState.lastNudgedAtMs !== null
          ? Math.max(
              processBlueprint.watchdog.idleTimeoutSeconds * 1000 -
                (Date.now() - session.watchdogState.lastNudgedAtMs),
              0,
            )
          : 0
    } else if (
      runtime.providerIdleSinceAtMs !== null &&
      session.watchdogState.nudgeCount === 0
    ) {
      delayMs = 0
    } else {
      delayMs = Math.max(
        processBlueprint.watchdog.idleTimeoutSeconds * 1000 -
          (Date.now() - persistedIdleWatchdogAnchorMs(session)),
        0,
      )
    }
  } else if (runtime.status === "running") {
    const anchorMs = runtime.lastVisibleActivityAtMs ?? runtime.startedAtMs
    if (anchorMs !== null) {
      delayMs = Math.max(
        processBlueprint.watchdog.idleTimeoutSeconds * 1000 -
          (Date.now() - anchorMs),
        0,
      )
    }
  }

  if (delayMs === null) {
    return
  }

  const handle = setTimeout(() => {
    maybeTriggerSessionWatchdog(sessionId)
  }, delayMs)
  sessionWatchdogTimers.set(sessionId, handle)
}

function setUserTypingState(sessionId: string, active: boolean) {
  const session = store.getSession(sessionId)
  if (!session) {
    return null
  }

  const runtime = setRuntimeState(sessionId, (current) => ({
    ...current,
    userTypingUntilAtMs: active ? Date.now() + typingGraceMs : null,
  }))
  if (!active && runtime.status !== "idle" && runtime.status !== "running") {
    cancelSessionWatchdog(sessionId)
  }
  return runtime
}

function rearmPersistedSessionWatchdogs() {
  for (const session of store.listSessions()) {
    const processBlueprint = getSessionProcessBlueprint(session)
    if (
      !processBlueprint ||
      !isProceduralProcessBlueprint(processBlueprint) ||
      !processBlueprint.watchdog.enabled
    ) {
      continue
    }
    if (sessionTerminalWatchdogState(session)) {
      continue
    }
    if (processBlueprintNudgeLimitReached(session, processBlueprint)) {
      continue
    }
    ensureRuntimeState(session.id)
    maybeScheduleSessionWatchdog(session.id)
  }
}

function buildRetryWaitingFlag(delayMs: number) {
  return `retrying in ${Math.max(1, Math.ceil(delayMs / 1000))}s`
}

function shouldRetryProviderError(errorText: string, attempt: number) {
  return (
    isRetryableProviderError(errorText) && attempt < retryBackoffMs.length + 1
  )
}

function requestProviderInterrupt(
  sessionId: string,
  session: StoredSession,
  providerKind: AgentChatProviderKind,
  threadId: string | null,
  turnId: string | null,
) {
  if (providerKind === "codex-app-server") {
    if (!threadId || !turnId) {
      return Promise.reject(new Error("No active turn to interrupt"))
    }
    return interruptCodexTurn(session, threadId, turnId)
  }
  return interruptClaudeTurn(sessionId)
}

function providerActivityCallbacks(
  sessionId: string,
  currentSession: StoredSession,
  seenQueuedInstructionMessages: StoredMessage[],
  seenQueuedMessages: StoredMessage[],
  seenThoughtItemIds: Set<string>,
  streamCheckpointMessageIds: Map<string, string>,
  streamCheckpointTexts: Map<string, string>,
) {
  return {
    onRunStarted(payload: { threadId: string; turnId: string }) {
      const startedActivity = appendActivityMessage(
        sessionId,
        "Provider turn started.",
      )
      let shouldInterruptImmediately = false
      setRuntimeState(sessionId, (current) => {
        shouldInterruptImmediately = current.interruptRequested
        return {
          ...current,
          status: "running",
          startedAtMs: current.startedAtMs ?? Date.now(),
          lastVisibleActivityAtMs: Date.now(),
          providerIdleSinceAtMs: null,
          threadId: payload.threadId,
          turnId: payload.turnId,
        }
      })
      broadcastSession(sessionId, {
        type: "run.started",
        sessionId,
        providerKind: currentSession.providerKind,
        messages: [
          ...seenQueuedInstructionMessages,
          ...seenQueuedMessages,
        ].sort((left, right) => left.createdAtMs - right.createdAtMs),
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      })
      broadcastSingleMessageUpdate(sessionId, startedActivity)
      if (shouldInterruptImmediately) {
        void requestProviderInterrupt(
          sessionId,
          currentSession,
          currentSession.providerKind,
          payload.threadId,
          payload.turnId,
        ).catch((error) => {
          const errorText =
            error instanceof Error ? error.message : "Interrupt request failed."
          const failureMessage = appendActivityMessage(
            sessionId,
            `Interrupt request failed: ${errorText}`,
          )
          broadcastSingleMessageUpdate(sessionId, failureMessage)
        })
      }
    },
    onThreadStatusChanged(payload: { threadId: string; flags: string[] }) {
      let statusMessage: StoredMessage | null = null
      setRuntimeState(sessionId, (current) => {
        const changed =
          current.waitingFlags.join("\u0000") !== payload.flags.join("\u0000")
        if (changed) {
          statusMessage = appendActivityMessage(
            sessionId,
            payload.flags.length > 0
              ? `Agent waiting: ${payload.flags.join(", ")}.`
              : "Agent resumed.",
          )
        }
        return {
          ...current,
          threadId: payload.threadId || current.threadId,
          waitingFlags: payload.flags,
          lastVisibleActivityAtMs: changed
            ? Date.now()
            : current.lastVisibleActivityAtMs,
          providerIdleSinceAtMs: null,
        }
      })
      if (statusMessage) {
        broadcastSingleMessageUpdate(sessionId, statusMessage)
      }
      broadcastActivity(sessionId)
    },
    onBackgroundProcessCountChanged(payload: {
      threadId: string
      turnId: string
      backgroundProcessCount: number
    }) {
      setRuntimeState(sessionId, (current) => ({
        ...current,
        threadId: payload.threadId || current.threadId,
        turnId: payload.turnId || current.turnId,
        backgroundProcessCount: payload.backgroundProcessCount,
        lastVisibleActivityAtMs:
          current.backgroundProcessCount === payload.backgroundProcessCount
            ? current.lastVisibleActivityAtMs
            : Date.now(),
        providerIdleSinceAtMs: null,
      }))
      broadcastActivity(sessionId)
    },
    onAssistantDelta(payload: {
      threadId: string
      turnId: string
      itemId: string
      delta: string
    }) {
      if (payload.delta) {
        markSessionVisibleActivity(sessionId)
      }
      if (payload.itemId) {
        const nextText = `${streamCheckpointTexts.get(payload.itemId) ?? ""}${payload.delta}`
        streamCheckpointTexts.set(payload.itemId, nextText)

        const existingMessageId = streamCheckpointMessageIds.get(payload.itemId)
        const checkpointContent: StoredMessageContentBlock[] = [
          {
            type: "text",
            text: nextText,
          },
        ]

        const checkpointMessage = existingMessageId
          ? store.updateMessageContent(
              sessionId,
              existingMessageId,
              checkpointContent,
            )
          : store.appendMessage(sessionId, {
              role: "assistant",
              kind: "streamCheckpoint",
              providerSeenAtMs: Date.now(),
              content: checkpointContent,
            })

        if (checkpointMessage) {
          streamCheckpointMessageIds.set(payload.itemId, checkpointMessage.id)
          broadcastSession(sessionId, {
            type: "session.updated",
            session: store.getSession(sessionId)
              ? buildSessionSummaryOrNull(sessionId)
              : null,
            messages: [checkpointMessage],
            queuedMessages: store.listQueuedMessages(sessionId),
            activity: toSessionActivity(sessionId),
          })
        }
      }

      broadcastSession(sessionId, {
        type: "run.delta",
        sessionId,
        threadId: payload.threadId,
        turnId: payload.turnId,
        itemId: payload.itemId,
        delta: payload.delta,
      })
    },
    onThoughtItem(payload: {
      threadId: string
      turnId: string
      itemId: string
      summaryText: string
    }) {
      if (
        !payload.itemId ||
        seenThoughtItemIds.has(payload.itemId) ||
        !payload.summaryText.trim()
      ) {
        return
      }
      markSessionVisibleActivity(sessionId)
      seenThoughtItemIds.add(payload.itemId)
      const thoughtMessage = store.appendMessage(sessionId, {
        role: "assistant",
        kind: "thought",
        providerSeenAtMs: Date.now(),
        content: [
          {
            type: "text",
            text: payload.summaryText,
          },
        ],
      })
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummaryOrNull(sessionId)
          : null,
        messages: [thoughtMessage],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      })
    },
    onActivity(payload: { threadId: string; turnId: string; text: string }) {
      const activityMessage = appendActivityMessage(sessionId, payload.text)
      setRuntimeState(sessionId, (current) => ({
        ...current,
        threadId: payload.threadId || current.threadId,
        turnId: payload.turnId || current.turnId,
        lastVisibleActivityAtMs: Date.now(),
        providerIdleSinceAtMs: null,
      }))
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummaryOrNull(sessionId)
          : null,
        messages: [activityMessage],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      })
    },
    onTokenUsageUpdated(payload: {
      threadId: string
      turnId: string
      tokenUsage: CodexTokenUsagePayload | null
    }) {
      const nextUsage = normalizeCodexTokenUsage(payload.tokenUsage)
      setRuntimeState(sessionId, (current) => ({
        ...current,
        threadId: payload.threadId || current.threadId,
        turnId: payload.turnId || current.turnId,
        providerUsage: nextUsage,
      }))
      broadcastSession(sessionId, {
        type: "session.updated",
        session: store.getSession(sessionId)
          ? buildSessionSummaryOrNull(sessionId)
          : null,
        messages: [],
        queuedMessages: store.listQueuedMessages(sessionId),
        activity: toSessionActivity(sessionId),
      })
    },
  }
}

function finalizeIdleRuntimeState(sessionId: string, threadId: string | null) {
  setRuntimeState(sessionId, {
    status: "idle",
    startedAtMs: null,
    threadId,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError: null,
    currentMessageId: null,
    canInterrupt: false,
    lastVisibleActivityAtMs: null,
    interruptRequested: false,
    providerKind: null,
    providerIdleSinceAtMs: Date.now(),
    providerUsage: currentSessionUsage(sessionId),
  })
}

function currentSessionUsage(sessionId: string) {
  return ensureRuntimeState(sessionId).providerUsage
}

function finalizeNonIdleRuntimeState(
  sessionId: string,
  status: "interrupted" | "error",
  lastError: string | null,
  providerKind: AgentChatProviderKind | null = null,
) {
  setRuntimeState(sessionId, {
    status,
    startedAtMs: null,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError,
    currentMessageId: null,
    canInterrupt: false,
    lastVisibleActivityAtMs: null,
    interruptRequested: false,
    providerKind,
    providerIdleSinceAtMs: null,
    providerUsage: currentSessionUsage(sessionId),
  })
}

function broadcastSingleMessageUpdate(
  sessionId: string,
  message: StoredMessage,
) {
  broadcastSession(sessionId, {
    type: "session.updated",
    session: store.getSession(sessionId)
      ? buildSessionSummaryOrNull(sessionId)
      : null,
    messages: [message],
    queuedMessages: store.listQueuedMessages(sessionId),
    activity: toSessionActivity(sessionId),
  })
}

function broadcastSession(sessionId: string, event: unknown) {
  for (const socket of getSessionSockets(sessionId)) {
    socket.send(JSON.stringify(event))
  }
}

function broadcastSnapshot(sessionId: string) {
  const payload = buildSessionSnapshot(sessionId)
  if (!payload) {
    return
  }
  broadcastSession(sessionId, {
    type: "session.snapshot",
    ...payload,
  })
}

function broadcastActivity(sessionId: string) {
  broadcastSession(sessionId, {
    type: "run.activity",
    sessionId,
    activity: toSessionActivity(sessionId),
    queuedMessages: store.listQueuedMessages(sessionId),
  })
}

function buildSessionTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= 56) {
    return normalized
  }
  return `${normalized.slice(0, 53)}...`
}

function buildSessionTitleFromContent(content: StoredMessageContentBlock[]) {
  const firstText = content.find(
    (block) => block.type === "text" && block.text.trim(),
  )
  if (firstText?.type === "text") {
    return buildSessionTitle(firstText.text)
  }

  const imageCount = content.filter((block) => block.type === "image").length
  return imageCount <= 1 ? "Shared image" : `Shared ${imageCount} images`
}

function buildSessionSummaryOrNull(sessionId: string) {
  const session = store.getSession(sessionId)
  return session ? buildSessionSummary(session) : null
}

function decodeMatchGroup(match: RegExpExecArray, index: number) {
  const value = match[index]
  if (!value) {
    throw new Error(`missing route parameter at index ${index}`)
  }
  return decodeURIComponent(value)
}

function decodeImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(
    dataUrl.trim(),
  )
  if (!match) {
    throw new Error(
      "Unsupported image payload. Expected a base64 image data URL.",
    )
  }

  const mediaType = match[1]?.toLowerCase()
  const base64Data = match[2]
  if (!base64Data) {
    throw new Error("Image payload data was missing.")
  }
  return {
    mediaType,
    bytes: Buffer.from(base64Data, "base64"),
  }
}

function normalizeMessageContent(
  sessionId: string,
  payload: {
    text?: string
    content?: Array<
      { type?: "text"; text?: string } | { type?: "image"; dataUrl?: string }
    >
  },
): StoredMessageContentBlock[] {
  const nextContent: StoredMessageContentBlock[] = []

  for (const block of payload.content ?? []) {
    if (block?.type === "text") {
      const text = block.text?.trim() || ""
      if (text) {
        nextContent.push({ type: "text", text })
      }
      continue
    }

    if (block?.type === "image") {
      const dataUrl = block.dataUrl?.trim() || ""
      if (!dataUrl) {
        continue
      }
      const decoded = decodeImageDataUrl(dataUrl)
      const attachment = store.persistAttachment(sessionId, decoded)
      nextContent.push({
        type: "image",
        url: attachment.url,
      })
    }
  }

  if (nextContent.length > 0) {
    return nextContent
  }

  const text = payload.text?.trim() || ""
  return text ? [{ type: "text", text }] : []
}

function buildProviderInputContent(
  content: StoredMessageContentBlock[],
): ProviderInputBlock[] {
  return content.reduce<ProviderInputBlock[]>((accumulator, block) => {
    if (block.type === "text") {
      const text = block.text.trim()
      if (text) {
        accumulator.push({ type: "text", text })
      }
      return accumulator
    }

    const attachment = store.readAttachmentBytes(block.url)
    accumulator.push({
      type: "image",
      url: block.url,
      mediaType: attachment?.attachment.mediaType ?? null,
      filePath: attachment?.attachment.path ?? null,
      base64Data: attachment ? attachment.bytes.toString("base64") : null,
    })
    return accumulator
  }, [])
}

function buildProviderInputContentForMessage(
  session: StoredSession,
  targetParticipantId: string,
  message: StoredMessage,
): ProviderInputBlock[] {
  const providerInput = buildProviderInputContent(message.content)
  const author = session.participants.find(
    (participant) => participant.participantId === message.authorParticipantId,
  )
  if (!author || author.participantId === targetParticipantId) {
    return providerInput
  }
  if (author.participantId === USER_PARTICIPANT_ID) {
    return providerInput
  }

  const prefix =
    author.participantId === SYSTEM_PARTICIPANT_ID
      ? "[System]\n"
      : `[${author.label} -> you]\n`

  if (providerInput[0]?.type === "text") {
    return [
      {
        ...providerInput[0],
        text: `${prefix}${providerInput[0].text}`,
      },
      ...providerInput.slice(1),
    ]
  }

  return [{ type: "text", text: prefix.trimEnd() }, ...providerInput]
}

function normalizeOptionalValue(value: string | null | undefined) {
  return value?.trim() || ""
}

function setRuntimeState(
  sessionId: string,
  update:
    | Partial<SessionRuntimeState>
    | ((current: SessionRuntimeState) => SessionRuntimeState),
) {
  const current = ensureRuntimeState(sessionId)
  const next =
    typeof update === "function"
      ? update({ ...current, waitingFlags: [...current.waitingFlags] })
      : { ...current, ...update }
  sessionRuntime.set(sessionId, next)
  if (next.status === "idle" || next.status === "running") {
    maybeScheduleSessionWatchdog(sessionId)
  } else {
    cancelSessionWatchdog(sessionId)
  }
  return next
}

function markSessionVisibleActivity(sessionId: string, atMs = Date.now()) {
  return setRuntimeState(sessionId, {
    lastVisibleActivityAtMs: atMs,
    providerIdleSinceAtMs: null,
  })
}

async function processSessionQueue(sessionId: string) {
  if (activeSessionRuns.has(sessionId)) {
    return
  }

  const queuedMessages = store.listQueuedUserMessages(sessionId)
  if (queuedMessages.length === 0) {
    const runtime = ensureRuntimeState(sessionId)
    if (runtime.status === "queued") {
      setRuntimeState(sessionId, {
        status: "idle",
        currentMessageId: null,
        lastError: null,
        providerIdleSinceAtMs: null,
      })
      broadcastActivity(sessionId)
    }
    return
  }

  void runProviderTurnForQueuedMessages(sessionId, queuedMessages)
}

async function runProviderTurnForQueuedMessages(
  sessionId: string,
  queuedMessages: StoredMessage[],
) {
  const session = store.getSession(sessionId)
  if (!session) {
    return
  }

  if (activeSessionRuns.has(sessionId)) {
    return
  }

  activeSessionRuns.add(sessionId)
  const runProviderSettings = {
    providerKind: session.providerKind,
    modelRef: session.modelRef,
    authProfile: session.authProfile,
    imageModelRef: session.imageModelRef,
  }
  setRuntimeState(sessionId, {
    status: "running",
    startedAtMs: Date.now(),
    threadId: session.providerThreadId,
    turnId: null,
    backgroundProcessCount: 0,
    waitingFlags: [],
    lastError: null,
    currentMessageId: queuedMessages[0]?.id ?? null,
    canInterrupt: providerSupportsInterrupt(session.providerKind),
    lastVisibleActivityAtMs: Date.now(),
    interruptRequested: false,
    providerKind: session.providerKind,
    providerIdleSinceAtMs: null,
    providerUsage: null,
  })
  store.markMessagesSeen(
    sessionId,
    queuedMessages.map((message) => message.id),
  )
  const queuedInstructionMessages = store
    .listQueuedMessages(sessionId)
    .filter(
      (message) =>
        message.providerSeenAtMs === null &&
        message.role === "system" &&
        message.kind !== "watchdogPrompt",
    )
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
  store.markMessagesSeen(
    sessionId,
    queuedInstructionMessages.map((message) => message.id),
  )
  const hasExplicitHumanMessage = queuedMessages.some(
    (message) => message.role === "user",
  )
  const pendingSystemInstruction = store.consumePendingSystemInstruction(
    sessionId,
    {
      excludePrefixes: hasExplicitHumanMessage
        ? []
        : [PROCESS_INSTRUCTION_PREFIX],
    },
  )
  const seenThoughtItemIds = new Set<string>()
  const streamCheckpointMessageIds = new Map<string, string>()
  const streamCheckpointTexts = new Map<string, string>()
  const seenQueuedMessages = queuedMessages
    .map(
      (queuedMessage) =>
        store
          .listMessages(sessionId)
          .find((message) => message.id === queuedMessage.id) ?? queuedMessage,
    )
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
  const seenQueuedInstructionMessages = queuedInstructionMessages
    .map(
      (queuedMessage) =>
        store
          .listMessages(sessionId)
          .find((message) => message.id === queuedMessage.id) ?? queuedMessage,
    )
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
  broadcastActivity(sessionId)

  try {
    const currentSession = store.getSession(sessionId)
    if (!currentSession) {
      throw new Error("Session disappeared before provider execution started")
    }

    const activeProviderParticipantId = resolveActiveProviderParticipantId(
      currentSession.participants,
      currentSession.providerKind,
    )
    const messageContent = queuedMessages.flatMap((queuedMessage) =>
      buildProviderInputContentForMessage(
        currentSession,
        activeProviderParticipantId,
        queuedMessage,
      ),
    )
    const callbacks = providerActivityCallbacks(
      sessionId,
      currentSession,
      seenQueuedInstructionMessages,
      seenQueuedMessages,
      seenThoughtItemIds,
      streamCheckpointMessageIds,
      streamCheckpointTexts,
    )

    let result:
      | Awaited<ReturnType<typeof runCodexTurn>>
      | Awaited<ReturnType<typeof runClaudeTurn>>
    let attempt = 1
    while (true) {
      try {
        if (currentSession.providerKind === "codex-app-server") {
          await ensureCodexAppServer(log)
          result = await runCodexTurn(
            currentSession,
            messageContent,
            pendingSystemInstruction,
            callbacks,
          )
        } else if (currentSession.providerKind === "claude-agent-sdk") {
          result = await runClaudeTurn(
            sessionId,
            currentSession,
            messageContent,
            pendingSystemInstruction,
            callbacks,
          )
        } else {
          throw new Error(
            `${currentSession.providerKind} provider adapter is not implemented yet`,
          )
        }
        break
      } catch (error) {
        const runtime = ensureRuntimeState(sessionId)
        if (runtime.interruptRequested) {
          throw error
        }
        const errorText =
          error instanceof Error
            ? error.message
            : "Provider run failed unexpectedly."
        if (!shouldRetryProviderError(errorText, attempt)) {
          throw error
        }
        const delayMs =
          retryBackoffMs[attempt - 1] ?? retryBackoffMs.at(-1) ?? 15000
        const failureActivity = appendActivityMessage(
          sessionId,
          `Provider error: ${errorText}`,
        )
        const retryActivity = appendActivityMessage(
          sessionId,
          `Retrying in ${Math.max(1, Math.ceil(delayMs / 1000))}s (attempt ${attempt + 1} of ${retryBackoffMs.length + 1}).`,
        )
        setRuntimeState(sessionId, (current) => ({
          ...current,
          status: "running",
          waitingFlags: [buildRetryWaitingFlag(delayMs)],
          lastError: errorText,
          lastVisibleActivityAtMs: Date.now(),
          providerIdleSinceAtMs: null,
        }))
        broadcastSession(sessionId, {
          type: "session.updated",
          session: store.getSession(sessionId)
            ? buildSessionSummaryOrNull(sessionId)
            : null,
          messages: [failureActivity, retryActivity],
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        })
        await Bun.sleep(delayMs)
        const retryStartActivity = appendActivityMessage(
          sessionId,
          `Retry attempt ${attempt + 1} starting.`,
        )
        setRuntimeState(sessionId, (current) => ({
          ...current,
          status: "running",
          waitingFlags: [],
          lastError: null,
          lastVisibleActivityAtMs: Date.now(),
          providerIdleSinceAtMs: null,
        }))
        broadcastSingleMessageUpdate(sessionId, retryStartActivity)
        attempt += 1
      }
    }

    const latestSession = store.getSession(sessionId)
    const shouldPersistProviderThread =
      !!latestSession &&
      latestSession.providerKind === runProviderSettings.providerKind &&
      latestSession.modelRef === runProviderSettings.modelRef &&
      normalizeOptionalValue(latestSession.authProfile) ===
        normalizeOptionalValue(runProviderSettings.authProfile) &&
      normalizeOptionalValue(latestSession.imageModelRef) ===
        normalizeOptionalValue(runProviderSettings.imageModelRef)
    const updatedSession = shouldPersistProviderThread
      ? store.updateProviderThread(sessionId, {
          threadId: result.threadId,
          threadPath: result.threadPath,
        })
      : latestSession
    const rawAssistantText = result.assistantText.trim()
    const assistantMetadata = extractAssistantTicketMetadata(rawAssistantText)
    ticketStore.specializeActiveTicketMetadata(sessionId, {
      title: assistantMetadata.title,
      summary: assistantMetadata.summary,
    })
    const assistantSignal = extractAssistantProcessSignal(
      assistantMetadata.visibleText,
      ticketStore.getActiveTicketForSession(sessionId),
    )
    const finalAssistantText = assistantSignal.visibleText
    const lastStreamItemId =
      Array.from(streamCheckpointMessageIds.keys()).at(-1) ?? null
    const lastStreamMessageId = lastStreamItemId
      ? (streamCheckpointMessageIds.get(lastStreamItemId) ?? null)
      : null
    const lastStreamText = lastStreamItemId
      ? (streamCheckpointTexts.get(lastStreamItemId) ?? "")
      : ""
    const providerCompletionIssueMessage =
      !finalAssistantText && result.completionIssueText
        ? appendActivityMessage(sessionId, result.completionIssueText)
        : null
    const assistantMessage = finalAssistantText
      ? lastStreamMessageId && lastStreamText === finalAssistantText
        ? (store.updateMessage(sessionId, lastStreamMessageId, {
            kind: "chat",
            content: [
              {
                type: "text",
                text: finalAssistantText,
              },
            ],
            providerSeenAtMs: Date.now(),
          }) ??
          store.appendMessage(sessionId, {
            role: "assistant",
            providerSeenAtMs: Date.now(),
            content: [
              {
                type: "text",
                text: finalAssistantText,
              },
            ],
          }))
        : store.appendMessage(sessionId, {
            role: "assistant",
            providerSeenAtMs: Date.now(),
            content: [
              {
                type: "text",
                text: finalAssistantText,
              },
            ],
          })
      : assistantSignal.signalText || providerCompletionIssueMessage
        ? null
        : store.appendMessage(sessionId, {
            role: "assistant",
            providerSeenAtMs: Date.now(),
            content: [
              {
                type: "text",
                text: "(empty response)",
              },
            ],
          })
    const ticketProgress = assistantSignal.signalText
      ? maybeApplyTicketStepTransition(sessionId, assistantSignal.signalText)
      : { status: null, messages: [] as StoredMessage[] }
    if (finalAssistantText && ticketProgress.status === null) {
      maybeMarkProcessBlueprintTerminal(sessionId, finalAssistantText)
    }
    finalizeIdleRuntimeState(sessionId, result.threadId)
    broadcastSession(sessionId, {
      type: "session.updated",
      session: buildSessionSummary(
        updatedSession ??
          latestSession ??
          store.getSession(sessionId) ??
          session,
      ),
      messages: [
        providerCompletionIssueMessage,
        assistantMessage,
        ...ticketProgress.messages,
      ].filter(Boolean),
      queuedMessages: store.listQueuedMessages(sessionId),
      activity: toSessionActivity(sessionId),
    })
    broadcastSession(sessionId, {
      type: "run.completed",
      sessionId,
      activity: toSessionActivity(sessionId),
    })
  } catch (error) {
    const runtime = ensureRuntimeState(sessionId)
    const interrupted = runtime.interruptRequested
    const errorText =
      error instanceof Error
        ? error.message
        : "Provider run failed unexpectedly."

    if (interrupted) {
      const systemMessage = appendActivityMessage(
        sessionId,
        "Agent run interrupted.",
      )
      finalizeNonIdleRuntimeState(sessionId, "interrupted", null)
      broadcastSingleMessageUpdate(sessionId, systemMessage)
      broadcastSession(sessionId, {
        type: "run.interrupted",
        sessionId,
        activity: toSessionActivity(sessionId),
      })
    } else {
      const failureMessage = appendActivityMessage(
        sessionId,
        `Provider run failed: ${errorText}`,
      )
      finalizeNonIdleRuntimeState(sessionId, "error", errorText)
      broadcastSingleMessageUpdate(sessionId, failureMessage)
      broadcastSession(sessionId, {
        type: "run.failed",
        sessionId,
        error: errorText,
        activity: toSessionActivity(sessionId),
      })
      log(
        `run error session_id=${sessionId} error=${JSON.stringify(errorText)}`,
      )
    }
  } finally {
    activeSessionRuns.delete(sessionId)
    await processSessionQueue(sessionId)
  }
}

const server = Bun.serve<ChatSocketData>({
  port,
  async fetch(request, serverInstance) {
    const url = new URL(request.url)

    const attachment = store.resolveAttachment(url.pathname)
    if (attachment && request.method === "GET") {
      return new Response(Bun.file(attachment.path), {
        status: 200,
        headers: {
          "content-type": attachment.mediaType,
          "cache-control": "no-store",
        },
      })
    }

    const mediaMatch = /^\/api\/agent-chat\/sessions\/([^/]+)\/media$/.exec(
      url.pathname,
    )
    if (mediaMatch && request.method === "GET") {
      const sessionId = decodeMatchGroup(mediaMatch, 1)
      if (!store.getSession(sessionId)) {
        return notFound()
      }
      const sourceUrl = url.searchParams.get("source")?.trim() || ""
      try {
        const resolvedImage = await readImageSource(sourceUrl)
        return new Response(resolvedImage.bytes, {
          status: 200,
          headers: {
            "content-type": resolvedImage.mediaType,
            "cache-control": "no-store",
          },
        })
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Image could not be loaded.",
          },
          400,
        )
      }
    }

    if (url.pathname === "/api/agent-chat/ws") {
      const sessionId = url.searchParams.get("sessionId")
      if (!sessionId || !store.getSession(sessionId)) {
        return jsonResponse({ ok: false, error: "sessionId required" }, 400)
      }
      const clientMode = url.searchParams.get("mode") === "v2" ? "v2" : "v1"

      if (
        serverInstance.upgrade(request, {
          data: {
            socketId: randomUUID(),
            sessionId,
            clientMode,
          },
        })
      ) {
        return undefined
      }
      return new Response("upgrade failed", { status: 500 })
    }

    if (url.pathname === "/api/agent-chat/health") {
      return jsonResponse({ ok: true })
    }

    if (url.pathname === "/api/agent-chat/providers") {
      await refreshClaudeModelCatalog()
      return jsonResponse({
        ok: true,
        providers: listProviderCatalog(),
      })
    }

    if (url.pathname === "/api/agent-chat/process-blueprints") {
      return jsonResponse({
        ok: true,
        processBlueprints: listProcessBlueprints(),
      })
    }

    const ticketMatch = /^\/api\/agent-chat\/tickets\/([^/]+)$/.exec(
      url.pathname,
    )
    if (ticketMatch && request.method === "GET") {
      const ticketId = decodeMatchGroup(ticketMatch, 1)
      const ticket = ticketStore.getTicket(ticketId)
      return ticket ? jsonResponse({ ok: true, ticket }) : notFound()
    }

    const ticketProcessConfigMatch =
      /^\/api\/agent-chat\/tickets\/([^/]+)\/process-config$/.exec(url.pathname)
    if (ticketProcessConfigMatch && request.method === "PATCH") {
      const ticketId = decodeMatchGroup(ticketProcessConfigMatch, 1)
      const ticket = ticketStore.getTicket(ticketId)
      if (!ticket) {
        return notFound()
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          overrides?: Record<string, string> | null
          confirm?: boolean
        }
        const patchEntries = payload.overrides
          ? Object.entries(payload.overrides)
              .map(
                ([key, value]) =>
                  [
                    key.trim(),
                    typeof value === "string" ? value.trim() : "",
                  ] as const,
              )
              .filter(([key, value]) => key && value)
          : []
        const overridesPatch =
          patchEntries.length > 0 ? Object.fromEntries(patchEntries) : null
        const wantsConfirm = payload.confirm === true

        if (!overridesPatch && !wantsConfirm) {
          return jsonResponse(
            { ok: false, error: "overrides or confirm required" },
            400,
          )
        }

        let updatedTicket = ticket
        const eventMessages: StoredMessage[] = []

        if (overridesPatch) {
          const updateResult = applyTicketProcessConfigOverrides(
            updatedTicket,
            overridesPatch,
            updatedTicket.confirmationState === "pending"
              ? "pending"
              : "confirmed",
          )
          if (!updateResult.ok) {
            return jsonResponse({ ok: false, error: updateResult.error }, 400)
          }
          eventMessages.push(
            appendTicketEventMessage(
              updatedTicket.sessionId,
              buildTicketTransitionEventText(updatedTicket, {
                ticket: updateResult.ticket,
                kind: "configUpdated",
                stepTitle: null,
                detail: null,
              }),
            ),
          )
          updatedTicket = updateResult.ticket
        }

        if (wantsConfirm) {
          if (updatedTicket.confirmationState !== "pending") {
            return jsonResponse(
              {
                ok: false,
                error: "ticket process config is not pending confirmation",
              },
              400,
            )
          }
          const confirmed = ticketStore.confirmActiveTicketProcessConfig(
            updatedTicket.sessionId,
          )
          if (!confirmed || confirmed.id !== updatedTicket.id) {
            return jsonResponse(
              { ok: false, error: "unable to confirm ticket process config" },
              400,
            )
          }
          eventMessages.push(
            appendTicketEventMessage(
              updatedTicket.sessionId,
              buildTicketTransitionEventText(updatedTicket, {
                ticket: confirmed,
                kind: "configConfirmed",
                stepTitle: confirmed.nextStepLabel,
                detail: "confirm_process_config",
              }),
            ),
          )
          updatedTicket = confirmed
          if (confirmed.nextStepLabel) {
            markSessionWatchdogStepPrompted(updatedTicket.sessionId)
          }
        }

        const snapshot = buildSessionSnapshot(updatedTicket.sessionId)
        if (snapshot) {
          broadcastSession(updatedTicket.sessionId, {
            type: "session.snapshot",
            session: snapshot.session,
            messages: snapshot.messages,
            queuedMessages: snapshot.queuedMessages,
            activity: snapshot.activity,
          })
        }

        return jsonResponse({
          ok: true,
          ticket: updatedTicket,
          messages: eventMessages,
        })
      })
    }

    const ticketStepSelectionMatch = matchTicketStepSelectionRoute(url.pathname)
    if (ticketStepSelectionMatch && request.method === "POST") {
      const ticketId = decodeMatchGroup(ticketStepSelectionMatch, 1)
      return request.json().then((body: unknown) => {
        const payload = body as { stepId?: string | null; checked?: boolean }
        const stepId = payload.stepId?.trim() || ""
        if (!stepId) {
          return jsonResponse({ ok: false, error: "stepId required" }, 400)
        }

        const ticket = selectTicketStepMutation({
          ticketStore,
          ticketId,
          stepId,
          checked: payload.checked === true,
        })
        if (!ticket) {
          return jsonResponse(
            {
              ok: false,
              error: "unfinished ticket or executable step not found",
            },
            404,
          )
        }

        const snapshot = buildSessionSnapshot(ticket.sessionId)
        if (snapshot) {
          broadcastSession(ticket.sessionId, {
            type: "session.snapshot",
            session: snapshot.session,
            messages: snapshot.messages,
            queuedMessages: snapshot.queuedMessages,
            activity: snapshot.activity,
          })
        }

        return jsonResponse({ ok: true, ticket })
      })
    }

    const ticketReassignMatch = matchTicketReassignRoute(url.pathname)
    if (ticketReassignMatch && request.method === "POST") {
      const ticketId = decodeMatchGroup(ticketReassignMatch, 1)
      return request.json().then((body: unknown) => {
        const payload = body as {
          targetSessionId?: string | null
          createSession?: boolean
        }
        const targetSessionId = payload.targetSessionId?.trim() || null
        const createSession = payload.createSession === true
        if (!createSession && !targetSessionId) {
          return jsonResponse(
            { ok: false, error: "targetSessionId or createSession required" },
            400,
          )
        }

        const result = reassignTicketMutation({
          store,
          ticketStore,
          ticketId,
          targetSessionId,
          createSession,
        })
        if (!result) {
          return jsonResponse(
            {
              ok: false,
              error: "unfinished ticket or destination session not found",
            },
            404,
          )
        }

        resetSessionWatchdogState(result.targetSessionId)
        maybeScheduleSessionWatchdog(result.targetSessionId)

        for (const sessionId of new Set([
          result.previousSessionId,
          result.targetSessionId,
        ])) {
          const snapshot = buildSessionSnapshot(sessionId)
          if (!snapshot) {
            continue
          }
          broadcastSession(sessionId, {
            type: "session.snapshot",
            session: snapshot.session,
            messages: snapshot.messages,
            queuedMessages: snapshot.queuedMessages,
            activity: snapshot.activity,
          })
        }

        return jsonResponse({
          ok: true,
          ticket: result.ticket,
          createdSession: result.createdSession
            ? buildSessionSummary(result.createdSession)
            : null,
        })
      })
    }

    const sessionTicketsMatch =
      /^\/api\/agent-chat\/sessions\/([^/]+)\/tickets$/.exec(url.pathname)
    if (sessionTicketsMatch && request.method === "GET") {
      const sessionId = decodeMatchGroup(sessionTicketsMatch, 1)
      if (!store.getSession(sessionId)) {
        return notFound()
      }
      const unfinishedOnly =
        url.searchParams.get("unfinished") === "true" ||
        url.searchParams.get("unfinished") === "1"
      return jsonResponse({
        ok: true,
        tickets: ticketStore.listTicketsForSession(sessionId, {
          unfinishedOnly,
        }),
      })
    }

    const sessionActiveTicketMatch =
      /^\/api\/agent-chat\/sessions\/([^/]+)\/active-ticket$/.exec(url.pathname)
    if (sessionActiveTicketMatch && request.method === "POST") {
      const sessionId = decodeMatchGroup(sessionActiveTicketMatch, 1)
      if (!store.getSession(sessionId)) {
        return notFound()
      }

      return request.json().then((body: unknown) => {
        const payload = body as { ticketId?: string | null }
        const ticketId = payload.ticketId?.trim() || ""
        if (!ticketId) {
          return jsonResponse({ ok: false, error: "ticketId required" }, 400)
        }

        const activatedTicket = ticketStore.activateTicketForSession(
          sessionId,
          ticketId,
        )
        if (!activatedTicket) {
          return jsonResponse(
            { ok: false, error: "unfinished ticket not found for session" },
            404,
          )
        }

        resetSessionWatchdogState(sessionId)
        maybeScheduleSessionWatchdog(sessionId)
        const snapshot = buildSessionSnapshot(sessionId)
        if (!snapshot) {
          return notFound()
        }
        broadcastSession(sessionId, {
          type: "session.snapshot",
          session: snapshot.session,
          messages: snapshot.messages,
          queuedMessages: snapshot.queuedMessages,
          activity: snapshot.activity,
        })
        return jsonResponse(snapshot)
      })
    }

    if (
      url.pathname === "/api/agent-chat/sessions" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        ok: true,
        sessions: store.listSessions().map(buildSessionSummary),
      })
    }

    if (
      url.pathname === "/api/agent-chat/v2/sessions" &&
      request.method === "GET"
    ) {
      const limit = normalizeV2Limit(url.searchParams.get("limit"), 40)
      const cursor = url.searchParams.get("cursor")?.trim() || ""
      const sessions = store.listSessions().map(buildSessionSummary)
      const startIndex = cursor
        ? Math.max(
            0,
            sessions.findIndex((session) => session.id === cursor) + 1,
          )
        : 0
      const boundedSessions = sessions.slice(startIndex, startIndex + limit)
      return jsonResponse({
        ok: true,
        sessions: boundedSessions,
        nextCursor:
          startIndex + limit < sessions.length
            ? (boundedSessions.at(-1)?.id ?? null)
            : null,
        totalKnownSessions: sessions.length,
      })
    }

    const sessionWindowMatch =
      /^\/api\/agent-chat\/v2\/sessions\/([^/]+)\/window$/.exec(url.pathname)
    if (sessionWindowMatch && request.method === "GET") {
      const sessionId = decodeMatchGroup(sessionWindowMatch, 1)
      const payload = buildSessionWindow(sessionId, {
        beforeMessageId: url.searchParams.get("beforeMessageId"),
        limit: normalizeV2Limit(url.searchParams.get("limit"), 80),
      })
      return payload ? jsonResponse(payload) : notFound()
    }

    if (
      url.pathname === "/api/agent-chat/sessions" &&
      request.method === "POST"
    ) {
      return request.json().then((body: unknown) => {
        const payload = body as {
          title?: string
          providerKind?: AgentChatProviderKind
          modelRef?: string
          cwd?: string
          authProfile?: string | null
          imageModelRef?: string | null
          processBlueprintId?: string | null
        }

        if (!payload.providerKind) {
          return jsonResponse(
            { ok: false, error: "providerKind required" },
            400,
          )
        }

        const provider = getProviderCatalogEntry(payload.providerKind)
        if (!provider) {
          return jsonResponse({ ok: false, error: "unknown provider" }, 400)
        }

        if (provider.status !== "ready") {
          return jsonResponse(
            {
              ok: false,
              error: `${provider.label} is not implemented yet in Agent Chat`,
            },
            400,
          )
        }

        const nextProcessBlueprintId =
          payload.processBlueprintId?.trim() || null
        if (
          nextProcessBlueprintId &&
          !processBlueprintById.has(nextProcessBlueprintId)
        ) {
          return jsonResponse(
            { ok: false, error: "unknown process blueprint" },
            400,
          )
        }

        let session = store.createSession({
          title: payload.title,
          providerKind: payload.providerKind,
          modelRef: normalizeProviderModelRef(
            payload.providerKind,
            payload.modelRef?.trim() || provider.defaultModelRef,
          ),
          cwd: payload.cwd?.trim() || defaultSessionDirectory,
          authProfile:
            payload.authProfile?.trim() || provider.authProfiles[0] || null,
          imageModelRef: payload.imageModelRef?.trim() || null,
        })
        if (nextProcessBlueprintId) {
          const updatedSession = store.updateSessionProcessBlueprint(
            session.id,
            nextProcessBlueprintId,
          )
          if (updatedSession) {
            session = updatedSession
          }
          const queuedExpectation = queueProcessExpectationForSession(
            session.id,
          )
          if (queuedExpectation.session) {
            session = queuedExpectation.session
          }
        }

        const snapshot = buildSessionSnapshot(session.id)
        return snapshot ? jsonResponse(snapshot) : notFound()
      })
    }

    const sessionMatch = /^\/api\/agent-chat\/sessions\/([^/]+)$/.exec(
      url.pathname,
    )
    if (sessionMatch && request.method === "GET") {
      const sessionId = decodeMatchGroup(sessionMatch, 1)
      const snapshot = buildSessionSnapshot(sessionId)
      return snapshot ? jsonResponse(snapshot) : notFound()
    }

    if (sessionMatch && request.method === "PATCH") {
      const sessionId = decodeMatchGroup(sessionMatch, 1)
      if (!store.getSession(sessionId)) {
        return notFound()
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          cwd?: string
          title?: string
          archived?: boolean
          processBlueprintId?: string | null
          forceProcessBlueprintReapply?: boolean
          providerKind?: AgentChatProviderKind
          modelRef?: string
          authProfile?: string | null
          imageModelRef?: string | null
        }
        const currentSession = store.getSession(sessionId)
        if (!currentSession) {
          return notFound()
        }

        const nextDirectory = payload.cwd?.trim()
        const nextTitle = payload.title?.trim()
        const nextArchived =
          typeof payload.archived === "boolean" ? payload.archived : undefined
        const nextProcessBlueprintId =
          payload.processBlueprintId === undefined
            ? undefined
            : payload.processBlueprintId?.trim() || null
        const forceProcessBlueprintReapply =
          payload.forceProcessBlueprintReapply === true
        const nextProviderKind = payload.providerKind?.trim() as
          | AgentChatProviderKind
          | undefined
        const nextModelRef = payload.modelRef?.trim()
        const nextAuthProfile =
          payload.authProfile === undefined
            ? undefined
            : payload.authProfile?.trim() || null
        const nextImageModelRef =
          payload.imageModelRef === undefined
            ? undefined
            : payload.imageModelRef?.trim() || null
        const hasProviderPatch =
          !!nextProviderKind ||
          !!nextModelRef ||
          payload.authProfile !== undefined ||
          payload.imageModelRef !== undefined
        const hasProcessBlueprintPatch =
          payload.processBlueprintId !== undefined

        if (
          !nextDirectory &&
          !nextTitle &&
          nextArchived === undefined &&
          !hasProviderPatch &&
          !hasProcessBlueprintPatch
        ) {
          return jsonResponse(
            {
              ok: false,
              error:
                "directory, title, archive state, process blueprint, or provider settings required",
            },
            400,
          )
        }
        let session = currentSession
        const queuedMessages: StoredMessage[] = []

        if (nextDirectory && session && nextDirectory !== session.cwd) {
          store.markQueuedSystemMessagesSeenByPrefix(
            sessionId,
            DIRECTORY_QUEUE_PREFIX,
          )
          const updatedSession = store.updateSessionCwd(
            sessionId,
            nextDirectory,
          )
          if (updatedSession) {
            session = updatedSession
          }
          const directoryMessage = store.appendMessage(sessionId, {
            role: "system",
            kind: "directoryInstruction",
            providerSeenAtMs: null,
            content: [
              {
                type: "text",
                text: `${DIRECTORY_QUEUE_PREFIX}${nextDirectory} for the next agent turn.`,
              },
            ],
          })
          queuedMessages.push(directoryMessage)
          const instructionSession =
            store.replacePendingSystemInstructionByPrefix(
              sessionId,
              DIRECTORY_INSTRUCTION_PREFIX,
              `${DIRECTORY_INSTRUCTION_PREFIX}${nextDirectory}. Use this directory for subsequent work unless the user says otherwise.`,
            )
          if (instructionSession) {
            session = instructionSession
          }
        }

        if (nextTitle && session && nextTitle !== session.title) {
          store.markQueuedSystemMessagesSeenByPrefix(
            sessionId,
            TITLE_QUEUE_PREFIX,
          )
          const updatedSession = store.updateSessionTitle(sessionId, nextTitle)
          if (updatedSession) {
            session = updatedSession
          }
          const titleMessage = store.appendMessage(sessionId, {
            role: "system",
            providerSeenAtMs: null,
            content: [
              {
                type: "text",
                text: `${TITLE_QUEUE_PREFIX}${nextTitle} for the next agent turn.`,
              },
            ],
          })
          queuedMessages.push(titleMessage)
          const instructionSession =
            store.replacePendingSystemInstructionByPrefix(
              sessionId,
              TITLE_INSTRUCTION_PREFIX,
              `${TITLE_INSTRUCTION_PREFIX}${nextTitle}. Use this title when referring to this chat unless the user says otherwise.`,
            )
          if (instructionSession) {
            session = instructionSession
          }
        }

        if (
          nextArchived !== undefined &&
          session &&
          nextArchived !== session.archived
        ) {
          const updatedSession = store.updateSessionArchived(
            sessionId,
            nextArchived,
          )
          if (updatedSession) {
            session = updatedSession
          }
        }

        if (hasProcessBlueprintPatch && session) {
          if (
            nextProcessBlueprintId &&
            !processBlueprintById.has(nextProcessBlueprintId)
          ) {
            return jsonResponse(
              { ok: false, error: "unknown process blueprint" },
              400,
            )
          }
          const previousProcessBlueprintId = session.processBlueprintId
          const previousProcessTitle =
            getSessionProcessBlueprint(session)?.title ?? null
          const nextProcessTitle = nextProcessBlueprintId
            ? (processBlueprintById.get(nextProcessBlueprintId)?.title ?? null)
            : null
          const shouldReapplyProcessBlueprint =
            previousProcessBlueprintId === (nextProcessBlueprintId ?? null) &&
            forceProcessBlueprintReapply
          const processBlueprintChanged =
            previousProcessBlueprintId !== (nextProcessBlueprintId ?? null)
          const updatedSession = store.updateSessionProcessBlueprint(
            sessionId,
            nextProcessBlueprintId ?? null,
          )
          if (updatedSession) {
            session = updatedSession
          }
          if (shouldReapplyProcessBlueprint) {
            const resetSession = resetSessionWatchdogState(sessionId)
            if (resetSession) {
              session = resetSession
            }
          }
          if (processBlueprintChanged || shouldReapplyProcessBlueprint) {
            store.markQueuedSystemMessagesSeen(sessionId)
            cancelSessionWatchdog(sessionId)
            ticketStore.clearActiveTicketForSession(sessionId)
            queuedMessages.push(
              appendTicketEventMessage(
                sessionId,
                buildProcessSelectionEventText(
                  previousProcessTitle,
                  nextProcessTitle,
                  shouldReapplyProcessBlueprint ? "reapplied" : "changed",
                ),
              ),
            )
            const queuedExpectation =
              queueProcessExpectationForSession(sessionId)
            queuedMessages.push(...queuedExpectation.messages)
            if (queuedExpectation.session) {
              session = queuedExpectation.session
            }
          }
          cancelSessionWatchdog(sessionId)
          maybeScheduleSessionWatchdog(sessionId)
        }

        if (hasProviderPatch && session) {
          const resolvedProviderKind = nextProviderKind ?? session.providerKind
          const provider = getProviderCatalogEntry(resolvedProviderKind)
          if (!provider) {
            return jsonResponse({ ok: false, error: "unknown provider" }, 400)
          }
          if (provider.status !== "ready") {
            return jsonResponse(
              {
                ok: false,
                error: `${provider.label} is not implemented yet in Agent Chat`,
              },
              400,
            )
          }

          const resolvedModelRef = normalizeProviderModelRef(
            resolvedProviderKind,
            nextModelRef || session.modelRef || provider.defaultModelRef,
          )
          const resolvedAuthProfile =
            nextAuthProfile !== undefined
              ? nextAuthProfile
              : session.authProfile || provider.authProfiles[0] || null
          const resolvedImageModelRef =
            nextImageModelRef !== undefined
              ? nextImageModelRef
              : session.imageModelRef
          const providerChanged =
            resolvedProviderKind !== session.providerKind ||
            resolvedModelRef !== session.modelRef ||
            normalizeOptionalValue(resolvedAuthProfile) !==
              normalizeOptionalValue(session.authProfile) ||
            normalizeOptionalValue(resolvedImageModelRef) !==
              normalizeOptionalValue(session.imageModelRef)

          if (providerChanged) {
            const updatedSession = store.updateSessionProviderSettings(
              sessionId,
              {
                providerKind: resolvedProviderKind,
                modelRef: resolvedModelRef,
                authProfile: resolvedAuthProfile,
                imageModelRef: resolvedImageModelRef,
                clearProviderThread: true,
              },
            )
            if (updatedSession) {
              session = updatedSession
            }

            const providerMessage = store.appendMessage(sessionId, {
              role: "system",
              providerSeenAtMs: Date.now(),
              content: [
                {
                  type: "text",
                  text: `Chat provider changed to ${provider.label} · ${resolvedModelRef}`,
                },
              ],
            })
            queuedMessages.push(providerMessage)
          }
        }

        broadcastSession(sessionId, {
          type: "session.updated",
          session: session ? buildSessionSummary(session) : null,
          messages: queuedMessages,
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        })
        const snapshot = buildSessionSnapshot(sessionId)
        return snapshot ? jsonResponse(snapshot) : notFound()
      })
    }

    const interruptMatch =
      /^\/api\/agent-chat\/sessions\/([^/]+)\/interrupt$/.exec(url.pathname)
    if (interruptMatch && request.method === "POST") {
      const sessionId = decodeMatchGroup(interruptMatch, 1)
      const session = store.getSession(sessionId)
      const runtime = ensureRuntimeState(sessionId)
      if (!session) {
        return notFound()
      }
      const interruptProviderKind = runtime.providerKind ?? session.providerKind
      if (!providerSupportsInterrupt(interruptProviderKind)) {
        return jsonResponse(
          { ok: false, error: "Interrupt not supported for this provider" },
          400,
        )
      }
      if (runtime.status !== "running") {
        return jsonResponse(
          { ok: false, error: "No active turn to interrupt" },
          409,
        )
      }

      if (
        interruptProviderKind === "codex-app-server" &&
        (!runtime.turnId || !runtime.threadId)
      ) {
        setRuntimeState(sessionId, (current) => ({
          ...current,
          interruptRequested: true,
          canInterrupt: false,
          lastVisibleActivityAtMs: Date.now(),
          providerIdleSinceAtMs: null,
        }))
        broadcastActivity(sessionId)
        return jsonResponse({
          ok: true,
          activity: toSessionActivity(sessionId),
        })
      }

      const interruptPromise = requestProviderInterrupt(
        sessionId,
        session,
        interruptProviderKind,
        runtime.threadId,
        runtime.turnId,
      )

      return interruptPromise
        .then(() => {
          setRuntimeState(sessionId, {
            status: "interrupted",
            interruptRequested: true,
            canInterrupt: false,
            providerKind: interruptProviderKind,
            providerIdleSinceAtMs: null,
          })
          broadcastActivity(sessionId)
          return jsonResponse({
            ok: true,
            activity: toSessionActivity(sessionId),
          })
        })
        .catch((error) => {
          const errorText =
            error instanceof Error ? error.message : "Interrupt request failed."
          return jsonResponse({ ok: false, error: errorText }, 500)
        })
    }

    const messagesMatch =
      /^\/api\/agent-chat\/sessions\/([^/]+)\/messages$/.exec(url.pathname)
    const keepImageMatch =
      /^\/api\/agent-chat\/sessions\/([^/]+)\/messages\/([^/]+)\/keep-image$/.exec(
        url.pathname,
      )
    const typingMatch = /^\/api\/agent-chat\/sessions\/([^/]+)\/typing$/.exec(
      url.pathname,
    )
    if (typingMatch && request.method === "POST") {
      const sessionId = decodeMatchGroup(typingMatch, 1)
      if (!store.getSession(sessionId)) {
        return notFound()
      }
      return request.json().then((body: unknown) => {
        const payload = body as { active?: boolean }
        setUserTypingState(sessionId, payload.active !== false)
        return jsonResponse({
          ok: true,
          activity: toSessionActivity(sessionId),
        })
      })
    }

    if (keepImageMatch && request.method === "POST") {
      const sessionId = decodeMatchGroup(keepImageMatch, 1)
      const messageId = decodeMatchGroup(keepImageMatch, 2)
      if (!store.getSession(sessionId)) {
        return notFound()
      }

      return request.json().then(async (body: unknown) => {
        const payload = body as {
          sourceUrl?: string
        }
        const rawSourceUrl = payload.sourceUrl?.trim() || ""
        if (!rawSourceUrl) {
          return jsonResponse({ ok: false, error: "sourceUrl required" }, 400)
        }

        try {
          const resolvedImage = await readImageSource(rawSourceUrl)
          if (
            resolvedImage.provenance === "attachment" &&
            resolvedImage.normalizedSource.startsWith(
              `/api/agent-chat/sessions/${encodeURIComponent(sessionId)}/attachments/`,
            )
          ) {
            const snapshot = buildSessionSnapshot(sessionId)
            return snapshot ? jsonResponse(snapshot) : notFound()
          }

          const attachmentReference = store.persistAttachment(sessionId, {
            mediaType: resolvedImage.mediaType,
            bytes: resolvedImage.bytes,
          })
          const updatedMessage = promoteMarkdownImageReference(
            sessionId,
            messageId,
            resolvedImage.normalizedSource,
            attachmentReference.url,
          )
          if (!updatedMessage) {
            return jsonResponse(
              {
                ok: false,
                error:
                  "Markdown image reference was not found in that message.",
              },
              409,
            )
          }

          const snapshot = buildSessionSnapshot(sessionId)
          broadcastSession(sessionId, {
            type: "session.updated",
            session: store.getSession(sessionId)
              ? buildSessionSummaryOrNull(sessionId)
              : null,
            messages: [updatedMessage],
            queuedMessages: store.listQueuedMessages(sessionId),
            activity: toSessionActivity(sessionId),
          })
          return snapshot ? jsonResponse(snapshot) : notFound()
        } catch (error) {
          return jsonResponse(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Image could not be kept.",
            },
            400,
          )
        }
      })
    }

    if (messagesMatch && request.method === "GET") {
      const sessionId = decodeMatchGroup(messagesMatch, 1)
      const snapshot = buildSessionSnapshot(sessionId)
      return snapshot ? jsonResponse(snapshot) : notFound()
    }

    if (messagesMatch && request.method === "POST") {
      const sessionId = decodeMatchGroup(messagesMatch, 1)
      if (!store.getSession(sessionId)) {
        return notFound()
      }

      return request.json().then((body: unknown) => {
        const payload = body as {
          text?: string
          role?: "user" | "assistant" | "system"
          authorParticipantId?: string | null
          replyToMessageId?: string | null
          defaultVisibility?: unknown
          visibilityTags?: string[]
          content?: Array<
            | { type?: "text"; text?: string }
            | { type?: "image"; dataUrl?: string }
          >
        }
        let content: StoredMessageContentBlock[]
        try {
          content = normalizeMessageContent(sessionId, payload)
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : "Invalid message content."
          return jsonResponse({ ok: false, error: errorText }, 400)
        }
        if (content.length === 0) {
          return jsonResponse(
            { ok: false, error: "message content required" },
            400,
          )
        }

        const session = store.getSession(sessionId)
        if (!session) {
          return notFound()
        }
        const authorParticipantId = payload.authorParticipantId?.trim() || null
        const authorParticipant = authorParticipantId
          ? (session.participants.find(
              (participant) =>
                participant.participantId === authorParticipantId,
            ) ?? null)
          : null
        if (authorParticipantId && !authorParticipant) {
          return jsonResponse(
            { ok: false, error: `Unknown participant: ${authorParticipantId}` },
            400,
          )
        }
        const role =
          payload.role ??
          (authorParticipant?.role === "agent"
            ? "assistant"
            : (authorParticipant?.role ?? "user"))
        const activeProviderParticipantId = resolveActiveProviderParticipantId(
          session.participants,
          session.providerKind,
        )
        const providerSeenAtMs =
          role === "assistant" &&
          authorParticipantId === activeProviderParticipantId
            ? Date.now()
            : null

        const userMessage = store.appendMessage(sessionId, {
          role,
          authorParticipantId,
          defaultVisibility: payload.defaultVisibility as never,
          visibilityTags: payload.visibilityTags as never,
          providerSeenAtMs,
          replyToMessageId: payload.replyToMessageId?.trim() || null,
          content,
        })
        resetSessionWatchdogState(sessionId)
        const resumedBlockedTicket =
          ticketStore.resumeBlockedActiveTicket(sessionId)
        if (!resumedBlockedTicket) {
          ticketStore.resetSameStepAttemptCount(sessionId)
        }

        const sessionBeforeRun = store.getSession(sessionId)
        const titledSession =
          sessionBeforeRun?.title === "New chat"
            ? store.updateSessionTitle(
                sessionId,
                buildSessionTitleFromContent(content),
              )
            : sessionBeforeRun

        if (!activeSessionRuns.has(sessionId)) {
          setRuntimeState(sessionId, {
            status: "queued",
            currentMessageId: userMessage.id,
            lastError: null,
            providerIdleSinceAtMs: null,
          })
        }

        broadcastSession(sessionId, {
          type: "session.updated",
          session: titledSession ? buildSessionSummary(titledSession) : null,
          messages: [userMessage],
          queuedMessages: store.listQueuedMessages(sessionId),
          activity: toSessionActivity(sessionId),
        })
        void processSessionQueue(sessionId)

        return jsonResponse(
          {
            ok: true,
            session: titledSession ? buildSessionSummary(titledSession) : null,
            started: !activeSessionRuns.has(sessionId),
            queuedMessages: store.listQueuedMessages(sessionId),
            activity: toSessionActivity(sessionId),
          },
          202,
        )
      })
    }

    return notFound()
  },
  websocket: {
    open(ws) {
      if (!ws.data.sessionId) {
        return
      }
      getSessionSockets(ws.data.sessionId).add(ws)
      if (ws.data.clientMode === "v2") {
        const payload = buildSessionWindow(ws.data.sessionId, { limit: 80 })
        if (payload) {
          ws.send(
            JSON.stringify({
              type: "session.window",
              ...payload,
            }),
          )
        }
        return
      }
      const payload = buildSessionSnapshot(ws.data.sessionId)
      if (payload) {
        ws.send(
          JSON.stringify({
            type: "session.snapshot",
            ...payload,
          }),
        )
      }
    },
    message() {},
    close(ws) {
      if (!ws.data.sessionId) {
        return
      }
      const sockets = sessionSockets.get(ws.data.sessionId)
      sockets?.delete(ws)
      if (sockets && sockets.size === 0) {
        sessionSockets.delete(ws.data.sessionId)
      }
    },
  },
})

log(`agent-chat server listening on http://127.0.0.1:${server.port}`)
rearmPersistedSessionWatchdogs()
