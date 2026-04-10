/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const FullDevelopmentTemplateGuide = define.system("FullDevelopmentTemplateGuide", {
  format: Agentish,
  role: "Companion guide for the template-backed Full Development (T) process blueprint",
});

const FullDevelopmentSectionMap = define.document("SectionMap");
const FullDevelopmentSection = {
  concept: define.section("ConceptSection"),
  scenarios: define.section("ScenariosSection"),
  implementationPlan: define.section("ImplementationPlanSection"),
  contracts: define.section("ContractsSection"),
};

FullDevelopmentTemplateGuide.contains(
  FullDevelopmentSectionMap,
  FullDevelopmentSection.concept,
  FullDevelopmentSection.scenarios,
  FullDevelopmentSection.implementationPlan,
  FullDevelopmentSection.contracts,
)

FullDevelopmentSectionMap.defines(`- Concept
- Scenarios
- ImplementationPlan
- Contracts`)

FullDevelopmentSection.concept.precedes(FullDevelopmentSection.scenarios)
FullDevelopmentSection.scenarios.precedes(FullDevelopmentSection.implementationPlan)
FullDevelopmentSection.implementationPlan.precedes(FullDevelopmentSection.contracts)

FullDevelopmentSection.concept.answers(
  "Why does the subject exist? Full Development (T) proves that an end-to-end development process can be authored through a reusable template while preserving the existing Full Development Process (Nested Steps) behavior.",
  "What are the core abstractions? The Full Development template, the template-backed Full Development (T) blueprint, and the four configured routing variables targetProject, workLocation, previewSteps, and mergeSteps.",
  "What is authoritative? The resolved Full Development (T) blueprint is authoritative at runtime; the template is the reusable authoring source and never becomes a separate runtime mode.",
  "What must remain true? Existing full-development processes remain unchanged, template-backed development resolves into an ordinary procedural process before execution, and the resolved process is fully inspectable without hidden template state.",
)

FullDevelopmentSection.scenarios.answers(
  "What must work end to end? An operator can choose Full Development (T), prepare the configured work surface, complete the bounded revision loop, run the configured merge steps, then run the configured preview steps and finish the process.",
  "What do humans observe? The process catalog shows Full Development (T) as a normal process entry, the runtime exposes concrete resolved steps, and the preview stage reflects the configured preview bundle rather than a hard-coded path.",
  "What counts as success? The resolved process performs worker or manager setup through the configured work-location bundle, completes implementation, merges through the configured merge bundle, and previews through the configured preview bundle.",
  "What do conflicts look like? Missing required variables, unknown preview or merge bundles, or unresolved placeholders stop process loading before execution; wrong bundle bindings produce the wrong resolved process shape and are a template-definition bug rather than an acceptable runtime guess.",
)

FullDevelopmentSection.implementationPlan.answers(
  "What code structure exists? The reusable template lives under blueprints/process-templates, the concrete (T) process lives under blueprints/process-blueprints, the preview and merge bundles live under blueprints/process-steps, and the process catalog loader resolves templates before normalizing process steps.",
  "Where do responsibilities live? The template owns the reusable development-process shape, the (T) blueprint owns concrete variable bindings, the step bundles own preview and merge fragments, and the loader owns template resolution plus final catalog normalization.",
  "How does the implemented system behave? Full Development (T) loads as a process blueprint, resolves through the Full Development template, substitutes its configured work-location, merge-step, and preview-step bundle ids, expands those bundles, and then behaves exactly like any other ordinary procedural process blueprint.",
  "What implementation choices remain closed? Full Development (T) preserves the bounded revision loop from the existing full-development process, limits variable routing to work-location, merge, and preview bundles, and keeps release or preview semantics inside named step bundles rather than inline ad hoc process variants.",
)

FullDevelopmentSection.contracts.answers(
  "What exact machine-readable shapes exist? The template file declares id, title, variables, and blueprint. The instantiated Full Development (T) process file declares id, title, catalogOrder, template, and variables with all four configured bindings.",
  "What exact messages exist? Template resolution substitutes placeholders in strings and use references, validates required variables, and feeds the resolved process into the ordinary step-bundle and process-blueprint normalization flow.",
  "What exact action contracts exist? Full Development (T) requires targetProject, workLocation, previewSteps, and mergeSteps to be bound to concrete strings and valid step-bundle ids before the process may load.",
  "What exact boundary schemas matter? The loader boundary is closed: after template resolution and step-bundle expansion, the runtime sees only a standard procedural process blueprint with no remaining template placeholders.",
)
