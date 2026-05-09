import type { AssetGenerationProvider } from "@agent-infrastructure/facebook-content-dashboard-core"
import type { ReactNode } from "react"
import { DraftGenerationControls } from "./DraftGenerationControls"

type DraftEditorSurfaceProps = {
  title: string
  subtitle: string
  generationTag: string | null
  draftSaved: boolean
  caption: string
  textProvider: Exclude<AssetGenerationProvider, "seed">
  imageProvider: Exclude<AssetGenerationProvider, "seed">
  onTextProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onImageProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onCaptionChange: (value: string) => void
  onGenerateText: () => void
  onGenerateImage: () => void
  onResetImage: () => void
  onDeleteCurrentDraft: () => void
  onDeleteGeneratedByProvider: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onSave: () => void
  preview: ReactNode
  queuedMeta?: string | null
}

export function DraftEditorSurface(props: DraftEditorSurfaceProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{props.title}</div>
          <div className="mt-1 text-xs text-zinc-500">{props.subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          {props.generationTag ? (
            <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500">
              set {props.generationTag}
            </div>
          ) : null}
          <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
            {props.draftSaved ? "saved" : "editing"}
          </div>
        </div>
      </div>

      <DraftGenerationControls
        textProvider={props.textProvider}
        imageProvider={props.imageProvider}
        onTextProviderChange={props.onTextProviderChange}
        onImageProviderChange={props.onImageProviderChange}
        onGenerateText={props.onGenerateText}
        onGenerateImage={props.onGenerateImage}
        onResetImage={props.onResetImage}
        onDeleteCurrentDraft={props.onDeleteCurrentDraft}
        onDeleteGeneratedByProvider={props.onDeleteGeneratedByProvider}
      />

      <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Post Text</div>
        </div>
        <textarea
          value={props.caption}
          onChange={(event) => props.onCaptionChange(event.target.value)}
          className="min-h-[220px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm leading-6 text-zinc-200 outline-none"
        />
      </div>

      <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Preview</div>
        {props.preview}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={props.onSave}
          className={[
            "flex min-w-[140px] items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition",
            props.draftSaved
              ? "border-cyan-500/30 bg-cyan-500/12 text-cyan-100"
              : "border-zinc-700 bg-zinc-950/80 text-zinc-100 hover:border-zinc-600",
          ].join(" ")}
        >
          <span>{props.draftSaved ? "Saved draft" : "Save draft"}</span>
        </button>
      </div>

      {props.queuedMeta ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <span>Queued</span>
          <span className="text-xs text-emerald-200/80">{props.queuedMeta}</span>
        </div>
      ) : null}
    </div>
  )
}
