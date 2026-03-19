import type { NodeProps } from "reactflow";

export function HiddenContextPortalNode({ data }: NodeProps<{
  label: string;
  summary: string;
  hiddenCount: number;
}>) {
  return (
    <div className="w-32 rounded-2xl border border-amber-500/40 bg-amber-950/70 px-3 py-2 text-left text-xs text-amber-100 shadow-lg">
      <div className="font-semibold uppercase tracking-[0.2em] text-amber-300">
        Hidden
      </div>
      <div className="mt-1 text-sm font-medium">{data.hiddenCount} linked</div>
      <div className="mt-2 line-clamp-3 text-[11px] leading-4 text-amber-100/80">
        {data.summary}
      </div>
    </div>
  );
}
