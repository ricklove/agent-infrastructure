/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineBlueprintTemplateGuide = define.system("DefineBlueprintTemplateGuide", {
  format: Agentish,
  role: "Companion guide for the template-backed Define Blueprint (T) process blueprint",
});

const SectionMap = define.document("SectionMap");
const Section = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

DefineBlueprintTemplateGuide.contains(
  SectionMap,
  Section.concept,
  Section.scenarios,
  Section.implementationPlan,
  Section.contracts,
)

SectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`)

Section.concept.precedes(Section.scenarios)
Section.scenarios.precedes(Section.implementationPlan)
Section.implementationPlan.precedes(Section.contracts)

Section.concept.answers(
  "Why does the subject exist? Define Blueprint (T) proves that blueprint-definition flow can be authored through a reusable process template without changing the existing Define Blueprint (Nested Steps) process.",
  "What are the core abstractions? The Define Blueprint template, the template-backed Define Blueprint (T) blueprint, and the configured work-location plus merge-step variables.",
  "What is authoritative? The resolved Define Blueprint (T) process blueprint is authoritative at runtime; the template is only the reusable authoring source.",
  "What must remain true? Existing blueprint processes stay unchanged, the template expands into an ordinary process blueprint before execution, and the resolved process remains locally recoverable without hidden template state.",
)

Section.scenarios.answers(
  "What must work end to end? An operator can select Define Blueprint (T), resolve it through the template, prepare the configured work surface, revise blueprint files, commit them, and finish through the configured merge steps.",
  "What do humans observe? The catalog shows a distinct Define Blueprint (T) process, and when it runs the steps are concrete ordinary process steps rather than unresolved template placeholders.",
  "What counts as success? The template-backed process resolves cleanly, the worktree setup matches the configured work-location steps, and the merge phase matches the configured merge-step bundle.",
  "What do conflicts look like? A missing template, missing required variable, or unknown step bundle blocks process loading before execution; an unresolved placeholder or wrong step bundle is a template-definition failure rather than a runtime guess.",
)

Section.implementationPlan.answers(
  "What code structure exists? The template definition lives in blueprints/process-templates, the concrete (T) process lives in blueprints/process-blueprints, and the process catalog loader resolves the template into a normal process blueprint before the catalog is exposed.",
  "Where do responsibilities live? The template owns reusable process shape, the (T) process owns id/title/catalog placement plus variable bindings, and the loader owns resolution plus validation.",
  "How does the implemented system behave? Loading begins with ordinary process blueprints and step bundles, adds process-template loading, resolves template-backed blueprints by substituting the configured variables, then normalizes the resolved process exactly like any non-template process.",
  "What implementation choices remain closed? Define Blueprint (T) keeps the same blueprint-definition behavior as the existing process, allows only configured work-location and merge-step routing to vary, and does not introduce a separate execution model for templates.",
)

Section.contracts.answers(
  "What exact machine-readable shapes exist? The template file is a .process-template.json record with id, title, variables, and blueprint. The instantiated (T) process is a .process-blueprint.json record with id, title, catalogOrder, template, and variables.",
  "What exact messages exist? Template resolution substitutes configured variable values into the template blueprint, validates required variables, and emits the resolved step tree to the ordinary process-blueprint normalizer.",
  "What exact action contracts exist? Define Blueprint (T) requires targetProject, workLocation, and mergeSteps bindings that resolve to concrete strings and valid step-bundle ids before the process may load.",
  "What exact boundary schemas matter? The template boundary is closed at loader time: after resolution the runtime sees only a standard process blueprint shape with no remaining template placeholders.",
)
