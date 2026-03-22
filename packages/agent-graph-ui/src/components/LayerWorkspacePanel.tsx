import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";

type LayerWorkspacePanelProps = {
  store: AgentGraphStore;
  actions: {
    cloneLayer(layerId: string): void;
    requestDiff(): void;
    setLayerVisibility(layerId: string, visible: boolean): void;
    setActiveLayer(layerId: string): void;
  };
};

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-700 text-stone-200 hover:bg-stone-800"
    >
      {children}
    </button>
  );
}

function DiffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 8l7-5 7 5" />
      <path d="M19 16l-7 5-7-5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
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
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      {visible ? null : <path d="M4 20 20 4" />}
    </svg>
  );
}

export const LayerWorkspacePanel = observer(function LayerWorkspacePanel({
  store,
  actions,
}: LayerWorkspacePanelProps) {
  const graph = useSelector(store.state$.graph);
  const activeLayerId = useSelector(store.state$.activeLayerId);
  const layers = [...(graph?.layers ?? [])].sort((left, right) => {
    if (left.id === activeLayerId) {
      return -1;
    }
    if (right.id === activeLayerId) {
      return 1;
    }
    if (left.visible !== right.visible) {
      return left.visible ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
  const visibleCount = layers.filter((layer) => layer.visible).length;
  const hiddenCount = layers.length - visibleCount;

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
            Layers
          </h2>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.16em] text-stone-500">
            <span>{layers.length} total</span>
            <span>{visibleCount} visible</span>
            {hiddenCount > 0 ? <span>{hiddenCount} hidden</span> : null}
          </div>
        </div>
        <IconButton title="Build diff" onClick={() => actions.requestDiff()}>
          <DiffIcon />
        </IconButton>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={
              activeLayerId === layer.id
                ? "rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-2 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                : layer.visible
                  ? "rounded-2xl border border-stone-800 bg-stone-950/70 p-2"
                  : "rounded-2xl border border-stone-800/70 bg-stone-950/40 p-2 opacity-70"
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => actions.setLayerVisibility(layer.id, !layer.visible)}
                  className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    layer.visible
                      ? "border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                      : "border-stone-700 text-stone-300 hover:bg-stone-800"
                  }`}
                  title={layer.visible ? "Hide layer" : "Show layer"}
                >
                  <VisibilityIcon visible={layer.visible} />
                </button>
                <button
                  type="button"
                  onClick={() => actions.setActiveLayer(layer.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        activeLayerId === layer.id ? "bg-emerald-400" : "bg-stone-600"
                      }`}
                    />
                    <h3 className="truncate text-sm font-medium text-stone-100">{layer.label}</h3>
                  </div>
                  <div className="mt-1 text-[11px] text-stone-400">
                    {layer.nodeIds.length} nodes
                  </div>
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <IconButton title="Clone layer" onClick={() => actions.cloneLayer(layer.id)}>
                  <CopyIcon />
                </IconButton>
              </div>
            </div>
          </div>
        )) ?? (
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
            Loading layers…
          </div>
        )}
      </div>
    </aside>
  );
});
