import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";

type DocumentsToolPanelProps = {
  store: AgentGraphStore;
  actions: {
    openBoard(path: string): Promise<void>;
    saveBoardAs(path: string, label?: string): Promise<void>;
    addBoardDocument(path: string): Promise<void>;
    refreshBoards(): Promise<void>;
  };
};

export const DocumentsToolPanel = observer(function DocumentsToolPanel({
  store,
  actions,
}: DocumentsToolPanelProps) {
  const workspace = useSelector(store.state$.workspace);
  const boards = useSelector(store.state$.boards);
  const documents = useSelector(store.state$.documents);

  async function handleSaveBoardAs() {
    const currentPath = workspace?.board.path ?? "projects/new.board.json";
    const nextPath = window.prompt("Save board as", currentPath);
    if (!nextPath || nextPath.trim() === "") {
      return;
    }
    const nextLabel = window.prompt(
      "Board label",
      workspace?.board.label ?? "Untitled Board",
    );
    await actions.saveBoardAs(nextPath.trim(), nextLabel?.trim() || undefined);
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
            Board
          </h2>
          <p className="text-[11px] text-stone-500">
            Repo-backed board file and included Agentish documents.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void actions.refreshBoards()}
            className="rounded-full border border-stone-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-200 hover:bg-stone-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleSaveBoardAs()}
            className="rounded-full border border-stone-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-200 hover:bg-stone-800"
          >
            Save As
          </button>
        </div>
      </div>

      {workspace ? (
        <div className="mt-3 rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5">
          <div className="text-sm font-medium text-stone-100">{workspace.board.label}</div>
          <div className="mt-1 text-[11px] text-stone-500">{workspace.board.path}</div>
        </div>
      ) : null}

      <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">
        Boards
      </div>

      <div className="mt-2 max-h-36 min-h-0 space-y-2 overflow-auto pr-1">
        {boards.length > 0 ? (
          boards.map((board) => {
            const isCurrent = board.path === workspace?.board.path;
            return (
              <button
                key={board.path}
                type="button"
                disabled={isCurrent}
                onClick={() => void actions.openBoard(board.path)}
                className={`block w-full rounded-2xl border p-2.5 text-left ${
                  isCurrent
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-stone-800 bg-stone-950/70 hover:bg-stone-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-stone-100">{board.label}</div>
                  {isCurrent ? (
                    <div className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-200">
                      Open
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 text-[11px] text-stone-500">{board.path}</div>
              </button>
            );
          })
        ) : (
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
            No boards found.
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">
        Board Documents
      </div>

      <div className="mt-2 max-h-36 min-h-0 space-y-2 overflow-auto pr-1">
        {workspace?.documents.length ? (
          workspace.documents.map((document) => (
            <div
              key={document.id}
              className="rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
            >
              <div className="text-sm font-medium text-stone-100">{document.label}</div>
              <div className="mt-1 text-[11px] text-stone-500">{document.path}</div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
            Loading documents…
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">
        Available Agentish Documents
      </div>

      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {documents.length > 0 ? (
          documents.map((document) => {
            const alreadyIncluded = workspace?.documents.some(
              (current) => current.path === `/home/ec2-user/workspace/${document.path}`,
            );
            return (
              <div
                key={document.path}
                className="rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-100">
                      {document.label}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">{document.path}</div>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyIncluded}
                    onClick={() => void actions.addBoardDocument(document.path)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${
                      alreadyIncluded
                        ? "border-stone-800 text-stone-600"
                        : "border-stone-700 text-stone-200 hover:bg-stone-800"
                    }`}
                  >
                    {alreadyIncluded ? "Added" : "Add"}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
            No Agentish documents found.
          </div>
        )}
      </div>
    </section>
  );
});
