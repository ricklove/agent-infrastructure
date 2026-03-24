/// <reference path="../_agentish.d.ts" />

// Full Development Process Process Blueprint Guide

const Agentish = define.language("Agentish");

const FullDevelopmentProcessGuide = define.system("FullDevelopmentProcessGuide", {
  format: Agentish,
  role: "Optional explanatory companion for the full-development-process process blueprint",
});

FullDevelopmentProcessGuide.enforces(`
- The operator and provider-backed agent should treat the development-process blueprint as the execution contract for feature work.
- Completion means blueprint work, implementation, verification, release promotion, runtime deployment, and live validation are all finished.
- Idle before deployed verification is unresolved work, not a completed session.
- The watchdog completion token should only be used when the entire process is complete.
`);
