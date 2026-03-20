import { useRef, useState } from "react";
import { observer, useMount, useValue } from "@legendapp/state/react";
import { createAgentGraphStore, findSelectedEdge, findSelectedNode } from "@agent-infrastructure/agent-graph-store";
import { createAgentGraphActions } from "@agent-infrastructure/agent-graph-store";
import { AgentGraphCanvas } from "./AgentGraphCanvas";
import { DiffPanel } from "./DiffPanel";
import { DocumentsToolPanel } from "./DocumentsToolPanel";
import { InspectorPanel } from "./InspectorPanel";
import { LayerWorkspacePanel } from "./LayerWorkspacePanel";
import { LayoutPhysicsPanel } from "./LayoutPhysicsPanel";
import { NodesToolPanel } from "./NodesToolPanel";

export type AgentGraphScreenProps = {
  appVersion?: string;
  serverOrigin?: string;
};

export const AgentGraphScreen = observer(function AgentGraphScreen({
  appVersion = "dev",
  serverOrigin = "http://localhost:8788",
}: AgentGraphScreenProps) {
  const [store] = useState(() => createAgentGraphStore(serverOrigin));
  const [actions] = useState(() => createAgentGraphActions(store));
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const [panelHeights, setPanelHeights] = useState([0.26, 0.28, 0.46]);

  useMount(() => {
    void actions.openWorkspace();
  });

  const connection = useValue(store.state$.connection);
  const workspace = useValue(store.state$.workspace);
  const graph = useValue(store.state$.graph);
  const validation = useValue(store.state$.validation);
  const conflict = useValue(store.state$.conflict);
  const activeLayerId = useValue(store.state$.activeLayerId);
  const pinnedNodeIds = useValue(store.state$.layout.pinnedNodeIds);
  const physicsEnabled = useValue(store.state$.layout.physicsEnabled);
  const springStrength = useValue(store.state$.layout.springStrength);
  const springLength = useValue(store.state$.layout.springLength);
  const straightenStrength = useValue(store.state$.layout.straightenStrength);
  const repulsionStrength = useValue(store.state$.layout.repulsionStrength);
  const selectedNode = useValue(() => findSelectedNode(store.state$.get()));
  const selectedEdge = useValue(() => findSelectedEdge(store.state$.get()));
  const activeLayerVisibleSemanticNodes = graph
    ? graph.nodes.filter(
        (node) => node.kind === "semantic-node" && (!activeLayerId || node.parentLayerId === activeLayerId),
      )
    : [];
  const pinnedVisibleNodeCount = activeLayerVisibleSemanticNodes.filter((node) =>
    pinnedNodeIds.includes(node.id),
  ).length;
  const movableNodeCount = activeLayerVisibleSemanticNodes.length - pinnedVisibleNodeCount;
  const revisionLabel = graph ? String(graph.revision) : "--";
  const connectionTone =
    connection.status === "ready"
      ? "text-emerald-300"
      : connection.status === "error"
        ? "text-rose-300"
        : "text-amber-200";
  const workspaceLabel = workspace ? "Loaded" : "Loading...";

  function beginResize(handleIndex: 0 | 1): void {
    const column = leftColumnRef.current;
    if (!column) {
      return;
    }

    const rect = column.getBoundingClientRect();
    const totalHeight = rect.height - 16;
    const startFractions = panelHeights;
    const startY = rect.top;

    function onPointerMove(event: PointerEvent): void {
      const pointerY = Math.min(Math.max(event.clientY - startY, 0), rect.height);
      const first = startFractions[0] * totalHeight;
      const second = startFractions[1] * totalHeight;
      const third = startFractions[2] * totalHeight;
      const minPanel = 96;

      if (handleIndex === 0) {
        const nextFirst = Math.min(Math.max(pointerY, minPanel), first + second - minPanel);
        const nextSecond = first + second - nextFirst;
        setPanelHeights([
          nextFirst / totalHeight,
          nextSecond / totalHeight,
          third / totalHeight,
        ]);
        return;
      }

      const currentOffset = first + 8 + second;
      const desiredSecond = Math.min(
        Math.max(pointerY - first - 8, minPanel),
        second + third - minPanel,
      );
      const nextThird = second + third - desiredSecond;
      setPanelHeights([
        first / totalHeight,
        desiredSecond / totalHeight,
        nextThird / totalHeight,
      ]);
    }

    function onPointerUp(): void {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return (
    <div className="relative h-screen overflow-hidden bg-stone-950 text-stone-100">
      <div className="h-full w-full">
        <AgentGraphCanvas store={store} actions={actions} />
      </div>

      <div className="pointer-events-none absolute inset-0 p-3">
        <div className="flex h-full items-start justify-between gap-3">
          <div
            ref={leftColumnRef}
            className="pointer-events-auto flex h-full w-[280px] max-w-[28vw] flex-col"
          >
            <div className="min-h-0" style={{ height: `${panelHeights[0] * 100}%` }}>
              <DocumentsToolPanel store={store} />
            </div>
            <button
              type="button"
              aria-label="Resize documents and layers panels"
              onPointerDown={() => beginResize(0)}
              className="my-1 h-2 cursor-row-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
            />
            <div className="min-h-0" style={{ height: `${panelHeights[1] * 100}%` }}>
              <LayerWorkspacePanel store={store} actions={actions} />
            </div>
            <button
              type="button"
              aria-label="Resize layers and nodes panels"
              onPointerDown={() => beginResize(1)}
              className="my-1 h-2 cursor-row-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
            />
            <div className="min-h-0" style={{ height: `${panelHeights[2] * 100}%` }}>
              <NodesToolPanel store={store} actions={actions} />
            </div>
            {(connection.error || (validation && !validation.accepted) || conflict) ? (
              <section className="mt-3 rounded-3xl border border-stone-800 bg-stone-900/80 p-3 text-sm">
                <div className="space-y-2">
                  {connection.error ? (
                    <div className="rounded-2xl border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                      {connection.error}
                    </div>
                  ) : null}
                  {validation && !validation.accepted ? (
                    <div className="rounded-2xl border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                      {validation.message}
                    </div>
                  ) : null}
                  {conflict ? (
                    <div className="rounded-2xl border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-rose-200">
                      {conflict.message}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          <div className="pointer-events-auto flex h-full min-h-0 w-[300px] max-w-[30vw] flex-col gap-3">
            <div className="self-end rounded-2xl border border-stone-800/90 bg-stone-950/88 px-3 py-2 text-xs text-stone-300 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                <span>Version: {appVersion}</span>
                <span className={connectionTone}>Connection: {connection.status}</span>
                <span>Workspace: {workspaceLabel}</span>
                <span>Revision: {revisionLabel}</span>
              </div>
            </div>
            <div className="shrink-0">
              <LayoutPhysicsPanel
                pinnedNodeCount={pinnedVisibleNodeCount}
                movableNodeCount={movableNodeCount}
                physicsEnabled={physicsEnabled}
                springStrength={springStrength}
                springLength={springLength}
                straightenStrength={straightenStrength}
                repulsionStrength={repulsionStrength}
                actions={actions}
              />
            </div>
            <div className="min-h-0 flex-1">
              <InspectorPanel
                actions={actions}
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
              />
            </div>
            <div className="shrink-0">
              <DiffPanel store={store} actions={actions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
