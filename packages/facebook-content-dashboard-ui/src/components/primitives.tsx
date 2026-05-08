import type { ReactNode } from "react"

export function MetricChip(props: {
  label: string
  value: string
  tone?: "default" | "cyan"
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {props.label}
      </div>
      <div
        className={[
          "mt-1 text-sm font-semibold",
          props.tone === "cyan" ? "text-cyan-200" : "text-zinc-100",
        ].join(" ")}
      >
        {props.value}
      </div>
    </div>
  )
}

export function StatusBadge(props: { status: string }) {
  const tone =
    props.status === "approved" || props.status === "scheduled"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
      : props.status === "review" || props.status === "drafted"
        ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-200"
        : props.status === "needs review" || props.status === "draft"
          ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-white/[0.04] text-zinc-300"

  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
        tone,
      ].join(" ")}
    >
      {props.status}
    </span>
  )
}

export function StageBadge(props: { step: string; label: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/90">
        {props.step}
      </div>
      <div className="mt-1 text-sm font-semibold text-zinc-100">{props.label}</div>
    </div>
  )
}

export function Panel(props: {
  title: string
  meta?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/75">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{props.title}</h2>
          {props.meta ? <p className="mt-1 text-xs text-zinc-500">{props.meta}</p> : null}
        </div>
        {props.action}
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{props.children}</div>
    </section>
  )
}

export function FieldPair(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {props.label}
      </div>
      <div className="mt-2 text-sm leading-6 text-zinc-200">{props.value}</div>
    </div>
  )
}
