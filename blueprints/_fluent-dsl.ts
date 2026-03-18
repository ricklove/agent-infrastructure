const Human = define.actor('Human');
const Agent = define.actor('Agent');
const Visualizer = define.system('Visualizer');

const SystemBlueprint = define.entity('SystemBlueprint');
const FluentGraphDSL = define.entity('FluentGraphDSL');
const SystemImplementation = define.entity('SystemImplementation');
const VisualGraph = define.entity('VisualGraph');
const Ambiguity = define.concept('Ambiguity');

FluentGraphDSL.servesAs('SourceOfTruth').for(SystemBlueprint);

when(Human.intendsToExpress(SystemBlueprint))
  .then(Human.authors(FluentGraphDSL));

when(Agent.needsToUnderstand(SystemBlueprint))
  .then(Agent.reads(FluentGraphDSL));

when(Human.wantsToUnderstand(SystemBlueprint))
  .then(Visualizer.projects(FluentGraphDSL).into(VisualGraph))
  .and(Human.observes(VisualGraph));

when(Agent.encounters(Ambiguity).in(SystemBlueprint))
  .then(Agent.updates(FluentGraphDSL))
  .and(Agent.requestsVerificationFrom(Human).on(FluentGraphDSL));

when(Human.verifies(FluentGraphDSL))
  .then(Agent.generates(SystemImplementation).strictlyFrom(FluentGraphDSL));

when(Human.intendsToModify(SystemBlueprint))
  .then(Human.mutates(FluentGraphDSL))
  .and(Agent.synchronizes(SystemImplementation).to(FluentGraphDSL));

when(SystemImplementation.divergesFrom(FluentGraphDSL))
  .then(Agent.discards(SystemImplementation))
  .and(Agent.regenerates(SystemImplementation).strictlyFrom(FluentGraphDSL));