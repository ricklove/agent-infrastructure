import { observer, useSelector } from "@legendapp/state/react";
import { useMemo, useState } from "react";
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

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-700 text-stone-200 hover:bg-stone-800"
    >
      {children}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

export const DocumentsToolPanel = observer(function DocumentsToolPanel({
  store,
  actions,
}: DocumentsToolPanelProps) {
  const workspace = useSelector(store.state$.workspace);
  const boards = useSelector(store.state$.boards);
  const documents = useSelector(store.state$.documents);
  const [picker, setPicker] = useState<null | "boards" | "documents">(null);
  const [query, setQuery] = useState("");

  const filteredBoards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return boards;
    }
    return boards.filter((board) =>
      `${board.label} ${board.path}`.toLowerCase().includes(needle),
    );
  }, [boards, query]);

  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return documents;
    }
    return documents.filter((document) =>
      `${document.label} ${document.path}`.toLowerCase().includes(needle),
    );
  }, [documents, query]);

  function openPicker(kind: "boards" | "documents"): void {
    setQuery("");
    setPicker(kind);
  }

  function closePicker(): void {
    setPicker(null);
    setQuery("");
  }

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
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
            Board
          </h2>
          {workspace ? (
            <div className="mt-1 truncate text-[11px] text-stone-500">{workspace.board.label}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <IconButton title="Refresh boards" onClick={() => void actions.refreshBoards()}>
            <RefreshIcon />
          </IconButton>
          <IconButton title="Open board" onClick={() => openPicker("boards")}>
            <FolderIcon />
          </IconButton>
          <IconButton title="Add document" onClick={() => openPicker("documents")}>
            <PlusIcon />
          </IconButton>
          <IconButton title="Save board as" onClick={() => void handleSaveBoardAs()}>
            <SaveIcon />
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {workspace ? (
          <div className="mt-3 rounded-2xl border border-stone-800 bg-stone-950/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-stone-100">
                  {workspace.board.label}
                </div>
                <div className="mt-1 truncate text-[11px] text-stone-500">{workspace.board.path}</div>
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-200">
                Open
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">
            Documents
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-stone-600">
            {workspace?.documents.length ?? 0}
          </div>
        </div>

        <div className="mt-2 min-h-0 space-y-2 overflow-auto pr-1">
          {workspace?.documents.length ? (
            workspace.documents.map((document) => (
              <div
                key={document.id}
                className="rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5"
              >
                <div className="text-sm font-medium text-stone-100">{document.label}</div>
                <div className="mt-1 truncate text-[11px] text-stone-500">{document.path}</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-sm text-stone-400">
              Loading documents…
            </div>
          )}
        </div>

      </div>

      {picker ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-sm"
          onClick={closePicker}
        >
          <div
            className="w-full max-w-4xl rounded-[2rem] border border-stone-700 bg-[linear-gradient(180deg,rgba(28,25,23,0.98),rgba(12,10,9,0.98))] shadow-[0_24px_100px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-800 px-5 py-4">
              <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-medium text-stone-50">
                  {picker === "boards" ? "Open Board" : "Add Document"}
                </h3>
                <p className="mt-1 text-sm text-stone-400">
                  {picker === "boards"
                    ? "Pick a workspace board to open."
                    : "Pick an Agentish document to include in the current board."}
                </p>
                <div className="mt-2 inline-flex rounded-full border border-stone-700 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-300">
                  {picker === "boards" ? `${boards.length} boards` : `${documents.length} documents`}
                </div>
              </div>
              <button
                type="button"
                onClick={closePicker}
                className="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-stone-200 hover:bg-stone-800"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={picker === "boards" ? "Search boards" : "Search documents"}
                className="w-full rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-100 outline-none ring-0 placeholder:text-stone-500 focus:border-stone-500"
              />
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-auto px-5 pb-5">
              {picker === "boards"
                ? filteredBoards.map((board) => {
                    const isCurrent = board.path === workspace?.board.path;
                    return (
                      <button
                        key={board.path}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          void actions.openBoard(board.path);
                          closePicker();
                        }}
                        className={`block w-full rounded-[1.5rem] border p-4 text-left transition ${
                          isCurrent
                            ? "border-amber-500/40 bg-amber-500/10"
                            : "border-stone-800 bg-stone-900/90 hover:border-stone-500 hover:bg-stone-900"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-medium text-stone-100">{board.label}</div>
                          <div
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${
                              isCurrent
                                ? "border-amber-500/40 text-amber-200"
                                : "border-stone-700 text-stone-300"
                            }`}
                          >
                            {isCurrent ? "Current" : "Open"}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-stone-500">{board.path}</div>
                      </button>
                    );
                  })
                : filteredDocuments.map((document) => {
                    const alreadyIncluded = workspace?.documents.some(
                      (current) => current.path === `/home/ec2-user/workspace/${document.path}`,
                    );
                    return (
                      <button
                        key={document.path}
                        type="button"
                        disabled={alreadyIncluded}
                        onClick={() => {
                          void actions.addBoardDocument(document.path);
                          closePicker();
                        }}
                        className={`block w-full rounded-[1.5rem] border p-4 text-left transition ${
                          alreadyIncluded
                            ? "border-stone-800 bg-stone-900/60"
                            : "border-stone-800 bg-stone-900/90 hover:border-stone-500 hover:bg-stone-900"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium text-stone-100">
                              {document.label}
                            </div>
                            <div className="mt-2 text-xs text-stone-500">{document.path}</div>
                          </div>
                          <div
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${
                              alreadyIncluded
                                ? "border-stone-700 text-stone-500"
                                : "border-stone-700 text-stone-300"
                            }`}
                          >
                            {alreadyIncluded ? "Added" : "Add"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              {picker === "boards" && filteredBoards.length === 0 ? (
                <div className="rounded-2xl border border-stone-800 bg-stone-900 p-4 text-sm text-stone-400">
                  No boards match this search.
                </div>
              ) : null}
              {picker === "documents" && filteredDocuments.length === 0 ? (
                <div className="rounded-2xl border border-stone-800 bg-stone-900 p-4 text-sm text-stone-400">
                  No documents match this search.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
});
