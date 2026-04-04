import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { WorkbenchDocumentRecord } from "@agent-infrastructure/agent-workbench-protocol"

const tempRoot = mkdtempSync(join(tmpdir(), "agent-workbench-store-"))
const sharedRoot = join(tempRoot, "workspace")
const dataRoot = join(sharedRoot, "data", "workbench")

process.env.AGENT_WORKSPACE_DIR = sharedRoot
process.env.AGENT_WORKBENCH_DATA_DIR = dataRoot

const storeModulePath = resolve(import.meta.dir, "./workbench-store.ts")

async function loadStore() {
  return import(`${storeModulePath}?t=${Date.now()}-${Math.random()}`)
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("workbench-store", () => {
  test("writes and reloads a workbench with real node content from shared data", async () => {
    const { readWorkbench, writeWorkbench } = await loadStore()
    const record: WorkbenchDocumentRecord = {
      id: "proof-workbench",
      title: "Proof Workbench",
      nodes: [
        {
          id: "node-1",
          type: "text",
          text: "persist me",
          x: 120,
          y: 80,
          width: 240,
          height: 140,
        },
      ],
      edges: [],
      handles: [],
      viewport: {
        x: 10,
        y: 20,
        zoom: 1.25,
      },
    }

    await writeWorkbench(record)
    const snapshot = await readWorkbench(record.id)

    expect(snapshot.filePath).toBe(
      join(dataRoot, "proof-workbench.workbench.ts"),
    )
    expect(snapshot.workbench.title).toBe("Proof Workbench")
    expect(snapshot.workbench.nodes).toHaveLength(1)
    expect(snapshot.workbench.nodes[0]?.text).toBe("persist me")
    expect(
      snapshot.summaries.some(
        (entry: { id: string; path: string }) =>
          entry.id === record.id && entry.path === snapshot.filePath,
      ),
    ).toBe(true)
  })

  test("lists shared-data workbenches using persisted titles", async () => {
    const { listWorkbenches, writeWorkbench } = await loadStore()
    await writeWorkbench({
      id: "title-check",
      title: "Visible Title",
      nodes: [],
      edges: [],
      handles: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    const summaries = await listWorkbenches()
    const summary = summaries.find(
      (entry: { id: string }) => entry.id === "title-check",
    )
    expect(summary?.title).toBe("Visible Title")
    expect(summary?.path).toBe(join(dataRoot, "title-check.workbench.ts"))
  })

  test("renames the persisted workbench file when the id changes", async () => {
    const { readWorkbench, writeWorkbench } = await loadStore()
    await writeWorkbench({
      id: "rename-source",
      title: "Rename Source",
      nodes: [],
      edges: [],
      handles: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    await writeWorkbench(
      {
        id: "rename-target",
        title: "Rename Target",
        nodes: [],
        edges: [],
        handles: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      { previousId: "rename-source" },
    )

    expect(existsSync(join(dataRoot, "rename-source.workbench.ts"))).toBe(false)
    const snapshot = await readWorkbench("rename-target")
    expect(snapshot.filePath).toBe(join(dataRoot, "rename-target.workbench.ts"))
    expect(snapshot.workbench.id).toBe("rename-target")
    expect(snapshot.workbench.title).toBe("Rename Target")
  })
})
