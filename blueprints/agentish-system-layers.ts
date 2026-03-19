export type AgentishSystemLayerId =
  | "concept"
  | "scenarios"
  | "implementation-plan"
  | "contracts";

export type AgentishSystemLayer = readonly [
  purpose: string,
  decides: readonly string[],
  excludes: readonly string[],
  becomesMechanicalFor: AgentishSystemLayerId | null,
];

export const agentishSystemLayers = {
  concept: [
    "Define what the system is and what must stay true.",
    ["purpose", "core abstractions", "source of truth", "invariants", "non-goals"],
    ["package layout", "transport", "store structure", "exact type syntax"],
    "scenarios",
  ],
  scenarios: [
    "Define canonical end-to-end behavior.",
    ["user stories", "success outcomes", "failure behavior", "round-trip flows"],
    ["package boundaries", "component names", "payload fields", "helper structure"],
    "implementation-plan",
  ],
  "implementation-plan": [
    "Resolve all non-mechanical architecture decisions.",
    ["package graph", "file ownership", "runtime boundaries", "state ownership", "transport", "authority"],
    ["fluffy story prose", "obvious boilerplate", "pseudo-types"],
    "contracts",
  ],
  contracts: [
    "Define exact machine-readable shared structures.",
    ["exported types", "message envelopes", "store shape", "request/response shapes"],
    ["behavior already covered by scenarios", "architecture rationale already covered by implementation-plan"],
    null,
  ],
} as const satisfies Record<AgentishSystemLayerId, AgentishSystemLayer>;

export const agentishSystemLayerRules = [
  "Each lower layer must be mechanically derivable from the layer above it.",
  "Use the densest TypeScript form that removes ambiguity at that layer.",
  "Do not restate details that are already implied by a stronger layer.",
  "User stories belong in scenarios as acceptance flows, not product prose.",
] as const;
