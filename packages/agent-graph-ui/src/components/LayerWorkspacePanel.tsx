import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";

type LayerWorkspacePanelProps = {
  store: AgentGraphStore;
  actions: {
    cloneLayer(layerId: string): void;
    requestDiff(): void;
  };
};

export const LayerWorkspacePanel = observer(function LayerWorkspacePanel({
  store,
  actions,
}: LayerWorkspacePanelProps) {
  const graph = useSelector(store.state$.graph);

  return (
    <aside className="rounded-3xl border border-stone-800 bg-stone-900/80 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-['Space_Grotesk'] text-lg font-medium text-stone-50">
            Layers
          </h2>
          <p className="text-sm text-stone-400">
            Materialized slices of the complete graph.
          </p>
        </div>
        <button
          type="button"
          onClick={() => actions.requestDiff()}
          className="rounded-full border border-stone-700 px-3 py-1 text-xs text-stone-200 hover:bg-stone-800"
        >
          Build diff
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {graph?.layers.map((layer) => (
          <div
            key={layer.id}
            className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-stone-100">{layer.label}</h3>
                <p className="text-xs text-stone-500">
                  {layer.nodeIds.length} source nodes · {layer.kind}
                </p>
              </div>
              <button
                type="button"
                onClick={() => actions.cloneLayer(layer.id)}
                className="rounded-full border border-stone-700 px-3 py-1 text-xs text-stone-200 hover:bg-stone-800"
              >
                Clone
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-stone-400">
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
