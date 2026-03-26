/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentDebugTools = define.blueprint("AgentDebugTools", {
  format: Agentish,
  role: "Repository-wide workflow for agent-operated browser debugging, render diagnosis, and targeted UI investigation",
});

const Artifact = {
  browserTool: define.document("AgentBrowserTool"),
  renderDiagnostics: define.document("RenderDiagnosticsBlueprint"),
  screenshot: define.document("DebugScreenshot"),
  snapshot: define.document("BrowserSnapshot"),
  consoleOutput: define.document("BrowserConsoleOutput"),
  errorOutput: define.document("BrowserErrorOutput"),
};

const Concept = {
  browserFirstDebugging: define.concept("BrowserFirstDebugging"),
  isolatedInteractionLoop: define.concept("IsolatedInteractionLoop"),
  renderCounterProbe: define.concept("RenderCounterProbe"),
  visibleDebugSurfacePreferred: define.concept("VisibleDebugSurfacePreferred"),
  consoleAsSecondarySignal: define.concept("ConsoleAsSecondarySignal"),
};

AgentDebugTools.contains(
  Artifact.browserTool,
  Artifact.renderDiagnostics,
  Artifact.screenshot,
  Artifact.snapshot,
  Artifact.consoleOutput,
  Artifact.errorOutput,
  Concept.browserFirstDebugging,
  Concept.isolatedInteractionLoop,
  Concept.renderCounterProbe,
  Concept.visibleDebugSurfacePreferred,
  Concept.consoleAsSecondarySignal,
);

AgentDebugTools.prescribes(`- UI debugging should begin in the browser with agent-browser rather than from code intuition alone.
- The render-diagnostics blueprint is the canonical prerequisite for repository-wide render counting and event counting.
- agent-browser snapshot, screenshot, console, errors, and eval are the canonical browser-debug surfaces on this machine.
- A render diagnosis loop should stay narrow: reset counters, perform one isolated interaction, read top counters, identify the hot subtree, then inspect code.
- agent-browser eval may read the shared render counter registry directly when a visible in-page debug surface does not yet exist.
- Browser console output and browser error output are useful secondary signals, but visible in-page debug surfaces are preferred when the investigation data should be repeatedly inspectable by agents.
- Saved screenshots and snapshots should be kept when they materially support a diagnosis or before/after comparison.
- Debug probes should prefer top-counter summaries over noisy per-render logging.
- Render investigations should compare the hot components observed in the browser against the intended memo or state-isolation boundaries in code.`);

AgentDebugTools.defines(`- BrowserFirstDebugging means starting with the actual rendered UI and observed browser behavior before changing code for a UI or rerender issue.
- IsolatedInteractionLoop means one narrow user action or state change is performed between counter reset and counter read so the hot render path remains attributable.
- RenderCounterProbe means reading the shared global render counter registry and ranking the highest counters to identify the hottest subtree.
- VisibleDebugSurfacePreferred means repeated debugging data should ideally be exposed in the page or another directly inspectable surface rather than existing only in transient console output.
- ConsoleAsSecondarySignal means browser console and uncaught page errors complement render probes but do not replace structured render-count data.`);

when(AgentDebugTools.investigates("a UI rerender problem"))
  .then(AgentDebugTools.expects(Artifact.browserTool))
  .and(AgentDebugTools.expects(Artifact.renderDiagnostics))
  .and(AgentDebugTools.expects(Concept.isolatedInteractionLoop))
  .and(AgentDebugTools.expects(Concept.renderCounterProbe));

when(UI.lacks("a visible debug surface for repeated render inspection"))
  .then(AgentDebugTools.prefers("agent-browser eval against the shared render counter registry"));
