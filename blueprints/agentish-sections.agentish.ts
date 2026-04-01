/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentishSections = define.blueprint("AgentishSections", {
  format: Agentish,
  role: "Canonical in-file section structure for a subject Agentish blueprint",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SubjectBlueprintState = define.document("SubjectBlueprintStateFile");
const SectionMap = define.document("SectionMap");
const BlueprintStateSectionMap = define.document("BlueprintStateSectionMap");

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

const BlueprintStateSection = {
  currentReality: define.section("CurrentRealitySection", {
    order: 1,
  }),
  currentFiles: define.section("CurrentFilesSection", {
    order: 2,
  }),
  plannedFiles: define.section("PlannedFilesSection", {
    order: 3,
  }),
};

AgentishSections.contains(
  SubjectBlueprint,
  SubjectBlueprintState,
  SectionMap,
  BlueprintStateSectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
  BlueprintStateSection.currentReality,
  BlueprintStateSection.currentFiles,
  BlueprintStateSection.plannedFiles,
);

AgentishSections.prescribes(`- A subject blueprint should be expressed as one coherent subject file.
- A subject blueprint should declare a section map near the top of the file.
- The canonical section order is Concept, Scenarios, ImplementationPlan, then Contracts.
- A subject blueprint may include only the sections the subject materially needs.
- A subject blueprint-state file is the current-reality companion to the subject blueprint.
- Every subject blueprint should include an explicit ideal file hierarchy in ImplementationPlan.
- Every subject blueprint-state file should include explicit sections for current related files and planned new files.`);

AgentishSections.defines(`- SubjectBlueprintFile means the canonical Agentish file that defines one coherent subject.
- SubjectBlueprintStateFile means the blueprint-state companion that records current implementation reality relative to the subject blueprint, including every current related file and every new file still required by the ideal blueprint.
- SectionMap means the top-of-file declaration of which canonical sections are present in the subject blueprint and in what order.
- BlueprintStateSectionMap means the top-of-file declaration of which blueprint-state sections are present and in what order.
- ConceptSection means the section that closes why the subject exists, what the core abstractions are, what is authoritative, and what must remain true.
- ScenariosSection means the section that closes what must work end to end, what humans observe, what counts as success, and what conflicts look like.
- ImplementationPlanSection means the section that closes code structure, responsibility ownership, operational behavior, implementation choices that should remain closed, and the ideal file hierarchy for the subject.
- ContractsSection means the section that closes exact machine-readable shapes, messages, action contracts, store shape, and boundary schemas.`);
- CurrentRealitySection means the blueprint-state section that summarizes actual implementation status, confidence, evidence, gaps, and known issues relative to the subject blueprint.
- CurrentFilesSection means the blueprint-state section that lists every current repository file related to the subject, including implementing files, supporting files, test files, API files, UI files, and any other currently relevant evidence files.
- PlannedFilesSection means the blueprint-state section that lists every new file the ideal blueprint still requires and may also name existing files that still require modification to reach the ideal file organization.`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);
BlueprintStateSection.currentReality.precedes(BlueprintStateSection.currentFiles);
BlueprintStateSection.currentFiles.precedes(BlueprintStateSection.plannedFiles);

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
  "What is the ideal file hierarchy?",
);
Section.contracts.answers(
  "What exact types exist?",
  "What exact messages exist?",
  "What exact action contracts exist?",
  "What exact store shape exists?",
  "What exact schemas cross boundaries?",
);
BlueprintStateSection.currentReality.answers(
  "What is implemented today?",
  "How confident is that comparison?",
  "What evidence supports it?",
  "What gaps and known issues remain?",
);
BlueprintStateSection.currentFiles.answers(
  "What current files are related to this subject?",
  "Which current files implement behavior directly?",
  "Which current files provide supporting evidence, tests, UI surfaces, API surfaces, or wiring?",
  "What current file hierarchy exists today?",
);
BlueprintStateSection.plannedFiles.answers(
  "What new files should exist in the ideal implementation but do not exist yet?",
  "What directories should exist in the ideal implementation but do not exist yet?",
  "Which existing files still need modification to match the ideal file hierarchy?",
);

when(SubjectBlueprint.contains(SectionMap))
  .then(SubjectBlueprint.expects(Section.concept))
  .and(SubjectBlueprint.orders(Section.scenarios).after(Section.concept))
  .and(SubjectBlueprint.orders(Section.implementationPlan).after(Section.scenarios))
  .and(SubjectBlueprint.orders(Section.contracts).after(Section.implementationPlan));

when(SubjectBlueprintState.contains(BlueprintStateSectionMap))
  .then(SubjectBlueprintState.expects(BlueprintStateSection.currentReality))
  .and(SubjectBlueprintState.orders(BlueprintStateSection.currentFiles).after(BlueprintStateSection.currentReality))
  .and(SubjectBlueprintState.orders(BlueprintStateSection.plannedFiles).after(BlueprintStateSection.currentFiles));

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

when(SubjectBlueprint.writes(Section.implementationPlan))
  .then(Section.implementationPlan.expects("an explicit ideal file hierarchy that names every related directory and file that should exist in the ideal implementation"))
  .and(Section.implementationPlan.forbids("hiding file organization only in prose without a concrete hierarchy"));

when(SubjectBlueprintState.writes(BlueprintStateSection.currentFiles))
  .then(BlueprintStateSection.currentFiles.expects("every current repository file related to the subject"))
  .and(BlueprintStateSection.currentFiles.forbids("sampling only a subset of related files"));

when(SubjectBlueprintState.writes(BlueprintStateSection.plannedFiles))
  .then(BlueprintStateSection.plannedFiles.expects("every new file and directory still required by the ideal blueprint"))
  .and(BlueprintStateSection.plannedFiles.allows("existing files that still require modification to reach the ideal file organization"));
