/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const ImproveAgentishQualityGuide = define.system("ImproveAgentishQualityGuide", {
  format: Agentish,
  role: "Companion guide for the improve-agentish-quality process blueprint",
});

ImproveAgentishQualityGuide.enforces(`
- Improve one subject file per run.
- Begin each run by rereading the Agentish language root, the Agentish quality-evaluation blueprint, and the Agentish sections blueprint.
- Evaluate before rewriting.
- Rewrite from the evaluation rather than from unfocused style preference.
- After the local rewrite, decide whether another pass would materially improve the file or whether further change would be mostly cosmetic.
- Use an independent fresh-context evaluator for the final quality judgment.
- Use an independent fresh-context generator for the updated blueprint-state artifact.
- Compare the new blueprint-state against the prior one and judge whether the rewritten ideal improved downstream current-reality comparison quality.
- Prefer central subject files that can become strong exemplars before lower-leverage cleanup targets.
- Record whether the rewrite improved intrinsic quality, blueprint-state generativity, both, or neither.
`);
