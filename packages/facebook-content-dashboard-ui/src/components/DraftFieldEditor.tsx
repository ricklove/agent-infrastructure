import type { ReactNode } from "react"

type DraftFieldEditorProps = {
  label: string
  value: string
  onGenerate: () => void
  generateLabel: string
  feedback?: string | null
  options: string[]
  onSelectOption: (value: string) => void
  input: ReactNode
  renderOption?: (option: string, isSelected: boolean, onSelect: () => void, index: number) => ReactNode
}

export function DraftFieldEditor(props: DraftFieldEditorProps) {
  const visibleOptions = props.options.filter(Boolean)
  return (
    <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{props.label}</div>
        <button
          type="button"
          onClick={props.onGenerate}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-600"
        >
          <SparklesIcon />
          <span>{props.generateLabel}</span>
        </button>
      </div>
      {props.input}
      {props.feedback ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
          {props.feedback}
        </div>
      ) : null}
      {visibleOptions.length > 0 ? (
        <div className="grid gap-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Options</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visibleOptions.map((option, index) => {
              const isSelected = option === props.value
              const onSelect = () => props.onSelectOption(option)
              return props.renderOption ? (
                <div key={`${index}-${option}`}>{props.renderOption(option, isSelected, onSelect, index)}</div>
              ) : (
                <button
                  key={`${index}-${option}`}
                  type="button"
                  onClick={onSelect}
                  className={[
                    "grid gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                    isSelected
                      ? "border-cyan-500/50 bg-cyan-500/12 text-cyan-50 shadow-[0_0_0_1px_rgba(6,182,212,0.18)]"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Option {index + 1}</span>
                    <div className="flex items-center gap-2">
                      {index === 0 ? <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Newest</span> : null}
                      {isSelected ? <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Selected</span> : null}
                    </div>
                  </div>
                  <div className="line-clamp-4 leading-5">{option}</div>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5 11.6 6.4 15.5 8 11.6 9.6 10 13.5 8.4 9.6 4.5 8 8.4 6.4 10 2.5Z" />
      <path d="M14.8 12.8 15.6 14.7 17.5 15.5 15.6 16.3 14.8 18.2 14 16.3 12.1 15.5 14 14.7 14.8 12.8Z" />
    </svg>
  )
}
