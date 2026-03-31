import type { AgentTicket } from "./ticket-types"
import {
  formatTicketTimestamp,
  renderTicketChecklistItems,
  ticketStatusLabel,
} from "./ticket-ui"

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

  const updatedLabel = formatTicketTimestamp(props.ticket.updatedAtMs)
  const statusLabel = ticketStatusLabel(props.ticket)

  return (
    <div className="space-y-2 px-3 py-2 text-[12px] leading-5 text-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
              ticket
            </span>
            {statusLabel ? (
              <span className="text-[11px] text-emerald-200/90">
                {statusLabel}
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
          {renderTicketChecklistItems(props.ticket.checklist)}
        </div>
      </div>
    </div>
  )
}
