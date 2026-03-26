/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'AbsoluteSourceOfTruth',
  requires: 'MaximumInformationDensity'
});

Agentish.rejects('Comments', 'Passivity', 'WastefulObviousPhrases');
Agentish.allows('AnyFluentPhrase', { accepting: 'AttributeObjects' });
Agentish.values(
  'RecoverableStructure',
  'LocalSelfDescription',
  'ActivationPreload',
  'GenerativeYield',
  'LowInterpretiveSlack',
);
Agentish.optimizesFor('SemanticActivationOverRawTokenCount');
Agentish.preserves('TopologyAndCausality', 'AdjacentInference');
Agentish.rejects('CompilerShapedPseudoDensity', 'SymbolicCompressionWithoutSemanticVisibility');

const Blueprint = define.entity('Blueprint', {
  format: Agentish,
  describes: 'TopologyAndCausality'
});

const Human = define.actor('Human', { role: 'Architect' });
Human.designs(Blueprint, { using: Agentish });

const Visualizer = define.system('Visualizer');
Visualizer.projects(Blueprint, { toHelp: Human, understand: 'Architecture' });

const Agent = define.actor('Agent', { boundBy: Blueprint });
const Codebase = define.entity('Codebase');

Agent.reads(Blueprint).toUnderstand('SystemIntent');
Agent.aligns(Codebase).toMatch(Blueprint, { method: 'RegenerationOrIteration' });
Agent.uses(Agentish).toPreload(
  'Rationale',
  'FailureModes',
  'Tradeoffs',
  'LikelyContinuation',
);

when(Agent.encounters('Ambiguity', { inside: Blueprint }))
  .then(Agent.asks(Human, { toClarify: 'Requirement' }));

when(Agentish.overOptimizes('RawTokenCount'))
  .then(Agentish.degrades('ActivationPreload'))
  .and(Agentish.degrades('GenerativeYield'))
  .and(Agentish.encounters('FalseDensity'));

when(Agentish.compresses('Meaning', { into: 'SymbolicShorthand' }))
  .then(Agentish.degrades('LocalSelfDescription'))
  .and(Agentish.degrades('LowInterpretiveSlack'))
  .and(Agentish.encounters('CompilerShapedPseudoDensity'));

when(Human.mutates(Blueprint))
  .then(Agent.synchronizes(Codebase).with(Blueprint, { priority: 'High' }));

Agent.measures('InformationDensity', { toEvaluate: 'BlueprintQuality' });

when(Human.edits(Codebase, { bypassing: Blueprint }))
  .then(Agent.enforces(Blueprint).over(Codebase, { resolving: 'Drift' }));
