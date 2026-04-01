import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type AgentTicket,
  activateAgentChatSessionEventName,
} from "./ticket-types"

type SessionSummary = {
  id: string
  title: string
  archived: boolean
  activeTicket: { id: string } | null
}

type SessionsResponse = {
  ok: boolean
  sessions: SessionSummary[]
  error?: string
}

type TicketMutationResponse = {
  ok: boolean
  ticket: AgentTicket
  createdSession?: SessionSummary | null
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

export function TicketViewActions(props: {
  ticket: AgentTicket
  apiRootUrl: string
  authorizationHeader?: string
  disabled?: boolean
  onTicketUpdated: (ticket: AgentTicket) => void
  onError: (message: string) => void
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState("")
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [submitting, setSubmitting] = useState<
    "activate" | "move" | "new-session" | null
  >(null)

  const availableSessions = useMemo(
    () =>
      sessions
        .filter((session) => !session.archived)
        .sort((left, right) => right.id.localeCompare(left.id)),
    [sessions],
  )

  const loadSessions = useCallback(
    async (options?: {
      ownerSessionId?: string
      preferredSelectedSessionId?: string
    }) => {
      const response = await fetch(`${props.apiRootUrl}/sessions`, {
        headers: buildHeaders(props.authorizationHeader),
      })
      const payload = (await response.json()) as SessionsResponse
      if (!response.ok || !payload.ok || !Array.isArray(payload.sessions)) {
        throw new Error(payload.error ?? "Failed to load chat sessions.")
      }

      setSessions(payload.sessions)

      const ownerSessionId = options?.ownerSessionId ?? props.ticket.sessionId
      const preferredSelectedSessionId =
        options?.preferredSelectedSessionId?.trim() ?? ""
      const nextAvailableSessions = payload.sessions
        .filter((session) => !session.archived)
        .sort((left, right) => right.id.localeCompare(left.id))
      const fallbackSession = nextAvailableSessions.find(
        (session) => session.id !== ownerSessionId,
      )
      const preferredIsValid = nextAvailableSessions.some(
        (session) =>
          session.id === preferredSelectedSessionId &&
          session.id !== ownerSessionId,
      )
      setSelectedSessionId(
        preferredIsValid
          ? preferredSelectedSessionId
          : (fallbackSession?.id ?? ""),
      )
    },
    [props.apiRootUrl, props.authorizationHeader, props.ticket.sessionId],
  )

  useEffect(() => {
    let cancelled = false
    setLoadingSessions(true)
    void loadSessions()
      .catch((error) => {
        if (!cancelled) {
          props.onError(
            error instanceof Error
              ? error.message
              : "Failed to load chat sessions.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSessions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [loadSessions, props.onError])

  useEffect(() => {
    const selectedStillExists = availableSessions.some(
      (session) => session.id === selectedSessionId,
    )
    if (
      selectedSessionId &&
      selectedSessionId !== props.ticket.sessionId &&
      selectedStillExists
    ) {
      return
    }
    const fallbackSession = availableSessions.find(
      (session) => session.id !== props.ticket.sessionId,
    )
    setSelectedSessionId(fallbackSession?.id ?? "")
  }, [availableSessions, props.ticket.sessionId, selectedSessionId])

  async function runMutation(
    endpoint: string,
    body: Record<string, unknown>,
    submittingState: "activate" | "move" | "new-session",
  ) {
    setSubmitting(submittingState)
    props.onError("")
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: buildHeaders(props.authorizationHeader),
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as TicketMutationResponse
      if (!response.ok || !payload.ok || !payload.ticket) {
        throw new Error(payload.error ?? "Ticket action failed.")
      }
      await loadSessions({ ownerSessionId: payload.ticket.sessionId })
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(activateAgentChatSessionEventName, {
            detail: { sessionId: payload.ticket.sessionId },
          }),
        )
      }
      props.onTicketUpdated(payload.ticket)
    } catch (error) {
      props.onError(
        error instanceof Error ? error.message : "Ticket action failed.",
      )
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/55 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Ticket Actions
        </p>
        {loadingSessions ? (
          <span className="text-[10px] text-slate-500">loading sessions…</span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.disabled || submitting !== null}
          onClick={() =>
            void runMutation(
              `${props.apiRootUrl}/sessions/${encodeURIComponent(props.ticket.sessionId)}/active-ticket`,
              { ticketId: props.ticket.id },
              "activate",
            )
          }
          className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "activate"
            ? "Activating…"
            : "Make Active In Owning Session"}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <select
          value={selectedSessionId}
          onChange={(event) => setSelectedSessionId(event.target.value)}
          disabled={
            props.disabled ||
            submitting !== null ||
            availableSessions.length === 0
          }
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Choose session…</option>
          {availableSessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
              {session.id === props.ticket.sessionId ? " (current owner)" : ""}
              {session.activeTicket &&
              session.activeTicket.id !== props.ticket.id
                ? " (replaces active ticket)"
                : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={
            props.disabled ||
            submitting !== null ||
            !selectedSessionId ||
            selectedSessionId === props.ticket.sessionId
          }
          onClick={() =>
            void runMutation(
              `${props.apiRootUrl}/tickets/${encodeURIComponent(props.ticket.id)}/reassign`,
              { targetSessionId: selectedSessionId },
              "move",
            )
          }
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "move" ? "Moving…" : "Move To Session"}
        </button>
      </div>
      <div className="mt-2">
        <button
          type="button"
          disabled={props.disabled || submitting !== null}
          onClick={() =>
            void runMutation(
              `${props.apiRootUrl}/tickets/${encodeURIComponent(props.ticket.id)}/reassign`,
              { createSession: true },
              "new-session",
            )
          }
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "new-session" ? "Moving…" : "Move To New Session"}
        </button>
      </div>
    </div>
  )
}
