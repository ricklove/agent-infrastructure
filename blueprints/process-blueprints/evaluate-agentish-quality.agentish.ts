/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const EvaluateAgentishQualityGuide = define.system("EvaluateAgentishQualityGuide", {
  format: Agentish,
  role: "Companion guide for the evaluate-agentish-quality process blueprint",
});

EvaluateAgentishQualityGuide.enforces(`
- Evaluate one target file per fresh context.
- Always load the Agentish language root and the Agentish quality-evaluation blueprint.
- Load only the minimum legitimate companion context for the target file class.
- Do not let earlier file styles or earlier judgments leak into the next target evaluation.
- Separate intrinsic writing quality from role-appropriateness and from likely obsolescence.
- A file may be partial and still be high quality if that partiality matches its intended blueprint role.
- A file may be well written and still be a good archive/delete candidate if corpus-use evidence is weak.
- The report should end in a concrete recommendation: keep, revise, pair, archive, or delete.`);
