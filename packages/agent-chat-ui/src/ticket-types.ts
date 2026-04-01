export const activateAgentChatSessionEventName = "agent-chat-activate-session"

export type AgentTicketDecisionOption = {
  id: string
  title: string
  goto: string | null
  next: boolean
  block: boolean
  complete: boolean
  steps: AgentTicketStep[]
}

export type AgentTicketStep = {
  id: string
  title: string
  kind: "task" | "wait" | "decision"
  status: "pending" | "active" | "completed" | "blocked"
  doneToken: string | null
  blockedToken: string | null
  decision: {
    prompt: string
    options: AgentTicketDecisionOption[]
  } | null
  steps: AgentTicketStep[]
}

export type AgentTicket = {
  id: string
  sessionId: string
  title: string
  description: string
  processBlueprintId: string
  processSnapshotId?: string | null
  processTitle: string
  status: "active" | "completed" | "blocked"
  currentStepId: string | null
  nextStepId: string | null
  nextStepLabel: string | null
  checklist: AgentTicketStep[]
  resolution: string | null
  createdAtMs: number
  updatedAtMs: number
}
