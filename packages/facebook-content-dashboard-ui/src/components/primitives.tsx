import type { MouseEvent, ReactNode } from "react"

export function ActionButton(props: {
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  title?: string
  tone?: "default" | "accent" | "danger"
  compact?: boolean
  fullWidthOnMobile?: boolean
}) {
  const tone =
    props.tone === "accent"
      ? "border-cyan-700/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-600/50"
      : props.tone === "danger"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-100 hover:border-rose-400/40"
        : "border-zinc-700 bg-zinc-950/80 text-zinc-100 hover:border-zinc-600"

  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      className={[
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        props.compact ? "min-h-8 py-1.5" : "min-h-10 py-2",
        props.fullWidthOnMobile ? "w-full sm:w-auto" : "w-auto",
        tone,
      ].join(" ")}
    >
      {props.children}
    </button>
  )
}

export function IconOnlyButton(props: {
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  title?: string
  tone?: "default" | "danger"
  compact?: boolean
}) {
  const tone =
    props.tone === "danger"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-100 hover:border-rose-400/40"
      : "border-zinc-700 bg-zinc-950/80 text-zinc-300 hover:border-zinc-600"

  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      className={[
        "inline-flex w-full shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-60",
        props.compact ? "h-8 sm:w-8" : "h-10 sm:h-8 sm:w-8",
        tone,
      ].join(" ")}
    >
      {props.children}
    </button>
  )
}

export function OptionCardButton(props: {
  label: string
  value: string
  selected?: boolean
  badge?: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "grid gap-1.5 rounded-lg border px-2.5 py-2 text-left text-sm transition",
        props.selected
          ? "border-cyan-500/50 bg-cyan-500/12 text-cyan-50 shadow-[0_0_0_1px_rgba(6,182,212,0.18)]"
          : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          {props.label}
        </span>
        <div className="flex items-center gap-2">
          {props.badge}
          {props.selected ? (
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Selected
            </span>
          ) : null}
        </div>
      </div>
      <div className="line-clamp-4 leading-5">{props.value}</div>
    </button>
  )
}

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
