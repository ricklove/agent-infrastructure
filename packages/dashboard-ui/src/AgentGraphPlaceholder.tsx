import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"

export function AgentGraphPlaceholder() {
  useRenderCounter("AgentGraphPlaceholder")
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 px-8 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Agent Graph
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Graph view will mount here
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          The shell route and lazy loading are in place. The next step is to
          fold the existing graph app into this feature boundary and route its
          API and WebSocket traffic through the shared dashboard backend.
        </p>
      </div>
      <div className="grid flex-1 gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">
            Planned Integration
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li>
              Mount the existing agent graph screen as the full feature body.
            </li>
            <li>
              Move graph HTTP and WS traffic behind `/api/agent-graph` and
              `/ws/agent-graph`.
            </li>
            <li>
              Keep the route lazy so graph code is only loaded when the tab
              opens.
            </li>
          </ul>
        </section>
        <section className="rounded-3xl border border-dashed border-cyan-400/40 bg-cyan-400/5 p-6">
          <h2 className="text-lg font-medium text-cyan-100">Current State</h2>
          <p className="mt-4 text-sm leading-6 text-cyan-50/80">
            This placeholder is deliberate. It keeps the shell stable while the
            current graph app is migrated without mixing old app-level wiring
            into the new dashboard structure.
          </p>
        </section>
      </div>
    </div>
  )
}
