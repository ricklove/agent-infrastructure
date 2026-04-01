import type { AgentChatProviderKind } from "./catalog.js"

export const USER_PARTICIPANT_ID = "user"
export const SYSTEM_PARTICIPANT_ID = "system"
export const LEGACY_AGENT_PARTICIPANT_ID = "legacy-agent"

export type ParticipantRole = "user" | "agent" | "system"
export type ParticipantHost = "manager" | `worker:${string}`
export type VisibilityTag = "@all" | `@${string}`
export type DeliveryStatus =
  | "pending"
  | "delivered"
  | "seen"
  | "failed"
  | "unreachable"

export type DefaultVisibility =
  | "none"
  | "all"
  | {
      type: "participant_list"
      participantIds: string[]
    }

export type AgentChatParticipant = {
  participantId: string
  role: ParticipantRole
  label: string
  host: ParticipantHost
  defaultVisibility: DefaultVisibility
  providerKind: AgentChatProviderKind | null
  createdAtMs: number
}

export type VisibilityResolution = {
  audienceParticipantIds: string[]
  tagOverrides: VisibilityTag[]
  resolvedFromDefaultVisibility: DefaultVisibility
  resolvedAtMs: number
}

export type DeliveryRecord = {
  recipientParticipantId: string
  recipientHost: ParticipantHost
  status: DeliveryStatus
  visibleAtMs: number
  pendingSinceMs: number | null
  deliveredAtMs: number | null
  seenAtMs: number | null
  error: string | null
}

export function participantIdForProvider(providerKind: AgentChatProviderKind) {
  return `agent:${providerKind}:manager`
}

export function displayLabelForProvider(providerKind: AgentChatProviderKind) {
  switch (providerKind) {
    case "codex-app-server":
      return "Codex"
    case "claude-agent-sdk":
      return "Claude"
    case "openrouter":
      return "OpenRouter"
    case "gemini":
      return "Gemini"
    default:
      return providerKind
  }
}

export function normalizeParticipantVisibilityList(participantIds: string[]) {
  const uniqueIds: string[] = []
  const seen = new Set<string>()
  for (const participantId of participantIds) {
    const trimmed = participantId.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    uniqueIds.push(trimmed)
  }
  return uniqueIds
}

export function normalizeDefaultVisibility(
  input: DefaultVisibility | string[] | null | undefined,
): DefaultVisibility {
  if (input === "none" || input === null || input === undefined) {
    return "none"
  }
  if (input === "all") {
    return "all"
  }
  const participantIds = Array.isArray(input)
    ? normalizeParticipantVisibilityList(input)
    : normalizeParticipantVisibilityList(input.participantIds)
  if (participantIds.length === 0) {
    return "none"
  }
  return {
    type: "participant_list",
    participantIds,
  }
}

export function normalizeVisibilityTags(tags: string[] | null | undefined) {
  const uniqueTags: VisibilityTag[] = []
  const seen = new Set<string>()
  for (const rawTag of tags ?? []) {
    const trimmed = rawTag.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    if (trimmed === "@all" || /^@[A-Za-z0-9:_-]+$/.test(trimmed)) {
      seen.add(trimmed)
      uniqueTags.push(trimmed as VisibilityTag)
    }
  }
  return uniqueTags
}

export function extractVisibilityTagsFromText(text: string) {
  const matches = text.match(/@[A-Za-z0-9:_-]+/g) ?? []
  return normalizeVisibilityTags(matches)
}

export function extractVisibilityTagsFromContent(
  content: Array<
    { type: "text"; text: string } | { type: "image"; url: string }
  >,
) {
  return normalizeVisibilityTags(
    content.flatMap((block) =>
      block.type === "text" ? extractVisibilityTagsFromText(block.text) : [],
    ),
  )
}

export function createPendingDeliveryRecord(
  participant: AgentChatParticipant,
  visibleAtMs: number,
): DeliveryRecord {
  return {
    recipientParticipantId: participant.participantId,
    recipientHost: participant.host,
    status: "pending",
    visibleAtMs,
    pendingSinceMs: visibleAtMs,
    deliveredAtMs: null,
    seenAtMs: null,
    error: null,
  }
}

export function markDeliveryRecord(
  record: DeliveryRecord,
  status: DeliveryStatus,
  atMs: number,
  error: string | null = null,
): DeliveryRecord {
  if (status === "pending") {
    return {
      ...record,
      status,
      pendingSinceMs: atMs,
      deliveredAtMs: null,
      seenAtMs: null,
      error: null,
    }
  }
  if (status === "delivered") {
    return {
      ...record,
      status,
      pendingSinceMs: record.pendingSinceMs ?? record.visibleAtMs,
      deliveredAtMs: atMs,
      seenAtMs: null,
      error: null,
    }
  }
  if (status === "seen") {
    return {
      ...record,
      status,
      pendingSinceMs: record.pendingSinceMs ?? record.visibleAtMs,
      deliveredAtMs: record.deliveredAtMs ?? atMs,
      seenAtMs: atMs,
      error: null,
    }
  }
  if (status === "unreachable") {
    return {
      ...record,
      status,
      pendingSinceMs: record.pendingSinceMs ?? atMs,
      deliveredAtMs: null,
      seenAtMs: null,
      error: error ?? "Participant unreachable.",
    }
  }
  return {
    ...record,
    status,
    pendingSinceMs: record.pendingSinceMs ?? atMs,
    deliveredAtMs: null,
    seenAtMs: null,
    error: error ?? "Delivery failed.",
  }
}

