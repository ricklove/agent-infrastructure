import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { observer, useMount, useValue } from "@legendapp/state/react";
import { createAgentGraphStore, findSelectedEdge, findSelectedNode } from "@agent-infrastructure/agent-graph-store";
import { createAgentGraphActions } from "@agent-infrastructure/agent-graph-store";
import { AgentGraphCanvas } from "./AgentGraphCanvas";
import { DiffPanel } from "./DiffPanel";
import { DocumentsToolPanel } from "./DocumentsToolPanel";
import { InspectorPanel, type InspectorSelectionItem } from "./InspectorPanel";
import { LayerWorkspacePanel } from "./LayerWorkspacePanel";
import { LayoutPhysicsPanel } from "./LayoutPhysicsPanel";
import { NodesToolPanel } from "./NodesToolPanel";

export type AgentGraphScreenProps = {
  appVersion?: string;
  serverOrigin?: string;
};

const DEFAULT_LEFT_COLUMN_WIDTH = 280;
const DEFAULT_RIGHT_COLUMN_WIDTH = 300;
const MIN_COLUMN_WIDTH = 240;
const MAX_COLUMN_WIDTH = 480;

function clampColumnWidth(width: number): number {
  if (typeof window === "undefined") {
    return width;
  }
  const maxWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.floor(window.innerWidth * 0.4)));
  return Math.min(
    Math.max(width, MIN_COLUMN_WIDTH),
    maxWidth,
  );
}

function columnWidthsStorageKey(workspaceId: string): string {
  return `agent-graph:column-widths:${workspaceId}`;
}

