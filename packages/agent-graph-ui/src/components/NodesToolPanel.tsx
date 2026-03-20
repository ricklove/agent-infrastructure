import { useMemo, useState } from "react";
import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";
import { NodeAvatar } from "./NodeAvatar";
import { VisibilityIcon } from "./VisibilityIcon";

type NodesToolPanelProps = {
  store: AgentGraphStore;
  actions: {
    toggleLayerNode(layerId: string, sourceNodeId: string, include: boolean): void;
    beginHidePreview(layerId: string, sourceNodeIds: string[]): void;
    endHidePreview(): void;
  };
};

export const NodesToolPanel = observer(function NodesToolPanel({
  store,
  actions,
}: NodesToolPanelProps) {
  const [query, setQuery] = useState("");
  const workspace = useSelector(store.state$.workspace);
  const graph = useSelector(store.state$.graph);
  const activeLayerId = useSelector(store.state$.activeLayerId);

  const activeLayer = graph?.layers.find((layer) => layer.id === activeLayerId) ?? null;
  const activeNodeIds = new Set(activeLayer?.nodeIds ?? []);

  const filteredNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nodes = workspace?.nodes ?? [];
    if (!normalizedQuery) {
      return nodes;
    }

    return nodes.filter((node) => {
      const haystack = `${node.label} ${node.kind} ${node.summary}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, workspace?.nodes]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
            Nodes
          </h2>
          <p className="text-[11px] text-stone-500">
            {activeLayer ? `Layer: ${activeLayer.label}` : "No active layer"}
          </p>
        </div>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search nodes"
        className="mt-3 w-full rounded-2xl border border-stone-700 bg-stone-950/80 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-500"
      />

      <div className="mt-3 max-h-[40vh] space-y-2 overflow-auto pr-1">
        {filteredNodes.map((node) => {
          const isVisible = activeNodeIds.has(node.id);
          return (
            <div
              key={node.id}
              className="rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={!activeLayer}
                  onClick={() => {
                    if (!activeLayer) {
                      return;
                    }
                    actions.toggleLayerNode(activeLayer.id, node.id, !isVisible);
                  }}
                  className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isVisible
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                  } disabled:border-stone-800 disabled:bg-stone-900/60 disabled:text-stone-600`}
                  title={isVisible ? "Hide from active layer" : "Show in active layer"}
                  onMouseEnter={() => {
                    if (activeLayer && isVisible) {
                      actions.beginHidePreview(activeLayer.id, [node.id]);
                    }
                  }}
                  onMouseLeave={actions.endHidePreview}
                  onFocus={() => {
                    if (activeLayer && isVisible) {
                      actions.beginHidePreview(activeLayer.id, [node.id]);
                    }
                  }}
                  onBlur={actions.endHidePreview}
                >
                  <VisibilityIcon visible={isVisible} />
                </button>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <NodeAvatar nodeKey={node.id} label={node.label} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-100">
                      {node.label}
                    </div>
                    <div className="truncate text-[11px] text-stone-500">
                      {node.sourcePath}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                      {node.kind}
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-400">{node.summary}</p>
            </div>
          );
        })}

        {filteredNodes.length === 0 ? (
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
            No nodes match this search.
          </div>
        ) : null}
      </div>
    </section>
  );
});
