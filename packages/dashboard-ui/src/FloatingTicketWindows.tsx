import type { AgentTicket } from "@agent-infrastructure/agent-chat-ui"
import { TicketView } from "@agent-infrastructure/agent-chat-ui"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { useCallback, useEffect, useRef, useState } from "react"
import { useDashboardWindowLayer } from "./DashboardWindowLayer"

const openTicketWindowEventName = "dashboard-open-ticket-window"
const dashboardSessionStorageKey = "agent-infrastructure.dashboard.session"

type DashboardOpenTicketWindowDetail = {
  ticketId: string
  sessionId?: string | null
  title?: string | null
}

type TicketResponse = {
  ok: boolean
  ticket: AgentTicket
  error?: string
}

type TicketWindowState = {
  windowId: string
  ticketId: string
  title: string
  ticket: AgentTicket | null
  loading: boolean
  error: string
}

function TicketIcon(props: { className?: string }) {
  useRenderCounter("FloatingTicketWindows.TicketIcon")
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v2a1.5 1.5 0 0 0 0 3v2A2.5 2.5 0 0 1 16.5 17h-9A2.5 2.5 0 0 1 5 14.5v-2a1.5 1.5 0 0 0 0-3z" />
      <path d="M9 9.25h6M9 12h6" />
    </svg>
  )
}

function dashboardAuthorizationHeader() {
  if (typeof window === "undefined") {
    return ""
  }
  const sessionToken =
    window.sessionStorage.getItem(dashboardSessionStorageKey)?.trim() ?? ""
  return sessionToken ? `Bearer ${sessionToken}` : ""
}

export function FloatingTicketWindows(props: { apiRootUrl: string }) {
  useRenderCounter("FloatingTicketWindows")
  const { openWindow, updateWindow, focusWindow } = useDashboardWindowLayer()
  const [ticketWindows, setTicketWindows] = useState<
    Record<string, TicketWindowState>
  >({})
  const inFlightTicketIdsRef = useRef(new Set<string>())

  const syncWindow = useCallback(
    (entry: TicketWindowState) => {
      updateWindow(entry.windowId, {
        title: entry.ticket?.title ?? entry.title,
        icon: <TicketIcon className="h-3.5 w-3.5" />,
        body: (
          <TicketView
            ticket={entry.ticket}
            loading={entry.loading}
            error={entry.error}
            apiRootUrl={props.apiRootUrl}
            authorizationHeader={dashboardAuthorizationHeader()}
            onTicketUpdated={(ticket) => {
              const nextEntry: TicketWindowState = {
                ...entry,
                ticket,
                title: ticket.title,
                loading: false,
                error: "",
              }
              setTicketWindows((current) => ({
                ...current,
                [ticket.id]: nextEntry,
              }))
              syncWindow(nextEntry)
            }}
          />
        ),
      })
    },
    [props.apiRootUrl, updateWindow],
  )

  const fetchTicket = useCallback(
    async (ticketId: string, entryOverride?: TicketWindowState | null) => {
      const entry = entryOverride ?? ticketWindows[ticketId]
      if (!entry || inFlightTicketIdsRef.current.has(ticketId)) {
        return
      }
      inFlightTicketIdsRef.current.add(ticketId)
      try {
        const authorization = dashboardAuthorizationHeader()
        const headers = new Headers({ accept: "application/json" })
        if (authorization) {
          headers.set("Authorization", authorization)
        }
        const response = await fetch(
          `${props.apiRootUrl}/tickets/${encodeURIComponent(ticketId)}`,
          {
            headers,
          },
        )
        const payload = (await response.json()) as TicketResponse
        if (!response.ok || !payload.ok || !payload.ticket) {
          throw new Error(payload.error ?? "Ticket failed to load.")
        }
        const nextEntry: TicketWindowState = {
          ...entry,
          title: payload.ticket.title,
          ticket: payload.ticket,
          loading: false,
          error: "",
        }
        setTicketWindows((current) => ({
          ...current,
          [ticketId]: nextEntry,
        }))
        syncWindow(nextEntry)
      } catch (error) {
        const nextEntry: TicketWindowState = {
          ...entry,
          loading: false,
          error:
            error instanceof Error ? error.message : "Ticket failed to load.",
        }
        setTicketWindows((current) => ({
          ...current,
          [ticketId]: nextEntry,
        }))
        syncWindow(nextEntry)
      } finally {
        inFlightTicketIdsRef.current.delete(ticketId)
      }
    },
    [props.apiRootUrl, syncWindow, ticketWindows],
  )

  useEffect(() => {
    function handleOpenTicketWindow(event: Event) {
      const detail = (event as CustomEvent<DashboardOpenTicketWindowDetail>)
        .detail
      const ticketId = detail?.ticketId?.trim() ?? ""
      if (!ticketId) {
        return
      }

      const existing = ticketWindows[ticketId]
      if (existing) {
        focusWindow(existing.windowId)
        void fetchTicket(ticketId, existing)
        return
      }

      const nextEntry: TicketWindowState = {
        windowId: `ticket-${ticketId}`,
        ticketId,
        title: detail?.title?.trim() || "Ticket",
        ticket: null,
        loading: true,
        error: "",
      }
      setTicketWindows((current) => ({
        ...current,
        [ticketId]: nextEntry,
      }))
      openWindow({
        id: nextEntry.windowId,
        title: nextEntry.title,
        icon: <TicketIcon className="h-3.5 w-3.5" />,
        body: (
          <TicketView
            ticket={nextEntry.ticket}
            loading={nextEntry.loading}
            error={nextEntry.error}
            apiRootUrl={props.apiRootUrl}
            authorizationHeader={dashboardAuthorizationHeader()}
          />
        ),
      })
      void fetchTicket(ticketId, nextEntry)
    }

    function handleClosedWindow(event: Event) {
      const detail = (event as CustomEvent<{ windowId?: string }>).detail
      const closedWindowId = detail?.windowId?.trim()
      if (!closedWindowId) {
        return
      }
      setTicketWindows((current) => {
        const nextEntries = { ...current }
        for (const [ticketId, entry] of Object.entries(current)) {
          if (entry.windowId === closedWindowId) {
            delete nextEntries[ticketId]
          }
        }
        return nextEntries
      })
    }

    window.addEventListener(
      openTicketWindowEventName,
      handleOpenTicketWindow as EventListener,
    )
    window.addEventListener(
      "dashboard-window-closed",
      handleClosedWindow as EventListener,
    )
    return () => {
      window.removeEventListener(
        openTicketWindowEventName,
        handleOpenTicketWindow as EventListener,
      )
      window.removeEventListener(
        "dashboard-window-closed",
        handleClosedWindow as EventListener,
      )
    }
  }, [fetchTicket, focusWindow, openWindow, props.apiRootUrl, ticketWindows])

  useEffect(() => {
    const activeTicketIds = Object.values(ticketWindows)
      .filter(
        (entry) =>
          !entry.error && entry.ticket && entry.ticket.status !== "completed",
      )
      .map((entry) => entry.ticketId)
    if (activeTicketIds.length === 0) {
      return
    }
    const interval = window.setInterval(() => {
      for (const ticketId of activeTicketIds) {
        void fetchTicket(ticketId)
      }
    }, 4000)
    return () => {
      window.clearInterval(interval)
    }
  }, [fetchTicket, ticketWindows])

  return null
}
