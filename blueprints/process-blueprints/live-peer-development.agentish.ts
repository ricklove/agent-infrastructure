/// <reference path="../_agentish.d.ts" />

// Live Peer Development Process Blueprint Guide

const Agentish = define.language("Agentish");

const LivePeerDevelopmentGuide = define.system("LivePeerDevelopmentGuide", {
  format: Agentish,
  role: "Optional explanatory companion for the live-peer-development process blueprint",
});

LivePeerDevelopmentGuide.enforces(`
- The operator and provider-backed agent should treat the development-process blueprint as the execution contract for live peer development, except that merge, release promotion, deploy, and manager-host live validation remain deferred.
- Live Peer Development starts from the same worker-backed feature-branch setup as full development process work, including merging any relevant upstream from `origin/development` or `origin/main` into the worker feature branch before continuing.
- Live Peer Development uses the worker checkout as its only active mutable surface and does not use the manager host shared checkout as an editing surface.
- After the worker-hosted feature branch is ready and the persistent worker terminal is connected, the agent should review and update the relevant blueprints before implementation, preview setup, or user-facing tunnel sharing continues.
- The active preview surface for Live Peer Development must run on a swarm worker EC2 instance and must not be the manager dashboard.
- The agent should ensure a worker is running, connect to it through a persistent ssh-driven worker terminal, and use that worker as the active development surface for the feature branch.
- The worker preview should run from the feature-branch checkout of agent-infrastructure on the worker rather than from the manager checkout.
- The worker preview should use the same dashboard setup shape as the manager dashboard, except that it runs against the worker-local checkout, worker-local runtime surface, and worker-local state.
- The worker preview should be exposed through a worker-specific tunnel URL that is clearly distinct from the manager dashboard tunnel, whether that worker tunnel is temporary or named.
- The agent should provide the worker preview dashboard URL to the operator only after the relevant blueprints have been reviewed, the current revision is implemented, and the worker preview is running.
- Live Peer Development should keep the worker preview available while the operator tests the app and sends rapid follow-up suggestions.
- Live Peer Development should preserve fast feedback loops such as Vite HMR for frontend changes and quick worker Bun-server restarts when backend or gateway changes require them.
- Live Peer Development should checkpoint coherent progress as stable feature-branch commits instead of leaving preview work only in dirty worker state.
- Live Peer Development should expect continued operator feedback from the live worker preview and should resume implementation or refinement work from that feedback by default.
- Live Peer Development may include implementation changes, UI mockups, or high-level dashboard design outputs without requiring every request to become a release-ready change immediately.
- Completion means the live peer development loop is intentionally paused or concluded at a stable feature-branch milestone, not that the work has been merged or deployed.
- The process remains unresolved until the agent emits either the exact live-peer-development done token or the exact live-peer-development blocked token.
`);
