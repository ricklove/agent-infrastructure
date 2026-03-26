/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Layered system design",
});

const SystemLayers = define.layerSystem("AgentishSystemLayers", {
  format: Agentish,
  describes: "How system meaning, behavior, architecture, and contracts separate",
});

const Layer = {
  concept: define.layer("ConceptLayer", {
    decides: "system meaning",
    avoids: "architecture and schema detail",
  }),
  scenarios: define.layer("ScenariosLayer", {
    decides: "acceptance behavior",
    avoids: "architecture and schema detail",
  }),
  implementationPlan: define.layer("ImplementationPlanLayer", {
    decides: "all implementation-relevant decisions",
    avoids: "redundant behavior and pseudo-schemas",
  }),
  contracts: define.layer("ContractsLayer", {
    decides: "exact machine-readable shapes",
    avoids: "behavior and rationale already modeled above",
  }),
};

SystemLayers.contains(
  Layer.concept,
  Layer.scenarios,
  Layer.implementationPlan,
  Layer.contracts,
);

Layer.concept.precedes(Layer.scenarios);
Layer.scenarios.precedes(Layer.implementationPlan);
Layer.implementationPlan.precedes(Layer.contracts);

Layer.concept.answers(
  "Why does the system exist?",
  "What are the core abstractions?",
  "What is authoritative?",
  "What must always remain true?",
);
Layer.scenarios.answers(
  "What must work end to end?",
  "What do humans observe?",
  "What counts as success?",
  "What do conflicts look like?",
);
Layer.implementationPlan.answers(
  "What code structure exists?",
  "Where do responsibilities live?",
  "Who owns state, transport, parsing, projection, and mutation?",
  "How does the implemented system behave?",
  "What implementation choices remain closed?",
);
Layer.contracts.answers(
  "What exact types exist?",
  "What exact messages exist?",
  "What exact action contracts exist?",
  "What exact store shape exists?",
  "What exact schemas cross boundaries?",
);

Layer.scenarios.contains("canonical acceptance flows");
Layer.scenarios.rejects("loose product prose");
Layer.implementationPlan.contains(`- agentish-graph.code-architecture.ts
- agentish-graph.operational-behavior.ts`);

when(Layer.concept.weakens("system meaning"))
  .then(Layer.implementationPlan.invents("architecture semantics"))
  .and(SystemLayers.encounters("design drift"));

when(Layer.scenarios.weakens("acceptance behavior"))
  .then(Layer.implementationPlan.invents("behavior"))
  .and(SystemLayers.encounters("implementation variance"));

when(Layer.implementationPlan.weakens("architecture or behavior decisions"))
  .then(Layer.contracts.invents("system boundaries"))
  .and(SystemLayers.encounters("spec confusion"));

SystemLayers.prescribes(`- Each lower layer must be mechanical relative to the layer above.
- Use native structure instead of strings whenever possible.
- Choose the densest form that preserves semantic shape.
- Optimize for semantic activation rather than raw token count.
- Do not promote single-use phrases into named nodes without structural reuse.
- Prefer appropriate abstraction over textual deduplication.
- Keep semantic meaning close to where it has the most impact.
- Prefer explicitness over indirection when indirection only saves tokens.
- Prefer self-descriptive graphs over symbolic compression that hides semantic class.
- Use enough local description to keep node class, causal role, and scope visible at the point of use.
- Repeat structure freely when repetition improves local clarity.
- Reject abstractions that hide semantic class at the point of use.`);

const Quality = {
  recoverableStructure: define.quality("RecoverableStructure"),
  semanticNodeReuse: define.quality("SemanticNodeReuse"),
  explicitRelations: define.quality("ExplicitRelations"),
  causalShape: define.quality("CausalShape"),
  lowOpaqueStrings: define.quality("LowOpaqueStrings"),
  decisionCompression: define.quality("DecisionCompression"),
  exactNativeSchemas: define.quality("ExactNativeSchemas"),
  localSelfDescription: define.quality("LocalSelfDescription"),
  activationPreload: define.quality("ActivationPreload"),
  generativeYield: define.quality("GenerativeYield"),
  lowInterpretiveSlack: define.quality("LowInterpretiveSlack"),
};

SystemLayers.values(
  Quality.recoverableStructure,
  Quality.semanticNodeReuse,
  Quality.explicitRelations,
  Quality.causalShape,
  Quality.lowOpaqueStrings,
  Quality.decisionCompression,
  Quality.exactNativeSchemas,
  Quality.localSelfDescription,
  Quality.activationPreload,
  Quality.generativeYield,
  Quality.lowInterpretiveSlack,
);

