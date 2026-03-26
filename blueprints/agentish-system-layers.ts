/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish", {
  purpose: "In-file section structure",
});

const SystemLayers = define.blueprint("AgentishSystemLayers", {
  format: Agentish,
  role: "Canonical semantic layering inside one subject Agentish file",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

SystemLayers.contains(
  SubjectBlueprint,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

SystemLayers.prescribes(`- Subject meaning, behavior, implementation decisions, and machine contracts should be layered inside one coherent subject file.
- Each lower section should be mechanical relative to the section above it.
- Use native structure instead of strings whenever possible.
- Choose the densest form that preserves semantic shape.
- Optimize for semantic activation rather than raw token count.
- Prefer self-descriptive graphs over symbolic compression that hides semantic class.`);

SystemLayers.defines(`- ConceptSection means system meaning, core abstractions, authority, and invariants.
- ScenariosSection means canonical acceptance behavior and observable end-to-end flows.
- ImplementationPlanSection means concrete architecture, responsibility ownership, operational behavior, and closed implementation decisions.
- ContractsSection means exact machine-readable shapes, messages, action contracts, store shape, and boundary schemas.`);

when(SubjectBlueprint.contains(Section.concept))
  .then(Section.concept.answers("why, abstractions, authority, invariants"));

when(SubjectBlueprint.contains(Section.scenarios))
  .then(Section.scenarios.answers("acceptance behavior, observation, success, conflicts"));

when(SubjectBlueprint.contains(Section.implementationPlan))
  .then(Section.implementationPlan.answers("structure, ownership, behavior, closed implementation choices"));

when(SubjectBlueprint.contains(Section.contracts))
  .then(Section.contracts.answers("exact machine-readable boundary shapes"));
