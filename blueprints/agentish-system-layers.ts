/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "Layered system design",
});

const SystemLayers = define.entity("AgentishSystemLayers", {
  format: Agentish,
  describes: "How system meaning, behavior, architecture, and contracts separate",
});

const Layer = {
  concept: define.entity("ConceptLayer", {
    decides: "system meaning",
    avoids: "architecture and schema detail",
  }),
  scenarios: define.entity("ScenariosLayer", {
    decides: "acceptance behavior",
    avoids: "architecture and schema detail",
  }),
  implementationPlan: define.entity("ImplementationPlanLayer", {
    decides: "architecture and ownership",
    avoids: "redundant behavior and pseudo-schemas",
  }),
  contracts: define.entity("ContractsLayer", {
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
  "What packages exist?",
  "Where do responsibilities live?",
  "Who owns state, transport, parsing, projection, and mutation?",
  "What implementation choices remain closed?",
);
Layer.contracts.answers(
  "What exact types exist?",
  "What exact messages exist?",
  "What exact action contracts exist?",
  "What exact store shape exists?",
  "What exact schemas cross boundaries?",
);

Layer.scenarios.contains("user stories", {
  renderedAs: "canonical acceptance flows",
  rejects: "loose product prose",
});

when(Layer.concept.weakens("system meaning"))
  .then(Layer.implementationPlan.invents("architecture semantics"))
  .and(SystemLayers.encounters("design drift"));

when(Layer.scenarios.weakens("acceptance behavior"))
  .then(Layer.implementationPlan.invents("behavior"))
  .and(SystemLayers.encounters("implementation variance"));

when(Layer.implementationPlan.weakens("architecture decisions"))
  .then(Layer.contracts.invents("system boundaries"))
  .and(SystemLayers.encounters("spec confusion"));

SystemLayers.prescribes(`- Each lower layer must be mechanical relative to the layer above.
- Use native structure instead of strings whenever possible.
- Choose the densest form that preserves semantic shape.
- Do not promote single-use phrases into named nodes without structural reuse.
- Prefer appropriate abstraction over textual deduplication.
- Keep semantic meaning close to where it has the most impact.
- Prefer explicitness over indirection when indirection only saves tokens.
- Repeat structure freely when repetition improves local clarity.
- Reject abstractions that hide semantic class at the point of use.`);

const Quality = {
  recoverableStructure: define.concept("RecoverableStructure"),
  semanticNodeReuse: define.concept("SemanticNodeReuse"),
  explicitRelations: define.concept("ExplicitRelations"),
  causalShape: define.concept("CausalShape"),
  lowOpaqueStrings: define.concept("LowOpaqueStrings"),
  decisionCompression: define.concept("DecisionCompression"),
  exactNativeSchemas: define.concept("ExactNativeSchemas"),
};

SystemLayers.values(
  Quality.recoverableStructure,
  Quality.semanticNodeReuse,
  Quality.explicitRelations,
  Quality.causalShape,
  Quality.lowOpaqueStrings,
  Quality.decisionCompression,
  Quality.exactNativeSchemas,
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

Layer.concept.optimizesFor(
  Quality.recoverableStructure,
  Quality.semanticNodeReuse,
  Quality.explicitRelations,
);
Layer.scenarios.optimizesFor(
  Quality.causalShape,
  Quality.semanticNodeReuse,
  Quality.lowOpaqueStrings,
);
Layer.implementationPlan.optimizesFor(
  Quality.decisionCompression,
  Quality.explicitRelations,
  Quality.lowOpaqueStrings,
);
Layer.contracts.optimizesFor(
  Quality.exactNativeSchemas,
  Quality.recoverableStructure,
);

when(SystemLayers.overOptimizes("token count"))
  .then(SystemLayers.degrades(Quality.recoverableStructure))
  .and(SystemLayers.degrades(Quality.explicitRelations))
  .and(SystemLayers.encounters("false density"));

when(SystemLayers.compresses("structure").into("strings"))
  .then(SystemLayers.degrades(Quality.lowOpaqueStrings))
  .and(SystemLayers.encounters("markdown-like flattening"));
