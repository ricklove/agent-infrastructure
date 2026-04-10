/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const FullDevelopmentProcessTemplateGuide = define.system("FullDevelopmentProcessTemplateGuide", {
  format: Agentish,
  role: "Companion guide for the reusable Full Development process template",
});

FullDevelopmentProcessTemplateGuide.enforces(`
- The Full Development process template exists to provide a reusable end-to-end development-process shape without changing any existing concrete full-development process.
- The template owns only reusable process structure plus variable placeholders; it is not itself a runtime process entry.
- The supported routing variables for this template are targetProject, workLocation, previewSteps, and mergeSteps.
- Any concrete process instantiated from this template must resolve into an ordinary process blueprint before runtime execution.
`);
