import type {
  WorkbenchAgentChatNodeRecord,
  WorkbenchNodeComponentProps,
  WorkbenchNodeTypeDefinition,
} from "@agent-infrastructure/agent-workbench-protocol"
import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { memo, useEffect, useMemo, useRef, useState } from "react"

const agentChatApiRootUrl = "/api/agent-chat"
const maxVisibleMessages = 40

type ChatSessionSummary = {
  id: string
  title: string
  updatedAtMs: number
}

type ChatSessionMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: Array<
    { type: "text"; text: string } | { type: "image"; url: string }
  >
}

type SessionsResponse = {
  ok: boolean
  sessions: ChatSessionSummary[]
}

type SessionSnapshotResponse = {
  ok: boolean
  messages: ChatSessionMessage[]
}

function summarizeMessageContent(message: ChatSessionMessage) {
  const textContent = message.content
    .map((part) =>
      part.type === "text" ? part.text.trim() : `[image] ${part.url}`,
    )
    .filter(Boolean)
    .join("\n")
    .trim()
  return textContent || "No visible content"
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
  const [messages, setMessages] = useState<ChatSessionMessage[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
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
    return () => {
      cancelled = true
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

  useEffect(() => {
    let cancelled = false

    async function loadMessages(sessionId: string) {
      setLoadingMessages(true)
      setError("")
      try {
        const response = (await dashboardSessionFetch(
          `${agentChatApiRootUrl}/sessions/${encodeURIComponent(sessionId)}`,
        )) as Response
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as SessionSnapshotResponse
        if (!cancelled) {
          setMessages(payload.messages)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          )
          setMessages([])
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false)
        }
      }
    }

    if (!record.sessionId) {
      setMessages([])
      return () => {
        cancelled = true
      }
    }

    void loadMessages(record.sessionId)
    return () => {
      cancelled = true
    }
  }, [record.sessionId])

  const selectedSessionId = record.sessionId ?? ""
  const visibleMessages = useMemo(
    () => messages.slice(-maxVisibleMessages),
    [messages],
  )

  return (
    <div
      ref={containerRef}
      className={`flex min-h-[320px] min-w-[340px] flex-col overflow-hidden rounded-2xl border bg-slate-950/95 shadow-lg transition ${
        selected ? "border-cyan-300 shadow-cyan-900/40" : "border-slate-700"
      }`}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
              Agent Chat
            </div>
            <div className="text-xs text-slate-400">Session thread view</div>
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
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {loadingMessages ? (
              <div className="px-1 py-2 text-xs text-slate-400">
                Loading thread…
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="px-1 py-2 text-xs text-slate-500">
                No messages in this session yet.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleMessages.map((message) => {
                  const tone =
                    message.role === "assistant"
                      ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
                      : message.role === "system"
                        ? "border-violet-300/20 bg-violet-300/10 text-violet-50"
                        : "border-white/10 bg-white/5 text-slate-100"
                  return (
                    <div
                      key={message.id}
                      className={`rounded-2xl border px-3 py-2 ${tone}`}
                    >
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                        {message.role}
                      </div>
                      <div className="whitespace-pre-wrap break-words text-xs leading-5">
                        {summarizeMessageContent(message)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
        width: 420,
        height: 420,
      }
    },
    renderNode: AgentChatWorkbenchNode,
  }
