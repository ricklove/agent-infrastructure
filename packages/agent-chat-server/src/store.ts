import { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync as readBinaryFileSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import type { AgentChatProviderKind } from "./catalog.js"
import {
  type AgentChatParticipant,
  buildVisibilityResolution,
  createPendingDeliveryRecord,
  createProviderBinding,
  type DefaultVisibility,
  type DeliveryRecord,
  defaultParticipantsForProvider,
  displayLabelForProvider,
  ensureParticipantDefaultsTargetProvider,
  extractVisibilityTagsFromContent,
  legacySessionParticipants,
  markDeliveryRecord,
  normalizeDefaultVisibility,
  normalizeProviderBinding,
  normalizeVisibilityTags,
  type ParticipantHost,
  participantIdForProvider,
  resolveActiveProviderParticipantId,
  SYSTEM_PARTICIPANT_ID,
  USER_PARTICIPANT_ID,
  type VisibilityResolution,
  type VisibilityTag,
} from "./schema.js"

const attachmentRoutePrefix = "/api/agent-chat/sessions"

export type StoredMessageContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; url: string }

export type StoredAttachment = {
  fileName: string
  mediaType: string
  path: string
  url: string
}

export type SessionWatchdogState = {
  status: "unconfigured" | "unresolved" | "nudged" | "completed" | "blocked"
  nudgeCount: number
  lastNudgedAtMs: number | null
  completedAtMs: number | null
}

export type StoredSession = {
  id: string
  title: string
  archived: boolean
  processBlueprintId: string | null
  watchdogState: SessionWatchdogState
  providerKind: AgentChatProviderKind
  modelRef: string
  cwd: string
  pendingSystemInstruction: string | null
  authProfile: string | null
  imageModelRef: string | null
  providerThreadId: string | null
  providerThreadPath: string | null
  participants: AgentChatParticipant[]
  createdAtMs: number
  updatedAtMs: number
  preview: string | null
  messageCount: number
}

type PendingInstructionConsumeOptions = {
  excludePrefixes?: string[]
}

export type StoredMessage = {
  id: string
  sessionId: string
  role: "user" | "assistant" | "system"
  kind:
    | "chat"
    | "activity"
    | "ticketEvent"
    | "directoryInstruction"
    | "watchdogPrompt"
    | "thought"
    | "streamCheckpoint"
  replyToMessageId: string | null
  ticketId: string | null
  authorParticipantId: string
  authorHost: ParticipantHost
  defaultVisibility: DefaultVisibility
  visibilityTags: VisibilityTag[]
  visibilityResolution: VisibilityResolution
  deliveryRecords: DeliveryRecord[]
  providerSeenAtMs: number | null
  content: StoredMessageContentBlock[]
  createdAtMs: number
}

export type CreateSessionInput = {
  title?: string
  providerKind: AgentChatProviderKind
  modelRef: string
  cwd: string
  authProfile?: string | null
  imageModelRef?: string | null
}

type AppendMessageInput = {
  role: StoredMessage["role"]
  content: StoredMessage["content"]
  kind?: StoredMessage["kind"]
  replyToMessageId?: string | null
  ticketId?: string | null
  providerSeenAtMs?: number | null
  authorParticipantId?: string | null
  defaultVisibility?: DefaultVisibility
  visibilityTags?: VisibilityTag[]
}

type CanonicalWriteEvent = {
  sessionId: string
  reason:
    | "session-created"
    | "attachment-persisted"
    | "message-appended"
    | "session-metadata-updated"
    | "message-visibility-updated"
}

type AgentChatStoreOptions = {
  dataDir: string
  legacySqlitePath?: string | null
  onCanonicalWrite?: (event: CanonicalWriteEvent) => void
}

type SessionMetadata = Omit<StoredSession, "preview" | "messageCount">

const defaultWatchdogState = (
  processBlueprintId: string | null,
): SessionWatchdogState => ({
  status: processBlueprintId ? "unresolved" : "unconfigured",
  nudgeCount: 0,
  lastNudgedAtMs: null,
  completedAtMs: null,
})

function safeJsonParse<T>(raw: string): T | null {
  if (raw.includes("\0")) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function summarizePreview(messages: StoredMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.kind === "activity" || message.kind === "ticketEvent") {
      continue
    }
    const textBlock = message?.content.find((block) => block.type === "text")
    const preview = textBlock?.type === "text" ? textBlock.text.trim() : ""
    if (preview) {
      return preview
    }
    const imageCount =
      message?.content.filter((block) => block.type === "image").length ?? 0
    if (imageCount > 0) {
      return imageCount === 1
        ? "Shared an image"
        : `Shared ${imageCount} images`
    }
  }
  return null
}

function sessionSummary(
  metadata: SessionMetadata,
  messages: StoredMessage[],
): StoredSession {
  return {
    ...metadata,
    preview: summarizePreview(messages),
    messageCount: messages.length,
  }
}

function findParticipant(
  participants: AgentChatParticipant[],
  participantId: string | null | undefined,
) {
  if (!participantId) {
    return null
  }
  return (
    participants.find(
      (participant) => participant.participantId === participantId,
    ) ?? null
  )
}

function activeProviderParticipantIdForSession(session: StoredSession) {
  return resolveActiveProviderParticipantId(
    session.participants,
    session.providerKind,
  )
}

function queuedForParticipant(message: StoredMessage, participantId: string) {
  return message.deliveryRecords.some(
    (record) =>
      record.recipientParticipantId === participantId &&
      (record.status === "pending" || record.status === "unreachable"),
  )
}

