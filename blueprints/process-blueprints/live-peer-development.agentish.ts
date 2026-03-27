/// <reference path="../_agentish.d.ts" />

// Live Peer Development Process Blueprint Guide

const Agentish = define.language("Agentish");

const LivePeerDevelopmentGuide = define.system("LivePeerDevelopmentGuide", {
  format: Agentish,
  role: "Optional explanatory companion for the live-peer-development process blueprint",
});

LivePeerDevelopmentGuide.enforces(`
- The operator and provider-backed agent should treat the development-process blueprint as the execution contract for live peer development, except that merge, release promotion, deploy, and manager-host live validation remain deferred.
- Live Peer Development starts from the same worker-backed feature-branch setup as full development process work.
- Live Peer Development should expose a worker preview dashboard URL so the operator can inspect the in-progress app with HMR while the agent continues iterating.
- Live Peer Development should checkpoint coherent progress as stable feature-branch commits instead of leaving preview work only in dirty worker state.
- Live Peer Development should expect continued operator feedback from the live worker preview and should resume implementation or refinement work from that feedback by default.
- Live Peer Development may include implementation changes, UI mockups, or high-level dashboard design outputs without requiring every request to become a release-ready change immediately.
- Completion means the live peer development loop is intentionally paused or concluded at a stable feature-branch milestone, not that the work has been merged or deployed.
- The process remains unresolved until the agent emits either the exact live-peer-development done token or the exact live-peer-development blocked token.
`);
