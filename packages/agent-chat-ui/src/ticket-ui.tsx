import type { ReactNode } from "react"

import type { AgentTicket, AgentTicketStep } from "./ticket-types"

export type TicketChecklistVariant = "compact" | "detail"

export function formatTicketTimestamp(timestampMs: number | null | undefined) {
  if (!timestampMs) {
    return null
  }
  try {
    return new Date(timestampMs).toLocaleString()
  } catch {
    return null
  }
}

export function ticketStatusLabel(ticket: AgentTicket | null) {
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

export function renderTicketChecklistItems(
  steps: AgentTicketStep[],
  options: { variant?: TicketChecklistVariant; depth?: number } = {},
): ReactNode[] {
  const variant = options.variant ?? "detail"
  const depth = options.depth ?? 0

  return steps.flatMap((step) => {
    const row =
      variant === "compact" ? (
        <p
          key={step.id}
          style={{ paddingLeft: `${depth * 0.875}rem` }}
          className={`text-xs leading-5 ${
            step.status === "completed"
              ? "text-slate-400 line-through"
              : step.status === "active"
                ? "text-white"
                : step.status === "blocked"
                  ? "text-rose-200"
                  : "text-slate-400"
          }`}
        >
          {step.status === "completed" ? "[x]" : "[ ]"} {step.title}
          {ticketStepKindLabel(step)}
          {step.status === "active" ? " <- current" : ""}
          {step.status === "blocked" ? " (blocked)" : ""}
        </p>
      ) : (
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

    return [
      row,
      ...renderTicketChecklistItems(step.steps, { variant, depth: depth + 1 }),
    ]
  })
}