function ensureProviderParticipant(
  participants: AgentChatParticipant[],
  providerKind: AgentChatProviderKind,
  createdAtMs: number,
) {
  const existing = participants.find(
    (participant) =>
      participant.role === "agent" &&
      participant.host === "manager" &&
      (participant.providerBinding?.providerKind ??
        participant.providerKind) === providerKind,
  )
  if (existing) {
    return participants
  }
  const participantId = participantIdForProvider(providerKind)
  return [
    ...participants,
    {
      participantId,
      agentId: participantId,
      role: "agent",
      label: displayLabelForProvider(providerKind),
      host: "manager",
      defaultVisibility: "none",
      providerBinding: createProviderBinding(participantId, providerKind),
      providerKind,
      createdAtMs,
    } satisfies AgentChatParticipant,
  ]
}

function resolveMessageAuthorParticipantId(
  session: StoredSession,
  input: AppendMessageInput,
) {
  if (input.authorParticipantId?.trim()) {
    return input.authorParticipantId.trim()
  }
  if (input.role === "user") {
    return USER_PARTICIPANT_ID
  }
  if (input.role === "system") {
    return SYSTEM_PARTICIPANT_ID
  }
  return resolveActiveProviderParticipantId(
    session.participants,
    session.providerKind,
  )
}

function reconcileDeliveryRecords(
  participants: AgentChatParticipant[],
  existingRecords: DeliveryRecord[],
  visibilityResolution: VisibilityResolution,
) {
  const existingByParticipantId = new Map(
    existingRecords.map(
      (record) => [record.recipientParticipantId, record] as const,
    ),
  )
  return visibilityResolution.audienceParticipantIds
    .map((participantId) => {
      const participant = findParticipant(participants, participantId)
      if (!participant) {
        return null
      }
      return (
        existingByParticipantId.get(participantId) ??
        createPendingDeliveryRecord(
          participant,
          visibilityResolution.resolvedAtMs,
        )
      )
    })
    .filter(Boolean) as DeliveryRecord[]
}

function normalizeStoredParticipants(
  participants: AgentChatParticipant[] | undefined,
  providerKind: AgentChatProviderKind,
  createdAtMs: number,
) {
  const baseParticipants =
    participants && participants.length > 0
      ? participants.map((participant) => {
          const participantId = participant.participantId
          const normalizedProviderBinding = normalizeProviderBinding(
            participantId,
            participant.host,
            participant.providerBinding ?? null,
            participant.providerKind ?? null,
          )
          return {
            ...participant,
            agentId: participant.agentId ?? participantId,
            defaultVisibility: normalizeDefaultVisibility(
              participant.defaultVisibility,
            ),
            providerBinding: normalizedProviderBinding,
            providerKind:
              normalizedProviderBinding?.providerKind ??
              participant.providerKind ??
              null,
            createdAtMs:
              participant.createdAtMs === undefined
                ? createdAtMs
                : Number(participant.createdAtMs),
          }
        })
      : legacySessionParticipants(createdAtMs)
  return ensureParticipantDefaultsTargetProvider(
    ensureProviderParticipant(baseParticipants, providerKind, createdAtMs),
    providerKind,
  )
}

function normalizeAuthorParticipantId(
  rawAuthorParticipantId: unknown,
  role: StoredMessage["role"],
  session: StoredSession,
) {
  if (
    typeof rawAuthorParticipantId === "string" &&
    rawAuthorParticipantId.trim()
  ) {
    return rawAuthorParticipantId.trim()
  }
  if (role === "user") {
    return USER_PARTICIPANT_ID
  }
  if (role === "system") {
    return SYSTEM_PARTICIPANT_ID
  }
  return resolveActiveProviderParticipantId(
    session.participants,
    session.providerKind,
  )
}

function normalizeVisibilityResolutionForMessage(args: {
  session: StoredSession
  authorParticipantId: string
  defaultVisibility: DefaultVisibility
  visibilityTags: VisibilityTag[]
  createdAtMs: number
  rawVisibilityResolution?: Partial<VisibilityResolution> | null
}) {
  if (args.rawVisibilityResolution) {
    return {
      audienceParticipantIds: Array.isArray(
        args.rawVisibilityResolution.audienceParticipantIds,
      )
        ? [
            ...new Set(
              args.rawVisibilityResolution.audienceParticipantIds.map(String),
            ),
          ]
        : buildVisibilityResolution({
            participants: args.session.participants,
            senderParticipantId: args.authorParticipantId,
            senderDefaultVisibility: args.defaultVisibility,
            tagOverrides: args.visibilityTags,
            resolvedAtMs: args.createdAtMs,
          }).audienceParticipantIds,
      tagOverrides: args.visibilityTags,
      resolvedFromDefaultVisibility: args.defaultVisibility,
      resolvedAtMs:
        args.rawVisibilityResolution.resolvedAtMs === undefined
          ? args.createdAtMs
          : Number(args.rawVisibilityResolution.resolvedAtMs),
    } satisfies VisibilityResolution
  }
  return buildVisibilityResolution({
    participants: args.session.participants,
    senderParticipantId: args.authorParticipantId,
    senderDefaultVisibility: args.defaultVisibility,
    tagOverrides: args.visibilityTags,
    resolvedAtMs: args.createdAtMs,
  })
}

