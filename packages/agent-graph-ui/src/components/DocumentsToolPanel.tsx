import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";

type DocumentsToolPanelProps = {
  store: AgentGraphStore;
};

export const DocumentsToolPanel = observer(function DocumentsToolPanel({
  store,
}: DocumentsToolPanelProps) {
  const workspace = useSelector(store.state$.workspace);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div>
        <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
          Documents
        </h2>
        <p className="text-[11px] text-stone-500">
          Agentish sources in this graph workspace.
        </p>
      </div>

      <div className="mt-3 min-h-0 space-y-2 overflow-auto pr-1">
        {workspace?.documents.map((document) => (
          <div
            key={document.id}
            className="rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
          >
            <div className="text-sm font-medium text-stone-100">{document.label}</div>
            <div className="mt-1 text-[11px] text-stone-500">{document.path}</div>
          </div>
        )) ?? (
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
            Loading documents…
          </div>
        )}
      </div>
    </section>
  );
});
