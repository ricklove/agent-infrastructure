import { Handle, Position, type NodeProps } from "reactflow";

export function HiddenContextPortalNode({ data }: NodeProps<{
  label: string;
  summary: string;
  hiddenCount: number;
}>) {
  return (
    <div className="relative w-28 rounded-full border border-amber-500/40 bg-amber-950/80 px-3 py-2 text-left text-xs text-amber-100 shadow-lg">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-amber-300 !bg-amber-400"
      />
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
        Hidden
      </div>
      <div className="mt-0.5 text-sm font-medium">{data.hiddenCount} linked</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-amber-300 !bg-amber-400"
      />
    </div>
  );
}
