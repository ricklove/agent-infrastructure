import type { ReactNode } from "react"

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

function formatTimestamp(timestampMs: number | null | undefined) {
  if (!timestampMs) {
    return null
  }
  try {
    return new Date(timestampMs).toLocaleString()
  } catch {
    return null
  }
}

function activeTicketStatusLabel(ticket: AgentTicket | null) {
  if (!ticket) {
    return null
  }
  if (ticket.status === "completed") {
    return ticket.resolution ? `Done: ${ticket.resolution}` : "Ticket complete"
  }
  if (ticket.status === "blocked") {
    return ticket.resolution
      ? `Blocked: ${ticket.resolution}`
      : ticket.nextStepLabel
        ? `Blocked: ${ticket.nextStepLabel}`
        : "Ticket blocked"
  }
  if (ticket.nextStepLabel) {
    return `Next: ${ticket.nextStepLabel}`
  }
  return ticket.title
}

function ticketStepKindLabel(step: AgentTicketStep) {
  if (step.kind === "wait") {
    return " [wait]"
  }
  if (step.kind === "decision") {
    return " [decision]"
  }
  return ""
}

function renderChecklistItems(
  steps: AgentTicketStep[],
  depth = 0,
): ReactNode[] {
  return steps.flatMap((step) => {
    const row = (
      <div
        key={step.id}
        style={{ paddingLeft: `${depth * 0.875}rem` }}
        className={`leading-5 ${
          step.status === "completed"
            ? "text-slate-500"
            : step.status === "active"
              ? "text-white"
              : step.status === "blocked"
                ? "text-rose-200"
                : "text-slate-400"
        }`}
      >
        <span className="mr-2 inline-block w-7 text-slate-500">
          {step.status === "completed" ? "[x]" : "[ ]"}
        </span>
        <span className={step.status === "completed" ? "line-through" : ""}>
          {step.title}
        </span>
        <span className="text-slate-500">{ticketStepKindLabel(step)}</span>
        {step.status === "active" ? (
          <span className="ml-2 text-cyan-200">&lt;- current</span>
        ) : null}
        {step.status === "blocked" ? (
          <span className="ml-2 text-rose-200">(blocked)</span>
        ) : null}
      </div>
    )
    return [row, ...renderChecklistItems(step.steps, depth + 1)]
  })
}

export function TicketView(props: {
  ticket: AgentTicket | null
  loading?: boolean
  error?: string | null
}) {
  if (props.loading) {
    return (
      <div className="px-3 py-2 text-xs text-slate-400">Loading ticket...</div>
    )
  }

  if (props.error) {
    return <div className="px-3 py-2 text-xs text-rose-200">{props.error}</div>
  }

  if (!props.ticket) {
    return (
      <div className="px-3 py-2 text-xs text-slate-500">
        Ticket data is unavailable.
      </div>
    )
  }

  const updatedLabel = formatTimestamp(props.ticket.updatedAtMs)

  return (
    <div className="space-y-2 px-3 py-2 text-[12px] leading-5 text-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
              ticket
            </span>
            {activeTicketStatusLabel(props.ticket) ? (
              <span className="text-[11px] text-emerald-200/90">
                {activeTicketStatusLabel(props.ticket)}
              </span>
            ) : null}
          </div>
          <div className="mt-1 break-words text-[11px] text-slate-500">
            {props.ticket.processTitle}
          </div>
        </div>
        <div className="shrink-0 text-right text-[10px] text-slate-500">
          {updatedLabel ? <div>{updatedLabel}</div> : null}
          <div className="mt-1 font-mono text-[10px] text-slate-600">
            {props.ticket.id.slice(0, 8)}
          </div>
        </div>
      </div>

      {props.ticket.currentStepId ? (
        <div className="text-[11px] text-cyan-100/85">
          Current: {props.ticket.currentStepId}
        </div>
      ) : null}

      {props.ticket.resolution ? (
        <div className="text-[11px] text-amber-100/85">
          Resolution: {props.ticket.resolution}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-slate-950/55 px-2 py-2">
        <div className="space-y-1 font-mono text-[11px]">
          {renderChecklistItems(props.ticket.checklist)}
        </div>
      </div>
    </div>
  )
}
