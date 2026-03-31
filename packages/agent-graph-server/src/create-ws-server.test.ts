import { describe, expect, test } from "bun:test"
import {
  type BoardFile,
  createInitialWorkspaceState,
  createSampleSourceWorkspace,
  type SourceWorkspace,
  type WorkspaceState,
} from "@agent-infrastructure/agent-graph-core"
import { createWsMessageHandler } from "./create-ws-server.js"
import type { DocumentRepository } from "./document-repository.js"

function createRepositoryFixture(): {
  repository: DocumentRepository
  sourceWorkspace: SourceWorkspace
  previousSourceWorkspace: SourceWorkspace
  workspaceState: WorkspaceState
} {
  const boardFile: BoardFile = {
    kind: "agent-graph-board",
    id: "board-1",
    label: "Agent Graph Board",
    documents: [],
    revision: 1,
    layers: [],
    nodePositions: {},
    pinnedNodeIds: [],
  }

  let sourceWorkspace = createSampleSourceWorkspace()
  let previousSourceWorkspace = structuredClone(sourceWorkspace)
  let workspaceState = createInitialWorkspaceState()

  const repository: DocumentRepository = {
    getBoardPath() {
      return "/tmp/agent-graph.board.json"
    },
    getBoardFile() {
      return boardFile
    },
    setBoardFile() {},
    getBoardSummary() {
      return {
        path: "tmp/agent-graph.board.json",
        id: boardFile.id,
        label: boardFile.label,
      }
    },
    async listBoards() {
      return []
    },
    async listDocuments() {
      return []
    },
    async openBoard() {},
    getSourceWorkspace() {
      return sourceWorkspace
    },
    setSourceWorkspace(nextWorkspace) {
      sourceWorkspace = nextWorkspace
    },
    getWorkspaceState() {
      return workspaceState
    },
    setWorkspaceState(nextState) {
      workspaceState = nextState
    },
    getPreviousSourceWorkspace() {
      return previousSourceWorkspace
    },
    setPreviousSourceWorkspace(nextWorkspace) {
      previousSourceWorkspace = nextWorkspace
    },
  }

  return {
    repository,
    get sourceWorkspace() {
      return sourceWorkspace
    },
    get previousSourceWorkspace() {
      return previousSourceWorkspace
    },
    get workspaceState() {
      return workspaceState
    },
  }
}

describe("createWsMessageHandler", () => {
  test("returns a connected snapshot for client hello", async () => {
    const fixture = createRepositoryFixture()
    const handleMessage = createWsMessageHandler(fixture.repository)

    const messages = await handleMessage(
      JSON.stringify({ type: "client/hello" }),
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]?.type).toBe("server/connected")
    if (messages[0]?.type !== "server/connected") {
      throw new Error("Expected connected snapshot")
    }
    expect(messages[0].workspace.workspace.id).toBe("agent-graph")
    expect(messages[0].graph.workspaceId).toBe("agent-graph")
    expect(messages[0].diff?.revision).toBe(fixture.workspaceState.revision)
  })

  test("returns validation and conflict messages for stale source edits", async () => {
    const fixture = createRepositoryFixture()
    const handleMessage = createWsMessageHandler(fixture.repository)

    const messages = await handleMessage(
      JSON.stringify({
        type: "client/intent",
        intent: {
          kind: "edit-node-meaning",
          intentId: "intent-stale",
          expectedRevision: fixture.sourceWorkspace.revision - 1,
          sourceNodeId: "component-screen",
          label: "Renamed Screen",
        },
      }),
    )

    expect(messages).toHaveLength(2)
    expect(messages.map((message) => message.type)).toEqual([
      "server/validation",
      "server/conflict",
    ])
    expect(fixture.sourceWorkspace.revision).toBe(1)
    expect(
      fixture.sourceWorkspace.nodes.find(
        (node) => node.id === "component-screen",
      )?.label,
    ).toBe("AgentGraphScreen")
  })

  test("applies valid source edits and publishes graph and diff updates", async () => {
    const fixture = createRepositoryFixture()
    const handleMessage = createWsMessageHandler(fixture.repository)

    const messages = await handleMessage(
      JSON.stringify({
        type: "client/intent",
        intent: {
          kind: "edit-node-meaning",
          intentId: "intent-rename",
          expectedRevision: fixture.sourceWorkspace.revision,
          sourceNodeId: "component-screen",
          label: "Renamed Screen",
        },
      }),
    )

    expect(messages.map((message) => message.type)).toEqual([
      "server/validation",
      "server/graph",
      "server/diff",
    ])
    expect(fixture.previousSourceWorkspace.revision).toBe(1)
    expect(fixture.sourceWorkspace.revision).toBe(2)
    expect(
      fixture.sourceWorkspace.nodes.find(
        (node) => node.id === "component-screen",
      )?.label,
    ).toBe("Renamed Screen")
  })
})
