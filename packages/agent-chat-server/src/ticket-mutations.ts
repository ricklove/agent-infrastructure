import type { AgentTicketStore, StoredAgentTicket } from "./agent-tickets.js"
import type { AgentChatStore, StoredSession } from "./store.js"

export type ReassignTicketResult = {
  ticket: StoredAgentTicket
  previousSessionId: string
  targetSessionId: string
  createdSession: StoredSession | null
}

export function selectTicketStepMutation(input: {
  ticketStore: AgentTicketStore
  ticketId: string
  stepId: string
  checked: boolean
}) {
  return input.ticketStore.selectStepForTicket(
    input.ticketId,
    input.stepId,
    input.checked,
  )
}

export function reassignTicketMutation(input: {
  store: AgentChatStore
  ticketStore: AgentTicketStore
  ticketId: string
  targetSessionId?: string | null
  createSession?: boolean
}): ReassignTicketResult | null {
  const currentTicket = input.ticketStore.getTicket(input.ticketId)
  if (!currentTicket || currentTicket.status === "completed") {
    return null
  }

  let createdSession: StoredSession | null = null
  let nextSessionId = input.targetSessionId?.trim() || ""

  if (input.createSession) {
    const sourceSession = input.store.getSession(currentTicket.sessionId)
    if (!sourceSession) {
      return null
    }
    createdSession = input.store.createSession({
      title: currentTicket.title,
      providerKind: sourceSession.providerKind,
      modelRef: sourceSession.modelRef,
      cwd: sourceSession.cwd,
      authProfile: sourceSession.authProfile,
      imageModelRef: sourceSession.imageModelRef,
    })
    nextSessionId = createdSession.id
  }

  if (!nextSessionId || !input.store.getSession(nextSessionId)) {
    return null
  }

  const ticket = input.ticketStore.reassignTicketToSession(
    currentTicket.id,
    nextSessionId,
  )
  if (!ticket) {
    return null
  }

  return {
    ticket,
    previousSessionId: currentTicket.sessionId,
    targetSessionId: nextSessionId,
    createdSession,
  }
}
