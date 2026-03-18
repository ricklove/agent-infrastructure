const Agentish = define.language('Agentish', { purpose: 'VisualizationEngineBlueprint' });

const Human = define.actor('Human', { role: 'ObserverAndManipulator' });
const Visualizer = define.system('ReactFlowVisualizer', { role: 'RenderingEngine' });
const Solver = define.system('ConstraintSolver', { role: 'GeometricLayoutEngine' });

const AST = define.entity('AgentishDocument', { format: 'SemanticTriples' });

const Workspace = {
  canvas: define.entity('InfiniteCanvas'),
  layer: define.entity('GraphViewLayer', { actsAs: 'ParentCoordinateOrigin' }),
  node: define.entity('VisualNode'),
  childNode: define.entity('ChildNode', { actsAs: 'NestedContainer' }),
  edge: define.entity('VisualEdge'),
  handle: define.entity('NodeHandle', { actsAs: 'ConnectionPort' }),
  label: define.entity('TextLabel', { actsAs: 'Decorator' }),
  interactiveComponent: define.entity('InteractiveComponent', { actsAs: 'RuntimeUI' }),
  portal: define.entity('PortalEdge', { actsAs: 'CrossLayerWormhole' })
};

const EngineConfig = {
  mappingRule: define.entity('MappingRule', { transforms: 'DslToElement' }),
  layoutRule: define.entity('LayoutRule', { transforms: 'DslToGeometry' }),
  portalRule: define.entity('PortalRule', { transforms: 'DslToCrossLayerLink' })
};

const UIControls = {
  view: define.entity('GraphViewControl', { actsAs: 'RuleAndSourceManager' }),
  layer: define.entity('LayerControl', { actsAs: 'VisibilityAndStackManager' })
};

Visualizer.owns(Workspace.canvas);
Visualizer.owns(UIControls.view, UIControls.layer);
Visualizer.reads(AST);
Visualizer.reads(EngineConfig.mappingRule, EngineConfig.layoutRule, EngineConfig.portalRule);

Workspace.canvas.contains(Workspace.layer);
Workspace.layer.contains(Workspace.node, Workspace.edge);
Workspace.node.contains(Workspace.childNode, Workspace.handle, Workspace.label, Workspace.interactiveComponent);
Workspace.edge.contains(Workspace.label);
Workspace.layer.defines('IndependentCoordinateSpace');

when(Human.configures(UIControls.view).with(AST))
  .then(Visualizer.selects('SourceDocuments').from(AST))
  .and(Visualizer.applies(EngineConfig.mappingRule).to(Workspace.layer))
  .and(Visualizer.applies(EngineConfig.layoutRule).to(Workspace.layer));

when(Human.configures(UIControls.layer).for(Workspace.layer))
  .then(Visualizer.adjusts('ZIndex').for(Workspace.layer))
  .and(Visualizer.toggles('Visibility').for(Workspace.layer))
  .and(Visualizer.evaluates(EngineConfig.portalRule).across('ActiveLayers'));

when(Visualizer.ingests(AST))
  .then(Visualizer.evaluates(EngineConfig.mappingRule))
  .and(Visualizer.evaluates(EngineConfig.layoutRule))
  .and(Visualizer.evaluates(EngineConfig.portalRule));

when(EngineConfig.mappingRule.matches('DslStructure', { in: AST }))
  .then(Visualizer.projects(Workspace.node).into(Workspace.layer))
  .and(Visualizer.projects(Workspace.childNode).inside(Workspace.node))
  .and(Visualizer.projects(Workspace.handle).onto(Workspace.node))
  .and(Visualizer.projects(Workspace.edge).into(Workspace.layer))
  .and(Visualizer.projects(Workspace.label).onto(Workspace.node))
  .and(Visualizer.projects(Workspace.label).onto(Workspace.edge))
  .and(Visualizer.projects(Workspace.interactiveComponent).inside(Workspace.node));

when(EngineConfig.layoutRule.matches('DslStructure', { in: AST }))
  .then(Solver.enforces('SpatialConstraint').on(Workspace.node, { inside: Workspace.layer }))
  .and(Solver.enforces('PortAlignment').on(Workspace.handle, { relativeTo: Workspace.node }))
  .and(Solver.enforces('NestingLayout').on(Workspace.childNode, { inside: Workspace.node }));

when(EngineConfig.portalRule.detects('SemanticLink', { across: [Workspace.layer, Workspace.layer] }))
  .then(Visualizer.draws(Workspace.portal).connecting(Workspace.handle, Workspace.handle));

when(Human.drags(Workspace.layer).across(Workspace.canvas))
  .then(Workspace.layer.moves('Independently'))
  .and(Workspace.node.follows(Workspace.layer, { maintaining: 'LocalCoordinates' }))
  .and(Workspace.portal.updates('DynamicBezierRouting'));

when(Human.selects(Workspace.node, { inside: Workspace.layer }))
  .then(Visualizer.highlights(Workspace.node))
  .and(Visualizer.highlights(Workspace.childNode))
  .and(Visualizer.illuminates(Workspace.portal, { attachedTo: Workspace.handle }));

when(Human.interactsWith(Workspace.interactiveComponent))
  .then(Visualizer.executes('ComponentLogic', { scopedTo: Workspace.interactiveComponent }));