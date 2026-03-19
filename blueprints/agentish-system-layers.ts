export type AgentishSystemLayerId =
  | "concept"
  | "scenarios"
  | "implementation-plan"
  | "contracts";

export type AgentishSystemLayer = {
  id: AgentishSystemLayerId;
  purpose: string;
  decides: readonly string[];
  excludes: readonly string[];
  becomesMechanicalFor: AgentishSystemLayerId | null;
};

export const agentishSystemLayers = [
  {
    id: "concept",
    purpose: "Define what the system is, why it exists, and what must stay true.",
    decides: [
      "system purpose",
      "core abstractions",
      "source of truth",
      "invariants",
      "non-goals",
    ],
    excludes: [
      "package layout",
      "transport choices",
      "store structure",
      "exact type syntax",
    ],
    becomesMechanicalFor: "scenarios",
  },
  {
    id: "scenarios",
    purpose: "Define canonical end-to-end behavior and acceptance flows.",
    decides: [
      "important user stories",
      "success outcomes",
      "failure and conflict behavior",
      "observable round-trip flows",
    ],
    excludes: [
      "package boundaries",
      "component names",
      "exact payload fields",
      "internal helper structure",
    ],
    becomesMechanicalFor: "implementation-plan",
  },
  {
    id: "implementation-plan",
    purpose: "Resolve all non-mechanical architecture decisions.",
    decides: [
      "package graph",
      "file ownership",
      "runtime boundaries",
      "state ownership",
      "transport model",
      "authority model",
    ],
    excludes: [
      "fluffy user-story prose",
      "obvious inferred boilerplate",
      "redundant pseudo-types",
    ],
    becomesMechanicalFor: "contracts",
  },
  {
    id: "contracts",
    purpose: "Define exact shared machine-readable structures.",
    decides: [
      "exact exported types",
      "exact message envelopes",
      "exact store shape",
      "exact request and response shapes",
    ],
    excludes: [
      "behavioral explanation already covered by scenarios",
      "architecture rationale already covered by implementation-plan",
    ],
    becomesMechanicalFor: null,
  },
] as const satisfies readonly AgentishSystemLayer[];

export const agentishSystemLayerRules = [
  "Each lower layer must be mechanically derivable from the layer above it.",
  "Use the densest TypeScript form that removes ambiguity at that layer.",
  "Do not restate details that are already implied by a stronger layer.",
  "User stories belong in scenarios as acceptance flows, not product prose.",
] as const;
