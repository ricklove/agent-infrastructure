/// <reference path="../_agentish.d.ts" />

const Agentish = define.language("Agentish");

const DefineProcessProcessTemplateGuide = define.system("DefineProcessProcessTemplateGuide", {
  format: Agentish,
  role: "Companion guide for the reusable Define Process process template",
});

DefineProcessProcessTemplateGuide.enforces(`
- The Define Process process template exists to provide a reusable authoring shape for template-backed process-definition work without changing any existing concrete process-definition process.
- The template owns only reusable process structure plus variable placeholders; it is not itself a runtime process entry.
- The supported routing variables for this template are targetProject, workLocation, and mergeSteps.
- Any concrete process instantiated from this template must resolve into an ordinary process blueprint before runtime execution.
`);
