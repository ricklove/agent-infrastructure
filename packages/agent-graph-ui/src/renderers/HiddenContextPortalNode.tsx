import { memo, useState } from "react";
import { NodeAvatar } from "../components/NodeAvatar";
import { Handle, Position, type NodeProps } from "reactflow";

export const HiddenContextPortalNode = memo(function HiddenContextPortalNode({ data }: NodeProps<{
  label: string;
  summary: string;
  sourceId: string;
  hiddenCount: number;
  hiddenNodes?: Array<{
    sourceId: string;
    label: string;
    sourcePath?: string;
  }>;
  onRevealHiddenNode?: (hiddenNodeId: string) => void;
  isHidePreview?: boolean;
}>) {
  const [expanded, setExpanded] = useState(false);
  const hiddenNodes = data.hiddenNodes ?? [];
  const previewNodes = expanded ? hiddenNodes : hiddenNodes.slice(0, 3);
  const columnCount = expanded
    ? Math.max(1, Math.ceil(Math.sqrt(hiddenNodes.length)))
    : previewNodes.length;
  const canToggle = hiddenNodes.length > 3;

  return (
    <div
      title={data.summary}
      className={`nodrag nopan relative rounded-2xl border border-amber-500/50 bg-amber-950/90 px-2 py-2 text-sm font-semibold text-amber-100 shadow-[0_8px_24px_rgba(120,53,15,0.32)] ${
        data.isHidePreview ? "opacity-25" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-amber-300 !bg-amber-400 !opacity-0"
      />
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {previewNodes.map((hiddenNode) => (
          <button
            key={hiddenNode.sourceId}
            type="button"
            title={hiddenNode.sourcePath ? `${hiddenNode.label}\n${hiddenNode.sourcePath}` : hiddenNode.label}
            onClick={(event) => {
              event.stopPropagation();
              data.onRevealHiddenNode?.(hiddenNode.sourceId);
            }}
            className="nodrag nopan rounded-full transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
          >
            <NodeAvatar nodeKey={hiddenNode.sourceId} label={hiddenNode.label} size="sm" />
          </button>
        ))}
      </div>
      {canToggle ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="nodrag nopan mt-2 rounded-full border border-amber-400/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-200 hover:bg-amber-500/10"
        >
          {expanded ? "Collapse" : `Show all ${hiddenNodes.length}`}
        </button>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-amber-300 !bg-amber-400 !opacity-0"
      />
    </div>
  );
});
