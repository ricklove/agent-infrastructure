import { memo } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "reactflow";
import { NodeAvatar } from "../components/NodeAvatar";
import { VisibilityIcon } from "../components/VisibilityIcon";

function CopyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function humanizeKind(kind: string): string {
  return kind.replace(/[-_]+/g, " ");
}

function nodeTypeTheme(sourceKind?: string): {
  accent: string;
  tint: string;
  label: string | null;
} {
  const normalized = sourceKind?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return {
      accent: "border-stone-600/80 text-stone-300",
      tint: "from-stone-400/10 via-transparent to-transparent",
      label: null,
    };
  }

  if (/(actor|user|agent|operator|participant)/.test(normalized)) {
    return {
      accent: "border-cyan-500/60 text-cyan-200",
      tint: "from-cyan-400/14 via-cyan-400/4 to-transparent",
      label: humanizeKind(normalized),
    };
  }

  if (/(system|runtime|service|server|adapter|provider)/.test(normalized)) {
    return {
      accent: "border-emerald-500/60 text-emerald-200",
      tint: "from-emerald-400/14 via-emerald-400/4 to-transparent",
      label: humanizeKind(normalized),
    };
  }

  if (/(workspace|board|layer|plane|graph|session)/.test(normalized)) {
    return {
      accent: "border-violet-500/60 text-violet-200",
      tint: "from-violet-400/14 via-violet-400/4 to-transparent",
      label: humanizeKind(normalized),
    };
  }

  if (/(document|artifact|file|blueprint|transcript|summary)/.test(normalized)) {
    return {
      accent: "border-amber-500/60 text-amber-200",
      tint: "from-amber-400/14 via-amber-400/4 to-transparent",
      label: humanizeKind(normalized),
    };
  }

  if (/(concept|truth|policy|status|meaning|language)/.test(normalized)) {
    return {
      accent: "border-fuchsia-500/60 text-fuchsia-200",
      tint: "from-fuchsia-400/14 via-fuchsia-400/4 to-transparent",
      label: humanizeKind(normalized),
    };
  }

  return {
    accent: "border-sky-500/60 text-sky-200",
    tint: "from-sky-400/14 via-sky-400/4 to-transparent",
    label: humanizeKind(normalized),
  };
}

export const SemanticGraphNode = memo(function SemanticGraphNode({
  data,
  selected,
}: NodeProps<{
  label: string;
  sourceId: string;
  sourcePath?: string;
  kind?: string;
  sourceKind?: string;
  summary?: string;
  isActiveLayer?: boolean;
  isPinned?: boolean;
  onHide?: () => void;
  onTogglePin?: () => void;
  showSelectionToolbar?: boolean;
  selectionToolbarNodeIds?: string[];
  selectionHiddenCount?: number;
  onExpandSelectionHidden?: () => void;
  onHideSelection?: () => void;
  onCopySelectionReferences?: () => void;
  onPreviewHide?: () => void;
  onClearHidePreview?: () => void;
  onPreviewHideSelection?: () => void;
}>) {
  const selectionCount = data.selectionToolbarNodeIds?.length ?? 0;
  const hiddenCount = data.selectionHiddenCount ?? 0;
  const theme = nodeTypeTheme(data.sourceKind);

  return (
    <div
      className={`group relative min-w-[168px] max-w-[320px] rounded-2xl px-4 py-4 text-center text-sm text-stone-50 shadow-[0_10px_40px_rgba(0,0,0,0.22)] ${
        selected
          ? "border border-sky-400 bg-sky-950/20 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_14px_44px_rgba(0,0,0,0.28)]"
          : data.isPinned
            ? "border border-emerald-500/70 bg-emerald-950/25"
            : "border border-stone-700/80 bg-zinc-950/95"
      }`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-2xl bg-gradient-to-b ${theme.tint}`} />
      {data.showSelectionToolbar && data.selectionToolbarNodeIds?.length ? (
        <NodeToolbar
          nodeId={data.selectionToolbarNodeIds}
          isVisible
          position={Position.Top}
          align="end"
          offset={12}
          className="nodrag nopan"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-stone-700/90 bg-stone-950/92 px-3 py-2 text-xs text-stone-200 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onExpandSelectionHidden?.();
              }}
              className="inline-flex min-w-[2.75rem] items-center justify-center gap-1.5 rounded-full border border-emerald-500/40 px-2.5 py-1.5 font-medium text-emerald-200 hover:bg-emerald-500/10"
              title={`Expand ${hiddenCount} hidden node${hiddenCount === 1 ? "" : "s"}`}
            >
              <VisibilityIcon visible className="h-3.5 w-3.5" />
              <span>{hiddenCount}</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onHideSelection?.();
              }}
              className="inline-flex min-w-[2.75rem] items-center justify-center gap-1.5 rounded-full border border-amber-500/40 px-2.5 py-1.5 font-medium text-amber-200 hover:bg-amber-500/10"
              onMouseEnter={() => data.onPreviewHideSelection?.()}
              onMouseLeave={() => data.onClearHidePreview?.()}
              onFocus={() => data.onPreviewHideSelection?.()}
              onBlur={() => data.onClearHidePreview?.()}
              title={`Hide ${selectionCount} selected node${selectionCount === 1 ? "" : "s"}`}
            >
              <VisibilityIcon visible={false} className="h-3.5 w-3.5" />
              <span>{selectionCount}</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onCopySelectionReferences?.();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-600/90 text-stone-200 hover:bg-stone-800/80"
              title={`Copy references for ${selectionCount} selected node${selectionCount === 1 ? "" : "s"}`}
            >
              <CopyIcon />
            </button>
          </div>
        </NodeToolbar>
      ) : null}
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
          className="absolute -left-2.5 -top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/50 bg-amber-950/90 text-amber-200 opacity-0 shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-opacity hover:bg-amber-900 group-hover:opacity-100"
          title="Hide from active layer"
          onMouseEnter={() => data.onPreviewHide?.()}
          onMouseLeave={() => data.onClearHidePreview?.()}
          onFocus={() => data.onPreviewHide?.()}
          onBlur={() => data.onClearHidePreview?.()}
        >
          <VisibilityIcon visible />
        </button>
      ) : null}
      {data.isActiveLayer && data.onTogglePin ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onTogglePin?.();
          }}
          className={`absolute -right-2.5 -top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-opacity ${
            data.isPinned
              ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 opacity-100"
              : "border-stone-600 bg-stone-900/90 text-stone-300 hover:bg-stone-800 opacity-0 group-hover:opacity-100"
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
      <div className="flex items-start gap-3 text-left">
        <NodeAvatar nodeKey={data.sourceId} label={data.label} />
        <div className="min-w-0 pt-0.5">
          <div className="text-base font-medium leading-5 tracking-tight text-stone-50">
            {data.label}
          </div>
          {theme.label ? (
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full border ${theme.accent}`} />
              <div className={`text-[10px] uppercase tracking-[0.16em] ${theme.accent}`}>
                {theme.label}
              </div>
            </div>
          ) : data.kind ? (
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-500">
              {humanizeKind(data.kind)}
            </div>
          ) : null}
          {data.summary ? (
            <div className="mt-1 line-clamp-3 text-[11px] leading-4 text-stone-400">
              {data.summary}
            </div>
          ) : null}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-stone-500 !bg-stone-500 !opacity-0"
      />
    </div>
  );
});
