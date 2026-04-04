import { useEffect, useState } from "react"
import { NodeResizer } from "reactflow"

type WorkbenchNodeWrapperProps = {
  children: JSX.Element
  editableLabelValue: string
  label: string
  labelPlaceholder?: boolean
  nodeId: string
  onLabelChange(nextLabel: string): void
  resizable?: boolean
  selected: boolean
  workbenchReferenceSegment: string | null
}

function CopyReferenceIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function PencilIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
    </svg>
  )
}

export function WorkbenchNodeWrapper({
  children,
  editableLabelValue,
  label,
  labelPlaceholder = false,
  nodeId,
  onLabelChange,
  resizable = true,
  selected,
  workbenchReferenceSegment,
}: WorkbenchNodeWrapperProps) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [draftLabel, setDraftLabel] = useState(editableLabelValue)

  useEffect(() => {
    if (!editingLabel) {
      setDraftLabel(editableLabelValue)
    }
  }, [editableLabelValue, editingLabel])

  return (
    <>
      {resizable ? (
        <NodeResizer
          isVisible={selected}
          lineClassName="!border-cyan-300/70"
          handleClassName="!h-3 !w-3 !rounded-full !border-2 !border-cyan-200 !bg-slate-950"
        />
      ) : null}
      <div className="group relative h-full w-full">
        <div className="absolute left-2 top-0 z-10 flex -translate-y-1/2 items-center gap-1">
        {editingLabel ? (
          <input
            value={draftLabel}
            autoFocus
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={() => {
              setEditingLabel(false)
              onLabelChange(draftLabel)
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setEditingLabel(false)
                onLabelChange(draftLabel)
              } else if (event.key === "Escape") {
                setEditingLabel(false)
                setDraftLabel(editableLabelValue)
              }
            }}
            className="nodrag rounded-full border border-cyan-300/60 bg-white px-3 py-1 text-[9px] font-semibold text-slate-700 shadow-sm outline-none"
          />
        ) : (
          <div
            className={`cursor-grab rounded-full border border-slate-300/80 bg-white px-3 py-1 text-[9px] font-semibold shadow-sm active:cursor-grabbing ${
              labelPlaceholder ? "text-slate-400" : "text-slate-600"
            }`}
          >
            {label}
          </div>
        )}
        {selected || !editingLabel ? (
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full border border-slate-300/80 bg-white p-1.5 text-slate-500 shadow-sm transition hover:text-slate-700 ${
              selected
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(event) => {
              event.stopPropagation()
              setDraftLabel(editableLabelValue)
              setEditingLabel(true)
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            title="Edit node name"
          >
            <PencilIcon className="h-3 w-3" />
          </button>
        ) : null}
        </div>
        {selected || !editingLabel ? (
          <button
            type="button"
            className={`absolute right-2 top-0 z-10 inline-flex -translate-y-1/2 items-center justify-center rounded-xl border border-cyan-200/80 bg-cyan-300 px-2.5 py-2 text-slate-950 shadow-sm transition hover:bg-cyan-200 ${
              selected
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(event) => {
              event.stopPropagation()
              const reference = workbenchReferenceSegment
                ? `/workbench/${workbenchReferenceSegment}/node/${nodeId}`
                : nodeId
              void navigator.clipboard.writeText(reference)
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            title="Copy node reference"
          >
            <CopyReferenceIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {children}
      </div>
    </>
  )
}