function normalizeDeliveryRecordsForMessage(args: {
  session: StoredSession
  visibilityResolution: VisibilityResolution
  rawDeliveryRecords: DeliveryRecord[] | undefined
  providerSeenAtMs: number | null
}) {
  if (
    Array.isArray(args.rawDeliveryRecords) &&
    args.rawDeliveryRecords.length > 0
  ) {
    return reconcileDeliveryRecords(
      args.session.participants,
      args.rawDeliveryRecords.map((record) => ({
        ...record,
        recipientParticipantId: String(record.recipientParticipantId),
        recipientHost: record.recipientHost,
        status: record.status,
        visibleAtMs: Number(record.visibleAtMs),
        pendingSinceMs:
          record.pendingSinceMs === null || record.pendingSinceMs === undefined
            ? null
            : Number(record.pendingSinceMs),
        deliveredAtMs:
          record.deliveredAtMs === null || record.deliveredAtMs === undefined
            ? null
            : Number(record.deliveredAtMs),
        seenAtMs:
          record.seenAtMs === null || record.seenAtMs === undefined
            ? null
            : Number(record.seenAtMs),
        error: record.error ?? null,
      })),
      args.visibilityResolution,
    )
  }
  const activeProviderParticipantId = resolveActiveProviderParticipantId(
    args.session.participants,
    args.session.providerKind,
  )
  return args.visibilityResolution.audienceParticipantIds
    .map((participantId) =>
      findParticipant(args.session.participants, participantId),
    )
    .filter(
      (participant): participant is AgentChatParticipant =>
        participant !== null,
    )
    .map((participant) => {
      const baseRecord = createPendingDeliveryRecord(
        participant,
        args.visibilityResolution.resolvedAtMs,
      )
      if (
        participant.participantId === activeProviderParticipantId &&
        args.providerSeenAtMs !== null
      ) {
        return markDeliveryRecord(baseRecord, "seen", args.providerSeenAtMs)
      }
      return baseRecord
    }) as DeliveryRecord[]
}

export class AgentChatStore {
  private readonly sessionsDir: string
  private readonly onCanonicalWrite?: (event: CanonicalWriteEvent) => void
  private readonly sessionCache = new Map<string, StoredSession>()
  private readonly messageCache = new Map<string, StoredMessage[]>()

  constructor(options: AgentChatStoreOptions) {
    this.sessionsDir = join(options.dataDir, "sessions")
    this.onCanonicalWrite = options.onCanonicalWrite
    mkdirSync(this.sessionsDir, { recursive: true })
    this.importLegacySqliteIfNeeded(options.legacySqlitePath ?? null)
    this.loadCache()
  }

  listSessions(): StoredSession[] {
    return Array.from(this.sessionCache.values()).sort((left, right) => {
      if (right.updatedAtMs !== left.updatedAtMs) {
        return right.updatedAtMs - left.updatedAtMs
      }
      return right.createdAtMs - left.createdAtMs
    })
  }

  getSession(sessionId: string): StoredSession | null {
    return this.sessionCache.get(sessionId) ?? null
  }

