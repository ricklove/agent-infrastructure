/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineProcessWithTeamGuide = define.system("DefineProcessWithTeamGuide", {
  format: Agentish,
  role: "Companion guide for the Define Process with Team process blueprint",
});

const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const Artifact = {
  targetProcessJson: define.document("TargetProcessBlueprintJson"),
  targetGuide: define.document("TargetProcessGuide"),
  sectionMap: define.document("ProcessGuideSectionTableOfContents"),
  sharedConcept: define.document("SharedProcessConcept"),
  qualityBlueprint: define.document("AgentishQualityBlueprint"),
  combinedDraft: define.document("CombinedProcessGuideDraft"),
  sectionFeedback: define.document("ProcessGuideSectionFeedbackSet"),
  proposalGuide: define.document("ProposalProcessGuide"),
};

const Actor = {
  author: define.actor("PrimaryProcessAuthor"),
  teamMember: define.actor("TeamSubAgent"),
};

const Step = {
  defineTableOfContents: define.step("DefineProcessGuideTableOfContents"),
  prepareDraftingPackets: define.step("PrepareProcessGuideDraftingPackets"),
  assignDrafting: define.step("AssignProcessGuideSectionDrafting"),
  combineDrafts: define.step("CombineProcessGuideSectionDrafts"),
  collectReview: define.step("CollectWholeFileProcessGuideFeedback"),
  prepareRewritePackets: define.step("PrepareProcessGuideRewritePackets"),
  assignRewrites: define.step("AssignProcessGuideSectionRewrites"),
  combineProposal: define.step("CombineProposalProcessGuide"),
  collectFinalReview: define.step("CollectFinalProcessGuideReview"),
  decideAcceptance: define.step("DecideProcessGuideAcceptance"),
  alignProcessDefinition: define.step("AlignProcessDefinitionLayer"),
};

DefineProcessWithTeamGuide.contains(
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
  Artifact.targetProcessJson,
  Artifact.targetGuide,
  Artifact.sectionMap,
  Artifact.sharedConcept,
  Artifact.qualityBlueprint,
  Artifact.combinedDraft,
  Artifact.sectionFeedback,
  Artifact.proposalGuide,
  Actor.author,
  Actor.teamMember,
  Step.defineTableOfContents,
  Step.prepareDraftingPackets,
  Step.assignDrafting,
  Step.combineDrafts,
  Step.collectReview,
  Step.prepareRewritePackets,
  Step.assignRewrites,
  Step.combineProposal,
  Step.collectFinalReview,
  Step.decideAcceptance,
  Step.alignProcessDefinition,
);

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

DefineProcessWithTeamGuide.enforces(`
- Start by closing the section structure of the process companion guide before section drafting begins.
- The process should improve process-definition quality before release by forcing section-level decomposition, independent section authorship, whole-file review, and explicit guide-to-JSON alignment before integration.
- The subject of this process is the team-authored process-definition workflow itself.
- The shared process concept and the assigned section scope are fixed inputs for section authors.
- The Agentish quality blueprint is a required input for every section-writing and section-review agent in this process.
- A section author may draft only its assigned guide section and may not rewrite the whole guide opportunistically.
- No guide section becomes authoritative until the whole guide has been recombined, accepted, and aligned with the process JSON as one process-definition layer.
- Review and rewrite may refine the guide, but they do not transfer authority away from whole-file recombination and process-layer alignment.
`);

Section.concept.answers(
  "Why does the subject exist? To protect process-definition quality by separating section-local guide authorship from final whole-process authority.",
  "What are the core abstractions? The shared process concept, guide-section authority, whole-guide authority, and the aligned process-definition layer made of the guide plus the JSON contract.",
  "What is authoritative? A guide section draft is authoritative only within its assigned section; the accepted guide and aligned process JSON are authoritative only after the team accepts the guide and the process-definition layer is brought back into sync.",
  "What must remain true? A section author may only claim authority over the guide section it is writing, no guide section may become final before the guide is accepted as a whole, and the process JSON may not drift from the accepted guide once alignment begins.",
);

