import { observer, useValue } from "@legendapp/state/react"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import {
  type AgentChatV2Message,
  type AgentChatV2Session,
  createAgentChatV2Actions,
  createAgentChatV2Store,
} from "./AgentChatV2Store"

export type AgentChatV2ScreenProps = {
  apiRootUrl?: string
  wsRootUrl?: string
  appVersion?: string
}

function messageText(message: AgentChatV2Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : "[image]"))
    .join("\n")
    .trim()
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function activityLabel(session: AgentChatV2Session): string {
  if (session.activity.status === "running") {
    return "Working"
  }
  if (session.activity.status === "queued") {
    return "Queued"
  }
  if (session.activity.status === "error") {
    return "Error"
  }
  return "Idle"
}

export const AgentChatV2Screen = observer(function AgentChatV2Screen(
  props: AgentChatV2ScreenProps,
) {
  const apiRootUrl = props.apiRootUrl ?? "/api/agent-chat"
  const wsRootUrl = props.wsRootUrl ?? "/ws/agent-chat"
  const [store] = useState(() => createAgentChatV2Store(apiRootUrl, wsRootUrl))
  const [actions] = useState(() => createAgentChatV2Actions(store))

  useEffect(() => {
    void actions.loadSessions()
    return () => actions.close()
  }, [actions])

  const state = useValue(store.state$)
  const activeSession = useMemo(
    () =>
      state.activeSessionId
        ? (state.sessions.find(
            (session) => session.id === state.activeSessionId,
          ) ?? null)
        : null,
    [state.activeSessionId, state.sessions],
  )
  const activeMessages = activeSession
    ? (state.messagesBySessionId[activeSession.id] ?? [])
    : []
  const queuedMessages = activeSession
    ? (state.queuedMessagesBySessionId[activeSession.id] ?? [])
    : []
  const hasOlderMessages = activeSession
    ? (state.hasOlderMessagesBySessionId[activeSession.id] ?? false)
    : false

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await actions.sendMessage()
  }

  return (
    <main className="flex h-screen min-h-0 bg-zinc-950 text-zinc-100">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-cyan-300">
            Agent Chat v2
          </p>
          <h1 className="mt-1 text-lg font-semibold text-white">
            Canonical chat
          </h1>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Bounded list and transcript windows over the existing Agent Chat
            data.
          </p>
          <button
            type="button"
            onClick={() => void actions.createSession()}
            className="mt-3 w-full rounded bg-cyan-500 px-3 py-2 text-sm font-semibold text-zinc-950"
          >
            New chat
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400">
          <span>
            {state.sessions.length}
            {state.totalKnownSessions == null
              ? ""
              : ` of ${state.totalKnownSessions}`}{" "}
            sessions
          </span>
          <span>{state.connection.wsStatus}</span>
        </div>

        {state.connection.error ? (
          <div className="m-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {state.connection.error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => void actions.openSession(session.id)}
              className={`block w-full border-b border-zinc-800 px-4 py-3 text-left transition ${
                session.id === state.activeSessionId
                  ? "bg-cyan-950/40"
                  : "hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                  {session.title}
                </span>
                <span className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                  {activityLabel(session)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
                {session.preview ?? "No messages yet"}
              </p>
              <p className="mt-2 text-[11px] text-zinc-500">
                {session.messageCount.toLocaleString()} messages ·{" "}
                {formatTime(session.updatedAtMs)}
              </p>
            </button>
          ))}
        </div>

        {state.nextSessionsCursor ? (
          <button
            type="button"
            onClick={() => void actions.loadSessions(true)}
            className="border-t border-zinc-800 px-4 py-3 text-sm font-medium text-cyan-200 hover:bg-zinc-800"
          >
            Load more sessions
          </button>
        ) : null}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {activeSession ? (
          <>
            <header className="border-b border-zinc-800 bg-zinc-950 px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">
                    {activeSession.title}
                  </h2>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {activeSession.cwd}
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-400">
                  <p>{activityLabel(activeSession)}</p>
                  <p className="mt-1">
                    window {activeMessages.length.toLocaleString()} /{" "}
                    {activeSession.messageCount.toLocaleString()}
                  </p>
                  {activeSession.activity.canInterrupt ? (
                    <button
                      type="button"
                      onClick={() => void actions.interruptSession()}
                      className="mt-2 rounded border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-950"
                    >
                      Stop
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {hasOlderMessages ? (
                <button
                  type="button"
                  onClick={() => void actions.loadOlderMessages()}
                  className="mb-4 w-full rounded border border-zinc-700 px-3 py-2 text-sm text-cyan-200 hover:bg-zinc-900"
                >
                  Load older messages
                </button>
              ) : null}

              <div className="space-y-3">
                {activeMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {state.streamingAssistantText ? (
                  <div className="rounded border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm leading-6 text-emerald-50">
                    {state.streamingAssistantText}
                  </div>
                ) : null}
              </div>
            </div>

            {queuedMessages.length > 0 ? (
              <div className="border-t border-amber-500/30 bg-amber-950/20 px-5 py-2 text-xs text-amber-100">
                {queuedMessages.length} queued message
                {queuedMessages.length === 1 ? "" : "s"}
              </div>
            ) : null}

            <form
              onSubmit={(event) => void submitMessage(event)}
              className="border-t border-zinc-800 bg-zinc-950 p-4"
            >
              <textarea
                value={state.composerText}
                onChange={(event) =>
                  store.state$.composerText.set(event.target.value)
                }
                rows={3}
                placeholder="Send a message through the existing Agent Chat pipeline"
                className="block w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                  Sends to v1 canonical session data.
                </p>
                <button
                  type="submit"
                  disabled={state.sending || !state.composerText.trim()}
                  className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                >
                  {state.sending ? "Sending" : "Send"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-zinc-400">
            {state.connection.status === "loading"
              ? "Loading sessions"
              : "Select a session"}
          </div>
        )}
      </section>
    </main>
  )
})

function MessageBubble(props: { message: AgentChatV2Message }) {
  const tone =
    props.message.role === "user"
      ? "ml-auto border-cyan-500/30 bg-cyan-950/30"
      : props.message.role === "assistant"
        ? "border-zinc-700 bg-zinc-900"
        : "border-amber-500/30 bg-amber-950/20"
  return (
    <article className={`max-w-3xl rounded border px-4 py-3 ${tone}`}>
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-500">
        <span>{props.message.role}</span>
        <span>{formatTime(props.message.createdAtMs)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
        {messageText(props.message) || "(empty message)"}
      </p>
    </article>
  )
}
