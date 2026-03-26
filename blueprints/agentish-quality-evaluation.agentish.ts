/// <reference path="./_agentish.d.ts" />

const Agentish = define.language("Agentish");

const AgentishQualityEvaluation = define.blueprint("AgentishQualityEvaluation", {
  format: Agentish,
  role: "Standard repository method for evaluating Agentish file quality fairly and comparably",
});

const Artifact = {
  targetFile: define.document("TargetAgentishFile"),
  qualityBlueprint: define.document("AgentishQualityBlueprint"),
  languageRoot: define.document("AgentishLanguageRoot"),
  companionContext: define.document("AllowedCompanionContext"),
  evaluationReport: define.document("AgentishEvaluationReport"),
};

const FileClass = {
  languageRoot: define.class("LanguageRootFile"),
  sharedMeta: define.class("SharedMetaBlueprint"),
  productIdeal: define.class("ProductIdealBlueprint"),
  implementationResolved: define.class("ImplementationResolvedBlueprint"),
  blueprintState: define.class("BlueprintStateFile"),
  processGuide: define.class("ProcessGuideFile"),
  exploratoryCompanion: define.class("ExploratoryCompanionFile"),
};

const Mode = {
  standalone: define.mode("StandaloneRead"),
  layerRelative: define.mode("LayerRelativeRead"),
  corpusUsefulness: define.mode("CorpusUsefulnessRead"),
};

const Dimension = {
  selfDescription: define.dimension("SelfDescription"),
  semanticDensity: define.dimension("SemanticDensity"),
  causalClarity: define.dimension("CausalClarity"),
  localRecoverability: define.dimension("LocalRecoverability"),
  abstractionDiscipline: define.dimension("AbstractionDiscipline"),
  interpretiveSlack: define.dimension("InterpretiveSlack"),
  corpusFit: define.dimension("CorpusFit"),
  layerCorrectness: define.dimension("LayerCorrectness"),
  liveUseEvidence: define.dimension("LiveUseEvidence"),
  obsolescenceRisk: define.dimension("ObsolescenceRisk"),
};

AgentishQualityEvaluation.contains(
  Artifact.targetFile,
  Artifact.qualityBlueprint,
  Artifact.languageRoot,
  Artifact.companionContext,
  Artifact.evaluationReport,
  FileClass.languageRoot,
  FileClass.sharedMeta,
  FileClass.productIdeal,
  FileClass.implementationResolved,
  FileClass.blueprintState,
  FileClass.processGuide,
  FileClass.exploratoryCompanion,
  Mode.standalone,
  Mode.layerRelative,
  Mode.corpusUsefulness,
  Dimension.selfDescription,
  Dimension.semanticDensity,
  Dimension.causalClarity,
  Dimension.localRecoverability,
  Dimension.abstractionDiscipline,
  Dimension.interpretiveSlack,
  Dimension.corpusFit,
  Dimension.layerCorrectness,
  Dimension.liveUseEvidence,
  Dimension.obsolescenceRisk,
);

AgentishQualityEvaluation.enforces(`- Every target file must be classified before quality judgment begins.
- Every target file must be evaluated in fresh context rather than after reading a long mixed corpus.
- The fresh context must always include the language root and this quality-evaluation blueprint.
- Layer-relative evaluation may include only the minimum companion context that the target file class legitimately depends on.
- Standalone evaluation must not silently import adjacent blueprint knowledge.
- Blueprint-state files are judged relative to the ideal blueprint they compare against rather than as fully standalone product specifications.
- Process guides are judged relative to their paired JSON contract rather than as primary machine-readable artifacts.
- Files with no clear ownership, no evident companion role, and no live-use evidence should be evaluated for obsolescence risk separately from intrinsic writing quality.
- Reports must separate quality problems from corpus-role problems.
- Reports must distinguish low quality, partial but correct role execution, and likely obsolete or orphaned artifacts.`);

