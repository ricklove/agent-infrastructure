/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const RefineWithTeam = define.blueprint("RefineWithTeam", {
  format: Agentish,
  role: "Refinement workflow that uses team-profile review, revision, and unanimous approval to close one target at a time",
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

RefineWithTeam.contains(
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
  "Why does the subject exist? To refine one target at a time by collecting team-profile feedback, applying revision, and closing only after the fixed reviewer set approves the same result.",
  "What are the core abstractions? One target, team-profile feedback, a revision candidate, and approval state.",
  "What is authoritative? The target remains authoritative until a revision candidate replaces it, and no revision candidate becomes final until the fixed reviewer set unanimously approves it.",
  "What must remain true? Every team profile reviews the same target and the same revision candidate, and any requested change reopens the revision loop until unanimous approval is reached.",
);

Section.scenarios.answers(
  "What must work end to end? A user identifies one target to refine, each team profile sub agent reviews that same target and returns change suggestions, the changes are applied into a revised target, each team profile sub agent reviews that revised target and returns approve or request-more-changes feedback, and the loop repeats until every team profile sub agent approves the same refined target.",
  "What do humans observe? The target stays fixed across review and revision rounds, each round produces one updated target snapshot, and each reviewer pass makes the current approval state visible for that same target.",
  "What counts as success? Every team profile sub agent approves the same revised target, no reviewer still requests changes, and the refined target is ready to be treated as done.",
  "What do conflicts look like? A blocked or missing reviewer response keeps the target open and returns that review round to the loop, any request for more changes returns the target to the make-changes step, and partial approval never closes the workflow until unanimous approval is reached.",
);

Section.implementationPlan.answers(
  "What code structure exists? `IdentifyTargetBlueprint` selects one target snapshot, `CollectTeamChangeSuggestions` gathers role-fixed suggestions from `structure-author`, `implementer`, `refactorer`, `invariants-critic`, and `fresh-engineer`, `ApplySuggestedChanges` produces the only revision candidate eligible for the next approval round, `CollectTeamApproval` gathers approvals against that revision candidate, and `DecideCompletion` closes the workflow only when every role approves the same candidate.",
  "Where do responsibilities live? The reviewer roles stay fixed across both passes, the target snapshot stays authoritative while review is open, `ApplySuggestedChanges` owns the single next-round candidate, and `DecideCompletion` owns the only accepted end state.",
  "Who owns state, transport, parsing, projection, and mutation? `IdentifyTargetBlueprint` owns target selection, `CollectTeamChangeSuggestions` owns the role-fixed suggestion set, `ApplySuggestedChanges` owns the sole revision candidate and its new snapshot, `CollectTeamApproval` owns the approval set for that candidate, and `DecideCompletion` owns the final open-or-closed decision.",
  "How does the implemented system behave? It identifies one target, sends that same target to the same five reviewer roles, applies the gathered suggestions into one revision candidate, reuses the same five roles to approve or request more changes on that candidate, and loops only if a reviewer rejects the candidate.",
  "What implementation choices remain closed? No reviewer role changes between passes, no alternate candidate competes with the revision produced by `ApplySuggestedChanges`, no approval can bypass the candidate from the latest change step, and the workflow closes only after unanimous approval of that one candidate.",
);

Section.contracts.answers(
  "What exact types exist? `RefineTargetSpec`, `ReviewRound`, `ChangeSuggestion`, `AppliedChangeSet`, `ApprovalRecord`, `ApprovalSet`, `RefinementLoop`, and `RefinedTarget`.",
  "What exact review-packet behavior exists? Each review packet contains the current target snapshot, the active review-round id, the assigned team profile, the canonical Agentish sections blueprint, and the Agentish quality blueprint. Reviewers may suggest changes only against the current snapshot and may not rewrite the target directly.",
  "What exact action contracts exist? `ChangeSuggestion` is immutable after creation. `AppliedChangeSet` consumes only the suggestion IDs it applies and produces a new target snapshot. `ApprovalRecord` is immutable and must name the round it belongs to, the reviewer who decided, and the suggestion IDs that blocked approval if approval was not granted. `ApprovalSet` is immutable, keyed by roundId, and may consume only the suggestions named by the current round. `RefinementLoop` is immutable and must name the blocking reviewer IDs, blocking suggestion IDs, fromStage, and toStage that force another change pass.",
  "What exact store shape exists? `RefineTargetSpec` is an immutable payload with targetId, targetKind, targetPath, targetSnapshotId, and targetSummary. `ReviewRound` is an immutable payload with roundId, targetId, targetSnapshotId, reviewerIds, reviewStage, and inputSnapshotId. Every artifact in the round must carry the same targetId and the same targetSnapshotId for that round.",
  "What exact schemas cross boundaries? `ApprovalSet` records unanimous approval only when every reviewerId in the current round has a matching `ApprovalRecord` with `approved = true`. `RefinedTarget` is the accepted target snapshot paired with its `ApprovalSet` and `AppliedChangeSet`, and it is immutable after acceptance. The loop remains open if any reviewer requests more changes, if any blocking suggestion remains unconsumed for the current round, or if the applied change set does not match the accepted approval set.",
);
