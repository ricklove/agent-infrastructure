import { useEffect, useMemo } from "react";
import { observer, useSelector } from "@legendapp/state/react";
import { createAgentGraphStore, findSelectedEdge, findSelectedNode } from "@agent-infrastructure/agent-graph-store";
import { createAgentGraphActions } from "@agent-infrastructure/agent-graph-store";
import { AgentGraphCanvas } from "./AgentGraphCanvas";
import { DiffPanel } from "./DiffPanel";
import { InspectorPanel } from "./InspectorPanel";
import { LayerWorkspacePanel } from "./LayerWorkspacePanel";

export type AgentGraphScreenProps = {
  serverOrigin?: string;
};

export const AgentGraphScreen = observer(function AgentGraphScreen({
  serverOrigin = "http://localhost:8788",
}: AgentGraphScreenProps) {
  const store = useMemo(() => createAgentGraphStore(serverOrigin), [serverOrigin]);
  const actions = useMemo(() => createAgentGraphActions(store), [store]);

  useEffect(() => {
    void actions.openWorkspace();
  }, [actions]);

  const connection = useSelector(store.state$.connection);
  const workspace = useSelector(store.state$.workspace);
  const graph = useSelector(store.state$.graph);
  const validation = useSelector(store.state$.validation);
  const conflict = useSelector(store.state$.conflict);
  const selectedNode = findSelectedNode(store.state$.get());
  const selectedEdge = findSelectedEdge(store.state$.get());

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 px-4 py-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)_340px] lg:grid-rows-[auto_minmax(0,1fr)]">
        <header className="rounded-3xl border border-stone-800 bg-stone-900/80 p-6 lg:col-span-3">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-emerald-300">
            Agent Graph
          </p>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="font-['Space_Grotesk'] text-4xl font-semibold tracking-tight text-stone-50">
                Graph-native Agentish workspace
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-300">
                Read-first, edit-capable, graph-only workspace for multi-document
                Agentish systems. Layers are persistent slices of one complete graph.
              </p>
            </div>
            <div className="grid gap-2 rounded-2xl border border-stone-800 bg-stone-950/80 px-4 py-3 text-sm">
              <div>
                <span className="text-stone-500">Connection</span>{" "}
                <strong className="text-stone-100">{connection.status}</strong>
              </div>
              <div>
                <span className="text-stone-500">Workspace</span>{" "}
                <strong className="text-stone-100">{workspace?.workspace.label ?? "Loading..."}</strong>
              </div>
              <div>
                <span className="text-stone-500">Revision</span>{" "}
                <strong className="text-stone-100">{graph?.revision ?? "--"}</strong>
              </div>
            </div>
          </div>
          {connection.error ? (
            <div className="mt-4 rounded-2xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
              {connection.error}
            </div>
          ) : null}
          {validation && !validation.accepted ? (
            <div className="mt-4 rounded-2xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
              {validation.message}
            </div>
          ) : null}
          {conflict ? (
            <div className="mt-4 rounded-2xl border border-rose-700/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {conflict.message}
            </div>
          ) : null}
        </header>

        <LayerWorkspacePanel store={store} actions={actions} />
        <AgentGraphCanvas store={store} actions={actions} />
        <div className="flex min-h-[540px] flex-col gap-4">
          <InspectorPanel
            actions={actions}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
          />
          <DiffPanel store={store} actions={actions} />
        </div>
      </div>
    </div>
  );
});
