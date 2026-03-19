import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";

type LayerWorkspacePanelProps = {
  store: AgentGraphStore;
  actions: {
    cloneLayer(layerId: string): void;
    requestDiff(): void;
    setActiveLayer(layerId: string): void;
  };
};

export const LayerWorkspacePanel = observer(function LayerWorkspacePanel({
  store,
  actions,
}: LayerWorkspacePanelProps) {
  const graph = useSelector(store.state$.graph);
  const activeLayerId = useSelector(store.state$.activeLayerId);

  return (
    <aside className="rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
            Layers
          </h2>
        </div>
        <button
          type="button"
          onClick={() => actions.requestDiff()}
          className="rounded-full border border-stone-700 px-3 py-1 text-[11px] text-stone-200 hover:bg-stone-800"
        >
          Build diff
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {graph?.layers.map((layer) => (
          <div
            key={layer.id}
            className={
              activeLayerId === layer.id
                ? "rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-2.5 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                : "rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
            }
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => actions.setActiveLayer(layer.id)}
                className="min-w-0 text-left"
              >
                <h3 className="text-sm font-medium text-stone-100">{layer.label}</h3>
                <p className="text-[11px] text-stone-500">
                  {activeLayerId === layer.id ? "active · " : ""}
                  {layer.nodeIds.length} source nodes · {layer.kind}
                </p>
              </button>
              <button
                type="button"
                onClick={() => actions.cloneLayer(layer.id)}
                className="rounded-full border border-stone-700 px-3 py-1 text-[11px] text-stone-200 hover:bg-stone-800"
              >
                Clone
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-stone-400">
              Position: {Math.round(layer.x)}, {Math.round(layer.y)}
            </p>
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
