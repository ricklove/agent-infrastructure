import { Handle, Position, type NodeProps } from "reactflow";

export function SemanticGraphNode({
  data,
}: NodeProps<{
  label: string;
}>) {
  return (
    <div className="relative w-[168px] rounded-2xl border border-stone-700/80 bg-zinc-950/95 px-4 py-4 text-center text-sm text-stone-50 shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
      <div className="text-lg font-medium leading-6 tracking-tight">{data.label}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
    </div>
  );
}
