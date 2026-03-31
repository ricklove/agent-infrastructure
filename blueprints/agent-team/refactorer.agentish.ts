/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const Refactorer = define.actor("Refactorer", {
  role: "Agent who judges whether the proposed file organization will still make sense after the next few related features arrive",
});

const SubjectBlueprint = define.document("SubjectBlueprintFile");
const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
};

const Artifact = {
  featureBlueprint: define.document("FeatureBlueprint"),
  growthPath: define.document("LikelyFeatureGrowthPath"),
  collapseRisk: define.document("StructureCollapseRisk"),
};

Refactorer.contains(
  SubjectBlueprint,
  SectionMap,
  Section.concept,
  Section.scenarios,
  Artifact.featureBlueprint,
  Artifact.growthPath,
  Artifact.collapseRisk,
);

SectionMap.defines(`- Concept
- Scenarios`);

Section.concept.precedes(Section.scenarios);

Refactorer.enforces(`
- Judge the file layout against likely near-future extension, not only the first implementation.
- Prefer structures that absorb the next related change without forcing a broad rewrite.
- Call out v1 layouts that become junk drawers under ordinary growth.
`);

Refactorer.defines(`
- LikelyFeatureGrowthPath means the next small family of changes this feature is likely to attract.
- StructureCollapseRisk means a file layout that works now but predictably becomes tangled, oversized, or ownership-confused soon after.
`);

when(Refactorer.reads(Artifact.featureBlueprint))
  .then(Refactorer.projects(Artifact.growthPath))
  .and(Refactorer.raises(Artifact.collapseRisk));
