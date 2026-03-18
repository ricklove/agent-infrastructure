const Agentish = define.concept('Agentish');

const Human = define.actor('Human');
const Agent = define.actor('Agent');
const Visualizer = define.system('Visualizer');

const Blueprint = define.entity('Blueprint');
const Codebase = define.entity('Codebase');
const VisualGraph = define.entity('VisualGraph');

Agentish.servesAs('AbsoluteSourceOfTruth');
Agentish.requires('MaximumInformationDensity');
Agentish.rejects('WastefulObviousPhrases');
Agentish.rejects('RedundantDefinitions');
Agentish.rejects('Passivity');
Agentish.rejects('Ambiguity');

when(Agentish.defines('Topology'))
  .then(Agentish.enforces('Subject.verb(Object)'));

when(Agentish.defines('Causality'))
  .then(Agentish.enforces('when(Trigger).then(Action)'));

when(Human.architects('System'))
  .then(Human.authors(Blueprint).using(Agentish));

when(Human.inspects(Blueprint))
  .then(Visualizer.projects(Blueprint).into(VisualGraph));

when(Agent.reads(Blueprint))
  .then(Agent.generates(Codebase).strictlyFrom(Blueprint));

when(Agent.encounters('LogicalGap').in(Blueprint))
  .then(Agent.halts('Generation'))
  .and(Agent.requestsClarificationFrom(Human).on(Blueprint));

when(Human.mutates(Blueprint))
  .then(Agent.discards(Codebase))
  .and(Agent.regenerates(Codebase).strictlyFrom(Blueprint));

when(Human.mutates(Codebase).bypassing(Blueprint))
  .then(Agent.strikes(Codebase))
  .and(Agent.regenerates(Codebase).strictlyFrom(Blueprint));