import type { ReactNode } from "react"
import { OptionGrid } from "./OptionGrid"
import { ActionButton, OptionCardButton } from "./primitives"

type DraftFieldEditorProps = {
  label: string
  value: string
  onGenerate: () => void
  generateLabel: string
  isGenerating?: boolean
  feedback?: string | null
  options: string[]
  onSelectOption: (value: string) => void
  input: ReactNode
  renderOption?: (option: string, isSelected: boolean, onSelect: () => void, index: number) => ReactNode
  optionsColumnsClassName?: string
}

export function DraftFieldEditor(props: DraftFieldEditorProps) {
  const visibleOptions = props.options.filter(Boolean)
  return (
    <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{props.label}</div>
        <ActionButton onClick={props.onGenerate} disabled={props.isGenerating} compact>
          {props.isGenerating ? <SpinnerIcon /> : <SparklesIcon />}
          <span>{props.generateLabel}</span>
        </ActionButton>
      </div>
      {props.input}
      {props.feedback ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
          {props.feedback}
        </div>
      ) : null}
      {visibleOptions.length > 0 ? (
        <OptionGrid
          label="Options"
          status={props.isGenerating ? <span className="text-cyan-300">Generating…</span> : null}
          columnsClassName={props.optionsColumnsClassName ?? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3"}
        >
          {visibleOptions.map((option, index) => {
            const isSelected = option === props.value
            const onSelect = () => props.onSelectOption(option)
            return props.renderOption ? (
              <div key={"render-option-" + index} className="justify-self-start self-start">
                {props.renderOption(option, isSelected, onSelect, index)}
              </div>
            ) : (
              <OptionCardButton
                key={`${index}-${option}`}
                label={`Option ${index + 1}`}
                value={option}
                selected={isSelected}
                onClick={onSelect}
                badge={
                  index === 0 ? (
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      Newest
                    </span>
                  ) : null
                }
              />
            )
          })}
        </OptionGrid>
      ) : null}
    </div>
  )
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5 11.6 6.4 15.5 8 11.6 9.6 10 13.5 8.4 9.6 4.5 8 8.4 6.4 10 2.5Z" />
      <path d="M14.8 12.8 15.6 14.7 17.5 15.5 15.6 16.3 14.8 18.2 14 16.3 12.1 15.5 14 14.7 14.8 12.8Z" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 animate-spin" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 3a7 7 0 1 0 7 7" strokeLinecap="round" />
    </svg>
  )
}
