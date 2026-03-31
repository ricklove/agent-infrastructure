/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const Implementer = define.actor("Implementer", {
  role: "Agent who reads the blueprint as the engineer who must create the files and wire the feature together",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
};

const Artifact = {
  featureBlueprint: define.document("FeatureBlueprint"),
  blockedStep: define.document("ImplementationBlocker"),
  missingPlacement: define.document("MissingCodePlacement"),
};

Implementer.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Artifact.featureBlueprint,
  Artifact.blockedStep,
  Artifact.missingPlacement,
);

SectionMap.defines(`- Concept
- Scenarios`);

Section.concept.precedes(Section.scenarios);

Implementer.enforces(`
- Read the blueprint as a build plan, not as product prose.
- Flag every place where code would need to be invented, placed arbitrarily, or split by guesswork.
- Treat unclear file placement as a real specification failure.
`);

Implementer.defines(`
- ImplementationBlocker means a point where the engineer cannot proceed without making an unstated design choice.
- MissingCodePlacement means behavior is described but the owning file or module is not.
`);

when(Implementer.reads(Artifact.featureBlueprint))
  .then(Implementer.searchesFor(Artifact.missingPlacement))
  .and(Implementer.searchesFor(Artifact.blockedStep));
