/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentishRewriteQualityLoop = define.blueprint("AgentishRewriteQualityLoop", {
  format: Agentish,
  role: "Standard iterative workflow for improving one Agentish subject file, validating the improvement independently, and checking whether the stronger ideal yields a stronger blueprint-state artifact",
});

const Artifact = {
  targetFile: define.document("TargetAgentishSubjectFile"),
  languageRoot: define.document("AgentishLanguageRoot"),
  qualityBlueprint: define.document("AgentishQualityBlueprint"),
  sectionsBlueprint: define.document("AgentishSectionsBlueprint"),
  subjectState: define.document("SubjectBlueprintStateFile"),
  priorEvaluation: define.document("PreCleanupQualityEvaluation"),
  revisedEvaluation: define.document("PostCleanupQualityEvaluation"),
  independentEvaluation: define.document("IndependentQualityEvaluation"),
  priorState: define.document("PriorBlueprintState"),
  revisedState: define.document("RewrittenBlueprintState"),
  comparison: define.document("QualityAndStateComparison"),
};

const Step = {
  reloadStandards: define.step("ReloadAgentishStandards"),
  evaluateCurrentQuality: define.step("EvaluateCurrentQuality"),
  rewriteTarget: define.step("RewriteTargetFile"),
  decideAnotherPass: define.step("DecideWhetherAnotherPassImprovesQuality"),
  independentReview: define.step("RunIndependentQualityEvaluation"),
  stateRewrite: define.step("RegenerateBlueprintStateFromRewrittenIdeal"),
  compareOutputs: define.step("CompareBeforeAndAfterOutputs"),
};

const Goal = {
  intrinsicQuality: define.goal("IntrinsicAgentishQualityImprovement"),
  stateGenerativity: define.goal("BlueprintStateGenerativityImprovement"),
  exemplarValue: define.goal("ExemplarSubjectBlueprintImprovement"),
};

AgentishRewriteQualityLoop.contains(
  Artifact.targetFile,
  Artifact.languageRoot,
  Artifact.qualityBlueprint,
  Artifact.sectionsBlueprint,
  Artifact.subjectState,
  Artifact.priorEvaluation,
  Artifact.revisedEvaluation,
  Artifact.independentEvaluation,
  Artifact.priorState,
  Artifact.revisedState,
  Artifact.comparison,
  Step.reloadStandards,
  Step.evaluateCurrentQuality,
  Step.rewriteTarget,
  Step.decideAnotherPass,
  Step.independentReview,
  Step.stateRewrite,
  Step.compareOutputs,
  Goal.intrinsicQuality,
  Goal.stateGenerativity,
  Goal.exemplarValue,
);

AgentishRewriteQualityLoop.enforces(`
- Run the loop on one target subject file at a time.
- Each cleanup iteration must begin by rereading the Agentish language root, the Agentish quality-evaluation blueprint, and the Agentish sections blueprint.
- Evaluate the current file before rewriting it.
- Rewrite the target file from that evaluation rather than from vague stylistic preference.
- After each rewrite pass, decide explicitly whether another iteration would materially improve quality or whether further change would be mostly cosmetic.
- Before accepting the rewrite, obtain an independent quality evaluation from a fresh reader context.
- Before accepting the rewrite, obtain an updated blueprint-state artifact for the same subject from an independent fresh reader context.
- Compare the rewritten blueprint-state against the prior blueprint-state to judge whether the stronger ideal produced a stronger current-reality comparison.
- Record intrinsic quality change separately from blueprint-state generativity change.
- Prioritize files that can become strong exemplar subject blueprints before lower-leverage cleanup targets.
`);

AgentishRewriteQualityLoop.defines(`
- TargetAgentishSubjectFile means the one canonical subject blueprint being improved in this loop.
- SubjectBlueprintStateFile means the blueprint-state companion for that same subject when one exists.
- PreCleanupQualityEvaluation means the file-quality judgment captured before any rewrite pass begins.
- PostCleanupQualityEvaluation means the authoring agent's own quality judgment after the rewrite pass is complete.
- IndependentQualityEvaluation means a fresh-context quality judgment produced by a separate evaluator after the rewrite.
- PriorBlueprintState means the blueprint-state artifact before the target subject file was improved.
- RewrittenBlueprintState means a new blueprint-state artifact generated after the target subject file was improved.
- BlueprintStateGenerativityImprovement means the rewritten ideal makes the blueprint-state sharper in ownership, gap articulation, evidence separation, and comparison clarity.
- ExemplarSubjectBlueprintImprovement means the rewritten file is valuable not only locally but as a model for improving the rest of the corpus.
`);

Step.reloadStandards.precedes(Step.evaluateCurrentQuality);
Step.evaluateCurrentQuality.precedes(Step.rewriteTarget);
Step.rewriteTarget.precedes(Step.decideAnotherPass);
Step.decideAnotherPass.precedes(Step.independentReview);
Step.independentReview.precedes(Step.stateRewrite);
Step.stateRewrite.precedes(Step.compareOutputs);

Step.reloadStandards.preserves("fresh activation of Agentish language values and quality criteria");
Step.evaluateCurrentQuality.preserves(Goal.intrinsicQuality);
Step.rewriteTarget.preserves(Goal.intrinsicQuality, Goal.exemplarValue);
Step.independentReview.preserves("external quality verification");
Step.stateRewrite.preserves(Goal.stateGenerativity);
Step.compareOutputs.preserves(
  Goal.intrinsicQuality,
  Goal.stateGenerativity,
  Goal.exemplarValue,
);

when(Step.decideAnotherPass.encounters("mostly stylistic or cosmetic remaining differences"))
  .then(AgentishRewriteQualityLoop.stops("local iteration on the target file"));

when(Artifact.targetFile.improves(Goal.intrinsicQuality))
  .and(Artifact.revisedState.improves(Goal.stateGenerativity))
  .then(AgentishRewriteQualityLoop.promotes(Artifact.targetFile).as(Goal.exemplarValue));
