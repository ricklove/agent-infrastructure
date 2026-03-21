/// <reference path="../_agentish.d.ts" />

// Agent Graph Boards

const Agentish = define.language("Agentish");

const AgentGraphBoards = define.system("AgentGraphBoards", {
  format: Agentish,
  role: "Board model and persistence boundary for agent-graph",
});

const User = define.actor("AgentGraphUser", {
  role: "Maintainer working in graph boards",
});

const Board = {
  file: define.document("BoardFile"),
  surface: define.workspace("BoardSurface"),
  document: define.document("BoardDocument"),
  layer: define.graphLayer("BoardLayer"),
  state: define.concept("BoardState"),
  layerName: define.concept("LayerName"),
  layerDescription: define.concept("LayerDescription"),
  chatSessionRef: define.concept("ChatSessionReference"),
};

const Repo = {
  project: define.documentSet("ProjectRepo"),
  blueprints: define.documentSet("BlueprintFolder"),
};

const Runtime = {
  sessionState: define.concept("TransientRuntimeState"),
};

AgentGraphBoards.enforces(`
- Board is the primary persisted unit in agent-graph.
- Board files live in a project repo.
- Board files are durable and versioned in git.
- Runtime state is transient and non-authoritative.
- A board file explicitly declares which Agentish documents belong to the board.
- Document paths in a board file are relative to the board file location.
- Layers, positions, pins, and visibility belong to the board file.
- Every layer has a name and a description.
- A layer may reference related chat sessions.
- User-facing graph language uses board, documents, and layers.
- Workspace remains a dashboard-level concept, not an agent-graph board concept.
`);

Repo.project.contains(Repo.blueprints, Board.file, Board.document);
Board.file.contains(Board.document, Board.layer, Board.state);
Board.layer.contains(Board.layerName, Board.layerDescription, Board.chatSessionRef);

AgentGraphBoards.defines(`
- A board surface is one saved graph working surface over a selected set of Agentish documents.
- A board file is the durable source of truth for one board.
- A board file persists documents, layers, visibility, layout, node positions, and pinned nodes.
- A layer name is the short label used in the layers panel.
- A layer description explains the layer's purpose, emphasis, or question.
- Chat session references connect a layer to related agent-chat sessions without making chat own the layer.
- The runtime may cache session state, but runtime state never replaces the board file as durable truth.
- Board files are intended to live near the design material they organize, typically under blueprints.
- New layer is the primary creation action.
- Clone remains a secondary action behind a menu rather than a primary button.
- Graph diff remains an internal capability until its user workflow is defined and should not be a primary layers-panel action.
`);

when(User.opens(Board.file))
  .then(AgentGraphBoards.loads(Board.surface))
  .and(AgentGraphBoards.resolves(Board.document).relativeTo(Board.file))
  .and(AgentGraphBoards.projects("one complete graph for the board's declared documents"));

when(User.saves(Board.surface))
  .then(AgentGraphBoards.writes(Board.file))
  .and(AgentGraphBoards.persists(Board.layer, Board.state))
  .and(AgentGraphBoards.neverRequires(Runtime.sessionState).forDurability());

when(User.adds(Board.document).to(Board.file))
  .then(AgentGraphBoards.records("the relative document path"))
  .and(AgentGraphBoards.reprojects(Board.surface));

when(User.creates("a new board"))
  .then(AgentGraphBoards.creates(Board.file))
  .and(Board.file.startsWith("documents and layers"))
  .and(Board.file.belongsTo(Repo.project));

when(User.creates(Board.layer))
  .then(AgentGraphBoards.requires(Board.layerName))
  .and(AgentGraphBoards.requires(Board.layerDescription))
  .and(AgentGraphBoards.records("an intentional layer purpose"));

when(User.links(Board.chatSessionRef).to(Board.layer))
  .then(AgentGraphBoards.records("a durable cross-reference"))
  .and(AgentGraphBoards.doesNotRequire("chat to own board state"));

AgentGraphBoards.usesFiles(`
- blueprints/agent-graph/agent-graph-boards.agentish.ts
- blueprints/agent-graph/agent-graph.board.json
- packages/agent-graph-core/src/types.ts
- packages/agent-graph-server/src/load-agentish-workspace.ts
- packages/agent-graph-server/src/document-repository.ts
- packages/agent-graph-server/src/workspace-state-repository.ts
`);