Quality.recoverableStructure.means(
  "Meaning should be recoverable from native syntax rather than decoded from prose strings.",
);
Quality.semanticNodeReuse.means(
  "Names should act as stable semantic nodes that can be referenced repeatedly.",
);
Quality.semanticNodeReuse.means(
  "Promoting text into names only improves density when the name creates reusable structure rather than single-use indirection.",
);
Quality.explicitRelations.means(
  "Important connections should appear as structure rather than being buried inside text.",
);
Quality.explicitRelations.means(
  "Visible relations at the point of use are usually better than helper indirection that requires mental expansion.",
);
Quality.causalShape.means(
  "Behavior should read as transitions and consequences rather than bulleted narration.",
);
Quality.lowOpaqueStrings.means(
  "Strings should name or constrain meaning rather than carry most of the meaning themselves.",
);
Quality.lowOpaqueStrings.means(
  "Strings remain preferable for local meaning when promotion would only create ceremony.",
);
Quality.decisionCompression.means(
  "One expression should close many implementation choices without expanding into boilerplate.",
);
Quality.decisionCompression.means(
  "Compression is useful only when it preserves local clarity and does not hide the relevant abstraction level.",
);
Quality.exactNativeSchemas.means(
  "When exact shapes matter, they should be expressed in real type syntax rather than described indirectly.",
);
Quality.localSelfDescription.means(
  "A capable reader should recover semantic class, causal role, and local importance from the graph surface without external decoding.",
);
Quality.localSelfDescription.means(
  "Agentish should not rely on compiler-style symbolic tables that force the reader to reconstruct obvious graph meaning from weak local cues.",
);
Quality.activationPreload.means(
  "A good Agentish statement should preload the adjacent network of rationale, failure, tradeoff, and likely next inference rather than merely restating one rule.",
);
Quality.activationPreload.means(
  "Reading one node or relation should activate neighboring semantic structure that would otherwise require prose explanation.",
);
Quality.generativeYield.means(
  "Agentish quality is measured partly by how much correct downstream reasoning the graph unlocks beyond the literal statement.",
);
Quality.generativeYield.means(
  "A strong graph does not only preserve instruction; it makes the right continuation feel locally inevitable.",
);
Quality.lowInterpretiveSlack.means(
  "The graph should leave few plausible wrong readings while still avoiding wasteful explanation of what its visible structure already makes obvious.",
);
Quality.lowInterpretiveSlack.means(
  "Compression is bad when it increases reconstruction burden or permits many incompatible mental expansions.",
);

Layer.concept.optimizesFor(
  Quality.recoverableStructure,
  Quality.semanticNodeReuse,
  Quality.explicitRelations,
  Quality.localSelfDescription,
  Quality.activationPreload,
  Quality.lowInterpretiveSlack,
);
Layer.scenarios.optimizesFor(
  Quality.causalShape,
  Quality.semanticNodeReuse,
  Quality.lowOpaqueStrings,
  Quality.activationPreload,
  Quality.generativeYield,
);
Layer.implementationPlan.optimizesFor(
  Quality.decisionCompression,
  Quality.explicitRelations,
  Quality.lowOpaqueStrings,
  Quality.localSelfDescription,
  Quality.generativeYield,
  Quality.lowInterpretiveSlack,
);
Layer.contracts.optimizesFor(
  Quality.exactNativeSchemas,
  Quality.recoverableStructure,
);

when(SystemLayers.overOptimizes("token count"))
  .then(SystemLayers.degrades(Quality.recoverableStructure))
  .and(SystemLayers.degrades(Quality.explicitRelations))
  .and(SystemLayers.degrades(Quality.activationPreload))
  .and(SystemLayers.degrades(Quality.lowInterpretiveSlack))
  .and(SystemLayers.encounters("false density"));

when(SystemLayers.compresses("structure").into("strings"))
  .then(SystemLayers.degrades(Quality.lowOpaqueStrings))
  .and(SystemLayers.encounters("markdown-like flattening"));

when(SystemLayers.compresses("graph meaning").into("symbolic shorthand"))
  .then(SystemLayers.degrades(Quality.localSelfDescription))
  .and(SystemLayers.degrades(Quality.activationPreload))
  .and(SystemLayers.degrades(Quality.generativeYield))
  .and(SystemLayers.encounters("compiler-shaped pseudo-density"));
