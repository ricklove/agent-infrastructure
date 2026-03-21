export function AgentChatScreen() {
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 px-8 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">
          Agent Chat
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Multi-session chat placeholder
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          This tab is intentionally a placeholder while the chat architecture is
          designed around Codex app-server, session management, and a shared
          dashboard WebSocket entrypoint.
        </p>
      </div>

      <div className="grid flex-1 gap-6 p-8 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Sessions</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/60 p-4">
              <p className="text-sm font-medium text-slate-200">Session list</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Pending implementation. This panel will hold resumable agent
                sessions, repo context, and launch controls.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">
            Conversation Surface
          </h2>
          <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-fuchsia-300/30 bg-fuchsia-300/5 p-10">
            <div className="max-w-xl text-center">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-fuchsia-200">
                Coming Next
              </p>
              <p className="mt-4 text-base leading-7 text-slate-300">
                The first real version will target structured Codex app-server
                integration instead of a terminal scrape so the browser UI can
                own sessions, streaming state, and reconnect behavior cleanly.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
