import { SquareImageFrame } from "./SquareImageFrame"
import type { AssetGenerationProvider } from "@agent-infrastructure/facebook-content-dashboard-core"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { DraftGenerationControls } from "./DraftGenerationControls"
import { DraftFieldEditor } from "./DraftFieldEditor"
import { ActionButton, IconOnlyButton } from "./primitives"

type DraftEditorSurfaceProps = {
  title: string
  subtitle: string
  generationTag: string | null
  draftSaved: boolean
  statusMessage?: string | null
  titleValue: string
  titleOptions: string[]
  titleFeedback?: string | null
  caption: string
  captionOptions: string[]
  captionFeedback?: string | null
  imageValue: string
  imageOptions: string[]
  imageFeedback?: string | null
  textProvider: Exclude<AssetGenerationProvider, "seed">
  imageProvider: Exclude<AssetGenerationProvider, "seed">
  pendingGeneration?: null | "post" | "title" | "text" | "image"
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
  showPreview?: boolean
}

export function DraftEditorSurface(props: DraftEditorSurfaceProps) {
  const [localSavePulseAt, setLocalSavePulseAt] = useState<number | null>(null)
  const lastSaveTriggerAt = useRef(0)

  useEffect(() => {
    setLocalSavePulseAt(null)
  }, [props.titleValue, props.caption, props.imageValue, props.generationTag])

  const saveAcknowledged = Boolean(
    props.draftSaved ||
      props.statusMessage?.startsWith("Draft saved at ") ||
      localSavePulseAt !== null,
  )
  const handleSave = () => {
    const now = Date.now()
    if (now - lastSaveTriggerAt.current < 300) {
      return
    }
    lastSaveTriggerAt.current = now
    setLocalSavePulseAt(now)
    props.onSave()
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 md:gap-3.5 md:p-3.5">
      <div className="grid gap-2.5 md:flex md:flex-wrap md:items-start md:justify-between md:gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-5 text-zinc-100">{props.title}</div>
          <div className="mt-1 text-[11px] leading-4 text-zinc-500">{props.subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 md:justify-end md:gap-2">
          {props.generationTag ? (
            <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              set {props.generationTag}
            </div>
          ) : null}
          <div
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
              saveAcknowledged
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-400",
            ].join(" ")}
          >
            {saveAcknowledged ? "saved" : "editing"}
          </div>
          {props.showSaveAction === false ? null : (
            <ActionButton onClick={handleSave} tone={saveAcknowledged ? "accent" : "default"} compact fullWidthOnMobile>
              {saveAcknowledged ? <><CheckIcon /><span>Saved</span></> : <span>Save</span>}
            </ActionButton>
          )}
          <IconOnlyButton onClick={props.onDeleteCurrentDraft} title="Delete draft" tone="danger">
            <TrashIcon />
          </IconOnlyButton>
        </div>
      </div>

      <DraftGenerationControls
        textProvider={props.textProvider}
        imageProvider={props.imageProvider}
        onTextProviderChange={props.onTextProviderChange}
        onImageProviderChange={props.onImageProviderChange}
        onGeneratePost={props.onGeneratePost}
        onResetImage={props.onResetImage}
        generatePostLabel={props.pendingGeneration === "post" ? "Generating full post…" : "Generate full post"}
        isGeneratingPost={props.pendingGeneration === "post"}
        isBusy={Boolean(props.pendingGeneration)}
      />

      <DraftFieldEditor
        label="Title"
        value={props.titleValue}
        onGenerate={props.onGenerateTitle}
        generateLabel={props.pendingGeneration === "title" ? "Generating titles…" : "Generate titles"}
        isGenerating={props.pendingGeneration === "title"}
        feedback={props.titleFeedback}
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
        label="Image"
        value={props.imageValue}
        onGenerate={props.onGenerateImage}
        generateLabel={props.pendingGeneration === "image" ? "Generating image…" : "Generate image"}
        isGenerating={props.pendingGeneration === "image"}
        feedback={props.imageFeedback}
        options={props.imageOptions}
        onSelectOption={props.onSelectImage}
        optionsColumnsClassName="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5"
        input={
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <SquareImageFrame
              src={props.imageValue}
              alt="Selected creative"
              label="Selected image unavailable"
              sizeClassName="w-full min-h-[200px] max-h-[360px] max-w-[360px] md:min-h-[220px] md:max-h-[400px] md:max-w-[400px]"
            />
          </div>
        }
        renderOption={(option, isSelected, onSelect, index) => (
          <button
            type="button"
            onClick={onSelect}
            title={`Image option ${index + 1}`}
            aria-label={`Image option ${index + 1}`}
            style={{ width: 104, height: 104 }}
            className={[
              "relative flex shrink-0 overflow-hidden rounded-lg border transition justify-self-start self-start",
              isSelected
                ? "border-cyan-500/60 shadow-[0_0_0_1px_rgba(6,182,212,0.24)]"
                : "border-zinc-800 hover:border-zinc-700",
            ].join(" ")}
          >
            <SquareImageFrame
              src={option}
              alt={`Image option ${index + 1}`}
              label="No image"
              sizeClassName="h-full w-full"
            />
            {isSelected ? (
              <div className="pointer-events-none absolute right-2 top-2 rounded-full border border-cyan-400/50 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                Selected
              </div>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] text-white">
              <span>Option {index + 1}</span>
              {isSelected ? <span>Using</span> : null}
            </div>
          </button>
        )}
      />

      <DraftFieldEditor
        label="Post Text"
        value={props.caption}
        onGenerate={props.onGenerateCaption}
        generateLabel={props.pendingGeneration === "text" ? "Generating text…" : "Generate text"}
        isGenerating={props.pendingGeneration === "text"}
        feedback={props.captionFeedback}
        options={props.captionOptions}
        onSelectOption={props.onSelectCaption}
        input={
          <textarea
            value={props.caption}
            onChange={(event) => props.onCaptionChange(event.target.value)}
            className="min-h-[160px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm leading-6 text-zinc-200 outline-none md:min-h-[180px]"
          />
        }
      />



      {props.showPreview === false ? null : (
        <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Preview</div>
          {props.preview}
        </div>
      )}

      {saveAcknowledged && !props.queuedMeta ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
          <span>{props.statusMessage?.includes("saved") ? props.statusMessage : "Draft saved. Queue it when ready."}</span>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.8">
      <path d="m4.5 10.5 3.2 3.2 7.8-7.8" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.6">
      <path d="M3.5 5.5h13" />
      <path d="M8 3.5h4" />
      <path d="M6 5.5v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-10" />
      <path d="M8 8.5v5" />
      <path d="M12 8.5v5" />
    </svg>
  )
}
