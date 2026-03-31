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
  "Why does the subject exist? To protect blueprint quality by separating section-local authorship from final blueprint authority.",
  "What are the core abstractions? The shared concept, section-local authority, and final blueprint authority.",
  "What is authoritative? A section draft is authoritative only within its assigned section; the final blueprint is authoritative only after it is accepted as one file.",
  "What must remain true? A section author may only claim authority over the section it is writing, and no section may become final before the blueprint is accepted as a whole.",
);

Section.scenarios.answers(
  "What must work end to end? The operator sees the section table of contents, the section drafts, the combined draft, the section-by-section feedback, the proposal blueprint, the acceptance decision, and only after acceptance do commit and merge occur downstream.",
  "What do humans observe? Each stage is visible as a distinct artifact or decision point, and when a section blocks the proposal the runtime keeps the proposal target constant, names the blocking section or sections, and routes the affected sections back to rewrite.",
  "What counts as success? Every section is complete only as part of the whole blueprint, the team has no remaining objections, the proposal is accepted as one file, and the accepted result is ready for downstream integration after acceptance.",
  "What do conflicts look like? A section-level objection blocks the whole proposal and returns that section to rewrite; a cross-section disagreement blocks the whole proposal and returns the conflicting sections to rewrite; the proposal target stays unchanged while blocked; partial acceptance is not allowed; section-map drift or midstream re-partitioning is a structural failure that forces the section table to be reestablished before drafting can resume.",
);

DefineBlueprintWithTeamGuide.defines(`
- BlueprintSectionTableOfContents means a contract payload with proposalTargetId and an ordered sections array; each section record contains sectionTitle, order, owningTeamMemberId, and rewriteOwnerId.
- SharedBlueprintConcept means an immutable contract payload with proposalTargetId, subjectTitle, invariantSummary, fixedInputNotes, and forbiddenDriftNotes.
- AgentishQualityBlueprint means the repository quality blueprint that section-writing, review, and rewrite agents must load before judging or drafting Agentish output.
- SectionTitle means the stable display name for one section in the section table of contents.
- SectionAssignment means one section record with sectionTitle, order, owningTeamMemberId, and rewriteOwnerId.
- FeedbackEntry means one immutable section-keyed review note with feedbackId, proposalTargetId, sectionTitle, authorId, severity, body, and createdAt.
- FeedbackSeverity means one of note, revise, or block.
- FixedInput means the shared concept, canonical section map, and assigned section scope given to a team sub agent before drafting.
- DraftableOutput means the one assigned section draft produced by that team sub agent.
- WholeFileRecombination means the point where section drafts become one proposal blueprint and later one accepted blueprint.
- SectionAuthority means a section may guide drafting but cannot become final until the recombined whole file is accepted.
- CombinedBlueprintDraft means a whole-file payload with proposalTargetId, orderedSectionTitles, sectionDrafts keyed by sectionTitle, and sectionStatus keyed by sectionTitle.
- SectionFeedbackSet means an immutable payload with proposalTargetId, feedbackBySection keyed by sectionTitle, collectedAt, and consumedByRewriteAt.
- ProposalBlueprint means a whole-file payload with proposalTargetId, orderedSectionTitles, rewrittenSectionContent keyed by sectionTitle, dependencyNotes keyed by sectionTitle, currentStage, basedOnDraftId, and feedbackSetId.
- TeamAcceptance means an acceptance payload with proposalTargetId, accepted, acceptedSectionTitles, blockingSectionTitles, reviewerIds, decisionNotes, and decidedAt.
- RewriteLoop means a transition payload with fromStage, toStage, proposalTargetId, blockingSectionTitles, feedbackEntryIds, requestedByReviewerIds, and reason.
- FinalChanges means a global proposal-level hold on acceptance: one remaining section objection keeps the proposal unaccepted.
- AcceptedBlueprint means the proposal blueprint paired with its TeamAcceptance record and marked immutable after acceptance.
`);

DefineBlueprintWithTeamGuide.prescribes(`
- `DefineBlueprintTableOfContents` owns the section map.
- `AssignSectionDrafting` owns which team sub agent drafts which section.
- `CombineSectionDrafts` owns `CombinedBlueprintDraft`.
- `CollectWholeFileSectionFeedback` owns `SectionFeedbackSet`.
- `AssignSectionRewrites` owns rewrite ownership and dependency carry-forward for each section.
- `CombineProposalBlueprint` owns `ProposalBlueprint`.
- `DecideTeamAcceptance` owns `TeamAcceptance` and `AcceptedBlueprint`.
- `AssignSectionDrafting` may not mutate `CombinedBlueprintDraft`.
- `CollectWholeFileSectionFeedback` may not mutate `ProposalBlueprint`.
- `AssignSectionRewrites` may not mutate `TeamAcceptance`.
- `CombineProposalBlueprint` may not mutate the section map or the original owner map.
- The same sub agent should normally rewrite the same section it drafted unless the process explicitly reassigns ownership.
- Cross-section dependencies must be named explicitly and preserved through the combined draft, section feedback, and final rewrite.
- The process should not collapse multiple sections into one sub agent task unless the blueprint itself intentionally reduces the section count.
- `commit` and `merge` remain downstream of `DecideTeamAcceptance` and are not part of blueprint acceptance itself.
`);

