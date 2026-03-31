/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineBlueprintWithTeamGuide = define.system("DefineBlueprintWithTeamGuide", {
  format: Agentish,
  role: "Companion guide for the Define Blueprint with Team process blueprint",
});

const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const Artifact = {
  targetBlueprint: define.document("TargetBlueprintFile"),
  sectionMap: define.document("BlueprintSectionTableOfContents"),
  sharedConcept: define.document("SharedBlueprintConcept"),
  qualityBlueprint: define.document("AgentishQualityBlueprint"),
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
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
  Artifact.targetBlueprint,
  Artifact.sectionMap,
  Artifact.sharedConcept,
  Artifact.qualityBlueprint,
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

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

DefineBlueprintWithTeamGuide.enforces(`
- Start by closing the section structure of the target blueprint before section drafting begins.
- The process should improve blueprint quality before implementation by forcing section-level decomposition, independent section authorship, and whole-file review before acceptance.
- The subject of this process is the team-authored blueprint workflow itself.
- The shared concept and the assigned section scope are fixed inputs for section authors.
- The Agentish quality blueprint is a required input for every section-writing and section-review agent in this process.
- A section author may draft only its assigned section and may not rewrite the whole blueprint opportunistically.
- No section becomes authoritative until the whole file has been recombined and accepted.
- Review and rewrite may refine the draft, but they do not transfer authority away from whole-file recombination.
`);

Section.concept.answers(
  "Why does the subject exist? To define the team-authored blueprint workflow that improves a blueprint before implementation through section-level authorship, review, and rewrite.",
  "What are the core abstractions? The shared concept, the agent-team profile for the assigned section, the section-level draft, the combined file draft, the section feedback set, the proposal blueprint, and team acceptance.",
  "What is authoritative? The current draft is authoritative only within its assigned section; the whole blueprint becomes authoritative only after whole-file recombination and acceptance.",
  "What must remain true? Each section author receives the shared concept and assigned section scope as fixed input, produces only that section as draftable output, and no section may claim final authority outside whole-file recombination.",
);

Section.scenarios.answers(
  "What must work end to end? The operator sees the section table of contents, the section drafts, the combined draft, the section-by-section feedback, the proposal blueprint, the acceptance decision, and only then commit and merge.",
  "What do humans observe? Each stage is visible as a distinct artifact or decision point, so no step is collapsed into an inferred summary or hidden replay.",
  "What counts as success? Every section is complete only as part of the whole blueprint, the team has no remaining objections, the proposal is accepted as one file, and the accepted result is ready for integration.",
  "What do conflicts look like? A section-level objection blocks the whole proposal and returns that section to rewrite; a cross-section disagreement blocks the whole proposal and returns the conflicting sections to rewrite; partial acceptance is not allowed.",
);

DefineBlueprintWithTeamGuide.defines(`
- BlueprintSectionTableOfContents means the ordered list of sections the final subject blueprint will contain.
- SharedBlueprintConcept means the common subject intent all section authors preserve while drafting and rewriting.
- AgentishQualityBlueprint means the repository quality blueprint that section-writing and section-review agents must load before judging or drafting Agentish output.
- FixedInput means the shared concept, canonical section map, and assigned section scope given to a team sub agent before drafting.
- DraftableOutput means the one assigned section draft produced by that team sub agent.
- WholeFileRecombination means the point where section drafts become one proposal blueprint and later one accepted blueprint.
- SectionAuthority means a section may guide drafting but cannot become final until the recombined whole file is accepted.
- CombinedBlueprintDraft means the first whole-file draft assembled from section drafts and treated as the authoritative review target before rewrite.
- SectionFeedbackSet means the section-keyed set of review feedback gathered from the whole-file review of the combined draft.
- ProposalBlueprint means the rewritten whole-file candidate assembled from the combined draft plus the section feedback set.
- TeamAcceptance means every team sub agent has no remaining material changes for the same proposal blueprint.
- RewriteLoop means the explicit transition from final team review back to section rewrites when any section still requests changes.
- FinalChanges means a global proposal-level hold on acceptance: one remaining section objection keeps the proposal unaccepted.
- AcceptedBlueprint means the proposal blueprint after TeamAcceptance has closed the rewrite loop.
`);

DefineBlueprintWithTeamGuide.prescribes(`
- The process definition owns the step graph and the companion guide owns the human-readable contract around it.
- The table-of-contents step owns the ordered section map.
- The section-assignment step owns who drafts which section.
- The draft-combination step owns the first whole-file draft artifact.
- The review-collection step owns the section-grouped feedback set.
- The rewrite-assignment step owns the mapping from each section to its rewrite owner.
- The proposal-combination step owns the revised whole-file blueprint.
- The acceptance decision step owns the accepted-or-loopback outcome and records whether the blueprint is closed.
- The same sub agent should normally rewrite the same section it drafted unless the process explicitly reassigns ownership.
- Cross-section dependencies must be named explicitly and preserved through the combined draft, section feedback, and final rewrite.
- The process should not collapse multiple sections into one sub agent task unless the blueprint itself intentionally reduces the section count.
- Commit and merge remain downstream of acceptance and are not part of blueprint acceptance itself.
`);

Section.implementationPlan.answers(
  "What code structure exists? The process blueprint owns the nested step graph; the companion guide owns the Agentish explanation of that graph; the table-of-contents step owns section order; the draft-combination step owns the first whole-file draft; the rewrite-combination step owns the proposal blueprint; and the acceptance step owns the closed final state.",
  "Where do responsibilities live? The authoring agent assigns one section to one team sub agent for drafting, the same section owner may rewrite that section unless the process explicitly reassigns it, and acceptance is recorded only at the final decision step after the proposal is complete.",
  "Who owns state, transport, parsing, projection, and mutation? The process definition owns the authoritative step order, the section table owns ordered section names, the feedback set owns section-grouped critique, and the proposal blueprint owns the recombined section content before acceptance.",
  "How does the implemented system behave? It assigns sections from the shared concept, drafts them separately, combines them without collapsing section boundaries, collects section-scoped review, rewrites sections from the combined draft plus feedback, then either accepts the proposal or loops back to rewrite.",
  "How are cross-section dependencies handled? Dependencies are named in the assignment or feedback for the affected section, preserved in the combined draft, and resolved in rewrite or final review rather than by silently merging section authority.",
  "What implementation choices remain closed? Section ownership stays explicit, feedback stays grouped by section, review stays the gate for rewrite, and commit plus merge happen only after the final acceptance step closes the loop.",
);

Section.contracts.answers(
  "What exact artifacts exist? `CombinedBlueprintDraft` is the first whole-file draft assembled from section drafts, `SectionFeedbackSet` is the section-keyed review record gathered from the whole-file review, and `ProposalBlueprint` is the rewritten whole-file candidate produced from the combined draft plus section feedback.",
  "What exact review feedback is grouped by section? Each section's feedback stays grouped under that section name, and the grouped feedback remains attached to the same proposal target until rewrite consumes it.",
  "What exact acceptance condition ends the loop? `TeamAcceptance` requires every team sub agent to report no remaining material changes for the same proposal blueprint.",
  "What exact step transitions move the process forward or back? `RewriteLoop` routes from final team review back to section rewrites when any section still requests changes; acceptance closes the rewrite loop and permits commit and merge only after team acceptance.",
);

Step.defineTableOfContents.precedes(Step.assignDrafting);
Step.assignDrafting.precedes(Step.combineDrafts);
Step.combineDrafts.precedes(Step.collectReview);
Step.collectReview.precedes(Step.assignRewrites);
Step.assignRewrites.precedes(Step.combineProposal);
Step.combineProposal.precedes(Step.collectFinalReview);
Step.collectFinalReview.precedes(Step.decideAcceptance);

when(Step.collectReview.contains("section feedback"))
  .then(DefineBlueprintWithTeamGuide.expects("feedback grouped by section name"))
  .and(DefineBlueprintWithTeamGuide.expects("each section feedback set to remain attached to the same proposal target until rewrite consumes it"));

when(Step.assignDrafting.starts())
  .then(DefineBlueprintWithTeamGuide.requires(Artifact.sectionMap))
  .and(DefineBlueprintWithTeamGuide.requires(Artifact.sharedConcept))
  .and(DefineBlueprintWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineBlueprintWithTeamGuide.requires("an explicit team sub agent owner for each section"))
  .and(DefineBlueprintWithTeamGuide.expects("each sub agent to load the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, the assigned section name, and the shared concept before drafting"));

when(Step.combineDrafts.starts())
  .then(DefineBlueprintWithTeamGuide.requires("all drafted sections"))
  .and(DefineBlueprintWithTeamGuide.preserves("section boundaries inside the combined draft"));

when(Step.collectReview.contains("section feedback"))
  .then(DefineBlueprintWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineBlueprintWithTeamGuide.expects("each reviewing agent to load the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, and the whole blueprint draft before producing section feedback"));

when(Step.assignRewrites.starts())
  .then(DefineBlueprintWithTeamGuide.requires(Artifact.combinedDraft))
  .and(DefineBlueprintWithTeamGuide.requires(Artifact.sectionFeedback))
  .and(DefineBlueprintWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineBlueprintWithTeamGuide.prefers("the same owner for each section unless reassignment is explicitly needed"));

when(Step.collectReview.contains("section feedback"))
  .then(DefineBlueprintWithTeamGuide.requires("cross-section dependencies called out explicitly when they exist"));

when(Step.assignRewrites.starts())
  .then(DefineBlueprintWithTeamGuide.expects("each rewrite agent to load the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, the assigned section name, the combined draft, and the section-grouped feedback before rewriting"));

when(Step.collectFinalReview.starts())
  .then(DefineBlueprintWithTeamGuide.requires(Artifact.proposalBlueprint))
  .and(DefineBlueprintWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineBlueprintWithTeamGuide.expects("each final-review agent to load the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, and the proposal blueprint before suggesting final changes"));

when(Step.decideAcceptance.encounters("requested final changes"))
  .then(DefineBlueprintWithTeamGuide.returnsTo(Step.assignRewrites))
  .and(DefineBlueprintWithTeamGuide.preserves("the same proposal blueprint as the current authoritative review target"));

when(Step.decideAcceptance.encounters("team acceptance"))
  .then(DefineBlueprintWithTeamGuide.accepts(Artifact.targetBlueprint))
  .and(DefineBlueprintWithTeamGuide.requires("one explicit acceptance record for the final blueprint"))
  .and(DefineBlueprintWithTeamGuide.requires("no partial section acceptance"))
  .and(DefineBlueprintWithTeamGuide.requires("commit and merge to follow acceptance without another rewrite pass"));
