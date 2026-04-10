/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineBlueprintProcessTemplateGuide = define.system("DefineBlueprintProcessTemplateGuide", {
  format: Agentish,
  role: "Companion guide for the reusable Define Blueprint process template",
});

DefineBlueprintProcessTemplateGuide.enforces(`
- The Define Blueprint process template exists to provide a reusable authoring shape for template-backed blueprint-definition processes without changing any existing concrete blueprint process.
- The template owns only reusable process structure plus variable placeholders; it is not itself a runtime process entry.
- The supported routing variables for this template are targetProject, workLocation, and mergeSteps.
- Any concrete process instantiated from this template must resolve into an ordinary process blueprint before runtime execution.
`);
