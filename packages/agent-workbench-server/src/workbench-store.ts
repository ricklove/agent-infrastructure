import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type {
  WorkbenchDocumentRecord,
  WorkbenchSummary,
} from "@agent-infrastructure/agent-workbench-protocol"

const sourceDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(sourceDir, "../../..")
const workbenchRoot = resolve(repoRoot, "workspace", "workbenches")
const defaultWorkbenchId = "agent-workbench"

const defaultWorkbench: WorkbenchDocumentRecord = {
  id: defaultWorkbenchId,
  title: "Agent Workbench",
  nodes: [],
  edges: [],
  handles: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
}

function workbenchFilePath(id: string) {
  return join(workbenchRoot, `${id}.workbench.ts`)
}

function serializeWorkbench(record: WorkbenchDocumentRecord) {
  return [
    "// Agent Workbench document",
    `const workbench = ${JSON.stringify(record, null, 2)} as const;`,
    "",
    "export default workbench;",
    "",
  ].join("\n")
}

async function loadWorkbenchModule(filePath: string) {
  const moduleUrl = pathToFileURL(filePath)
  moduleUrl.searchParams.set("ts", String(Date.now()))
  const imported = (await import(moduleUrl.href)) as {
    default?: WorkbenchDocumentRecord
  }
  if (!imported.default) {
    throw new Error(
      `Workbench file did not export a default record: ${filePath}`,
    )
  }
  return imported.default
}

export function ensureWorkbenchRoot() {
  mkdirSync(workbenchRoot, { recursive: true })
}

export async function ensureDefaultWorkbench() {
  ensureWorkbenchRoot()
  const targetPath = workbenchFilePath(defaultWorkbenchId)
  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, serializeWorkbench(defaultWorkbench))
  }
  return targetPath
}

export async function listWorkbenches(): Promise<WorkbenchSummary[]> {
  await ensureDefaultWorkbench()
  return readdirSync(workbenchRoot)
    .filter((entry: string) => entry.endsWith(".workbench.ts"))
    .map((entry: string) => {
      const filePath = join(workbenchRoot, entry)
      const stats = statSync(filePath)
      return {
        id: basename(entry, ".workbench.ts"),
        title: basename(entry, ".workbench.ts"),
        path: filePath,
        updatedAtMs: stats.mtimeMs,
      } satisfies WorkbenchSummary
    })
    .sort(
      (left: WorkbenchSummary, right: WorkbenchSummary) =>
        right.updatedAtMs - left.updatedAtMs,
    )
}

export async function readWorkbench(id?: string) {
  const summaries = await listWorkbenches()
  const selectedId = id?.trim() || summaries[0]?.id || defaultWorkbenchId
  const filePath = workbenchFilePath(selectedId)
  if (!existsSync(filePath)) {
    throw new Error(`Workbench not found: ${selectedId}`)
  }
  const workbench = await loadWorkbenchModule(filePath)
  const matchingSummary = summaries.find((summary) => summary.id === selectedId)
  return {
    workbench,
    summaries:
      matchingSummary == null
        ? summaries
        : summaries.map((summary) =>
            summary.id === selectedId
              ? {
                  ...summary,
                  title: workbench.title,
                }
              : summary,
          ),
    filePath,
  }
}

export async function writeWorkbench(record: WorkbenchDocumentRecord) {
  ensureWorkbenchRoot()
  const normalizedId = record.id.trim() || defaultWorkbenchId
  const normalizedRecord: WorkbenchDocumentRecord = {
    ...record,
    id: normalizedId,
    title: record.title.trim() || defaultWorkbenchId,
  }
  const filePath = workbenchFilePath(normalizedId)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, serializeWorkbench(normalizedRecord))
  return normalizedRecord
}
