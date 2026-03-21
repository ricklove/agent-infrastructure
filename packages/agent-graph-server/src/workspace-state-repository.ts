import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BoardFile } from "@agent-infrastructure/agent-graph-core";

export async function saveBoardFile(
  boardPath: string,
  boardFile: BoardFile,
): Promise<void> {
  await mkdir(dirname(boardPath), { recursive: true });
  await writeFile(boardPath, JSON.stringify(boardFile, null, 2), "utf8");
}
