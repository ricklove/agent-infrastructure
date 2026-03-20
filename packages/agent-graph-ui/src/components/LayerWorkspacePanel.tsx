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

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
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

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {graph?.layers.map((layer) => (
          <div
            key={layer.id}
            className={
              activeLayerId === layer.id
                ? "rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-2.5 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]"
                : layer.visible
                  ? "rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
                  : "rounded-2xl border border-stone-800/70 bg-stone-950/40 p-2.5 opacity-70"
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={() => actions.setLayerVisibility(layer.id, !layer.visible)}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
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
                  <h3 className="text-sm font-medium text-stone-100">{layer.label}</h3>
                  <p className="text-[11px] text-stone-500">
                    {activeLayerId === layer.id ? "active · " : ""}
                    {layer.visible ? "visible" : "hidden"} ·{" "}
                    {layer.nodeIds.length} source nodes · {layer.kind}
                  </p>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => actions.cloneLayer(layer.id)}
                  className="rounded-full border border-stone-700 px-3 py-1 text-[11px] text-stone-200 hover:bg-stone-800"
                >
                  Clone
                </button>
              </div>
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
