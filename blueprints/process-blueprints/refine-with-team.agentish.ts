/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const RefineWithTeamGuide = define.system("RefineWithTeamGuide", {
  format: Agentish,
  role: "Companion guide for the Refine with Team process blueprint",
});

const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

const Artifact = {
  targetSpec: define.document("RefineTargetSpec"),
  reviewRound: define.document("ReviewRound"),
  suggestion: define.document("ChangeSuggestion"),
  appliedChangeSet: define.document("AppliedChangeSet"),
  approvalRecord: define.document("ApprovalRecord"),
  approvalSet: define.document("ApprovalSet"),
  refinementLoop: define.document("RefinementLoop"),
  refinedTarget: define.document("RefinedTarget"),
};

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`);

RefineWithTeamGuide.contains(
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
  Artifact.targetSpec,
  Artifact.reviewRound,
  Artifact.suggestion,
  Artifact.appliedChangeSet,
  Artifact.approvalRecord,
  Artifact.approvalSet,
  Artifact.refinementLoop,
  Artifact.refinedTarget,
);

Section.concept.precedes(Section.scenarios);
Section.scenarios.precedes(Section.implementationPlan);
Section.implementationPlan.precedes(Section.contracts);

Section.concept.answers(
  "Why does the subject exist? To guide refinement of a bounded target by collecting team-profile feedback, applying revision, and ending only when the fixed reviewer set unanimously approves the same result.",
  "What are the core abstractions? A bounded target, team-profile feedback, a revision candidate, and unanimous approval.",
  "What is authoritative? The current target remains authoritative until a revision candidate replaces it, and no candidate is final until every team profile approves it.",
  "What must remain true? Every team profile reviews the same target and the same revised candidate, any request for more changes reopens the make-changes step, and the process ends only when the full reviewer set approves.",
);

Section.scenarios.answers(
  "What must work end to end? A user identifies one target scope to refine, which may be a single item or a bounded set of related items; each team profile sub agent reviews that same target scope and makes change suggestions, the changes are applied into a revised target scope, each team profile sub agent reviews the revised target scope and either approves it or requests additional changes, and the loop repeats until every team profile sub agent approves the same revised target scope.",
  "What do humans observe? The target scope stays fixed across review and revision rounds, each pass produces one updated target scope snapshot, and each reviewer pass makes the current approval state visible for that same target scope.",
  "What counts as success? Every team profile sub agent approves the same revised target scope, no reviewer still requests changes, and the workflow is ready to be treated as done.",
  "What do conflicts look like? A blocked or missing reviewer response is a loop blocker that keeps the target scope open and returns that review round to the loop, any request for additional changes returns the target scope to the make-changes step, and partial approval never closes the workflow until unanimous approval is reached.",
);

Section.implementationPlan.answers(
  "What code structure exists? `IdentifyTargetBlueprint` selects the target to refine, `CollectTeamChangeSuggestions` gathers role-fixed suggestions from the five team profiles, `ApplySuggestedChanges` produces the latest revision candidate, `CollectTeamApproval` gathers approvals for that candidate, and `DecideCompletion` closes the process only when every role approves the same latest candidate.",
  "Where do responsibilities live? `IdentifyTargetBlueprint` owns target selection, `CollectTeamChangeSuggestions` owns the review packet, `ApplySuggestedChanges` owns the latest candidate, `CollectTeamApproval` owns the approval set for that candidate, and `DecideCompletion` owns the open-or-closed workflow decision.",
  "What does each review packet contain? The packet carries the current target snapshot, the active review-round id, the assigned team profile, the canonical Agentish sections blueprint, and the Agentish quality blueprint; the same packet shape is used in both review passes.",
  "How does the implemented system behave? It identifies one target, sends that same target to the same five reviewer roles, applies their suggestions into one latest candidate, reuses the same five roles to approve or request more changes on that candidate, and loops only if the latest candidate is rejected.",
  "What implementation choices remain closed? The reviewer roles stay fixed across both passes, the latest candidate is the only candidate that can be approved in the next round, no approval can bypass that candidate, and the workflow closes only after unanimous approval of that one candidate.",
);

Section.contracts.answers(
  "What exact types exist? `RefineTargetSpec`, `ReviewRound`, `ChangeSuggestion`, `AppliedChangeSet`, `ApprovalRecord`, `ApprovalSet`, `RefinementLoop`, and `RefinedTarget`.",
  "What exact review-packet behavior exists? Each review packet is a role-relative payload for one bounded target scope and one `roundId`; it contains the current target snapshot, the assigned team profile, the canonical Agentish sections blueprint, and the Agentish quality blueprint. Reviewers may suggest changes only against that packet and may not rewrite the target directly.",
  "What exact action contracts exist? `ChangeSuggestion` is immutable after creation. `AppliedChangeSet` consumes only the suggestion IDs it applies, records the `sourceRoundId`, and produces the next target snapshot for the same bounded target. `ApprovalRecord` is immutable, keyed by `roundId` and `reviewerId`, and records `approved`, `blockingSuggestionIds`, and `notes`. `ApprovalSet` is immutable, keyed by `roundId`, and is unanimous only when it contains one `ApprovalRecord` per reviewer in the current round. `RefinementLoop` is immutable and must name `fromStage`, `toStage`, `targetId`, `roundId`, `blockingReviewerIds`, and `blockingSuggestionIds` for the loopback.",
  "What exact store shape exists? `RefineTargetSpec` is an immutable payload with targetId, targetKind, targetPath, targetSnapshotId, and targetSummary. `ReviewRound` is an immutable payload with roundId, targetId, targetSnapshotId, reviewerIds, reviewStage, and inputSnapshotId. Every artifact in a round must preserve the same targetId, the same targetSnapshotId, and the same roundId until `AppliedChangeSet` intentionally creates the next snapshot.",
  "What exact acceptance condition closes the loop? `RefinedTarget` is the accepted target snapshot paired with its unanimous `ApprovalSet` and matching `AppliedChangeSet`, and it is immutable after acceptance. The loop remains open if any reviewer requests more changes, if any blocking suggestion remains unconsumed for the current round, or if the applied change set does not match the accepted approval set.",
);