export function defaultParticipantsForProvider(
  providerKind: AgentChatProviderKind,
  createdAtMs: number,
): AgentChatParticipant[] {
  const defaultAgentParticipantId = participantIdForProvider(providerKind)
  return [
    {
      participantId: USER_PARTICIPANT_ID,
      role: "user",
      label: "User",
      host: "manager",
      defaultVisibility: {
        type: "participant_list",
        participantIds: [defaultAgentParticipantId],
      },
      providerKind: null,
      createdAtMs,
    },
    {
      participantId: SYSTEM_PARTICIPANT_ID,
      role: "system",
      label: "System",
      host: "manager",
      defaultVisibility: {
        type: "participant_list",
        participantIds: [defaultAgentParticipantId],
      },
      providerKind: null,
      createdAtMs,
    },
    {
      participantId: participantIdForProvider("codex-app-server"),
      role: "agent",
      label: displayLabelForProvider("codex-app-server"),
      host: "manager",
      defaultVisibility: "none",
      providerKind: "codex-app-server",
      createdAtMs,
    },
    {
      participantId: participantIdForProvider("claude-agent-sdk"),
      role: "agent",
      label: displayLabelForProvider("claude-agent-sdk"),
      host: "manager",
      defaultVisibility: "none",
      providerKind: "claude-agent-sdk",
      createdAtMs,
    },
  ]
}

export function legacySessionParticipants(
  createdAtMs: number,
): AgentChatParticipant[] {
  return [
    {
      participantId: USER_PARTICIPANT_ID,
      role: "user",
      label: "User",
      host: "manager",
      defaultVisibility: {
        type: "participant_list",
        participantIds: [LEGACY_AGENT_PARTICIPANT_ID],
      },
      providerKind: null,
      createdAtMs,
    },
    {
      participantId: SYSTEM_PARTICIPANT_ID,
      role: "system",
      label: "System",
      host: "manager",
      defaultVisibility: {
        type: "participant_list",
        participantIds: [LEGACY_AGENT_PARTICIPANT_ID],
      },
      providerKind: null,
      createdAtMs,
    },
    {
      participantId: LEGACY_AGENT_PARTICIPANT_ID,
      role: "agent",
      label: "Legacy agent",
      host: "manager",
      defaultVisibility: "none",
      providerKind: null,
      createdAtMs,
    },
  ]
}

export function resolveActiveProviderParticipantId(
  participants: AgentChatParticipant[],
  providerKind: AgentChatProviderKind,
) {
  const directMatch = participants.find(
    (participant) =>
      participant.role === "agent" &&
      participant.host === "manager" &&
      participant.providerKind === providerKind,
  )
  if (directMatch) {
    return directMatch.participantId
  }
  const legacy = participants.find(
    (participant) => participant.participantId === LEGACY_AGENT_PARTICIPANT_ID,
  )
  if (legacy) {
    return legacy.participantId
  }
  return participantIdForProvider(providerKind)
}

export function ensureParticipantDefaultsTargetProvider(
  participants: AgentChatParticipant[],
  providerKind: AgentChatProviderKind,
) {
  const targetParticipantId = resolveActiveProviderParticipantId(
    participants,
    providerKind,
  )
  return participants.map((participant) => {
    if (
      participant.participantId !== USER_PARTICIPANT_ID &&
      participant.participantId !== SYSTEM_PARTICIPANT_ID
    ) {
      return participant
    }
    return {
      ...participant,
      defaultVisibility: normalizeDefaultVisibility([targetParticipantId]),
    }
  })
}

export function buildVisibilityResolution(args: {
  participants: AgentChatParticipant[]
  senderParticipantId: string
  senderDefaultVisibility: DefaultVisibility
  tagOverrides: VisibilityTag[]
  resolvedAtMs: number
}) {
  const agentParticipants = args.participants.filter(
    (participant) =>
      participant.role === "agent" &&
      participant.participantId !== args.senderParticipantId,
  )
  const recipients = new Set<string>()
  const normalizedDefault = normalizeDefaultVisibility(
    args.senderDefaultVisibility,
  )
  if (normalizedDefault === "all") {
    for (const participant of agentParticipants) {
      recipients.add(participant.participantId)
    }
  } else if (normalizedDefault !== "none") {
    for (const participantId of normalizedDefault.participantIds) {
      if (
        participantId !== args.senderParticipantId &&
        agentParticipants.some(
          (participant) => participant.participantId === participantId,
        )
      ) {
        recipients.add(participantId)
      }
    }
  }

  for (const tag of args.tagOverrides) {
    if (tag === "@all") {
      for (const participant of agentParticipants) {
        recipients.add(participant.participantId)
      }
      continue
    }
    const targetParticipantId = tag.slice(1)
    if (
      targetParticipantId &&
      targetParticipantId !== args.senderParticipantId &&
      agentParticipants.some(
        (participant) => participant.participantId === targetParticipantId,
      )
    ) {
      recipients.add(targetParticipantId)
    }
  }

  return {
    audienceParticipantIds: [...recipients],
    tagOverrides: args.tagOverrides,
    resolvedFromDefaultVisibility: normalizedDefault,
    resolvedAtMs: args.resolvedAtMs,
  } satisfies VisibilityResolution
}
