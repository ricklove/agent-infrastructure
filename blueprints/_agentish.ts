const Agentish = define.language('Agentish');
const Blueprint = define.entity('Blueprint');

Agentish.servesAs('AbsoluteSourceOfTruth').for(Blueprint);
Agentish.requires('MaximumInformationDensity');
Agentish.rejects('Comments').and('Passivity').and('WastefulObviousPhrases');

const Human = define.actor('Human');
Human.architects(Blueprint).using(Agentish);

const Visualizer = define.system('Visualizer');
Visualizer.projects(Blueprint).toHelp(Human).understand('Architecture');

const Agent = define.actor('Agent');
Agent.reads(Blueprint).toUnderstand('SystemIntent');

const Codebase = define.entity('Codebase');
Agent.generates(Codebase).strictlyFrom(Blueprint);

when(Agent.encounters('Ambiguity').in(Blueprint))
  .then(Agent.asks(Human, 'to clarify the requirement'));

when(Human.mutates(Blueprint))
  .then(Agent.discards(Codebase))
  .and(Agent.regenerates(Codebase).strictlyFrom(Blueprint));

Agent.measures('InformationDensity').toEvaluate('BlueprintQuality');

when(Human.edits(Codebase).bypassing(Blueprint))
  .then(Agent.strikes(Codebase))
  .and(Agent.regenerates(Codebase).strictlyFrom(Blueprint));

Agentish.allows('AnyFluentPhrase').toExpress('TopologyAndCausality');