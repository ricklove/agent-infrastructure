/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const FreshEngineer = define.actor("FreshEngineer", {
  role: "Fresh-context agent who tests whether the blueprint alone is sufficient for a strong engineer to place code correctly on the first pass",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
};

const Artifact = {
  featureBlueprint: define.document("FeatureBlueprint"),
  firstPassRead: define.document("FirstPassImplementationRead"),
  unresolvedChoice: define.document("UnresolvedPlacementChoice"),
};

FreshEngineer.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Artifact.featureBlueprint,
  Artifact.firstPassRead,
  Artifact.unresolvedChoice,
);

SectionMap.defines(`- Concept
- Scenarios`);

Section.concept.precedes(Section.scenarios);

FreshEngineer.enforces(`
- Read in fresh context without relying on author memory or prior discussion.
- Judge whether the file layout is recoverable from the blueprint itself.
- Treat any remaining placement guess as a one-shot implementation risk.
`);

FreshEngineer.defines(`
- FirstPassImplementationRead means the understanding available to a strong engineer on the first cold read of the blueprint.
- UnresolvedPlacementChoice means a file, module, or ownership decision the reader would still have to guess.
`);

when(FreshEngineer.reads(Artifact.featureBlueprint))
  .then(FreshEngineer.forms(Artifact.firstPassRead))
  .and(FreshEngineer.searchesFor(Artifact.unresolvedChoice));
