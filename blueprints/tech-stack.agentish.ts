/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const TechStack = define.blueprint("TechStack", {
  format: Agentish,
  role: "Repository-wide technology choices and canonical implementation stack",
});

const Surface = {
  runtime: define.surface("RuntimeSurface"),
  frontend: define.surface("FrontendSurface"),
  backend: define.surface("BackendSurface"),
  verification: define.surface("VerificationSurface"),
  formatting: define.surface("FormattingSurface"),
  diagnostics: define.surface("DiagnosticsSurface"),
};

const Stack = {
  language: define.technology("TypeScript"),
  packageRuntime: define.technology("Bun"),
  frontendBuild: define.technology("Vite"),
  frontendUi: define.technology("React"),
  frontendStyling: define.technology("TailwindCss"),
  graphUi: define.technology("ReactFlow"),
  formatting: define.technology("Biome"),
  browserVerification: define.technology("AgentBrowser"),
  renderDiagnostics: define.technology("GlobalRenderCounterUtility"),
  debugWorkflow: define.technology("AgentDebugWorkflow"),
};

TechStack.contains(
  Surface.runtime,
  Surface.frontend,
  Surface.backend,
  Surface.verification,
  Surface.formatting,
  Surface.diagnostics,
  Stack.language,
  Stack.packageRuntime,
  Stack.frontendBuild,
  Stack.frontendUi,
  Stack.frontendStyling,
  Stack.graphUi,
  Stack.formatting,
  Stack.browserVerification,
  Stack.renderDiagnostics,
  Stack.debugWorkflow,
);

Surface.runtime.uses(Stack.packageRuntime, Stack.language);
Surface.frontend.uses(Stack.frontendBuild, Stack.frontendUi, Stack.frontendStyling);
Surface.backend.uses(Stack.packageRuntime, Stack.language);
Surface.verification.uses(Stack.browserVerification);
Surface.formatting.uses(Stack.formatting);
Surface.diagnostics.uses(Stack.language, Stack.frontendUi, Stack.renderDiagnostics, Stack.debugWorkflow);

TechStack.prescribes(`- TypeScript is the canonical implementation language for repository source.
- Bun is the canonical workspace runtime, package manager, and task runner unless a more specific repository blueprint closes a narrower exception.
- Vite is the canonical frontend composition and bundling surface for browser applications in this repository.
- React is the canonical browser UI runtime.
- Tailwind CSS is the canonical static styling system for browser UI.
- React Flow is the canonical graph-canvas rendering surface where graph interaction is required.
- Biome is the canonical formatter and linter surface where repository formatting or lint automation is defined.
- Biome should own canonical import ordering and static Tailwind class ordering where repository automation supports those normalizations safely.
- agent-browser is the canonical browser-verification tool on this machine for UI behavior and visual verification.
- A small internal global render-counter utility is the canonical rerender-diagnosis surface for React UI overrendering and event-churn investigation.
- The repository's agent-debug-tools blueprint is the canonical workflow surface for using agent-browser, render counters, snapshots, console output, and targeted browser eval during UI debugging.
- New implementation should prefer the canonical stack over introducing alternate frameworks, styling systems, build tools, or verification surfaces without an explicit blueprint change.
- Stack exceptions belong here before they spread into implementation.`);

TechStack.defines(`- Canonical means default, preferred, and expected for new work unless an explicit blueprint closes a different choice.
- TailwindCss means static presentation should be expressed through the repository styling system rather than ad hoc CSS or inline-style drift.
- Biome means the repository's code-shaping automation surface for formatting, linting, import organization, and other explicitly enabled safe canonicalization passes.
- AgentBrowser means the browser-verification surface expected by development-process for responsive and live UI validation on this machine.
- GlobalRenderCounterUtility means the repository's shared globalThis-backed render and event counter surface used for React rerender diagnosis without third-party tooling dependencies.
- AgentDebugWorkflow means the repository's canonical procedure for browser debugging and render diagnosis using agent-browser plus the shared render counter surface.
- Stack exception means a materially different technology choice that changes authoring, runtime, styling, verification, or repository maintenance expectations.`);

when(Repository.introduces("a new framework or tooling surface"))
  .then(TechStack.expects("an explicit stack decision"))
  .and(TechStack.expects("a blueprint revision before implementation dependence"));

when(Implementation.bypasses(Stack.frontendStyling))
  .then(TechStack.encounters("styling divergence"));

when(Implementation.bypasses(Stack.browserVerification))
  .then(TechStack.encounters("verification drift"));
