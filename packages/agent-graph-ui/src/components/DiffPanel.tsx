import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";

type DiffPanelProps = {
  store: AgentGraphStore;
  actions: {
    requestDiff(): void;
  };
};

export const DiffPanel = observer(function DiffPanel({
  store,
  actions,
}: DiffPanelProps) {
  const diff = useSelector(store.state$.diff);
  const conflict = useSelector(store.state$.conflict);

  return (
    <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-['Space_Grotesk'] text-lg font-medium text-stone-50">
            Diff & trust
          </h2>
          <p className="text-sm text-stone-400">
            Explain change before asking for resolution.
          </p>
        </div>
        <button
          type="button"
          onClick={() => actions.requestDiff()}
          className="rounded-full border border-stone-700 px-3 py-1 text-xs text-stone-200 hover:bg-stone-800"
        >
          Refresh diff
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-300">
        {diff ? (
          <>
            <p>
              Diff revision <strong>{diff.revision}</strong>
            </p>
            <p className="mt-2 text-stone-400">
              Changed nodes: {diff.changedNodeIds.length} · Changed edges:{" "}
              {diff.changedEdgeIds.length}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {diff.layers.map((layer) => (
                <span
                  key={layer.id}
                  className="rounded-full border border-stone-700 px-3 py-1 text-xs text-stone-200"
                >
                  {layer.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p>No diff layers yet. Build diff from the current workspace.</p>
        )}
      </div>

      {conflict ? (
        <div className="mt-4 rounded-2xl border border-rose-700/60 bg-rose-950/40 p-3 text-sm text-rose-200">
          <p className="font-medium">{conflict.code}</p>
          <p className="mt-2">{conflict.message}</p>
        </div>
      ) : null}
    </section>
  );
});
