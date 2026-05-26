import type { AssetGenerationProvider } from "@agent-infrastructure/facebook-content-dashboard-core"

type DraftGenerationControlsProps = {
  textProvider: Exclude<AssetGenerationProvider, "seed">
  imageProvider: Exclude<AssetGenerationProvider, "seed">
  onTextProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onImageProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onGeneratePost: () => void
  onResetImage: () => void
  generatePostLabel?: string
}

const providerOptions = [
  { value: "mock", label: "Mock" },
  { value: "codex", label: "Codex" },
] as const

export function DraftGenerationControls(props: DraftGenerationControlsProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Generation
        </div>
        <button
          type="button"
          onClick={props.onGeneratePost}
          title="Generate full post"
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-700/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-600/50"
        >
          <SparklesIcon />
          <span>{props.generatePostLabel ?? "Generate full post"}</span>
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Text provider
          </div>
          <select
            value={props.textProvider}
            onChange={(event) =>
              props.onTextProviderChange(
                event.target.value as Exclude<AssetGenerationProvider, "seed">,
              )
            }
            className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none"
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Image provider
          </div>
          <div className="flex items-center gap-2">
            <select
              value={props.imageProvider}
              onChange={(event) =>
                props.onImageProviderChange(
                  event.target.value as Exclude<AssetGenerationProvider, "seed">,
                )
              }
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={props.onResetImage}
              title="Reset image"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-700"
            >
              <ResetIcon />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>
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

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 5.5h4v4" />
      <path d="M16 14.5h-4v-4" />
      <path d="M6.5 13.5A5 5 0 0 0 15 10" />
      <path d="M13.5 6.5A5 5 0 0 0 5 10" />
    </svg>
  )
}