Section.implementationPlan.answers(
  "What code structure exists? `DefineBlueprintTableOfContents` owns the section table of contents, `AssignSectionDrafting` owns section-owner assignment, `CombineSectionDrafts` owns `CombinedBlueprintDraft`, `CollectWholeFileSectionFeedback` owns `SectionFeedbackSet`, `AssignSectionRewrites` owns rewrite-owner assignment and dependency carry-forward, `CombineProposalBlueprint` owns `ProposalBlueprint`, and `DecideTeamAcceptance` owns `TeamAcceptance` and `AcceptedBlueprint`.",
  "Where do responsibilities live? `AssignSectionDrafting` assigns one team sub agent per section, `AssignSectionRewrites` normally keeps the same section owner unless the process explicitly reassigns it, and `DecideTeamAcceptance` records the only final acceptance or loopback outcome after the proposal is complete.",
  "Which step mutates which artifact? `DefineBlueprintTableOfContents` mutates the section map, `AssignSectionDrafting` mutates the section-owner map, `CombineSectionDrafts` mutates the combined draft, `CollectWholeFileSectionFeedback` mutates the immutable section-keyed feedback set, `AssignSectionRewrites` mutates the rewrite-owner map and dependency notes, `CombineProposalBlueprint` mutates the proposal blueprint, and `DecideTeamAcceptance` mutates the final acceptance record.",
  "How does the implemented system behave? It moves from `DefineBlueprintTableOfContents` to `AssignSectionDrafting`, then `CombineSectionDrafts`, then `CollectWholeFileSectionFeedback`, then `AssignSectionRewrites`, then `CombineProposalBlueprint`, then `DecideTeamAcceptance`; each step owns one artifact boundary and may not silently mutate the next step's artifact.",
  "How are cross-section dependencies handled? Dependency notes are attached in `CollectWholeFileSectionFeedback`, preserved through `AssignSectionRewrites`, and carried into `CombineProposalBlueprint` so the dependent section rewrite resolves them before `DecideTeamAcceptance` can close the loop.",
  "What implementation choices remain closed? Section ownership stays explicit, feedback stays grouped by section, each step mutates only its own artifact, and `commit` plus `merge` remain downstream of `DecideTeamAcceptance` rather than part of blueprint acceptance itself.",
);

Section.contracts.answers(
  "What exact artifacts exist? `BlueprintSectionTableOfContents` is a payload with proposalTargetId and an ordered sections array; each section record contains sectionTitle, order, owningTeamMemberId, and rewriteOwnerId. `SharedBlueprintConcept` is an immutable payload with proposalTargetId, subjectTitle, invariantSummary, fixedInputNotes, and forbiddenDriftNotes. `CombinedBlueprintDraft` is a whole-file payload with proposalTargetId, orderedSectionTitles, sectionDrafts keyed by sectionTitle, and sectionStatus keyed by sectionTitle.",
  "What exact review feedback is grouped by section? `FeedbackEntry` is an immutable review note with feedbackId, proposalTargetId, sectionTitle, authorId, severity, body, and createdAt. It may be read many times, but it is never edited after creation; only a matching rewrite may mark it consumed for that proposal and section. `SectionFeedbackSet` is an immutable payload with proposalTargetId, feedbackBySection keyed by sectionTitle, collectedAt, and consumedByRewriteAt. Consumption is local: each section consumes only its own feedback entries, and the set is not globally consumed until every feedback entry it contains has been matched to a rewrite decision or explicitly left unconsumed.",
  "What exact acceptance condition ends the loop? `ProposalBlueprint` is a whole-file payload with proposalTargetId, orderedSectionTitles, rewrittenSectionContent keyed by sectionTitle, dependencyNotes keyed by sectionTitle, currentStage, basedOnDraftId, and feedbackSetId. `TeamAcceptance` is an immutable decision payload with proposalTargetId, accepted, acceptedSectionTitles, blockingSectionTitles, reviewerIds, decisionNotes, and decidedAt. The decision records the proposal state at the moment of review and does not retroactively mutate the proposal contents.",
  "What exact step transitions move the process forward or back? `RewriteLoop` is an immutable transition payload with fromStage, toStage, proposalTargetId, blockingSectionTitles, feedbackEntryIds, requestedByReviewerIds, and reason. It must name the specific blocking sections and the specific feedback entries that triggered the loopback, and it consumes only those entries relevant to the returned sections. Acceptance closes the loop only when `accepted` is true and produces `AcceptedBlueprint`, which is the `ProposalBlueprint` paired with its `TeamAcceptance` record, frozen as a single immutable accepted pair, and no later rewrite may alter either half.",
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
  .then(DefineBlueprintWithTeamGuide.requires("cross-section dependencies called out explicitly when they exist"))
  .and(DefineBlueprintWithTeamGuide.requires("each FeedbackEntry to remain immutable until the matching rewrite consumes it"));

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
  .and(DefineBlueprintWithTeamGuide.requires("one explicit TeamAcceptance record for the final blueprint"))
  .and(DefineBlueprintWithTeamGuide.requires("the AcceptedBlueprint to pair the proposal blueprint with that TeamAcceptance record"))
  .and(DefineBlueprintWithTeamGuide.requires("no partial section acceptance"))
  .and(DefineBlueprintWithTeamGuide.requires("commit and merge to follow acceptance without another rewrite pass"));
