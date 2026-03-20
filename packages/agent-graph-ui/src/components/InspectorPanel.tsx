import { useState } from "react";
import type { GraphEdge, GraphNode } from "@agent-infrastructure/agent-graph-core";
import { NodeAvatar } from "./NodeAvatar";
import { VisibilityIcon } from "./VisibilityIcon";

export type InspectorSelectionItem = {
  id: string;
  sourceId: string;
  parentLayerId: string;
  label: string;
  sourcePath?: string;
  kind: GraphNode["kind"];
  isVisible: boolean;
};

type InspectorPanelProps = {
  selectedNode: GraphNode | null;
  selectedNodes: InspectorSelectionItem[];
  selectedEdge: GraphEdge | null;
  actions: {
    editNodeMeaning(sourceNodeId: string, label: string): void;
    connectVisibleNodes(sourceNodeId: string, targetNodeId: string): void;
    hideNodeFromLayer(layerId: string, sourceNodeId: string): void;
    showNodeInLayer(layerId: string, sourceNodeId: string): void;
    revealConnectedHiddenContext(sourceNodeId: string, layerId: string): void;
    beginHidePreview(layerId: string, sourceNodeIds: string[]): void;
    endHidePreview(): void;
  };
};

export function InspectorPanel({
  selectedNode,
  selectedNodes,
  selectedEdge,
  actions,
}: InspectorPanelProps) {
  const [labelDraft, setLabelDraft] = useState("");
  const [targetNodeId, setTargetNodeId] = useState("");
  const multiSelectedNodes = selectedNodes.filter((node) => node.kind === "semantic-node");
  const hasMultiSelection = multiSelectedNodes.length > 1;

  return (
    <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
        Inspector
      </h2>
      {!selectedNode && !selectedEdge && !hasMultiSelection ? (
        <p className="mt-4 text-sm text-stone-400">
          Select a node, edge, or portal to inspect its local meaning.
        </p>
      ) : null}

      {hasMultiSelection ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
              Selection
            </div>
            <h3 className="mt-2 text-sm font-medium text-stone-100">
              {multiSelectedNodes.length} nodes selected
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {multiSelectedNodes.slice(0, 16).map((node) => (
                <div
                  key={node.id}
                  className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] ${
                    node.isVisible
                      ? "border-stone-700 bg-stone-900/80 text-stone-200"
                      : "border-stone-800 bg-stone-950/70 text-stone-500"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      node.isVisible
                        ? actions.hideNodeFromLayer(node.parentLayerId, node.sourceId)
                        : actions.showNodeInLayer(node.parentLayerId, node.sourceId)
                    }
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                      node.isVisible
                        ? "border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                        : "border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                    }`}
                    title={node.isVisible ? "Hide from active layer" : "Show in active layer"}
                    onMouseEnter={() => {
                      if (node.isVisible) {
                        actions.beginHidePreview(node.parentLayerId, [node.sourceId]);
                      }
                    }}
                    onMouseLeave={actions.endHidePreview}
                    onFocus={() => {
                      if (node.isVisible) {
                        actions.beginHidePreview(node.parentLayerId, [node.sourceId]);
                      }
                    }}
                    onBlur={actions.endHidePreview}
                  >
                    <VisibilityIcon visible={node.isVisible} className="h-3 w-3" />
                  </button>
                  <NodeAvatar nodeKey={node.sourceId} label={node.label} size="sm" />
                  <span className="max-w-[180px] truncate">{node.label}</span>
                </div>
              ))}
            </div>
            {multiSelectedNodes.length > 16 ? (
              <p className="mt-2 text-xs text-stone-400">
                Showing 16 of {multiSelectedNodes.length} selected nodes.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedNode && !hasMultiSelection ? (
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
                Expand hidden context
              </label>
              <p className="mt-2 text-xs leading-5 text-stone-400">
                Reveals every hidden incoming and outgoing neighbor connected to this node in the active layer.
              </p>
              <button
                type="button"
                onClick={() =>
                  actions.revealConnectedHiddenContext(
                    selectedNode.sourceId,
                    selectedNode.parentLayerId,
                  )
                }
                className="mt-2 rounded-full border border-emerald-500/40 px-4 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/10"
              >
                Expand connected hidden nodes
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
                onMouseEnter={() =>
                  actions.beginHidePreview(selectedNode.parentLayerId, [selectedNode.sourceId])
                }
                onMouseLeave={actions.endHidePreview}
                onFocus={() =>
                  actions.beginHidePreview(selectedNode.parentLayerId, [selectedNode.sourceId])
                }
                onBlur={actions.endHidePreview}
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