export const AgentGraphScreen = observer(function AgentGraphScreen({
  appVersion = "dev",
  serverOrigin = "http://localhost:8788",
}: AgentGraphScreenProps) {
  const [copiedVersion, setCopiedVersion] = useState(false);
  const [store] = useState(() => createAgentGraphStore(serverOrigin));
  const [actions] = useState(() => createAgentGraphActions(store));
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const [leftPanelHeights, setLeftPanelHeights] = useState([0.26, 0.28, 0.46]);
  const [rightPanelHeights, setRightPanelHeights] = useState([0.18, 0.52, 0.3]);
  const [leftColumnWidth, setLeftColumnWidth] = useState(DEFAULT_LEFT_COLUMN_WIDTH);
  const [rightColumnWidth, setRightColumnWidth] = useState(DEFAULT_RIGHT_COLUMN_WIDTH);
  const [columnWidthsReady, setColumnWidthsReady] = useState(false);
  const [hidePreview, setHidePreview] = useState<{ layerId: string | null; sourceNodeIds: string[] }>({
    layerId: null,
    sourceNodeIds: [],
  });

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
  const repulsionStrength = useValue(store.state$.layout.repulsionStrength);
  const selectedNode = useValue(() => findSelectedNode(store.state$.get()));
  const selectedEdge = useValue(() => findSelectedEdge(store.state$.get()));
  const selectedNodeIds = useValue(store.state$.selection.nodeIds);
  const selectedNodes: InspectorSelectionItem[] =
    graph && selectedNodeIds.length > 0
      ? graph.nodes
          .filter((node) => selectedNodeIds.includes(node.id))
          .map((node) => ({
            id: node.id,
            sourceId: node.sourceId,
            parentLayerId: node.parentLayerId,
            label: node.label,
            sourcePath: node.sourcePath,
            kind: node.kind,
            isVisible: true,
          }))
      : [];
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
  const workspaceId = workspace?.workspace.id ?? null;
  const connectionTone =
    connection.status === "ready"
      ? "text-emerald-300"
      : connection.status === "error"
        ? "text-rose-300"
        : "text-amber-200";
  const workspaceLabel = workspace ? "Loaded" : "Loading...";
  const beginHidePreview = (layerId: string | null, sourceNodeIds: string[]) => {
    setHidePreview({ layerId, sourceNodeIds });
  };
  const endHidePreview = () => {
    setHidePreview((current) =>
      current.sourceNodeIds.length === 0 ? current : { layerId: null, sourceNodeIds: [] },
    );
  };

  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") {
      setColumnWidthsReady(false);
      return;
    }

    setColumnWidthsReady(false);
    const raw = window.localStorage.getItem(columnWidthsStorageKey(workspaceId));
    if (!raw) {
      setLeftColumnWidth(clampColumnWidth(DEFAULT_LEFT_COLUMN_WIDTH));
      setRightColumnWidth(clampColumnWidth(DEFAULT_RIGHT_COLUMN_WIDTH));
      setColumnWidthsReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<{ left: number; right: number }>;
      setLeftColumnWidth(clampColumnWidth(parsed.left ?? DEFAULT_LEFT_COLUMN_WIDTH));
      setRightColumnWidth(clampColumnWidth(parsed.right ?? DEFAULT_RIGHT_COLUMN_WIDTH));
    } catch {
      setLeftColumnWidth(clampColumnWidth(DEFAULT_LEFT_COLUMN_WIDTH));
      setRightColumnWidth(clampColumnWidth(DEFAULT_RIGHT_COLUMN_WIDTH));
    }
    setColumnWidthsReady(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !columnWidthsReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      columnWidthsStorageKey(workspaceId),
      JSON.stringify({
        left: leftColumnWidth,
        right: rightColumnWidth,
      }),
    );
  }, [columnWidthsReady, leftColumnWidth, rightColumnWidth, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleResize(): void {
      setLeftColumnWidth((current) => clampColumnWidth(current));
      setRightColumnWidth((current) => clampColumnWidth(current));
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function beginResize(
    columnRef: RefObject<HTMLDivElement | null>,
    panelHeights: number[],
    setPanelHeights: Dispatch<SetStateAction<number[]>>,
    handleIndex: 0 | 1,
  ): void {
    const column = columnRef.current;
    if (!column) {
      return;
    }

    const rect = column.getBoundingClientRect();
    const totalHeight = rect.height - 16;
    const startFractions = [...panelHeights];
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

  function beginColumnResize(side: "left" | "right", startClientX: number): void {
    const startX = startClientX;
    const startWidth = side === "left" ? leftColumnWidth : rightColumnWidth;

    function onPointerMove(event: PointerEvent): void {
      const deltaX = event.clientX - startX;
      const nextWidth = side === "left" ? startWidth + deltaX : startWidth - deltaX;
      if (side === "left") {
        setLeftColumnWidth(clampColumnWidth(nextWidth));
        return;
      }
      setRightColumnWidth(clampColumnWidth(nextWidth));
    }

    function onPointerUp(): void {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function copyVersionLabel(): void {
    const value = `Version: ${appVersion}`;
    void navigator.clipboard.writeText(value);
    setCopiedVersion(true);
    window.setTimeout(() => setCopiedVersion(false), 1200);
  }

  return (
    <div className="relative h-screen overflow-hidden bg-stone-950 text-stone-100">
      <div className="h-full w-full">
        <AgentGraphCanvas
          store={store}
          leftSidebarWidth={leftColumnWidth}
          rightSidebarWidth={rightColumnWidth}
          hidePreview={hidePreview}
          beginHidePreview={(layerId, sourceNodeIds) => beginHidePreview(layerId, sourceNodeIds)}
          endHidePreview={endHidePreview}
          actions={actions}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 p-3">
        <div className="flex h-full items-start">
          <div
            ref={leftColumnRef}
            className="pointer-events-auto flex h-full flex-col"
            style={{ width: leftColumnWidth }}
          >
            <div className="min-h-0" style={{ height: `${leftPanelHeights[0] * 100}%` }}>
              <DocumentsToolPanel store={store} />
            </div>
            <button
              type="button"
              aria-label="Resize documents and layers panels"
              onPointerDown={() =>
                beginResize(leftColumnRef, leftPanelHeights, setLeftPanelHeights, 0)
              }
              className="my-1 h-2 cursor-row-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
            />
            <div className="min-h-0" style={{ height: `${leftPanelHeights[1] * 100}%` }}>
              <LayerWorkspacePanel store={store} actions={actions} />
            </div>
            <button
              type="button"
              aria-label="Resize layers and nodes panels"
              onPointerDown={() =>
                beginResize(leftColumnRef, leftPanelHeights, setLeftPanelHeights, 1)
              }
              className="my-1 h-2 cursor-row-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
            />
            <div className="min-h-0" style={{ height: `${leftPanelHeights[2] * 100}%` }}>
              <NodesToolPanel
                store={store}
                actions={{
                  ...actions,
                  beginHidePreview: (layerId, sourceNodeIds) =>
                    beginHidePreview(layerId, sourceNodeIds),
                  endHidePreview,
                }}
              />
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
          <button
            type="button"
            aria-label="Resize left column width"
            onPointerDown={(event) => beginColumnResize("left", event.clientX)}
            className="pointer-events-auto mx-1.5 h-full w-2 cursor-col-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
          />
          <div className="min-w-0 flex-1" />

          <button
            type="button"
            aria-label="Resize right column width"
            onPointerDown={(event) => beginColumnResize("right", event.clientX)}
            className="pointer-events-auto mx-1.5 h-full w-2 cursor-col-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
          />
          <div
            className="pointer-events-auto flex h-full min-h-0 flex-col gap-3"
            style={{ width: rightColumnWidth }}
          >
            <div className="self-end rounded-2xl border border-stone-800/90 bg-stone-950/88 px-3 py-2 text-xs text-stone-300 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <span>Version: {appVersion}</span>
                  <button
                    type="button"
                    onClick={copyVersionLabel}
                    className="rounded-full border border-stone-700 px-2 py-0.5 text-[10px] text-stone-200 hover:bg-stone-800"
                    title="Copy version"
                  >
                    {copiedVersion ? "Copied" : "Copy"}
                  </button>
                </span>
                <span className={connectionTone}>Connection: {connection.status}</span>
                <span>Workspace: {workspaceLabel}</span>
                <span>Revision: {revisionLabel}</span>
              </div>
            </div>
            <div ref={rightColumnRef} className="flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 overflow-y-auto"
                style={{ height: `${rightPanelHeights[0] * 100}%` }}
              >
                <LayoutPhysicsPanel
                  pinnedNodeCount={pinnedVisibleNodeCount}
                  movableNodeCount={movableNodeCount}
                  physicsEnabled={physicsEnabled}
                  springStrength={springStrength}
                  springLength={springLength}
                  repulsionStrength={repulsionStrength}
                  actions={actions}
                />
              </div>
              <button
                type="button"
                aria-label="Resize physics and inspector panels"
                onPointerDown={() =>
                  beginResize(rightColumnRef, rightPanelHeights, setRightPanelHeights, 0)
                }
                className="my-1 h-2 cursor-row-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
              />
              <div
                className="min-h-0 overflow-y-auto"
                style={{ height: `${rightPanelHeights[1] * 100}%` }}
              >
                <InspectorPanel
                  actions={{
                    ...actions,
                    beginHidePreview: (layerId, sourceNodeIds) =>
                      beginHidePreview(layerId, sourceNodeIds),
                    endHidePreview,
                  }}
                  selectedNode={selectedNode}
                  selectedNodes={selectedNodes}
                  selectedEdge={selectedEdge}
                />
              </div>
              <button
                type="button"
                aria-label="Resize inspector and diff panels"
                onPointerDown={() =>
                  beginResize(rightColumnRef, rightPanelHeights, setRightPanelHeights, 1)
                }
                className="my-1 h-2 cursor-row-resize rounded-full bg-stone-800/80 transition hover:bg-stone-700"
              />
              <div
                className="min-h-0 overflow-y-auto"
                style={{ height: `${rightPanelHeights[2] * 100}%` }}
              >
                <DiffPanel store={store} actions={actions} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
