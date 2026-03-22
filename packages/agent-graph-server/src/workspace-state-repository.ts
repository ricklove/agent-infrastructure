import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BoardFile } from "@agent-infrastructure/agent-graph-core";

export async function saveBoardFile(
  boardPath: string,
  boardFile: BoardFile,
): Promise<void> {
  await mkdir(dirname(boardPath), { recursive: true });
  const tempPath = `${boardPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, JSON.stringify(boardFile, null, 2), "utf8");
  await rename(tempPath, boardPath);
}
