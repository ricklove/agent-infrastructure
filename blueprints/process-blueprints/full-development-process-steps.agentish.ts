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
- Before implementation begins, the process should explicitly read the relevant blueprint, update that blueprint if needed, read the relevant blueprint-state, update that blueprint-state if needed, and confirm the current bounded implementation scope from those two artifacts.
- After each bounded implementation pass and local verification, the process should update the relevant blueprint-state before deciding whether the current scope is complete.
- After each blueprint-state update, the same fixed team profile reviewer set should review the blueprint-state against both the blueprint and the current implementation to verify that the recorded current reality is correct and to identify whether more implementation work is still required.
- The implementation loop should not advance to milestone commit or branch integration until the team agrees that the blueprint-state is correct for the current candidate and that no more implementation changes are required for the current scope.
- If the team finds the blueprint-state incorrect, incomplete, or indicative of more required implementation work, the process should loop back into implementation rather than continuing forward.
- Completion means blueprint work, implementation, verification, integration into \`development\`, promotion of that integrated commit onto \`main\`, release-tag creation from the promoted commit, runtime deployment, and live validation are all finished.
- The process remains unresolved until the agent emits either the exact full-development-process done token or the exact full-development-process blocked token.
- Immediate idle continuation for this process should arrive as a system ticket step message and should cause resumed execution work by default, not merely a textual status reply.
- Idle before deployed verification is unresolved work, not a completed session.
- Provider-reported idle before that explicit terminal token should make ticket-owned continuation immediately eligible.
- Provider error before that explicit terminal token should enter retry or escalation handling rather than being mistaken for ordinary idle.
- Any terminal completion token should only be used when the entire process is complete.
- Completion also requires that any required manager-dashboard screenshot be posted into the chat as a markdown image from the approved temporary image space under \`~/temp\`, not as a plain filesystem link.
`);
