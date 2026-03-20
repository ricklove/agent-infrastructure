import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { WorkspaceState } from "@agent-infrastructure/agent-graph-core";

const SIDE_CAR_PATH = resolve(
  process.cwd(),
  ".runtime/agent-graph/workspace-state.json",
);

export async function loadWorkspaceState(): Promise<WorkspaceState | null> {
  try {
    const content = await readFile(SIDE_CAR_PATH, "utf8");
    const parsed = JSON.parse(content) as Partial<WorkspaceState>;
    if (!parsed.rootId || !parsed.layers || typeof parsed.revision !== "number") {
      return null;
    }

    return {
      rootId: parsed.rootId,
      revision: parsed.revision,
      layers: parsed.layers,
      nodePositions: parsed.nodePositions ?? {},
      pinnedNodeIds: parsed.pinnedNodeIds ?? [],
    };
  } catch {
    return null;
  }
}

export async function saveWorkspaceState(state: WorkspaceState): Promise<void> {
  await mkdir(dirname(SIDE_CAR_PATH), { recursive: true });
  await writeFile(SIDE_CAR_PATH, JSON.stringify(state, null, 2), "utf8");
}
