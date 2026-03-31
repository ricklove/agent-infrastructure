import { describe, expect, test } from "bun:test"
import {
  createAgentGraphStore,
  findSelectedEdge,
  findSelectedNode,
  queueIntent,
} from "./agent-graph-store.js"

describe("agent graph store", () => {
  test("creates the expected initial connection and workspace state", () => {
    const store = createAgentGraphStore("http://api.test", "ws://ws.test")
    const state = store.state$.get()

    expect(state.connection).toEqual({
      status: "idle",
      apiRootUrl: "http://api.test",
      wsRootUrl: "ws://ws.test",
      error: null,
    })
    expect(state.workspace).toBeNull()
    expect(state.graph).toBeNull()
    expect(state.pendingIntents).toEqual([])
  })

  test("resolves selected graph entities from the current snapshot", () => {
    const store = createAgentGraphStore("http://api.test", "ws://ws.test")
    store.state$.graph.set({
      workspaceId: "workspace-1",
      revision: 2,
      layers: [],
      nodes: [
        {
          id: "node-1",
          sourceId: "source-node-1",
          parentLayerId: "layer-1",
          label: "Selected Node",
          kind: "semantic-node",
          sourceKind: "component",
          position: { x: 10, y: 20 },
          summary: "summary",
        },
      ],
      edges: [
        {
          id: "edge-1",
          sourceId: "source-edge-1",
          source: "node-1",
          target: "node-2",
          kind: "direct",
          label: "depends on",
          multiplicity: 1,
          supportingPathIds: [],
        },
      ],
    })
    store.state$.selection.nodeId.set("node-1")
    store.state$.selection.edgeId.set("edge-1")

    expect(findSelectedNode(store.state$.get())?.label).toBe("Selected Node")
    expect(findSelectedEdge(store.state$.get())?.label).toBe("depends on")
  })

  test("queues mutation intents by intent id and workspace intents by kind", () => {
    const store = createAgentGraphStore("http://api.test", "ws://ws.test")

    queueIntent(store.state$, {
      kind: "edit-node-meaning",
      intentId: "intent-1",
      expectedRevision: 1,
      sourceNodeId: "node-1",
      label: "Renamed Node",
    })
    queueIntent(store.state$, {
      kind: "request-diff",
    })

    expect(store.state$.pendingIntents.get()).toEqual([
      "intent-1",
      "request-diff",
    ])
  })
})