Section.scenarios.answers(
  "What must work end to end? The operator sees the guide section table of contents, the guide section drafts, the combined guide draft, the section-by-section feedback, the proposal guide, the guide acceptance decision, the aligned process-definition layer, and only after alignment do commit, merge, release, deploy, and live validation occur downstream.",
  "What do humans observe? Each stage is visible as a distinct artifact or decision point, and when a guide section blocks the proposal the runtime keeps the target process constant, names the blocking section or sections, and routes the affected sections back to rewrite before process-layer alignment can resume.",
  "What counts as success? Every guide section is complete only as part of the whole guide, the team has no remaining objections, the proposal guide is accepted as one file, the JSON and guide are aligned as one process-definition layer, and the accepted result is ready for downstream integration, release, deploy, and live validation.",
  "What do conflicts look like? A section-level objection blocks the whole proposal guide and returns that section to rewrite; a cross-section disagreement blocks the whole proposal guide and returns the conflicting sections to rewrite; the target process stays unchanged while blocked; partial acceptance is not allowed; guide-section drift or midstream re-partitioning is a structural failure that forces the guide section table to be reestablished before drafting can resume; JSON-guide drift after acceptance is a process-definition alignment failure.",
);

DefineProcessWithTeamGuide.defines(`
- ProcessGuideSectionTableOfContents means a contract payload with processId and an ordered sections array; each section record contains sectionTitle, order, owningTeamMemberId, and rewriteOwnerId.
- SharedProcessConcept means an immutable contract payload with processId, processTitle, invariantSummary, fixedInputNotes, and forbiddenDriftNotes.
- AgentishQualityBlueprint means the repository quality blueprint that section-writing, review, and rewrite agents must load before judging or drafting Agentish output.
- SectionTitle means the stable display name for one guide section in the section table of contents.
- SectionAssignment means one section record with sectionTitle, order, owningTeamMemberId, and rewriteOwnerId.
- FeedbackEntry means one immutable section-keyed review note with feedbackId, processId, sectionTitle, authorId, severity, body, and createdAt.
- FeedbackSeverity means one of note, revise, or block.
- DraftingPacket means one immutable packet carrying the shared process concept, canonical section map, assigned section scope, Agentish quality blueprint, canonical Agentish sections blueprint, and team profile inputs for one guide section author.
- RewritePacket means one immutable packet carrying the assigned section name, the combined guide draft, the grouped feedback for that section, Agentish quality blueprint, canonical Agentish sections blueprint, and team profile inputs for one guide section rewrite.
- CombinedProcessGuideDraft means a whole-file payload with processId, orderedSectionTitles, sectionDrafts keyed by sectionTitle, and sectionStatus keyed by sectionTitle.
- ProcessGuideSectionFeedbackSet means an immutable payload with processId, feedbackBySection keyed by sectionTitle, collectedAt, and consumedByRewriteAt.
- ProposalProcessGuide means a whole-file payload with processId, orderedSectionTitles, rewrittenSectionContent keyed by sectionTitle, dependencyNotes keyed by sectionTitle, currentStage, basedOnDraftId, and feedbackSetId.
- ProcessGuideAcceptance means an acceptance payload with processId, accepted, acceptedSectionTitles, blockingSectionTitles, reviewerIds, decisionNotes, and decidedAt.
- ProcessGuideRewriteLoop means a transition payload with fromStage, toStage, processId, blockingSectionTitles, feedbackEntryIds, requestedByReviewerIds, and reason.
- ProcessDefinitionLayer means the paired process blueprint JSON plus companion Agentish guide treated as one aligned process-definition unit.
- AcceptedProcessGuide means the proposal guide paired with its ProcessGuideAcceptance record and marked immutable after acceptance.
`);

