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
  sectionsBlueprint: define.document("AgentishSectionsBlueprint"),
  companionContext: define.document("AllowedCompanionContext"),
  evaluationReport: define.document("AgentishEvaluationReport"),
  reportCatalog: define.document("AgentishQualityReportCatalog"),
};

const FileClass = {
  languageRoot: define.class("LanguageRootFile"),
  sharedMeta: define.class("SharedMetaBlueprint"),
  subjectBlueprint: define.class("SubjectBlueprintFile"),
  blueprintState: define.class("BlueprintStateFile"),
  processGuide: define.class("ProcessGuideFile"),
  exploratoryCompanion: define.class("ExploratoryCompanionFile"),
};

const Mode = {
  standalone: define.mode("StandaloneRead"),
  roleRelative: define.mode("RoleRelativeRead"),
  corpusUsefulness: define.mode("CorpusUsefulnessRead"),
};

const Dimension = {
  selfDescription: define.dimension("SelfDescription"),
  semanticDensity: define.dimension("SemanticDensity"),
  causalClarity: define.dimension("CausalClarity"),
  localRecoverability: define.dimension("LocalRecoverability"),
  abstractionDiscipline: define.dimension("AbstractionDiscipline"),
  interpretiveSlack: define.dimension("InterpretiveSlack"),
  sectionDiscipline: define.dimension("SectionDiscipline"),
  corpusFit: define.dimension("CorpusFit"),
  roleCorrectness: define.dimension("RoleCorrectness"),
  liveUseEvidence: define.dimension("LiveUseEvidence"),
  obsolescenceRisk: define.dimension("ObsolescenceRisk"),
};

AgentishQualityEvaluation.contains(
  Artifact.targetFile,
  Artifact.qualityBlueprint,
  Artifact.languageRoot,
  Artifact.sectionsBlueprint,
  Artifact.companionContext,
  Artifact.evaluationReport,
  Artifact.reportCatalog,
  FileClass.languageRoot,
  FileClass.sharedMeta,
  FileClass.subjectBlueprint,
  FileClass.blueprintState,
  FileClass.processGuide,
  FileClass.exploratoryCompanion,
  Mode.standalone,
  Mode.roleRelative,
  Mode.corpusUsefulness,
  Dimension.selfDescription,
  Dimension.semanticDensity,
  Dimension.causalClarity,
  Dimension.localRecoverability,
  Dimension.abstractionDiscipline,
  Dimension.interpretiveSlack,
  Dimension.sectionDiscipline,
  Dimension.corpusFit,
  Dimension.roleCorrectness,
  Dimension.liveUseEvidence,
  Dimension.obsolescenceRisk,
);

AgentishQualityEvaluation.enforces(`- Every target file must be classified before quality judgment begins.
- Every target file must be evaluated in fresh context rather than after reading a long mixed corpus.
- The fresh context must always include the language root, the repository Agentish sections blueprint, and this quality-evaluation blueprint.
- Role-relative evaluation may include only the minimum companion context that the target file class legitimately depends on.
- Standalone evaluation must not silently import adjacent blueprint knowledge.
- Subject blueprints are judged against the canonical in-file section structure owned by the repository Agentish sections blueprint.
- Blueprint-state files are judged relative to the subject blueprint they compare against rather than as fully standalone product specifications.
- Process guides are judged relative to their paired JSON contract rather than as primary machine-readable artifacts.
- Files with no clear ownership, no evident companion role, and no live-use evidence should be evaluated for obsolescence risk separately from intrinsic writing quality.
- Reports must separate quality problems from corpus-role problems.
- The canonical latest per-file reports should live under blueprints/agentish-quality-reports/ with paths that mirror the evaluated blueprint tree.
- Reports must distinguish low quality, partial but correct role execution, and likely obsolete or orphaned artifacts.`);

