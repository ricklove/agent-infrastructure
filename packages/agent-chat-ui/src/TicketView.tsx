import { useState } from "react"
import { TicketViewActions } from "./TicketViewActions"
import type { AgentTicket } from "./ticket-types"
import {
  formatTicketTimestamp,
  renderTicketChecklistItems,
  ticketStatusLabel,
} from "./ticket-ui"

type TicketMutationResponse = {
  ok: boolean
  ticket: AgentTicket
  error?: string
}

function buildHeaders(authorizationHeader: string | undefined) {
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  })
  const normalizedAuthorization = authorizationHeader?.trim() ?? ""
  if (normalizedAuthorization) {
    headers.set("Authorization", normalizedAuthorization)
  }
  return headers
}

export function TicketView(props: {
  ticket: AgentTicket | null
  loading?: boolean
  error?: string | null
  apiRootUrl?: string
  authorizationHeader?: string
  onTicketUpdated?: (ticket: AgentTicket) => void
}) {
  const [pendingStepId, setPendingStepId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  async function handleToggleStep(
    step: AgentTicket,
    stepId: string,
    checked: boolean,
  ) {
    if (!props.apiRootUrl) {
      return
    }
    setPendingStepId(stepId)
    setActionError(null)
    try {
      const response = await fetch(
        `${props.apiRootUrl}/tickets/${encodeURIComponent(step.id)}/step-selection`,
        {
          method: "POST",
          headers: buildHeaders(props.authorizationHeader),
          body: JSON.stringify({ stepId, checked }),
        },
      )
      const payload = (await response.json()) as TicketMutationResponse
      if (!response.ok || !payload.ok || !payload.ticket) {
        throw new Error(payload.error ?? "Ticket step update failed.")
      }
      props.onTicketUpdated?.(payload.ticket)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Ticket step update failed.",
      )
    } finally {
      setPendingStepId(null)
    }
  }

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

      {props.apiRootUrl ? (
        <TicketViewActions
          ticket={props.ticket}
          apiRootUrl={props.apiRootUrl}
          authorizationHeader={props.authorizationHeader}
          disabled={pendingStepId !== null}
          onTicketUpdated={(ticket) => {
            setActionError(null)
            props.onTicketUpdated?.(ticket)
          }}
          onError={setActionError}
        />
      ) : null}

      {actionError ? (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">
          {actionError}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-slate-950/55 px-2 py-2">
        <div className="space-y-1 font-mono text-[11px]">
          {renderTicketChecklistItems(props.ticket.checklist, {
            onToggleStep: props.apiRootUrl
              ? (step, checked) =>
                  void handleToggleStep(
                    props.ticket as AgentTicket,
                    step.id,
                    checked,
                  )
              : undefined,
            pendingStepId,
          })}
        </div>
      </div>
    </div>
  )
}
