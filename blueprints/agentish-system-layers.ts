/// <reference path="./_agentish.d.ts" />

const Agentish = define.language('Agentish', {
  purpose: 'LayeredSystemDefinition'
});

const AgentishSystemLayers = define.entity('AgentishSystemLayers', {
  format: Agentish,
  describes: 'HowAgentishDesignSeparatesMeaningBehaviorArchitectureAndContracts'
});

const Layers = {
  concept: define.entity('ConceptLayer', {
    purpose: 'DefineWhatTheSystemIsAndWhyItExists'
  }),
  scenarios: define.entity('ScenariosLayer', {
    purpose: 'DefineCanonicalBehaviorAndAcceptanceFlows'
  }),
  implementationPlan: define.entity('ImplementationPlanLayer', {
    purpose: 'ResolveAllNonMechanicalArchitectureDecisions'
  }),
  contracts: define.entity('ContractsLayer', {
    purpose: 'DefineExactSharedTypeAndProtocolContracts'
  })
};

AgentishSystemLayers.contains(
  Layers.concept,
  Layers.scenarios,
  Layers.implementationPlan,
  Layers.contracts
);

Layers.concept.answers(
  'WhyDoesTheSystemExist',
  'WhatAreTheCoreAbstractions',
  'WhatIsTheSourceOfTruth',
  'WhatMustAlwaysBeTrue'
);
Layers.scenarios.answers(
  'WhatMustWorkEndToEnd',
  'HowHumansAndTheSystemInteract',
  'WhatCountsAsCorrectBehavior',
  'HowFailuresAndConflictsAppear'
);
Layers.implementationPlan.answers(
  'WhatPackagesExist',
  'WhereResponsibilitiesLive',
  'WhatOwnsStateTransportParsingProjectionAndMutation',
  'WhatImplementationChoicesAreNoLongerOpen'
);
Layers.contracts.answers(
  'WhatExactTypesExist',
  'WhatExactMessagesExist',
  'WhatExactStoreShapesExist',
  'WhatExactCrossPackageSchemasExist'
);

Layers.scenarios.contains('UserStories', {
  renderedAs: 'CanonicalAcceptanceFlows',
  avoids: 'LooseProductProse'
});

Layers.concept.precedes(Layers.scenarios);
Layers.scenarios.precedes(Layers.implementationPlan);
Layers.implementationPlan.precedes(Layers.contracts);

Layers.concept.failsWhen('ImplementationPlanMustInventSystemMeaning');
Layers.scenarios.failsWhen('CorrectBehaviorRemainsAmbiguous');
Layers.implementationPlan.failsWhen('ImplementersCanChooseDifferentArchitectures');
Layers.contracts.failsWhen('SharedBoundariesRemainImplicitOrUntyped');

AgentishSystemLayers.prescribes('EachLowerLayerMustBeMechanicalRelativeToTheLayerAbove');
AgentishSystemLayers.prescribes('DetailsObviousFromAStrongerLayerShouldNotBeRepeatedInAWeakerForm');