AgentishQualityEvaluation.defines(`- TargetAgentishFile means one repository Agentish artifact under evaluation.
- AgentishQualityBlueprint means this standard quality-evaluation blueprint.
- AgentishLanguageRoot means the shared language-level Agentish definition such as _agentish.ts.
- AgentishSectionsBlueprint means the repository blueprint that defines the canonical in-file section structure for subject Agentish files.
- AllowedCompanionContext means only the smallest extra blueprint set needed for a fair role-relative read.
- AgentishQualityReportCatalog means the durable report tree rooted at blueprints/agentish-quality-reports/ plus its rollup index.
- StandaloneRead means the file is judged primarily by what a capable reader can recover from the file itself plus the language root.
- RoleRelativeRead means the file is judged relative to the artifact role and companion artifacts it is supposed to rely on.
- CorpusUsefulnessRead means the file is judged by whether it improves the larger blueprint graph even if it is intentionally partial in isolation.
- LiveUseEvidence means concrete signs that the file is still used, paired, updated, referenced, or operationally relevant in the repository.
- ObsolescenceRisk means the probability that the file is stale, superseded, orphaned, or never integrated into the live blueprint corpus.`);

FileClass.languageRoot.allows(Mode.standalone, Mode.corpusUsefulness);
FileClass.sharedMeta.allows(Mode.standalone, Mode.corpusUsefulness);
FileClass.subjectBlueprint.allows(Mode.standalone, Mode.roleRelative, Mode.corpusUsefulness);
FileClass.blueprintState.allows(Mode.roleRelative, Mode.corpusUsefulness);
FileClass.processGuide.allows(Mode.roleRelative, Mode.corpusUsefulness);
FileClass.exploratoryCompanion.allows(Mode.standalone, Mode.corpusUsefulness);

Mode.standalone.judges(
  Dimension.selfDescription,
  Dimension.semanticDensity,
  Dimension.causalClarity,
  Dimension.localRecoverability,
  Dimension.abstractionDiscipline,
  Dimension.interpretiveSlack,
  Dimension.sectionDiscipline,
);

Mode.roleRelative.judges(
  Dimension.roleCorrectness,
  Dimension.corpusFit,
  Dimension.causalClarity,
  Dimension.localRecoverability,
  Dimension.abstractionDiscipline,
  Dimension.sectionDiscipline,
);

Mode.corpusUsefulness.judges(
  Dimension.corpusFit,
  Dimension.liveUseEvidence,
  Dimension.obsolescenceRisk,
);

when(FileClass.subjectBlueprint.evaluates(Artifact.targetFile))
  .then(Artifact.companionContext.requires(Artifact.sectionsBlueprint))
  .and(Mode.roleRelative.treats("alignment to Concept, Scenarios, ImplementationPlan, and Contracts as canonical section discipline"));

when(FileClass.blueprintState.evaluates(Artifact.targetFile))
  .then(Artifact.companionContext.requires("the subject blueprint it compares against"))
  .and(Mode.roleRelative.treats("comparison dependence as legitimate rather than as a standalone quality failure"));

when(FileClass.processGuide.evaluates(Artifact.targetFile))
  .then(Artifact.companionContext.requires("the paired process blueprint JSON"))
  .and(Mode.roleRelative.treats("guide incompleteness without the JSON contract as expected"));

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
  .and(Artifact.evaluationReport.expects("section-discipline judgment for subject blueprints"))
  .and(Artifact.evaluationReport.expects("separate obsolescence assessment"))
  .and(Artifact.evaluationReport.expects("recommended next action: keep, revise, pair, archive, or delete"));

when(Artifact.reportCatalog.contains(Artifact.evaluationReport))
  .then(Artifact.reportCatalog.expects("one durable latest report per target file"))
  .and(Artifact.reportCatalog.expects("a mirrored path derived from the source blueprint path"))
  .and(Artifact.reportCatalog.expects("a rollup summary index for corpus-wide comparison"));
