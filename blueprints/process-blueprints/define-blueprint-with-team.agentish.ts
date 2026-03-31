/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineBlueprintWithTeamGuide = define.system("DefineBlueprintWithTeamGuide", {
  format: Agentish,
  role: "Companion guide for the Define Blueprint with Team process blueprint",
});

const Artifact = {
  targetBlueprint: define.document("TargetBlueprintFile"),
  sectionMap: define.document("BlueprintSectionTableOfContents"),
  sharedConcept: define.document("SharedBlueprintConcept"),
  combinedDraft: define.document("CombinedBlueprintDraft"),
  sectionFeedback: define.document("SectionFeedbackSet"),
  proposalBlueprint: define.document("ProposalBlueprint"),
};

const Actor = {
  author: define.actor("PrimaryBlueprintAuthor"),
  teamMember: define.actor("TeamSubAgent"),
};

const Step = {
  defineTableOfContents: define.step("DefineBlueprintTableOfContents"),
  assignDrafting: define.step("AssignSectionDrafting"),
  combineDrafts: define.step("CombineSectionDrafts"),
  collectReview: define.step("CollectWholeFileSectionFeedback"),
  assignRewrites: define.step("AssignSectionRewrites"),
  combineProposal: define.step("CombineProposalBlueprint"),
  collectFinalReview: define.step("CollectFinalTeamReview"),
  decideAcceptance: define.step("DecideTeamAcceptance"),
};

DefineBlueprintWithTeamGuide.contains(
  Artifact.targetBlueprint,
  Artifact.sectionMap,
  Artifact.sharedConcept,
  Artifact.combinedDraft,
  Artifact.sectionFeedback,
  Artifact.proposalBlueprint,
  Actor.author,
  Actor.teamMember,
  Step.defineTableOfContents,
  Step.assignDrafting,
  Step.combineDrafts,
  Step.collectReview,
  Step.assignRewrites,
  Step.combineProposal,
  Step.collectFinalReview,
  Step.decideAcceptance,
);

DefineBlueprintWithTeamGuide.enforces(`
- Start by closing the section structure of the target blueprint before section drafting begins.
- Section drafting should begin from the shared concept rather than from a full prewritten blueprint.
- Each team sub agent should own one section at a time rather than rewriting the whole blueprint opportunistically.
- The first team review should inspect the whole combined draft and produce feedback for each section.
- Section rewrites should consume both the combined draft and the collected feedback for that section.
- The second team review should judge the combined proposal blueprint rather than isolated rewritten sections.
- If the team still requests changes, the loop should return to section rewrites rather than restart from the beginning.
- The blueprint is accepted only when the team no longer requests material changes.
`);

DefineBlueprintWithTeamGuide.defines(`
- BlueprintSectionTableOfContents means the ordered list of sections the final subject blueprint will contain.
- SharedBlueprintConcept means the common subject intent all section authors should preserve.
- CombinedBlueprintDraft means the first whole-file blueprint assembled from section drafts.
- SectionFeedbackSet means the collected team review comments organized by blueprint section.
- ProposalBlueprint means the recombined blueprint after section rewrites have incorporated the collected feedback.
`);

Step.defineTableOfContents.precedes(Step.assignDrafting);
Step.assignDrafting.precedes(Step.combineDrafts);
Step.combineDrafts.precedes(Step.collectReview);
Step.collectReview.precedes(Step.assignRewrites);
Step.assignRewrites.precedes(Step.combineProposal);
Step.combineProposal.precedes(Step.collectFinalReview);
Step.collectFinalReview.precedes(Step.decideAcceptance);

when(Step.decideAcceptance.encounters("requested final changes"))
  .then(DefineBlueprintWithTeamGuide.returnsTo(Step.assignRewrites));

when(Step.decideAcceptance.encounters("team acceptance"))
  .then(DefineBlueprintWithTeamGuide.accepts(Artifact.targetBlueprint));
