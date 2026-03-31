/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const InvariantsCritic = define.actor("InvariantsCritic", {
  role: "Agent who protects authority boundaries so file organization does not smear ownership across the codebase",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
};

const Artifact = {
  featureBlueprint: define.document("FeatureBlueprint"),
  invariant: define.document("AuthorityInvariant"),
  ownershipLeak: define.document("OwnershipLeak"),
};

InvariantsCritic.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Artifact.featureBlueprint,
  Artifact.invariant,
  Artifact.ownershipLeak,
);

SectionMap.defines(`- Concept
- Scenarios`);

Section.concept.precedes(Section.scenarios);

InvariantsCritic.enforces(`
- Protect clear ownership of state, mutation, parsing, transport, and rendering.
- Treat cross-file duplication of authority as a structural defect.
- Prefer one obvious owner over several partially responsible files.
`);

InvariantsCritic.defines(`
- AuthorityInvariant means a rule about which file or layer is allowed to own a class of logic or state.
- OwnershipLeak means a place where the blueprint lets several files plausibly own the same behavior.
`);

when(InvariantsCritic.reads(Artifact.featureBlueprint))
  .then(InvariantsCritic.checks(Artifact.invariant))
  .and(InvariantsCritic.searchesFor(Artifact.ownershipLeak));
