/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const CodingStandards = define.blueprint("CodingStandards", {
  format: Agentish,
  role: "Repository-wide code-shaping standards for understandable low-slack implementation",
});

const Concern = {
  semanticLocality: define.concern("SemanticLocality"),
  ownershipVisibility: define.concern("OwnershipVisibility"),
  shallowBranching: define.concern("ShallowBranching"),
  boundaryDiscipline: define.concern("BoundaryDiscipline"),
  semanticExtraction: define.concern("SemanticExtraction"),
  staticStyleCanonicality: define.concern("StaticStyleCanonicality"),
  cheapDiagnostics: define.concern("CheapDiagnostics"),
};

const Failure = {
  hiddenOwnership: define.failureMode("HiddenOwnership"),
  weakAbstraction: define.failureMode("WeakAbstraction"),
  controlDepth: define.failureMode("ControlDepth"),
  convenienceCoupling: define.failureMode("ConvenienceCoupling"),
  staticStyleEscape: define.failureMode("StaticStyleEscape"),
  noisyRenderInstrumentation: define.failureMode("NoisyRenderInstrumentation"),
};

const Move = {
  colocateByChange: define.move("ColocateByChange"),
  extractBySemanticGain: define.move("ExtractBySemanticGain"),
  resolveByGuard: define.move("ResolveByGuard"),
  preserveBoundary: define.move("PreserveBoundary"),
  keepStaticStyleInTailwind: define.move("KeepStaticStyleInTailwind"),
  reserveInlineStyleForRuntimeValues: define.move("ReserveInlineStyleForRuntimeValues"),
  useSharedRenderCounter: define.move("UseSharedRenderCounter"),
};

CodingStandards.contains(
  Concern.semanticLocality,
  Concern.ownershipVisibility,
  Concern.shallowBranching,
  Concern.boundaryDiscipline,
  Concern.semanticExtraction,
  Concern.staticStyleCanonicality,
  Concern.cheapDiagnostics,
  Failure.hiddenOwnership,
  Failure.weakAbstraction,
  Failure.controlDepth,
  Failure.convenienceCoupling,
  Failure.staticStyleEscape,
  Failure.noisyRenderInstrumentation,
  Move.colocateByChange,
  Move.extractBySemanticGain,
  Move.resolveByGuard,
  Move.preserveBoundary,
  Move.keepStaticStyleInTailwind,
  Move.reserveInlineStyleForRuntimeValues,
  Move.useSharedRenderCounter,
);

Move.colocateByChange.preserves(
  Concern.semanticLocality,
  Concern.ownershipVisibility,
);
Move.extractBySemanticGain.preserves(
  Concern.semanticExtraction,
  Concern.semanticLocality,
);
Move.resolveByGuard.preserves(
  Concern.shallowBranching,
);
Move.preserveBoundary.preserves(
  Concern.boundaryDiscipline,
  Concern.ownershipVisibility,
);
Move.keepStaticStyleInTailwind.preserves(
  Concern.staticStyleCanonicality,
);
Move.reserveInlineStyleForRuntimeValues.preserves(
  Concern.staticStyleCanonicality,
);
Move.useSharedRenderCounter.preserves(
  Concern.cheapDiagnostics,
  Concern.semanticLocality,
);

CodingStandards.prescribes(`- Colocation is king: keep behavior near the feature or domain that owns the reason to change it.
- Minimize unnecessary dependencies and preserve intended layer boundaries.
- Abstract only when the extracted shape is semantically clearer than the inlined one.
- Prefer guard clauses and early returns over nested branching.
- Avoid else when an earlier branch can fully exit.
- Resolve one condition fully before introducing the next.
- Repeat small local structure when reuse would hide meaning or ownership.
- Prefer explicit interfaces over highly configurable generic helpers.
- Make invalid or ambiguous state harder to represent than valid state.
- Use names that expose domain meaning at the point of use.
- Use Tailwind for static styling.
- Keep import ordering and statically knowable Tailwind class ordering in the repository's canonical Biome surface when that automation is enabled.
- Reserve inline style for truly runtime-calculated values or renderer-constrained values.
- For React rerender diagnosis, prefer the shared global render-counter utility over ad hoc console logging or bespoke per-component debug scaffolding.
- Render instrumentation should stay cheap, use explicit string names, and keep render counts separate from non-render event counts.
- Comments should explain intent, invariant, or tradeoff when the code cannot carry that load itself.`);

when(Code.lacks(Move.colocateByChange))
  .then(CodingStandards.encounters(Failure.hiddenOwnership));

when(Code.extracts("deduplication without semantic gain"))
  .then(CodingStandards.encounters(Failure.weakAbstraction));

when(Code.keeps("resolved branching live through nesting"))
  .then(CodingStandards.encounters(Failure.controlDepth));

when(Code.crosses("module or layer boundaries for convenience reuse"))
  .then(CodingStandards.encounters(Failure.convenienceCoupling));

when(Code.uses("inline style for statically knowable presentation"))
  .then(CodingStandards.encounters(Failure.staticStyleEscape));

when(Code.uses("console logging as the primary rerender counter"))
  .then(CodingStandards.encounters(Failure.noisyRenderInstrumentation));
