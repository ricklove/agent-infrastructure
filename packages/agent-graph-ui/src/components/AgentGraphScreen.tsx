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
    <div className="relative h-screen overflow-hidden bg-stone-950 text-stone-100">
      <div className="h-full w-full">
        <AgentGraphCanvas store={store} actions={actions} />
      </div>

      <div className="pointer-events-none absolute inset-0 p-3">
        <div className="flex h-full items-start justify-between gap-3">
          <div className="pointer-events-auto w-[280px] max-w-[28vw]">
            <LayerWorkspacePanel store={store} actions={actions} />
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

          <div className="pointer-events-auto flex w-[300px] max-w-[30vw] flex-col gap-3">
            <InspectorPanel
              actions={actions}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
            />
            <DiffPanel store={store} actions={actions} />
          </div>
        </div>
      </div>
    </div>
  );
});
