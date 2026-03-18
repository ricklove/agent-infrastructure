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
Agent.aligns(Codebase).toMatch(Blueprint);

when(Agent.encounters('Ambiguity').in(Blueprint))
  .then(Agent.asks(Human, 'to clarify the requirement'));

when(Human.mutates(Blueprint))
  .then(Agent.synchronizes(Codebase).with(Blueprint));

Agent.measures('InformationDensity').toEvaluate('BlueprintQuality');

when(Human.edits(Codebase).bypassing(Blueprint))
  .then(Agent.enforces(Blueprint).over(Codebase));

Agentish.allows('AnyFluentPhrase').toExpress('TopologyAndCausality');