/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const ImproveAgentishQualityGuide = define.system("ImproveAgentishQualityGuide", {
  format: Agentish,
  role: "Companion guide for the improve-agentish-quality process blueprint",
});

const Artifact = {
  targetFile: define.document("TargetAgentishSubjectFile"),
  languageRoot: define.document("AgentishLanguageRoot"),
  qualityBlueprint: define.document("AgentishQualityBlueprint"),
  sectionsBlueprint: define.document("AgentishSectionsBlueprint"),
  independentEvaluation: define.document("IndependentQualityEvaluation"),
  rewrittenBlueprintState: define.document("RewrittenBlueprintState"),
  comparison: define.document("QualityAndStateComparison"),
};

const Step = {
  evaluateTarget: define.step("EvaluateTargetAgentishFile"),
  rewriteTarget: define.step("RewriteTargetFromEvaluation"),
  decideAnotherPass: define.step("DecideWhetherAnotherPassIsMaterial"),
  runBlindEvaluation: define.step("RunIndependentFreshContextEvaluation"),
  compareDownstreamEffects: define.step("CompareBlueprintStateDownstreamEffects"),
};

const Goal = {
  intrinsicQuality: define.goal("IntrinsicAgentishQualityImprovement"),
  stateGenerativity: define.goal("BlueprintStateGenerativityImprovement"),
  exemplarValue: define.goal("ExemplarSubjectBlueprintImprovement"),
};

ImproveAgentishQualityGuide.contains(
  Artifact.targetFile,
  Artifact.languageRoot,
  Artifact.qualityBlueprint,
  Artifact.sectionsBlueprint,
  Artifact.independentEvaluation,
  Artifact.rewrittenBlueprintState,
  Artifact.comparison,
  Step.evaluateTarget,
  Step.rewriteTarget,
  Step.decideAnotherPass,
  Step.runBlindEvaluation,
  Step.compareDownstreamEffects,
  Goal.intrinsicQuality,
  Goal.stateGenerativity,
  Goal.exemplarValue,
);

ImproveAgentishQualityGuide.enforces(`
- Improve one subject file per run.
- Improve Agentish Quality uses a feature-branch worktree as its only mutable surface and does not rewrite blueprint files from the shared checkout.
- Begin each run by rereading the Agentish language root, the Agentish quality-evaluation blueprint, and the Agentish sections blueprint.
- Evaluate the target file before rewriting it.
- Rewrite from that evaluation rather than from unfocused style preference.
- After the local rewrite, decide explicitly whether another pass would materially improve the file or whether further change would be mostly cosmetic.
- Use an independent fresh-context evaluator for the final quality judgment.
- Use an independent fresh-context generator for the updated blueprint-state artifact.
- Compare the new blueprint-state against the prior one and judge whether the rewritten ideal improved downstream current-reality comparison quality.
- Record whether the rewrite improved intrinsic quality, blueprint-state generativity, both, or neither.
- Prefer central subject files that can become strong exemplars before lower-leverage cleanup targets.
`);

ImproveAgentishQualityGuide.defines(`
- TargetAgentishSubjectFile means the single Agentish subject file under improvement in this run.
- AgentishLanguageRoot means the shared language-level Agentish definition such as _agentish.ts.
- AgentishQualityBlueprint means the repository blueprint that defines the evaluation method for Agentish file quality.
- AgentishSectionsBlueprint means the repository blueprint that defines canonical in-file section structure for subject Agentish files.
- IndependentQualityEvaluation means a fresh-context evaluation produced after the local rewrite without relying on the authoring agent's live rewrite context.
- RewrittenBlueprintState means the updated blueprint-state artifact produced after the target file has been improved.
- QualityAndStateComparison means the judgment that compares the rewritten file and downstream blueprint-state against their prior versions.
- IntrinsicAgentishQualityImprovement means the rewritten file became clearer, denser, more causally legible, or more role-correct on its own merits.
- BlueprintStateGenerativityImprovement means the rewritten file yields a sharper downstream blueprint-state comparison.
- ExemplarSubjectBlueprintImprovement means the rewritten file is strong enough to serve as a model for similar files in the corpus.
`);

Step.evaluateTarget.precedes(Step.rewriteTarget);
Step.rewriteTarget.precedes(Step.decideAnotherPass);
Step.decideAnotherPass.precedes(Step.runBlindEvaluation);
Step.runBlindEvaluation.precedes(Step.compareDownstreamEffects);

when(Step.decideAnotherPass.encounters("mostly cosmetic remaining changes"))
  .then(ImproveAgentishQualityGuide.stops("local rewrite iteration for the current file"));

when(Artifact.targetFile.improves(Goal.intrinsicQuality))
  .and(Artifact.rewrittenBlueprintState.improves(Goal.stateGenerativity))
  .then(ImproveAgentishQualityGuide.promotes(Artifact.targetFile).as(Goal.exemplarValue));
