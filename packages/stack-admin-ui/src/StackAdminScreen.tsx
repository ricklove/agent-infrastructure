import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"

type QuickLink = {
  href: string
  label: string
  description: string
}

const quickLinks: QuickLink[] = [
  {
    href: "/projects",
    label: "Projects",
    description: "Review managed repo inventory and project access.",
  },
  {
    href: "/chat",
    label: "Agent Chat",
    description: "Coordinate operator work and inspect admin-side sessions.",
  },
  {
    href: "/terminal",
    label: "Terminal",
    description: "Open shell access for direct host administration.",
  },
]

export function StackAdminScreen() {
  useRenderCounter("StackAdminScreen")

  return (
    <main className="h-full overflow-auto bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-6 py-8 md:px-10">
        <section className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.96)_42%,rgba(15,23,42,0.98))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200/80">
            Stack Admin
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Cross-stack admin surface
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            This host is the shared administration dashboard. Use the plugin
            surfaces below for stack discovery, operator chat, terminal access,
            and project-level controls.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {quickLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-white/10 bg-slate-900/80 p-5 transition hover:border-emerald-300/40 hover:bg-slate-900"
            >
              <div className="text-sm font-semibold text-white">
                {link.label}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {link.description}
              </p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
                Open
              </div>
            </a>
          ))}
        </section>
      </div>
    </main>
  )
}
