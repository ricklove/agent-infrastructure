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
- After loading the relevant blueprints, the agent should complete one implementation iteration on the active focus before reassessing whether the loop continues, pauses, or blocks.
- The default outcome after a successful implementation iteration is to continue the loop and return to the blueprint-loading step.
- The loop should pause only when the operator explicitly asks to stop, switch processes, or preserve the current state without continuing.
- The loop should block only for a real user dependency or environment dependency rather than for ordinary uncertainty that can be resolved by another implementation iteration.
- Development Loop may run for a long time, but it remains stateless at the process-definition level and uses the same ticket-owned step progression model as other procedural process blueprints.
`);
