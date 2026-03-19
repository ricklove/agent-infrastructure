import { Handle, Position, type NodeProps } from "reactflow";

export function HiddenContextPortalNode({ data }: NodeProps<{
  label: string;
  summary: string;
  hiddenCount: number;
}>) {
  return (
    <div
      title={data.summary}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-amber-500/50 bg-amber-950/90 text-sm font-semibold text-amber-100 shadow-[0_8px_24px_rgba(120,53,15,0.32)]"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-amber-300 !bg-amber-400 !opacity-0"
      />
      <span>{data.hiddenCount}</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-amber-300 !bg-amber-400 !opacity-0"
      />
    </div>
  );
}