DefineProcessWithTeamGuide.prescribes(`
- `DefineProcessGuideTableOfContents` owns the guide section map.
- `PrepareProcessGuideDraftingPackets` owns the drafting packet for each guide section.
- `AssignProcessGuideSectionDrafting` owns dispatch of each drafting packet to its assigned team sub agent.
- `CombineProcessGuideSectionDrafts` owns `CombinedProcessGuideDraft`.
- `CollectWholeFileProcessGuideFeedback` owns `ProcessGuideSectionFeedbackSet`.
- `PrepareProcessGuideRewritePackets` owns the rewrite packet for each guide section.
- `AssignProcessGuideSectionRewrites` owns dispatch of each rewrite packet to its assigned team sub agent.
- `CombineProposalProcessGuide` owns `ProposalProcessGuide`.
- `DecideProcessGuideAcceptance` owns `ProcessGuideAcceptance` and `AcceptedProcessGuide`.
- `AlignProcessDefinitionLayer` owns synchronization of the accepted guide with the process blueprint JSON.
- `PrepareProcessGuideDraftingPackets` may not mutate `CombinedProcessGuideDraft`.
- `AssignProcessGuideSectionDrafting` may not mutate `CombinedProcessGuideDraft`.
- `CollectWholeFileProcessGuideFeedback` may not mutate `ProposalProcessGuide`.
- `PrepareProcessGuideRewritePackets` may not mutate `ProposalProcessGuide`.
- `AssignProcessGuideSectionRewrites` may not mutate `ProcessGuideAcceptance`.
- `AlignProcessDefinitionLayer` may not reopen accepted guide sections without returning through the rewrite loop.
- The same sub agent should normally rewrite the same guide section it drafted unless the process explicitly reassigns ownership.
- Cross-section dependencies must be named explicitly and preserved through the combined draft, section feedback, final rewrite, and process-layer alignment.
- `commit`, `merge`, `release`, `deploy`, and live verification remain downstream of `AlignProcessDefinitionLayer` and are not part of guide acceptance itself.
`);

Section.implementationPlan.answers(
  "What code structure exists? `DefineProcessGuideTableOfContents` owns the guide section table of contents, `PrepareProcessGuideDraftingPackets` owns one drafting packet per guide section, `AssignProcessGuideSectionDrafting` owns dispatch of those packets, `CombineProcessGuideSectionDrafts` owns `CombinedProcessGuideDraft`, `CollectWholeFileProcessGuideFeedback` owns `ProcessGuideSectionFeedbackSet`, `PrepareProcessGuideRewritePackets` owns one rewrite packet per guide section, `AssignProcessGuideSectionRewrites` owns dispatch of those packets, `CombineProposalProcessGuide` owns `ProposalProcessGuide`, `DecideProcessGuideAcceptance` owns `ProcessGuideAcceptance` and `AcceptedProcessGuide`, and `AlignProcessDefinitionLayer` owns synchronization of the accepted guide with the process JSON.",
  "Where do responsibilities live? `PrepareProcessGuideDraftingPackets` fixes the exact inputs each guide section author receives, `AssignProcessGuideSectionDrafting` sends one packet to one team sub agent per guide section, `PrepareProcessGuideRewritePackets` fixes the exact rewrite inputs for each guide section, `AssignProcessGuideSectionRewrites` normally keeps the same guide section owner unless the process explicitly reassigns it, `DecideProcessGuideAcceptance` records the only final guide acceptance or loopback outcome after the proposal guide is complete, and `AlignProcessDefinitionLayer` updates the process JSON to match the accepted guide before integration proceeds.",
  "Which step mutates which artifact? `DefineProcessGuideTableOfContents` mutates the guide section map, `PrepareProcessGuideDraftingPackets` mutates the drafting-packet set, `AssignProcessGuideSectionDrafting` mutates the guide-section dispatch record, `CombineProcessGuideSectionDrafts` mutates the combined guide draft, `CollectWholeFileProcessGuideFeedback` mutates the immutable section-keyed feedback set, `PrepareProcessGuideRewritePackets` mutates the rewrite-packet set, `AssignProcessGuideSectionRewrites` mutates the rewrite dispatch record, `CombineProposalProcessGuide` mutates the proposal guide, `DecideProcessGuideAcceptance` mutates the final acceptance record, and `AlignProcessDefinitionLayer` mutates the process blueprint JSON and companion guide pair as one aligned layer.",
  "How does the implemented system behave? It moves from `DefineProcessGuideTableOfContents` to `PrepareProcessGuideDraftingPackets`, then `AssignProcessGuideSectionDrafting`, then `CombineProcessGuideSectionDrafts`, then `CollectWholeFileProcessGuideFeedback`, then `PrepareProcessGuideRewritePackets`, then `AssignProcessGuideSectionRewrites`, then `CombineProposalProcessGuide`, then `CollectFinalProcessGuideReview`, then `DecideProcessGuideAcceptance`, then `AlignProcessDefinitionLayer`; each step owns one artifact boundary and may not silently mutate the next step's artifact.",
  "How are cross-section dependencies handled? Dependency notes are attached in `CollectWholeFileProcessGuideFeedback`, preserved into `PrepareProcessGuideRewritePackets`, carried through `AssignProcessGuideSectionRewrites`, resolved in `CombineProposalProcessGuide`, and then preserved into `AlignProcessDefinitionLayer` so JSON-guide alignment does not drop accepted guide constraints.",
  "What implementation choices remain closed? Guide-section ownership stays explicit, feedback stays grouped by section, each step mutates only its own artifact, accepted guide content must align back into the process JSON before integration, and `commit`, `merge`, `release`, `deploy`, and live verification remain downstream of process-definition alignment rather than part of guide acceptance itself.",
);