AgentishQualityEvaluation.defines(`- TargetAgentishFile means one repository Agentish artifact under evaluation.
- AgentishQualityBlueprint means this standard quality-evaluation blueprint.
- AgentishLanguageRoot means the shared language-level Agentish definition such as _agentish.ts.
- AllowedCompanionContext means only the smallest extra blueprint set needed for a fair layer-relative read.
- StandaloneRead means the file is judged primarily by what a capable reader can recover from the file itself plus the language root.
- LayerRelativeRead means the file is judged relative to the blueprint layer and companion artifacts it is supposed to rely on.
- CorpusUsefulnessRead means the file is judged by whether it improves the larger blueprint graph even if it is intentionally partial in isolation.
- LiveUseEvidence means concrete signs that the file is still used, paired, updated, referenced, or operationally relevant in the repository.
- ObsolescenceRisk means the probability that the file is stale, superseded, orphaned, or never integrated into the live blueprint corpus.`);

FileClass.languageRoot.allows(Mode.standalone, Mode.corpusUsefulness);
FileClass.sharedMeta.allows(Mode.standalone, Mode.corpusUsefulness);
FileClass.productIdeal.allows(Mode.standalone, Mode.layerRelative, Mode.corpusUsefulness);
FileClass.implementationResolved.allows(Mode.layerRelative, Mode.corpusUsefulness);
FileClass.blueprintState.allows(Mode.layerRelative, Mode.corpusUsefulness);
FileClass.processGuide.allows(Mode.layerRelative, Mode.corpusUsefulness);
FileClass.exploratoryCompanion.allows(Mode.standalone, Mode.corpusUsefulness);

Mode.standalone.judges(
  Dimension.selfDescription,
  Dimension.semanticDensity,
  Dimension.causalClarity,
  Dimension.localRecoverability,
  Dimension.abstractionDiscipline,
  Dimension.interpretiveSlack,
);

Mode.layerRelative.judges(
  Dimension.layerCorrectness,
  Dimension.corpusFit,
  Dimension.causalClarity,
  Dimension.localRecoverability,
  Dimension.abstractionDiscipline,
);

Mode.corpusUsefulness.judges(
  Dimension.corpusFit,
  Dimension.liveUseEvidence,
  Dimension.obsolescenceRisk,
);

when(FileClass.blueprintState.evaluates(Artifact.targetFile))
  .then(Artifact.companionContext.requires("the ideal blueprint it compares against"))
  .and(Mode.layerRelative.treats("comparison dependence as legitimate rather than as a standalone quality failure"));

when(FileClass.processGuide.evaluates(Artifact.targetFile))
  .then(Artifact.companionContext.requires("the paired process blueprint JSON"))
  .and(Mode.layerRelative.treats("guide incompleteness without the JSON contract as expected"));

when(Artifact.targetFile.lacks("clear role or live-use evidence"))
  .then(AgentishQualityEvaluation.raises(Dimension.obsolescenceRisk))
  .and(AgentishQualityEvaluation.forbids("equating likely obsolescence with low intrinsic Agentish quality"));

when(Reviewer.reads("many target files in one rolling context"))
  .then(AgentishQualityEvaluation.encounters("style anchoring"))
  .and(AgentishQualityEvaluation.encounters("cross-file contamination"))
  .and(AgentishQualityEvaluation.degrades(Dimension.interpretiveSlack));

when(Artifact.evaluationReport.describes(Artifact.targetFile))
  .then(Artifact.evaluationReport.expects("file class"))
  .and(Artifact.evaluationReport.expects("evaluation mode"))
  .and(Artifact.evaluationReport.expects("allowed companion context"))
  .and(Artifact.evaluationReport.expects("dimension-by-dimension judgment"))
  .and(Artifact.evaluationReport.expects("separate obsolescence assessment"))
  .and(Artifact.evaluationReport.expects("recommended next action: keep, revise, pair, archive, or delete"));
