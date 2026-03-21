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

  async function handleOpenBoard() {
    const currentPath = workspace?.board.path ?? "";
    const options = boards.map((board) => board.path).join("\n");
    const nextPath = window.prompt(
      `Open board\n\nAvailable boards:\n${options}`,
      currentPath,
    );
    if (!nextPath || nextPath.trim() === "" || nextPath === currentPath) {
      return;
    }
    await actions.openBoard(nextPath.trim());
  }

  async function handleSaveBoardAs() {
    const currentPath = workspace?.board.path ?? "new.board.json";
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

  async function handleAddDocument() {
    const nextPath = window.prompt(
      "Add document to board\nRelative to the board file",
      "./new-document.agentish.ts",
    );
    if (!nextPath || nextPath.trim() === "") {
      return;
    }
    await actions.addBoardDocument(nextPath.trim());
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
            onClick={() => void handleOpenBoard()}
            className="rounded-full border border-stone-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-200 hover:bg-stone-800"
          >
            Open
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

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">
          Documents
        </div>
        <button
          type="button"
          onClick={() => void handleAddDocument()}
          className="rounded-full border border-stone-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-200 hover:bg-stone-800"
        >
          Add
        </button>
      </div>

      <div className="mt-2 min-h-0 space-y-2 overflow-auto pr-1">
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
