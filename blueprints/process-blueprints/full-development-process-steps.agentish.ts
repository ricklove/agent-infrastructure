/// <reference path="../_agentish.d.ts" />

// Full Development Process (Nested Steps) Blueprint Guide

const Agentish = define.language("Agentish");

const FullDevelopmentProcessStepsGuide = define.system("FullDevelopmentProcessStepsGuide", {
  format: Agentish,
  role: "Optional explanatory companion for the full-development-process-steps process blueprint",
});

FullDevelopmentProcessStepsGuide.enforces(`
- The operator and provider-backed agent should treat the development-process blueprint as the execution contract for feature work.
- Full Development Process (Nested Steps) uses a worker-hosted feature-branch worktree as its active mutable implementation surface and does not use the manager host shared checkout, a manager-hosted worktree, or a worker shared checkout as an editing surface.
- The process should not reuse an existing feature branch or worktree unless the agent created it earlier in the current process and has already verified that it is the intended mutable surface.
- After creating the worker-hosted feature-branch worktree, the agent should merge only the additional upstream branch or branches that are actually ahead and intentionally required before continuing with implementation work.
- Completion means blueprint work, implementation, verification, integration into \`development\`, promotion of that integrated commit onto \`main\`, release-tag creation from the promoted commit, runtime deployment, and live validation are all finished.
- The process remains unresolved until the agent emits either the exact full-development-process done token or the exact full-development-process blocked token.
- Immediate idle continuation for this process should arrive as a system ticket step message and should cause resumed execution work by default, not merely a textual status reply.
- Idle before deployed verification is unresolved work, not a completed session.
- Provider-reported idle before that explicit terminal token should make ticket-owned continuation immediately eligible.
- Provider error before that explicit terminal token should enter retry or escalation handling rather than being mistaken for ordinary idle.
- Any terminal completion token should only be used when the entire process is complete.
- Completion also requires that any required manager-dashboard screenshot be posted into the chat as a markdown image from the approved temporary image space under \`~/temp\`, not as a plain filesystem link.
`);
