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
- The process remains unresolved until the agent emits either the exact full-development-process done token or the exact full-development-process blocked token.
- A watchdog prompt for this process should cause resumed execution work by default, not merely a textual status reply.
- Idle before deployed verification is unresolved work, not a completed session.
- Provider-reported idle before that explicit terminal token should make the watchdog immediately eligible.
- Provider error before that explicit terminal token should enter retry or escalation handling rather than being mistaken for ordinary idle.
- The watchdog completion token should only be used when the entire process is complete.
`);
