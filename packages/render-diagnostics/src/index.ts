type CounterMap = Record<string, number>;

type RenderDiagnosticsRegistry = {
  renders: CounterMap;
  events: CounterMap;
};

const renderDiagnosticsKey = Symbol.for("agent-infrastructure.render-diagnostics");

type GlobalWithRenderDiagnostics = typeof globalThis & {
  [renderDiagnosticsKey]?: RenderDiagnosticsRegistry;
};

function registry(): RenderDiagnosticsRegistry {
  const host = globalThis as GlobalWithRenderDiagnostics;
  if (!host[renderDiagnosticsKey]) {
    host[renderDiagnosticsKey] = {
      renders: {},
      events: {},
    };
  }
  return host[renderDiagnosticsKey];
}

function increment(counter: CounterMap, name: string): void {
  counter[name] = (counter[name] ?? 0) + 1;
}

export function useRenderCounter(name: string): void {
  increment(registry().renders, name);
}

export function countEvent(name: string): void {
  increment(registry().events, name);
}

export function readRenderDiagnostics(): RenderDiagnosticsRegistry {
  const current = registry();
  return {
    renders: { ...current.renders },
    events: { ...current.events },
  };
}

export function resetRenderDiagnostics(): void {
  const current = registry();
  current.renders = {};
  current.events = {};
}
