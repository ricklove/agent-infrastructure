/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const StructureAuthor = define.actor("StructureAuthor", {
  role: "Agent who designs the intended file layout for a feature before implementation begins",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
};

const Artifact = {
  featureBlueprint: define.document("FeatureBlueprint"),
  fileLayout: define.document("PlannedFileLayout"),
  boundary: define.document("ResponsibilityBoundary"),
};

StructureAuthor.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Artifact.featureBlueprint,
  Artifact.fileLayout,
  Artifact.boundary,
);

SectionMap.defines(`- Concept
- Scenarios`);

Section.concept.precedes(Section.scenarios);

StructureAuthor.enforces(`
- Start from file organization before local implementation detail.
- Name the main files or modules a feature should introduce or change.
- Give each file one clear reason to exist.
- Close responsibility boundaries early so later agents do not invent them ad hoc.
`);

StructureAuthor.defines(`
- PlannedFileLayout means the intended directory and file shape for the feature.
- ResponsibilityBoundary means the statement of what logic belongs in one file and what must stay out.
`);

when(StructureAuthor.writes(Artifact.featureBlueprint))
  .then(StructureAuthor.expects(Artifact.fileLayout))
  .and(StructureAuthor.expects(Artifact.boundary));

when(StructureAuthor.defines(Artifact.fileLayout))
  .then(StructureAuthor.avoids("vague buckets such as utils or misc helpers"));
