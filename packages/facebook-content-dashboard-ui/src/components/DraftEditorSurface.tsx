import type { AssetGenerationProvider } from "@agent-infrastructure/facebook-content-dashboard-core"
import type { ReactNode } from "react"
import { DraftGenerationControls } from "./DraftGenerationControls"
import { DraftFieldEditor } from "./DraftFieldEditor"

type DraftEditorSurfaceProps = {
  title: string
  subtitle: string
  generationTag: string | null
  draftSaved: boolean
  titleValue: string
  titleOptions: string[]
  caption: string
  captionOptions: string[]
  imageValue: string
  imageOptions: string[]
  textProvider: Exclude<AssetGenerationProvider, "seed">
  imageProvider: Exclude<AssetGenerationProvider, "seed">
  onTextProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onImageProviderChange: (provider: Exclude<AssetGenerationProvider, "seed">) => void
  onTitleChange: (value: string) => void
  onSelectTitle: (value: string) => void
  onCaptionChange: (value: string) => void
  onSelectCaption: (value: string) => void
  onSelectImage: (value: string) => void
  onGenerateTitle: () => void
  onGenerateCaption: () => void
  onGenerateImage: () => void
  onGeneratePost: () => void
  onResetImage: () => void
  onDeleteCurrentDraft: () => void
  onSave: () => void
  preview: ReactNode
  queuedMeta?: string | null
  showSaveAction?: boolean
}

export function DraftEditorSurface(props: DraftEditorSurfaceProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{props.title}</div>
          <div className="mt-1 text-xs text-zinc-500">{props.subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {props.generationTag ? (
            <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500">
              set {props.generationTag}
            </div>
          ) : null}
          <div
            className={[
              "rounded-full border px-2 py-1 text-[11px]",
              props.draftSaved
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-400",
            ].join(" ")}
          >
            {props.draftSaved ? "saved" : "editing"}
          </div>
          <button
            type="button"
            onClick={props.onDeleteCurrentDraft}
            title="Delete draft"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-100 transition hover:border-rose-400/40"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <DraftGenerationControls
        textProvider={props.textProvider}
        imageProvider={props.imageProvider}
        onTextProviderChange={props.onTextProviderChange}
        onImageProviderChange={props.onImageProviderChange}
        onGenerateText={props.onGenerateCaption}
        onGenerateImage={props.onGenerateImage}
        onGeneratePost={props.onGeneratePost}
        onResetImage={props.onResetImage}
      />

      <DraftFieldEditor
        label="Title"
        value={props.titleValue}
        onGenerate={props.onGenerateTitle}
        generateLabel="Generate titles"
        options={props.titleOptions}
        onSelectOption={props.onSelectTitle}
        input={
          <input
            value={props.titleValue}
            onChange={(event) => props.onTitleChange(event.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm text-zinc-100 outline-none"
          />
        }
      />

      <DraftFieldEditor
        label="Post Text"
        value={props.caption}
        onGenerate={props.onGenerateCaption}
        generateLabel="Generate text"
        options={props.captionOptions}
        onSelectOption={props.onSelectCaption}
        input={
          <textarea
            value={props.caption}
            onChange={(event) => props.onCaptionChange(event.target.value)}
            className="min-h-[220px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm leading-6 text-zinc-200 outline-none"
          />
        }
      />

      <DraftFieldEditor
        label="Image"
        value={props.imageValue}
        onGenerate={props.onGenerateImage}
        generateLabel="Generate image"
        options={props.imageOptions}
        onSelectOption={props.onSelectImage}
        input={
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <img src={props.imageValue} alt="Selected creative" className="h-56 w-full rounded-lg object-cover" />
          </div>
        }
        renderOption={(option, isSelected, onSelect, index) => (
          <button
            type="button"
            onClick={onSelect}
            title={`Image option ${index + 1}`}
            aria-label={`Image option ${index + 1}`}
            className={[
              "relative overflow-hidden rounded-lg border transition",
              isSelected
                ? "border-cyan-500/60 shadow-[0_0_0_1px_rgba(6,182,212,0.24)]"
                : "border-zinc-800 hover:border-zinc-700",
            ].join(" ")}
          >
            <img src={option} alt={`Image option ${index + 1}`} className="h-24 w-full object-cover" />
            {isSelected ? (
              <div className="absolute right-2 top-2 rounded-full border border-cyan-400/50 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                Selected
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] text-white">
              <span>Option {index + 1}</span>
              {isSelected ? <span>Using</span> : null}
            </div>
          </button>
        )}
      />

      <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Preview</div>
        {props.preview}
      </div>

      {props.showSaveAction === false ? null : (
        <button
          type="button"
          onClick={props.onSave}
          className={[
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition",
            props.draftSaved
              ? "border-cyan-500/30 bg-cyan-500/12 text-cyan-100"
              : "border-zinc-700 bg-zinc-950/80 text-zinc-100 hover:border-zinc-600",
          ].join(" ")}
        >
          {props.draftSaved ? <><CheckIcon /><span>Saved draft</span></> : <span>Save draft</span>}
        </button>
      )}

      {props.draftSaved && !props.queuedMeta ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
          <span>Draft saved.</span>
          <span className="text-xs text-cyan-100/80">Queue it when ready.</span>
        </div>
      ) : null}

      {props.queuedMeta ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          <span>Queued</span>
          <span className="text-xs text-emerald-200/80">{props.queuedMeta}</span>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8">
      <path d="m4.5 10.5 3.2 3.2 7.8-7.8" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 5.5h13" />
      <path d="M8 3.5h4" />
      <path d="M6 5.5v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-10" />
      <path d="M8 8.5v5" />
      <path d="M12 8.5v5" />
    </svg>
  )
}