Section.contracts.answers(
  "What exact types exist? `ProcessGuideSectionTableOfContents`, `SharedProcessConcept`, `DraftingPacket`, `RewritePacket`, `CombinedProcessGuideDraft`, `ProcessGuideSectionFeedbackSet`, `ProposalProcessGuide`, `ProcessGuideAcceptance`, `ProcessGuideRewriteLoop`, `ProcessDefinitionLayer`, and `AcceptedProcessGuide`.",
  "What exact messages exist? Drafting dispatch sends one immutable `DraftingPacket` to one team sub agent for one guide section; review returns immutable `FeedbackEntry` records keyed by guide section; rewrite dispatch sends one immutable `RewritePacket` to one team sub agent for one guide section; final review returns either acceptance or blocking section feedback for the whole proposal guide; alignment emits one synchronized process-definition layer from the accepted guide plus the JSON contract.",
  "What exact action contracts exist? `PrepareProcessGuideDraftingPackets` creates one complete drafting packet per guide section, `AssignProcessGuideSectionDrafting` dispatches those packets without altering their contents, `CollectWholeFileProcessGuideFeedback` records immutable section-keyed feedback, `PrepareProcessGuideRewritePackets` creates one complete rewrite packet per guide section from the combined draft plus grouped feedback, `AssignProcessGuideSectionRewrites` dispatches those packets without altering their contents, `DecideProcessGuideAcceptance` either emits one immutable acceptance record or one immutable loopback record, and `AlignProcessDefinitionLayer` either produces one synchronized JSON-guide pair or fails with explicit alignment drift.",
  "What exact store shape exists? The mutable store contains one current guide section map, one drafting-packet set, one combined guide draft, one section-keyed feedback set, one rewrite-packet set, one proposal guide, one guide acceptance decision, and one aligned process-definition layer for the target process; accepted artifacts become immutable once emitted.",
  "What exact schemas cross boundaries? Cross-agent boundaries carry only `DraftingPacket`, `RewritePacket`, `FeedbackEntry`, `ProcessGuideAcceptance`, and `ProcessGuideRewriteLoop`; process-definition alignment crosses the guide-to-JSON boundary only through the accepted guide plus the target process blueprint JSON; release boundaries carry the exact promoted commit and release tag produced after alignment is complete.",
);

Step.defineTableOfContents.precedes(Step.prepareDraftingPackets);
Step.prepareDraftingPackets.precedes(Step.assignDrafting);
Step.assignDrafting.precedes(Step.combineDrafts);
Step.combineDrafts.precedes(Step.collectReview);
Step.collectReview.precedes(Step.prepareRewritePackets);
Step.prepareRewritePackets.precedes(Step.assignRewrites);
Step.assignRewrites.precedes(Step.combineProposal);
Step.combineProposal.precedes(Step.collectFinalReview);
Step.collectFinalReview.precedes(Step.decideAcceptance);
Step.decideAcceptance.precedes(Step.alignProcessDefinition);

