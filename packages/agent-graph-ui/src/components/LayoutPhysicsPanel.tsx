type LayoutPhysicsPanelProps = {
  pinnedNodeCount: number;
  movableNodeCount: number;
  physicsEnabled: boolean;
  springStrength: number;
  springLength: number;
  straightenStrength: number;
  repulsionStrength: number;
  actions: {
    setPhysicsEnabled(enabled: boolean): void;
    setSpringStrength(value: number): void;
    setSpringLength(value: number): void;
    setStraightenStrength(value: number): void;
    setRepulsionStrength(value: number): void;
  };
};

export function LayoutPhysicsPanel({
  pinnedNodeCount,
  movableNodeCount,
  physicsEnabled,
  springStrength,
  springLength,
  straightenStrength,
  repulsionStrength,
  actions,
}: LayoutPhysicsPanelProps) {
  return (
    <section className="rounded-3xl border border-stone-800 bg-stone-900/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-['Space_Grotesk'] text-base font-medium text-stone-50">
            Layout
          </h2>
          <p className="mt-1 text-xs text-stone-400">
            Pinned nodes stay fixed. Unpinned visible nodes in the active layer settle by connection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => actions.setPhysicsEnabled(!physicsEnabled)}
          className="rounded-full border border-emerald-500/40 px-3 py-1 text-[11px] font-medium text-emerald-200 enabled:hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-stone-700 disabled:text-stone-500"
        >
          Physics: {physicsEnabled ? "On" : "Off"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-300">
        <div className="rounded-2xl border border-stone-800 bg-stone-950/70 px-3 py-2">
          <div className="text-stone-500">Pinned</div>
          <div className="mt-1 text-sm font-medium text-stone-100">{pinnedNodeCount}</div>
        </div>
        <div className="rounded-2xl border border-stone-800 bg-stone-950/70 px-3 py-2">
          <div className="text-stone-500">Moving</div>
          <div className="mt-1 text-sm font-medium text-stone-100">{movableNodeCount}</div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <label className="block">
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
            <span>Spring force</span>
            <span>{springStrength.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.01"
            value={springStrength}
            onChange={(event) => actions.setSpringStrength(Number(event.target.value))}
            className="w-full accent-sky-400"
          />
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
            <span>Spring length</span>
            <span>{springLength}</span>
          </div>
          <input
            type="range"
            min="40"
            max="280"
            step="2"
            value={springLength}
            onChange={(event) => actions.setSpringLength(Number(event.target.value))}
            className="w-full accent-sky-400"
          />
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
            <span>Straighten</span>
            <span>{straightenStrength.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.6"
            step="0.01"
            value={straightenStrength}
            onChange={(event) => actions.setStraightenStrength(Number(event.target.value))}
            className="w-full accent-amber-400"
          />
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
            <span>Repulsion</span>
            <span>{repulsionStrength}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1200"
            step="10"
            value={repulsionStrength}
            onChange={(event) => actions.setRepulsionStrength(Number(event.target.value))}
            className="w-full accent-emerald-400"
          />
        </label>
      </div>
    </section>
  );
}
