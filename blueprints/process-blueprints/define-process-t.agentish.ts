/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineProcessTemplateGuide = define.system("DefineProcessTemplateGuide", {
  format: Agentish,
  role: "Companion guide for the template-backed Define Process (T) process blueprint",
});

const DefineProcessSectionMap = define.document("SectionMap");
const DefineProcessSection = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

DefineProcessTemplateGuide.contains(
  DefineProcessSectionMap,
  DefineProcessSection.concept,
  DefineProcessSection.scenarios,
  DefineProcessSection.implementationPlan,
  DefineProcessSection.contracts,
)

DefineProcessSectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`)

DefineProcessSection.concept.precedes(DefineProcessSection.scenarios)
DefineProcessSection.scenarios.precedes(DefineProcessSection.implementationPlan)
DefineProcessSection.implementationPlan.precedes(DefineProcessSection.contracts)

DefineProcessSection.concept.answers(
  "Why does the subject exist? Define Process (T) proves that process-definition work itself can be authored through a reusable process template without changing the existing Define Process (Nested Steps) process.",
  "What are the core abstractions? The Define Process template, the template-backed Define Process (T) blueprint, and the configured work-location plus merge-step variables.",
  "What is authoritative? The resolved Define Process (T) blueprint is authoritative during runtime; the template is the reusable authoring source that produces it.",
  "What must remain true? Existing process definitions remain unchanged, template-backed processes resolve into ordinary process blueprints before execution, and the runtime never depends on hidden template state.",
)

DefineProcessSection.scenarios.answers(
  "What must work end to end? An operator can pick Define Process (T), prepare the configured work surface, edit process-definition files, commit changes, and finish through the configured merge steps.",
  "What do humans observe? The process catalog shows Define Process (T) as a normal process entry, and when loaded it exposes ordinary concrete steps rather than template syntax.",
  "What counts as success? The configured work-location and merge-step bundles resolve cleanly, and the resulting process behaves like a normal Define Process flow.",
  "What do conflicts look like? Missing required variables, missing templates, or unknown referenced step bundles fail during template resolution before the process can execute.",
)

DefineProcessSection.implementationPlan.answers(
  "What code structure exists? The reusable template lives under blueprints/process-templates, the concrete (T) process lives under blueprints/process-blueprints, and the process catalog loader resolves templates before process normalization.",
  "Where do responsibilities live? The template owns reusable structure, the (T) process owns concrete bindings, and the loader owns validation, variable substitution, and final blueprint normalization.",
  "How does the implemented system behave? Define Process (T) is loaded from its process-blueprint file, expanded through the Define Process template with the supplied variables, then normalized and sorted beside all other process blueprints.",
  "What implementation choices remain closed? The template-backed process keeps the same process-definition semantics as the existing process and only varies which setup and merge bundles are used.",
)

DefineProcessSection.contracts.answers(
  "What exact machine-readable shapes exist? The template file declares id, title, variables, and blueprint; the (T) process file declares id, title, catalogOrder, template, and variables.",
  "What exact messages exist? Variable substitution replaces placeholders in template strings and step-bundle references before the ordinary process normalizer validates the resolved shape.",
  "What exact action contracts exist? Define Process (T) requires targetProject, workLocation, and mergeSteps to be bound before the process is accepted into the catalog.",
  "What exact boundary schemas matter? The resolved process blueprint is structurally identical to an ordinary process blueprint and carries no unresolved template placeholders across the loader boundary.",
)
