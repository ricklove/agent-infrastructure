import { useState } from "react";
import type { GraphEdge, GraphNode } from "@agent-infrastructure/agent-graph-core";
import { NodeAvatar } from "./NodeAvatar";

type InspectorPanelProps = {
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  actions: {
    editNodeMeaning(sourceNodeId: string, label: string): void;
    connectVisibleNodes(sourceNodeId: string, targetNodeId: string): void;
    hideNodeFromLayer(layerId: string, sourceNodeId: string): void;
  };
};

export function InspectorPanel({
  selectedNode,
  selectedEdge,
  actions,
}: InspectorPanelProps) {
  const [labelDraft, setLabelDraft] = useState("");
  const [targetNodeId, setTargetNodeId] = useState("");

  return (
    <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
        Inspector
      </h2>
      {!selectedNode && !selectedEdge ? (
        <p className="mt-4 text-sm text-stone-400">
          Select a node, edge, or portal to inspect its local meaning.
        </p>
      ) : null}

      {selectedNode ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
              Node
            </div>
            <div className="mt-2 flex items-center gap-3">
              <NodeAvatar nodeKey={selectedNode.sourceId} label={selectedNode.label} />
              <div>
                <h3 className="text-sm font-medium text-stone-100">{selectedNode.label}</h3>
                <div className="text-[11px] text-stone-500">{selectedNode.sourcePath}</div>
              </div>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-300">{selectedNode.summary}</p>
          </div>

          {selectedNode.kind === "semantic-node" ? (
            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
              <label className="block text-xs uppercase tracking-[0.2em] text-stone-500">
                Edit node meaning
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-500"
                placeholder={selectedNode.label}
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (labelDraft.trim()) {
                    actions.editNodeMeaning(selectedNode.sourceId, labelDraft.trim());
                    setLabelDraft("");
                  }
                }}
                className="mt-2 rounded-full bg-emerald-400 px-4 py-1.5 text-sm font-medium text-stone-950 hover:bg-emerald-300"
              >
                Apply rename
              </button>
            </div>
          ) : null}

          {selectedNode.kind === "semantic-node" ? (
            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
              <label className="block text-xs uppercase tracking-[0.2em] text-stone-500">
                Connect visible nodes
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-500"
                placeholder="Target source node id"
                value={targetNodeId}
                onChange={(event) => setTargetNodeId(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (targetNodeId.trim()) {
                    actions.connectVisibleNodes(selectedNode.sourceId, targetNodeId.trim());
                    setTargetNodeId("");
                  }
                }}
                className="mt-2 rounded-full border border-sky-500/40 px-4 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/10"
              >
                Connect
              </button>
            </div>
          ) : null}

          {selectedNode.kind === "semantic-node" ? (
            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
              <label className="block text-xs uppercase tracking-[0.2em] text-stone-500">
                Collapse from active layer
              </label>
              <p className="mt-2 text-xs leading-5 text-stone-400">
                Removes this node from the current layer so it becomes hidden context again.
              </p>
              <button
                type="button"
                onClick={() =>
                  actions.hideNodeFromLayer(selectedNode.parentLayerId, selectedNode.sourceId)
                }
                className="mt-2 rounded-full border border-amber-500/40 px-4 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-500/10"
              >
                Hide from layer
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedEdge ? (
        <div className="mt-3 rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Edge</div>
          <h3 className="mt-1 text-sm font-medium text-stone-100">{selectedEdge.label}</h3>
          <p className="mt-1 text-xs leading-5 text-stone-300">
            {selectedEdge.kind === "derived"
              ? "Derived connection through hidden context."
              : selectedEdge.kind === "hidden-context"
                ? "Portal edge into hidden but present context."
                : "Direct visible relationship."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