  createSession(input: CreateSessionInput): StoredSession {
    const now = Date.now()
    const sessionId = randomUUID()
    const metadata: SessionMetadata = {
      id: sessionId,
      title: input.title?.trim() || "New chat",
      archived: false,
      processBlueprintId: null,
      watchdogState: defaultWatchdogState(null),
      providerKind: input.providerKind,
      modelRef: input.modelRef,
      cwd: input.cwd,
      pendingSystemInstruction: null,
      authProfile: input.authProfile ?? null,
      imageModelRef: input.imageModelRef ?? null,
      providerThreadId: null,
      providerThreadPath: null,
      participants: defaultParticipantsForProvider(input.providerKind, now),
      createdAtMs: now,
      updatedAtMs: now,
    }
    const messages: StoredMessage[] = []

    this.writeSessionFiles(metadata, messages)
    const summary = sessionSummary(metadata, messages)
    this.sessionCache.set(sessionId, summary)
    this.messageCache.set(sessionId, messages)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-created",
    })
    return summary
  }

  listMessages(sessionId: string): StoredMessage[] {
    return [...(this.messageCache.get(sessionId) ?? [])]
  }

  listMessagesPage(
    sessionId: string,
    input?: {
      beforeMessageId?: string | null
      limit?: number
    },
  ): {
    messages: StoredMessage[]
    hasOlderMessages: boolean
  } {
    const allMessages = this.messageCache.get(sessionId) ?? []
    const limit = Math.max(1, Math.min(200, input?.limit ?? 50))
    const beforeMessageId = input?.beforeMessageId?.trim() ?? ""

    if (!beforeMessageId) {
      const startIndex = Math.max(0, allMessages.length - limit)
      return {
        messages: allMessages.slice(startIndex),
        hasOlderMessages: startIndex > 0,
      }
    }

    const endIndex = allMessages.findIndex(
      (message) => message.id === beforeMessageId,
    )
    if (endIndex <= 0) {
      return {
        messages: [],
        hasOlderMessages: false,
      }
    }

    const startIndex = Math.max(0, endIndex - limit)
    return {
      messages: allMessages.slice(startIndex, endIndex),
      hasOlderMessages: startIndex > 0,
    }
  }

  listQueuedMessages(sessionId: string): StoredMessage[] {
    const session = this.sessionCache.get(sessionId)
    if (!session) {
      return []
    }
    const activeParticipantId = activeProviderParticipantIdForSession(session)
    return this.listMessages(sessionId).filter((message) =>
      queuedForParticipant(message, activeParticipantId),
    )
  }

  persistAttachment(
    sessionId: string,
    input: {
      mediaType: string
      bytes: Uint8Array
    },
  ): StoredAttachment {
    const current = this.sessionCache.get(sessionId)
    if (!current) {
      throw new Error(`Unknown session ${sessionId}`)
    }

    const extension = fileExtensionForMediaType(input.mediaType)
    const fileName = `${randomUUID()}.${extension}`
    const path = this.attachmentPath(sessionId, fileName)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, input.bytes)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "attachment-persisted",
    })
    return {
      fileName,
      mediaType: input.mediaType,
      path,
      url: this.attachmentUrl(sessionId, fileName),
    }
  }

  resolveAttachment(url: string): StoredAttachment | null {
    const match = attachmentUrlPattern.exec(url)
    if (!match) {
      return null
    }

    const sessionId = decodeURIComponent(match[1] ?? "")
    const fileName = decodeURIComponent(match[2] ?? "")
    const path = this.attachmentPath(sessionId, fileName)
    if (!existsSync(path)) {
      return null
    }

    return {
      fileName,
      mediaType: mediaTypeForFileName(fileName),
      path,
      url: this.attachmentUrl(sessionId, fileName),
    }
  }

  readAttachmentBytes(
    url: string,
  ): { attachment: StoredAttachment; bytes: Buffer } | null {
    const attachment = this.resolveAttachment(url)
    if (!attachment) {
      return null
    }

    return {
      attachment,
      bytes: readBinaryFileSync(attachment.path),
    }
  }

  listQueuedUserMessages(sessionId: string): StoredMessage[] {
    const session = this.sessionCache.get(sessionId)
    if (!session) {
      return []
    }
    const activeParticipantId = activeProviderParticipantIdForSession(session)
    return this.listMessages(sessionId).filter(
      (message) =>
        queuedForParticipant(message, activeParticipantId) &&
        (message.role === "user" ||
          message.kind === "watchdogPrompt" ||
          message.kind === "ticketEvent" ||
          (message.role === "assistant" &&
            message.authorParticipantId !== activeParticipantId)),
    )
  }

  appendMessage(sessionId: string, input: AppendMessageInput): StoredMessage {
    const session = this.sessionCache.get(sessionId)
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`)
    }

    const createdAtMs = Date.now()
    const authorParticipantId = resolveMessageAuthorParticipantId(
      session,
      input,
    )
    const authorParticipant = findParticipant(
      session.participants,
      authorParticipantId,
    )
    const defaultVisibility = normalizeDefaultVisibility(
      input.defaultVisibility ?? authorParticipant?.defaultVisibility ?? "none",
    )
    const visibilityTags = normalizeVisibilityTags(
      input.visibilityTags ?? extractVisibilityTagsFromContent(input.content),
    )
    const visibilityResolution = buildVisibilityResolution({
      participants: session.participants,
      senderParticipantId: authorParticipantId,
      senderDefaultVisibility: defaultVisibility,
      tagOverrides: visibilityTags,
      resolvedAtMs: createdAtMs,
    })
    const activeProviderParticipantId = resolveActiveProviderParticipantId(
      session.participants,
      session.providerKind,
    )
    const deliveryRecords = visibilityResolution.audienceParticipantIds
      .map((participantId) =>
        findParticipant(session.participants, participantId),
      )
      .filter(
        (participant): participant is AgentChatParticipant =>
          participant !== null,
      )
      .map((participant) => {
        const baseRecord = createPendingDeliveryRecord(participant, createdAtMs)
        if (
          participant.participantId === activeProviderParticipantId &&
          input.providerSeenAtMs !== null &&
          input.providerSeenAtMs !== undefined
        ) {
          return markDeliveryRecord(baseRecord, "seen", input.providerSeenAtMs)
        }
        return baseRecord
      }) as DeliveryRecord[]
    const message: StoredMessage = {
      id: randomUUID(),
      sessionId,
      role: input.role,
      kind: input.kind ?? "chat",
      replyToMessageId: input.replyToMessageId ?? null,
      ticketId: input.ticketId?.trim() || null,
      authorParticipantId,
      authorHost: authorParticipant?.host ?? "manager",
      defaultVisibility,
      visibilityTags,
      visibilityResolution,
      deliveryRecords,
      providerSeenAtMs:
        input.providerSeenAtMs === undefined
          ? createdAtMs
          : input.providerSeenAtMs,
      content: input.content,
      createdAtMs,
    }

    const nextMessages = [...(this.messageCache.get(sessionId) ?? []), message]
    this.messageCache.set(sessionId, nextMessages)

    const nextSession: StoredSession = {
      ...session,
      updatedAtMs: createdAtMs,
      preview: summarizePreview(nextMessages),
      messageCount: nextMessages.length,
    }

    this.writeSessionMetadata(nextSession)
    appendFileSync(this.messagesPath(sessionId), `${JSON.stringify(message)}\n`)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "message-appended",
    })
    return message
  }

  updateMessageContent(
    sessionId: string,
    messageId: string,
    content: StoredMessage["content"],
  ): StoredMessage | null {
    return this.updateMessage(sessionId, messageId, { content })
  }

  updateMessage(
    sessionId: string,
    messageId: string,
    input: {
      content?: StoredMessage["content"]
      kind?: StoredMessage["kind"]
      providerSeenAtMs?: number | null
      replyToMessageId?: string | null
      ticketId?: string | null
    },
  ): StoredMessage | null {
    const currentMessages = this.messageCache.get(sessionId)
    const currentSession = this.sessionCache.get(sessionId)
    if (!currentMessages?.length || !currentSession) {
      return null
    }

    let updatedMessage: StoredMessage | null = null
    const nextMessages = currentMessages.map((message) => {
      if (message.id !== messageId) {
        return message
      }
      const nextContent = input.content ?? message.content
      const nextVisibilityTags = normalizeVisibilityTags(
        extractVisibilityTagsFromContent(nextContent),
      )
      const nextVisibilityResolution = buildVisibilityResolution({
        participants: currentSession.participants,
        senderParticipantId: message.authorParticipantId,
        senderDefaultVisibility: message.defaultVisibility,
        tagOverrides: nextVisibilityTags,
        resolvedAtMs: Date.now(),
      })
      updatedMessage = {
        ...message,
        content: nextContent,
        kind: input.kind ?? message.kind,
        providerSeenAtMs:
          input.providerSeenAtMs === undefined
            ? message.providerSeenAtMs
            : input.providerSeenAtMs,
        replyToMessageId:
          input.replyToMessageId === undefined
            ? message.replyToMessageId
            : input.replyToMessageId,
        ticketId:
          input.ticketId === undefined ? message.ticketId : input.ticketId,
        visibilityTags: nextVisibilityTags,
        visibilityResolution: nextVisibilityResolution,
        deliveryRecords: reconcileDeliveryRecords(
          currentSession.participants,
          message.deliveryRecords,
          nextVisibilityResolution,
        ),
      }
      return updatedMessage
    })

    if (!updatedMessage) {
      return null
    }

    const nextSession: StoredSession = {
      ...currentSession,
      updatedAtMs: Date.now(),
      preview: summarizePreview(nextMessages),
      messageCount: nextMessages.length,
    }

    this.messageCache.set(sessionId, nextMessages)
    this.writeSessionMetadata(nextSession)
    this.writeMessagesFile(sessionId, nextMessages)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "message-visibility-updated",
    })
    return updatedMessage
  }

  updateSessionTitle(sessionId: string, title: string): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    const nextTitle = title.trim()
    if (!current || !nextTitle) {
      return current ?? null
    }

    const nextSession: StoredSession = {
      ...current,
      title: nextTitle,
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  updateSessionArchived(
    sessionId: string,
    archived: boolean,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    if (!current || current.archived === archived) {
      return current ?? null
    }

    const nextSession: StoredSession = {
      ...current,
      archived,
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    return nextSession
  }

  updateSessionProcessBlueprint(
    sessionId: string,
    processBlueprintId: string | null,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    const normalizedId = processBlueprintId?.trim() || null
    if (!current || current.processBlueprintId === normalizedId) {
      return current ?? null
    }

    const nextSession: StoredSession = {
      ...current,
      processBlueprintId: normalizedId,
      watchdogState: defaultWatchdogState(normalizedId),
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  updateSessionWatchdogState(
    sessionId: string,
    watchdogState: SessionWatchdogState,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    if (!current) {
      return null
    }

    const nextSession: StoredSession = {
      ...current,
      watchdogState: {
        status: watchdogState.status,
        nudgeCount: watchdogState.nudgeCount,
        lastNudgedAtMs: watchdogState.lastNudgedAtMs,
        completedAtMs: watchdogState.completedAtMs,
      },
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  resetSessionWatchdogState(sessionId: string): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    if (!current) {
      return null
    }
    return this.updateSessionWatchdogState(
      sessionId,
      defaultWatchdogState(current.processBlueprintId),
    )
  }

  updateProviderThread(
    sessionId: string,
    input: { threadId: string | null; threadPath: string | null },
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    if (!current) {
      return null
    }

    const nextSession: StoredSession = {
      ...current,
      providerThreadId: input.threadId,
      providerThreadPath: input.threadPath,
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  updateSessionCwd(sessionId: string, cwd: string): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    const nextCwd = cwd.trim()
    if (!current || !nextCwd) {
      return current ?? null
    }

    const nextSession: StoredSession = {
      ...current,
      cwd: nextCwd,
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  updateSessionProviderSettings(
    sessionId: string,
    input: {
      providerKind: AgentChatProviderKind
      modelRef: string
      authProfile: string | null
      imageModelRef: string | null
      clearProviderThread?: boolean
    },
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    const nextModelRef = input.modelRef.trim()
    if (!current || !nextModelRef) {
      return current ?? null
    }

    const clearProviderThread = input.clearProviderThread ?? true
    const nextSession: StoredSession = {
      ...current,
      providerKind: input.providerKind,
      modelRef: nextModelRef,
      authProfile: input.authProfile?.trim() || null,
      imageModelRef: input.imageModelRef?.trim() || null,
      providerThreadId: clearProviderThread ? null : current.providerThreadId,
      providerThreadPath: clearProviderThread
        ? null
        : current.providerThreadPath,
      participants: ensureParticipantDefaultsTargetProvider(
        ensureProviderParticipant(
          current.participants,
          input.providerKind,
          current.createdAtMs,
        ),
        input.providerKind,
      ),
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  queuePendingSystemInstruction(
    sessionId: string,
    instruction: string,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    if (!current) {
      return null
    }

    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: current.pendingSystemInstruction
        ? `${current.pendingSystemInstruction}\n${instruction}`
        : instruction,
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  replacePendingSystemInstructionByPrefix(
    sessionId: string,
    prefix: string,
    instruction: string,
  ): StoredSession | null {
    const current = this.sessionCache.get(sessionId)
    if (!current) {
      return null
    }

    const existingLines = current.pendingSystemInstruction
      ? current.pendingSystemInstruction
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !line.startsWith(prefix))
      : []
    existingLines.push(instruction)

    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction: existingLines.join("\n"),
      updatedAtMs: Date.now(),
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return nextSession
  }

  consumePendingSystemInstruction(
    sessionId: string,
    options?: PendingInstructionConsumeOptions,
  ): string | null {
    const current = this.sessionCache.get(sessionId)
    if (!current?.pendingSystemInstruction) {
      return null
    }

    const excludePrefixes = options?.excludePrefixes?.filter(Boolean) ?? []
    const instructionLines = current.pendingSystemInstruction
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    const retainedLines: string[] = []
    const consumedLines: string[] = []

    for (const line of instructionLines) {
      if (excludePrefixes.some((prefix) => line.startsWith(prefix))) {
        retainedLines.push(line)
      } else {
        consumedLines.push(line)
      }
    }

    if (consumedLines.length === 0) {
      return null
    }

    const instruction = consumedLines.join("\n")
    const nextSession: StoredSession = {
      ...current,
      pendingSystemInstruction:
        retainedLines.length > 0 ? retainedLines.join("\n") : null,
    }
    this.writeSessionMetadata(nextSession)
    this.sessionCache.set(sessionId, nextSession)
    const consumedText = new Set(consumedLines)
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => {
        if (message.role !== "system") {
          return false
        }
        const firstText = message.content.find((block) => block.type === "text")
        return (
          firstText?.type === "text" && consumedText.has(firstText.text.trim())
        )
      })
      .map((message) => message.id)
    this.markMessagesSeen(sessionId, messageIds)
    this.notifyCanonicalWrite({
      sessionId,
      reason: "session-metadata-updated",
    })
    return instruction
  }

  markQueuedDirectoryInstructionsSeen(
    sessionId: string,
    seenAtMs = Date.now(),
  ) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => message.role === "system")
      .map((message) => message.id)
    this.markMessagesSeen(sessionId, messageIds, seenAtMs)
  }

  markQueuedSystemMessagesSeen(sessionId: string, seenAtMs = Date.now()) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => message.role === "system")
      .map((message) => message.id)
    this.markMessagesSeen(sessionId, messageIds, seenAtMs)
  }

  markQueuedSystemMessagesSeenByPrefix(
    sessionId: string,
    prefix: string,
    seenAtMs = Date.now(),
  ) {
    const messageIds = this.listQueuedMessages(sessionId)
      .filter((message) => {
        if (message.role !== "system") {
          return false
        }
        const firstText = message.content.find((block) => block.type === "text")
        return firstText?.type === "text" && firstText.text.startsWith(prefix)
      })
      .map((message) => message.id)
    this.markMessagesSeen(sessionId, messageIds, seenAtMs)
  }

  markMessagesSeen(
    sessionId: string,
    messageIds: string[],
    seenAtMs = Date.now(),
    participantId?: string,
  ) {
    if (messageIds.length === 0) {
      return
    }

    const currentMessages = this.messageCache.get(sessionId)
    const currentSession = this.sessionCache.get(sessionId)
    if (!currentMessages?.length || !currentSession) {
      return
    }

    const activeProviderParticipantId =
      participantId ?? activeProviderParticipantIdForSession(currentSession)
    const targets = new Set(messageIds)
    let changed = false
    const nextMessages = currentMessages.map((message) => {
      if (!targets.has(message.id)) {
        return message
      }
      let updated = false
      const nextDeliveryRecords = message.deliveryRecords.map((record) => {
        if (record.recipientParticipantId !== activeProviderParticipantId) {
          return record
        }
        if (record.status === "seen") {
          return record
        }
        updated = true
        return markDeliveryRecord(record, "seen", seenAtMs)
      })
      if (!updated) {
        return message
      }
      changed = true
      return {
        ...message,
        providerSeenAtMs:
          message.providerSeenAtMs === null
            ? seenAtMs
            : message.providerSeenAtMs,
        deliveryRecords: nextDeliveryRecords,
      }
    })

    if (!changed) {
      return
    }

    this.messageCache.set(sessionId, nextMessages)
    this.writeMessagesFile(sessionId, nextMessages)
    const metadata = this.readSessionMetadata(sessionId)
    this.sessionCache.set(sessionId, sessionSummary(metadata, nextMessages))
    this.notifyCanonicalWrite({
      sessionId,
      reason: "message-visibility-updated",
    })
  }

  private notifyCanonicalWrite(event: CanonicalWriteEvent) {
    try {
      this.onCanonicalWrite?.(event)
    } catch {}
  }

  private loadCache() {
    this.sessionCache.clear()
    this.messageCache.clear()

    for (const sessionId of this.listSessionDirectories()) {
      const metadata = this.readSessionMetadata(sessionId)
      const summary = sessionSummary(metadata, [])
      const messages = this.readMessages(summary)
      const hydratedSummary = sessionSummary(summary, messages)
      this.sessionCache.set(sessionId, hydratedSummary)
      this.messageCache.set(sessionId, messages)
    }
  }

  private listSessionDirectories() {
    if (!existsSync(this.sessionsDir)) {
      return []
    }

    return readdirSync(this.sessionsDir).filter((entry) => {
      try {
        return statSync(join(this.sessionsDir, entry)).isDirectory()
      } catch {
        return false
      }
    })
  }

  private sessionDir(sessionId: string) {
    return join(this.sessionsDir, sessionId)
  }

  private sessionMetadataPath(sessionId: string) {
    return join(this.sessionDir(sessionId), "session.json")
  }

  private messagesPath(sessionId: string) {
    return join(this.sessionDir(sessionId), "messages.jsonl")
  }

  private attachmentDir(sessionId: string) {
    return join(this.sessionDir(sessionId), "attachments")
  }

  private attachmentPath(sessionId: string, fileName: string) {
    return join(this.attachmentDir(sessionId), fileName)
  }

  private attachmentUrl(sessionId: string, fileName: string) {
    return `${attachmentRoutePrefix}/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(fileName)}`
  }

  private writeSessionFiles(
    metadata: SessionMetadata,
    messages: StoredMessage[],
  ) {
    mkdirSync(this.sessionDir(metadata.id), { recursive: true })
    mkdirSync(dirname(this.sessionMetadataPath(metadata.id)), {
      recursive: true,
    })
    mkdirSync(dirname(this.messagesPath(metadata.id)), { recursive: true })
    writeFileSync(
      this.sessionMetadataPath(metadata.id),
      `${JSON.stringify(metadata, null, 2)}\n`,
    )
    this.writeMessagesFile(metadata.id, messages)
  }

  private writeMessagesFile(sessionId: string, messages: StoredMessage[]) {
    mkdirSync(dirname(this.messagesPath(sessionId)), { recursive: true })
    const lines = messages.map((message) => JSON.stringify(message)).join("\n")
    writeFileSync(this.messagesPath(sessionId), lines ? `${lines}\n` : "")
  }

  private writeSessionMetadata(session: StoredSession) {
    const metadata: SessionMetadata = {
      id: session.id,
      title: session.title,
      archived: session.archived,
      processBlueprintId: session.processBlueprintId,
      watchdogState: session.watchdogState,
      providerKind: session.providerKind,
      modelRef: session.modelRef,
      cwd: session.cwd,
      pendingSystemInstruction: session.pendingSystemInstruction,
      authProfile: session.authProfile,
      imageModelRef: session.imageModelRef,
      providerThreadId: session.providerThreadId,
      providerThreadPath: session.providerThreadPath,
      participants: session.participants,
      createdAtMs: session.createdAtMs,
      updatedAtMs: session.updatedAtMs,
    }
    mkdirSync(this.sessionDir(session.id), { recursive: true })
    mkdirSync(dirname(this.sessionMetadataPath(session.id)), {
      recursive: true,
    })
    writeFileSync(
      this.sessionMetadataPath(session.id),
      `${JSON.stringify(metadata, null, 2)}\n`,
    )
  }

  private readSessionMetadata(sessionId: string): SessionMetadata {
    const parsed = safeJsonParse<Partial<SessionMetadata>>(
      readFileSync(this.sessionMetadataPath(sessionId), "utf8"),
    )
    if (!parsed) {
      throw new Error(`failed to parse session metadata for ${sessionId}`)
    }
    const createdAtMs = Number(parsed.createdAtMs)
    const providerKind = parsed.providerKind as AgentChatProviderKind
    return {
      id: String(parsed.id),
      title: String(parsed.title),
      archived: Boolean(parsed.archived),
      processBlueprintId: parsed.processBlueprintId
        ? String(parsed.processBlueprintId)
        : null,
      watchdogState: {
        status:
          parsed.watchdogState?.status === "blocked" ||
          parsed.watchdogState?.status === "completed" ||
          parsed.watchdogState?.status === "nudged" ||
          parsed.watchdogState?.status === "unresolved"
            ? parsed.watchdogState.status
            : parsed.processBlueprintId
              ? "unresolved"
              : "unconfigured",
        nudgeCount:
          parsed.watchdogState?.nudgeCount === null ||
          parsed.watchdogState?.nudgeCount === undefined
            ? 0
            : Number(parsed.watchdogState.nudgeCount),
        lastNudgedAtMs:
          parsed.watchdogState?.lastNudgedAtMs === null ||
          parsed.watchdogState?.lastNudgedAtMs === undefined
            ? null
            : Number(parsed.watchdogState.lastNudgedAtMs),
        completedAtMs:
          parsed.watchdogState?.completedAtMs === null ||
          parsed.watchdogState?.completedAtMs === undefined
            ? null
            : Number(parsed.watchdogState.completedAtMs),
      },
      providerKind,
      modelRef: String(parsed.modelRef),
      cwd: String(parsed.cwd || "/home/ec2-user/workspace"),
      pendingSystemInstruction: parsed.pendingSystemInstruction
        ? String(parsed.pendingSystemInstruction)
        : null,
      authProfile: parsed.authProfile ? String(parsed.authProfile) : null,
      imageModelRef: parsed.imageModelRef ? String(parsed.imageModelRef) : null,
      providerThreadId: parsed.providerThreadId
        ? String(parsed.providerThreadId)
        : null,
      providerThreadPath: parsed.providerThreadPath
        ? String(parsed.providerThreadPath)
        : null,
      participants: normalizeStoredParticipants(
        parsed.participants as AgentChatParticipant[] | undefined,
        providerKind,
        createdAtMs,
      ),
      createdAtMs,
      updatedAtMs: Number(parsed.updatedAtMs),
    }
  }

  private readMessages(session: StoredSession): StoredMessage[] {
    const path = this.messagesPath(session.id)
    if (!existsSync(path)) {
      return []
    }

    const raw = readFileSync(path, "utf8")
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parsed = safeJsonParse<Partial<StoredMessage>>(line)
        if (!parsed) {
          console.error(
            `[agent-chat-store] skipped unreadable message line sessionId=${session.id} path=${path} line=${index + 1}`,
          )
          return null
        }
        const providerSeenAtMs =
          parsed.providerSeenAtMs === null ||
          parsed.providerSeenAtMs === undefined
            ? null
            : Number(parsed.providerSeenAtMs)
        const authorParticipantId = normalizeAuthorParticipantId(
          parsed.authorParticipantId,
          parsed.role as StoredMessage["role"],
          session,
        )
        const defaultVisibility = normalizeDefaultVisibility(
          (parsed.defaultVisibility as DefaultVisibility | undefined) ??
            findParticipant(session.participants, authorParticipantId)
              ?.defaultVisibility ??
            "none",
        )
        const visibilityTags = normalizeVisibilityTags(
          Array.isArray(parsed.visibilityTags)
            ? (parsed.visibilityTags as string[])
            : extractVisibilityTagsFromContent(
                (parsed.content ?? []) as StoredMessage["content"],
              ),
        )
        const visibilityResolution = normalizeVisibilityResolutionForMessage({
          session,
          authorParticipantId,
          defaultVisibility,
          visibilityTags,
          createdAtMs: Number(parsed.createdAtMs),
          rawVisibilityResolution:
            (parsed.visibilityResolution as
              | Partial<VisibilityResolution>
              | undefined) ?? null,
        })
        const message = {
          id: String(parsed.id),
          sessionId: String(parsed.sessionId),
          role: parsed.role as StoredMessage["role"],
          kind:
            parsed.kind === "directoryInstruction"
              ? "directoryInstruction"
              : parsed.kind === "activity"
                ? "activity"
                : parsed.kind === "ticketEvent"
                  ? "ticketEvent"
                  : parsed.kind === "watchdogPrompt"
                    ? "watchdogPrompt"
                    : parsed.kind === "streamCheckpoint"
                      ? "streamCheckpoint"
                      : parsed.kind === "thought"
                        ? "thought"
                        : "chat",
          replyToMessageId: parsed.replyToMessageId
            ? String(parsed.replyToMessageId)
            : null,
          ticketId:
            typeof parsed.ticketId === "string" && parsed.ticketId.trim()
              ? parsed.ticketId
              : null,
          authorParticipantId,
          authorHost:
            typeof parsed.authorHost === "string" && parsed.authorHost.trim()
              ? (parsed.authorHost as ParticipantHost)
              : (findParticipant(session.participants, authorParticipantId)
                  ?.host ?? "manager"),
          defaultVisibility,
          visibilityTags,
          visibilityResolution,
          deliveryRecords: normalizeDeliveryRecordsForMessage({
            session,
            visibilityResolution,
            rawDeliveryRecords: Array.isArray(parsed.deliveryRecords)
              ? (parsed.deliveryRecords as DeliveryRecord[])
              : undefined,
            providerSeenAtMs,
          }),
          providerSeenAtMs,
          content: (parsed.content ?? []) as StoredMessage["content"],
          createdAtMs: Number(parsed.createdAtMs),
        } satisfies StoredMessage
        return message
      })
      .filter((message): message is StoredMessage => message !== null)
      .sort((left, right) => {
        if (left.createdAtMs !== right.createdAtMs) {
          return left.createdAtMs - right.createdAtMs
        }
        return left.id.localeCompare(right.id)
      })
  }

  private importLegacySqliteIfNeeded(legacySqlitePath: string | null) {
    if (!legacySqlitePath || !existsSync(legacySqlitePath)) {
      return
    }

    if (this.listSessionDirectories().length > 0) {
      return
    }

    const legacyDb = new Database(legacySqlitePath, {
      create: false,
      readonly: true,
    })

    try {
      const tables = new Set(
        (
          legacyDb
            .query(`SELECT name FROM sqlite_master WHERE type = 'table'`)
            .all() as Array<{
            name: string
          }>
        ).map((row) => row.name),
      )

      if (!tables.has("sessions") || !tables.has("messages")) {
        return
      }

      const sessionColumns = new Set(
        (
          legacyDb.query(`PRAGMA table_info(sessions)`).all() as Array<{
            name: string
          }>
        ).map((row) => row.name),
      )
      const messageColumns = new Set(
        (
          legacyDb.query(`PRAGMA table_info(messages)`).all() as Array<{
            name: string
          }>
        ).map((row) => row.name),
      )
      const legacyHasCwd = sessionColumns.has("cwd")

      const sessionRows = legacyDb
        .query(`
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
      `)
        .all() as Array<Record<string, unknown>>

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
      `)

      for (const row of sessionRows) {
        const metadata: SessionMetadata = {
          id: String(row.id),
          title: String(row.title),
          archived: false,
          processBlueprintId: null,
          watchdogState: defaultWatchdogState(null),
          providerKind: row.provider_kind as AgentChatProviderKind,
          modelRef: String(row.model_ref),
          cwd: row.cwd ? String(row.cwd) : "/home/ec2-user/workspace",
          pendingSystemInstruction: row.pending_system_instruction
            ? String(row.pending_system_instruction)
            : null,
          authProfile: row.auth_profile ? String(row.auth_profile) : null,
          imageModelRef: row.image_model_ref
            ? String(row.image_model_ref)
            : null,
          providerThreadId: row.provider_thread_id
            ? String(row.provider_thread_id)
            : null,
          providerThreadPath: row.provider_thread_path
            ? String(row.provider_thread_path)
            : null,
          participants: defaultParticipantsForProvider(
            row.provider_kind as AgentChatProviderKind,
            Number(row.created_at_ms),
          ),
          createdAtMs: Number(row.created_at_ms),
          updatedAtMs: Number(row.updated_at_ms),
        }
        const legacySession = sessionSummary(metadata, [])

        const messages = messageQuery.all(metadata.id).map((messageRow) => {
          const rowObject = messageRow as Record<string, unknown>
          const role = rowObject.role as StoredMessage["role"]
          const providerSeenAtMs =
            rowObject.provider_seen_at_ms === null ||
            rowObject.provider_seen_at_ms === undefined
              ? null
              : Number(rowObject.provider_seen_at_ms)
          const content =
            safeJsonParse<StoredMessage["content"]>(
              String(rowObject.content_json),
            ) ?? []
          const authorParticipantId = normalizeAuthorParticipantId(
            null,
            role,
            legacySession,
          )
          const defaultVisibility = normalizeDefaultVisibility(
            findParticipant(legacySession.participants, authorParticipantId)
              ?.defaultVisibility ?? "none",
          )
          const visibilityTags = extractVisibilityTagsFromContent(content)
          const visibilityResolution = buildVisibilityResolution({
            participants: legacySession.participants,
            senderParticipantId: authorParticipantId,
            senderDefaultVisibility: defaultVisibility,
            tagOverrides: visibilityTags,
            resolvedAtMs: Number(rowObject.created_at_ms),
          })
          return {
            id: String(rowObject.id),
            sessionId: String(rowObject.session_id),
            role,
            kind:
              rowObject.kind === "directoryInstruction"
                ? "directoryInstruction"
                : "chat",
            replyToMessageId: rowObject.reply_to_message_id
              ? String(rowObject.reply_to_message_id)
              : null,
            ticketId: null,
            authorParticipantId,
            authorHost:
              findParticipant(legacySession.participants, authorParticipantId)
                ?.host ?? "manager",
            defaultVisibility,
            visibilityTags,
            visibilityResolution,
            deliveryRecords: normalizeDeliveryRecordsForMessage({
              session: legacySession,
              visibilityResolution,
              rawDeliveryRecords: undefined,
              providerSeenAtMs,
            }),
            providerSeenAtMs,
            content,
            createdAtMs: Number(rowObject.created_at_ms),
          } satisfies StoredMessage
        })

        this.writeSessionFiles(metadata, messages)
      }
    } finally {
      legacyDb.close()
    }
  }
}

const attachmentUrlPattern =
  /^\/api\/agent-chat\/sessions\/([^/]+)\/attachments\/([^/]+)$/

function fileExtensionForMediaType(mediaType: string) {
  switch (mediaType) {
    case "image/jpeg":
      return "jpg"
    case "image/gif":
      return "gif"
    case "image/webp":
      return "webp"
    default:
      return "png"
  }
}

function mediaTypeForFileName(fileName: string) {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (normalized.endsWith(".gif")) {
    return "image/gif"
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp"
  }
  return "image/png"
}
