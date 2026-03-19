import { Handle, Position, type NodeProps } from "reactflow";

export function SemanticGraphNode({
  data,
}: NodeProps<{
  label: string;
  isActiveLayer?: boolean;
  onHide?: () => void;
}>) {
  return (
    <div className="relative w-[168px] rounded-2xl border border-stone-700/80 bg-zinc-950/95 px-4 py-4 text-center text-sm text-stone-50 shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
      {data.isActiveLayer && data.onHide ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onHide?.();
          }}
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/40 bg-amber-950/80 text-xs font-semibold text-amber-200 hover:bg-amber-900"
          title="Hide from active layer"
        >
          -
        </button>
      ) : null}
      <div className="text-lg font-medium leading-6 tracking-tight">{data.label}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
    </div>
  );
}
