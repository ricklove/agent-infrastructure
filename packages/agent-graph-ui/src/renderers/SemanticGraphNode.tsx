import { Handle, Position, type NodeProps } from "reactflow";
import { NodeAvatar } from "../components/NodeAvatar";

export function SemanticGraphNode({
  data,
}: NodeProps<{
  label: string;
  sourceId: string;
  isActiveLayer?: boolean;
  isPinned?: boolean;
  onHide?: () => void;
  onTogglePin?: () => void;
}>) {
  return (
    <div
      className={`relative w-[168px] rounded-2xl px-4 py-4 text-center text-sm text-stone-50 shadow-[0_10px_40px_rgba(0,0,0,0.22)] ${
        data.isPinned
          ? "border border-emerald-500/70 bg-emerald-950/25"
          : "border border-stone-700/80 bg-zinc-950/95"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
      {data.isActiveLayer && data.onTogglePin ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onTogglePin?.();
          }}
          className={`absolute -left-2.5 -top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-[0_10px_24px_rgba(0,0,0,0.28)] ${
            data.isPinned
              ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              : "border-stone-600 bg-stone-900/90 text-stone-300 hover:bg-stone-800"
          }`}
          title={data.isPinned ? "Unpin node" : "Pin node"}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 3l7 7" />
            <path d="M9 8l7 7" />
            <path d="M15 2l7 7-4 4-7-7z" />
            <path d="M7 10l7 7" />
            <path d="M4 20l6-6" />
          </svg>
        </button>
      ) : null}
      {data.isActiveLayer && data.onHide ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onHide?.();
          }}
          className="absolute -right-2.5 -top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/50 bg-amber-950/90 text-amber-200 shadow-[0_10px_24px_rgba(0,0,0,0.28)] hover:bg-amber-900"
          title="Hide from active layer"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 9h14" />
            <path d="M5 15h14" />
          </svg>
        </button>
      ) : null}
      <div className="flex items-start gap-3 text-left">
        <NodeAvatar nodeKey={data.sourceId} label={data.label} />
        <div className="min-w-0 pt-0.5">
          <div className="text-base font-medium leading-5 tracking-tight text-stone-50">
            {data.label}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
    </div>
  );
}
