/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentishSections = define.blueprint("AgentishSections", {
  format: Agentish,
  role: "Canonical in-file section structure for a subject Agentish blueprint",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SubjectBlueprintState = define.document("SubjectBlueprintStateFile");
const SectionMap = define.document("SectionMap");

const Section = {
  concept: define.section("ConceptSection", {
    order: 1,
  }),
  scenarios: define.section("ScenariosSection", {
    order: 2,
  }),
  implementationPlan: define.section("ImplementationPlanSection", {
    order: 3,
  }),
  contracts: define.section("ContractsSection", {
    order: 4,
  }),
};

AgentishSections.contains(
  SubjectBlueprint,
  SubjectBlueprintState,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
);

AgentishSections.prescribes(`- A subject blueprint should be expressed as one coherent subject file.
- A subject blueprint should declare a section map near the top of the file.
- The canonical section order is Concept, Scenarios, ImplementationPlan, then Contracts.
- A subject blueprint may include only the sections the subject materially needs.
- A subject blueprint-state file is the current-reality companion to the subject blueprint.`);

AgentishSections.defines(`- SubjectBlueprintFile means the canonical Agentish file that defines one coherent subject.
- SubjectBlueprintStateFile means the blueprint-state companion that records current implementation reality relative to the subject blueprint.
- SectionMap means the top-of-file declaration of which canonical sections are present in the subject blueprint and in what order.
- ConceptSection means the section that closes why the subject exists, what the core abstractions are, what is authoritative, and what must remain true.
- ScenariosSection means the section that closes what must work end to end, what humans observe, what counts as success, and what conflicts look like.
- ImplementationPlanSection means the section that closes code structure, responsibility ownership, operational behavior, and implementation choices that should remain closed.
- ContractsSection means the section that closes exact machine-readable shapes, messages, action contracts, store shape, and boundary schemas.`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

Section.concept.answers(
  "Why does the subject exist?",
  "What are the core abstractions?",
  "What is authoritative?",
  "What must remain true?",
);
Section.scenarios.answers(
  "What must work end to end?",
  "What do humans observe?",
  "What counts as success?",
  "What do conflicts look like?",
);
Section.implementationPlan.answers(
  "What code structure exists?",
  "Where do responsibilities live?",
  "Who owns state, transport, parsing, projection, and mutation?",
  "How does the implemented system behave?",
  "What implementation choices remain closed?",
);
Section.contracts.answers(
  "What exact types exist?",
  "What exact messages exist?",
  "What exact action contracts exist?",
  "What exact store shape exists?",
  "What exact schemas cross boundaries?",
);

when(SubjectBlueprint.contains(SectionMap))
  .then(SubjectBlueprint.expects(Section.concept))
  .and(SubjectBlueprint.orders(Section.scenarios).after(Section.concept))
  .and(SubjectBlueprint.orders(Section.implementationPlan).after(Section.scenarios))
  .and(SubjectBlueprint.orders(Section.contracts).after(Section.implementationPlan));

when(SubjectBlueprint.uses(Section.scenarios))
  .then(SubjectBlueprint.preserves(Section.concept));

when(SubjectBlueprint.uses(Section.implementationPlan))
  .then(SubjectBlueprint.preserves(Section.concept))
  .and(SubjectBlueprint.preserves(Section.scenarios));

when(SubjectBlueprint.uses(Section.contracts))
  .then(SubjectBlueprint.preserves(Section.implementationPlan));

when(SubjectBlueprint.writes(Section.scenarios))
  .then(Section.scenarios.avoids("architecture and schema detail"));

when(SubjectBlueprint.writes(Section.implementationPlan))
  .then(Section.implementationPlan.avoids("redundant behavior and pseudo-schemas"));

when(SubjectBlueprint.writes(Section.contracts))
  .then(Section.contracts.avoids("behavior and rationale already modeled above"));
