/// <reference path="../_agentish.d.ts" />

// Development Loop Blueprint Guide

const Agentish = define.language("Agentish");

const DevelopmentLoopGuide = define.system("DevelopmentLoopGuide", {
  format: Agentish,
  role: "Optional explanatory companion for the development-loop process blueprint",
});

DevelopmentLoopGuide.enforces(`
- Development Loop is for long-running iterative implementation where the operator wants the agent to keep cycling instead of treating one milestone as terminal by default.
- Each iteration begins by loading the target blueprint or blueprints for the current focus so the next implementation pass is grounded in the current repository contract rather than in stale transcript memory.
- After loading the relevant blueprints, the agent should complete one implementation iteration on the active focus before choosing the next iteration shape.
- After a successful implementation iteration, the loop should choose one of three next-pass outcomes: fix a bug, improve the code architecture, or add tests.
- Each development-loop outcome should route back to the blueprint-loading step instead of terminating or blocking the loop.
- Development Loop should not expose pause, stop, or blocked outcomes in its process-definition layer.
- Development Loop may run for a long time, but it remains stateless at the process-definition level and uses the same ticket-owned step progression model as other procedural process blueprints.
`);