when(Step.collectReview.contains("section feedback"))
  .then(DefineProcessWithTeamGuide.expects("feedback grouped by guide section name"))
  .and(DefineProcessWithTeamGuide.expects("each guide section feedback set to remain attached to the same target process until rewrite consumes it"));

when(Step.prepareDraftingPackets.starts())
  .then(DefineProcessWithTeamGuide.requires(Artifact.sectionMap))
  .and(DefineProcessWithTeamGuide.requires(Artifact.sharedConcept))
  .and(DefineProcessWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineProcessWithTeamGuide.requires("an explicit team sub agent owner for each guide section"))
  .and(DefineProcessWithTeamGuide.expects("each drafting packet to include the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, the assigned section name, and the shared process concept before drafting"));

when(Step.assignDrafting.starts())
  .then(DefineProcessWithTeamGuide.requires("one prepared drafting packet per guide section"))
  .and(DefineProcessWithTeamGuide.expects("each packet to be dispatched without changing its section-specific inputs"));

when(Step.combineDrafts.starts())
  .then(DefineProcessWithTeamGuide.requires("all drafted guide sections"))
  .and(DefineProcessWithTeamGuide.preserves("guide section boundaries inside the combined guide draft"));

when(Step.collectReview.contains("section feedback"))
  .then(DefineProcessWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineProcessWithTeamGuide.expects("each reviewing agent to load the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, and the whole process guide draft before producing section feedback"));

when(Step.prepareRewritePackets.starts())
  .then(DefineProcessWithTeamGuide.requires(Artifact.combinedDraft))
  .and(DefineProcessWithTeamGuide.requires(Artifact.sectionFeedback))
  .and(DefineProcessWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineProcessWithTeamGuide.expects("each rewrite packet to include the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, the assigned section name, the combined guide draft, and the section-grouped feedback before rewriting"))
  .and(DefineProcessWithTeamGuide.prefers("the same owner for each guide section unless reassignment is explicitly needed"));

when(Step.collectReview.contains("section feedback"))
  .then(DefineProcessWithTeamGuide.requires("cross-section dependencies called out explicitly when they exist"))
  .and(DefineProcessWithTeamGuide.requires("each FeedbackEntry to remain immutable until the matching rewrite consumes it"));

when(Step.assignRewrites.starts())
  .then(DefineProcessWithTeamGuide.requires("one prepared rewrite packet per guide section"))
  .and(DefineProcessWithTeamGuide.expects("each packet to be dispatched without changing its section-specific rewrite inputs"));

when(Step.collectFinalReview.starts())
  .then(DefineProcessWithTeamGuide.requires(Artifact.proposalGuide))
  .and(DefineProcessWithTeamGuide.requires(Artifact.qualityBlueprint))
  .and(DefineProcessWithTeamGuide.expects("each final-review agent to load the relevant agent-team profile, the Agentish quality blueprint, the canonical Agentish sections blueprint, and the proposal guide before suggesting final changes"));

when(Step.decideAcceptance.encounters("requested final changes"))
  .then(DefineProcessWithTeamGuide.returnsTo(Step.prepareRewritePackets))
  .and(DefineProcessWithTeamGuide.preserves("the same proposal guide as the current authoritative review target"));

when(Step.decideAcceptance.encounters("team acceptance"))
  .then(DefineProcessWithTeamGuide.accepts(Artifact.targetGuide))
  .and(DefineProcessWithTeamGuide.requires("one explicit ProcessGuideAcceptance record for the final guide"))
  .and(DefineProcessWithTeamGuide.requires("the AcceptedProcessGuide to pair the proposal guide with that ProcessGuideAcceptance record"))
  .and(DefineProcessWithTeamGuide.requires("no partial guide section acceptance"));

when(Step.alignProcessDefinition.starts())
  .then(DefineProcessWithTeamGuide.requires(Artifact.targetProcessJson))
  .and(DefineProcessWithTeamGuide.requires(Artifact.targetGuide))
  .and(DefineProcessWithTeamGuide.requires("the accepted guide to align the paired process JSON before commit"))
  .and(DefineProcessWithTeamGuide.requires("release, deploy, and live validation to stay downstream of process-definition alignment"));
