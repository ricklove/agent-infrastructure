import type {
  WorkbenchAgentChatNodeRecord,
  WorkbenchNodeComponentProps,
  WorkbenchNodeTypeDefinition,
} from "@agent-infrastructure/agent-workbench-protocol"
import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { memo, useEffect, useRef, useState } from "react"

import { AgentChatWorkbenchSessionView } from "./AgentChatScreen"

const agentChatApiRootUrl = "/api/agent-chat"

type ChatSessionSummary = {
  id: string
  title: string
  updatedAtMs: number
}

type SessionsResponse = {
  ok: boolean
  sessions: ChatSessionSummary[]
}

const AgentChatWorkbenchNode = memo(function AgentChatWorkbenchNode({
  id,
  record,
  selected,
  onRecordChange,
  onResize,
}: WorkbenchNodeComponentProps<WorkbenchAgentChatNodeRecord>) {
  useRenderCounter("AgentChatWorkbenchNode")
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      onResize(id, entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [id, onResize])

  useEffect(() => {
    let cancelled = false

    async function loadSessions() {
      setLoadingSessions(true)
      setError("")
      try {
        const response = (await dashboardSessionFetch(
          `${agentChatApiRootUrl}/sessions`,
        )) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as SessionsResponse
        if (!cancelled) {
          setSessions(payload.sessions)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingSessions(false)
        }
      }
    }

    void loadSessions()
    const refreshHandle = window.setInterval(() => {
      void loadSessions()
    }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(refreshHandle)
    }
  }, [])

  useEffect(() => {
    if (record.sessionId || sessions.length === 0) {
      return
    }
    onRecordChange({
      ...record,
      sessionId: sessions[0]?.id ?? null,
    })
  }, [onRecordChange, record, sessions])

  const selectedSessionId = record.sessionId ?? ""

  return (
    <div
      ref={containerRef}
      className={`flex min-h-[320px] min-w-[340px] resize flex-col overflow-hidden rounded-2xl border bg-slate-950/95 shadow-lg transition ${
        selected ? "border-cyan-300 shadow-cyan-900/40" : "border-slate-700"
      }`}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
              Agent Chat
            </div>
            <div className="text-xs text-slate-400">Canonical session view</div>
          </div>
          <select
            value={selectedSessionId}
            onChange={(event) =>
              onRecordChange({
                ...record,
                sessionId: event.target.value || null,
              })
            }
            className="max-w-[220px] rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none"
          >
            <option value="">Select chat session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title || session.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-slate-950">
        {error ? (
          <div className="border-b border-rose-400/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}
        {loadingSessions ? (
          <div className="px-4 py-3 text-xs text-slate-400">
            Loading sessions…
          </div>
        ) : null}
        {!record.sessionId && !loadingSessions ? (
          <div className="flex flex-1 items-center justify-center px-4 text-sm text-slate-500">
            Select a chat session to view its thread.
          </div>
        ) : null}
        {record.sessionId ? (
          <div className="min-h-0 flex-1">
            <AgentChatWorkbenchSessionView
              apiRootUrl={agentChatApiRootUrl}
              sessionId={record.sessionId}
              draftNamespace={`workbench-node:${id}`}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
})

export const agentChatWorkbenchNodeType: WorkbenchNodeTypeDefinition<WorkbenchAgentChatNodeRecord> =
  {
    id: "agent-chat",
    label: "Agent Chat",
    keywords: ["agent", "chat", "thread", "session"],
    sortOrder: 100,
    createRecord({ id, x, y }) {
      return {
        id,
        type: "agent-chat",
        sessionId: null,
        x,
        y,
        width: 400,
        height: 800,
      }
    },
    renderNode: AgentChatWorkbenchNode,
  }
