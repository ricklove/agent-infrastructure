import type { AssetGenerationProvider } from "@agent-infrastructure/facebook-content-dashboard-core"

type DraftGenerationControlsProps = {
  textProvider: Exclude<AssetGenerationProvider, "seed">
  imageProvider: Exclude<AssetGenerationProvider, "seed">
  onTextProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onImageProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onGenerateText: () => void
  onGenerateImage: () => void
  onResetImage: () => void
  onDeleteCurrentDraft: () => void
  onDeleteGeneratedByProvider: (provider: Exclude<AssetGenerationProvider, "seed">) => void
}

const providerOptions = [
  { value: "mock", label: "Mock" },
  { value: "codex", label: "Codex" },
] as const

export function DraftGenerationControls(props: DraftGenerationControlsProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Text generation
          </div>
          <div className="flex items-center gap-2">
            <select
              value={props.textProvider}
              onChange={(event) =>
                props.onTextProviderChange(
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
              onClick={props.onGenerateText}
              className="rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-600"
            >
              Generate
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Image generation
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
              onClick={props.onGenerateImage}
              className="rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-600"
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={props.onResetImage}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700"
        >
          Reset image
        </button>
        <button
          type="button"
          onClick={props.onDeleteCurrentDraft}
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-100 transition hover:border-rose-400/40"
        >
          Delete draft
        </button>
        <button
          type="button"
          onClick={() => props.onDeleteGeneratedByProvider("mock")}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700"
        >
          Delete mock
        </button>
        <button
          type="button"
          onClick={() => props.onDeleteGeneratedByProvider("codex")}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700"
        >
          Delete codex
        </button>
      </div>
    </div>
  )
}
